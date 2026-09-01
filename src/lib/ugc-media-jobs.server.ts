type JsonRecord = Record<string, unknown>;

type MediaJob = {
  id: string;
  report_id: string | null;
  action_id: string | null;
  operation: "quarantine" | "restore" | "delete";
  source_bucket: string;
  source_path: string;
  evidence_bucket: string;
  evidence_path: string | null;
  status: "pending" | "processing" | "completed" | "failed";
  attempts: number;
};

type ProcessInput = {
  reportId?: string;
  appealId?: string;
  limit?: number;
};

function asRecord(value: unknown): JsonRecord {
  return value && typeof value === "object" && !Array.isArray(value)
    ? value as JsonRecord
    : {};
}

function safeObjectPath(value: string): string {
  const normalized = value.replace(/^\/+/, "");
  const segments = normalized.split("/");
  if (
    !normalized
    || normalized.includes("\\")
    || normalized.includes("\0")
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Caminho de mídia inválido.");
  }
  return normalized;
}

function managedObjectPath(bucket: string, source: string): string | null {
  if (!/^https?:\/\//i.test(source)) return safeObjectPath(source);

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL não configurada.");
  const parsed = new URL(source);
  if (parsed.origin !== new URL(supabaseUrl).origin) return null;

  const marker = `/storage/v1/object/public/${bucket}/`;
  if (!parsed.pathname.startsWith(marker)) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(parsed.pathname.slice(marker.length));
  } catch {
    throw new Error("URL de mídia possui codificação inválida.");
  }
  return safeObjectPath(decoded);
}

function validateManagedPath(job: MediaJob, path: string, evidence: JsonRecord) {
  if (job.source_bucket === "store-images") {
    const partnerId = String(evidence["partner_id"] || "");
    if (!partnerId || !path.startsWith(`partners/${partnerId}/posts/`)) {
      throw new Error("A mídia não pertence ao post denunciado.");
    }
    return;
  }
  if (job.source_bucket === "group-media") {
    const groupId = String(evidence["group_id"] || "");
    const senderId = String(evidence["sender_profile_id"] || "");
    if (!groupId || !senderId || !path.startsWith(`${groupId}/${senderId}/`)) {
      throw new Error("A mídia não pertence à mensagem denunciada.");
    }
    return;
  }
  if (job.source_bucket === "ugc-evidence") {
    if (!job.report_id || !path.startsWith(`reports/${job.report_id}/`)) {
      throw new Error("Caminho de evidência inválido.");
    }
    return;
  }
  throw new Error("Bucket de moderação não autorizado.");
}

async function requireModerator(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: profile, error } = await supabaseAdmin
    .from("profiles")
    .select("id,role,is_master_admin,admin_permissions")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);

  const row = profile as unknown as {
    id?: string;
    role?: string;
    is_master_admin?: boolean;
    admin_permissions?: Record<string, boolean> | null;
  } | null;
  if (
    !row?.id
    || row.role !== "admin"
    || (!row.is_master_admin && row.admin_permissions?.reports !== true)
  ) {
    throw new Error("Permissão de moderação necessária.");
  }
  return supabaseAdmin;
}

async function readReport(supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>, reportId: string) {
  const { data, error } = await supabaseAdmin
    .from("ugc_reports" as never)
    .select("id,evidence_snapshot" as never)
    .eq("id" as never, reportId as never)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Denúncia não encontrada.");
  const row = data as unknown as { id: string; evidence_snapshot: unknown };
  return { ...row, evidence: asRecord(row.evidence_snapshot) };
}

async function completeJob(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  jobId: string,
  patch: JsonRecord = {},
) {
  const { error } = await supabaseAdmin
    .from("ugc_media_jobs" as never)
    .update({
      ...patch,
      status: "completed",
      last_error: null,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, jobId as never);
  if (error) throw new Error(error.message);
}

async function processQuarantine(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  evidence: JsonRecord,
) {
  if (!job.report_id || !job.action_id) throw new Error("Job sem denúncia ou ação.");
  const sourcePath = managedObjectPath(job.source_bucket, job.source_path);

  // External HTTPS images are not controlled by FitMind. The post is already
  // hidden in the database, so there is no app-hosted object to quarantine.
  if (!sourcePath) {
    await completeJob(supabaseAdmin, job.id, { last_error: "external_media_not_managed" });
    return;
  }
  validateManagedPath(job, sourcePath, evidence);

  const fileName = sourcePath.split("/").at(-1) || "evidence.bin";
  const evidencePath = `reports/${job.report_id}/${job.action_id}/${fileName}`;
  let blob: Blob | null = null;
  const sourceDownload = await supabaseAdmin.storage.from(job.source_bucket).download(sourcePath);
  if (!sourceDownload.error && sourceDownload.data) {
    blob = sourceDownload.data;
    const uploaded = await supabaseAdmin.storage
      .from(job.evidence_bucket)
      .upload(evidencePath, blob, {
        upsert: true,
        contentType: blob.type || "application/octet-stream",
      });
    if (uploaded.error) throw new Error(uploaded.error.message);
    const removed = await supabaseAdmin.storage.from(job.source_bucket).remove([sourcePath]);
    if (removed.error) throw new Error(removed.error.message);
  } else {
    // Idempotent retry after a successful copy/removal but before the DB update.
    const evidenceDownload = await supabaseAdmin.storage
      .from(job.evidence_bucket)
      .download(evidencePath);
    if (evidenceDownload.error || !evidenceDownload.data) {
      throw new Error(sourceDownload.error?.message || "Mídia original não encontrada.");
    }
  }

  await completeJob(supabaseAdmin, job.id, { evidence_path: evidencePath });
  const updatedEvidence = {
    ...evidence,
    image_url: null,
    quarantined: true,
    evidence_bucket: job.evidence_bucket,
    evidence_path: evidencePath,
  };
  const { error } = await supabaseAdmin
    .from("ugc_reports" as never)
    .update({ evidence_snapshot: updatedEvidence, updated_at: new Date().toISOString() } as never)
    .eq("id" as never, job.report_id as never);
  if (error) throw new Error(error.message);
}

async function processRestore(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  evidence: JsonRecord,
) {
  if (!job.action_id) throw new Error("Job sem ação de moderação.");
  const { data: quarantineData, error: quarantineError } = await supabaseAdmin
    .from("ugc_media_jobs" as never)
    .select("source_bucket,source_path,evidence_bucket,evidence_path,status" as never)
    .eq("action_id" as never, job.action_id as never)
    .eq("operation" as never, "quarantine" as never)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (quarantineError || !quarantineData) {
    throw new Error(quarantineError?.message || "Quarentena da mídia não encontrada.");
  }
  const quarantine = quarantineData as unknown as {
    source_bucket: string;
    source_path: string;
    evidence_bucket: string;
    evidence_path: string | null;
    status: string;
  };
  if (quarantine.status !== "completed") throw new Error("Quarentena ainda não concluída.");

  const originalPath = managedObjectPath(quarantine.source_bucket, quarantine.source_path);
  if (originalPath) {
    validateManagedPath({ ...job, source_bucket: quarantine.source_bucket } as MediaJob, originalPath, evidence);
    if (!quarantine.evidence_path) throw new Error("Evidência privada não encontrada.");
    const downloaded = await supabaseAdmin.storage
      .from(quarantine.evidence_bucket)
      .download(quarantine.evidence_path);
    if (downloaded.error || !downloaded.data) {
      const original = await supabaseAdmin.storage.from(quarantine.source_bucket).download(originalPath);
      if (original.error || !original.data) throw new Error(downloaded.error?.message || "Evidência não encontrada.");
    } else {
      const uploaded = await supabaseAdmin.storage
        .from(quarantine.source_bucket)
        .upload(originalPath, downloaded.data, {
          upsert: true,
          contentType: downloaded.data.type || "application/octet-stream",
        });
      if (uploaded.error) throw new Error(uploaded.error.message);
    }
  }

  const { data: action, error: actionError } = await supabaseAdmin
    .from("ugc_moderation_actions" as never)
    .select("target_kind,target_id,revoked_at" as never)
    .eq("id" as never, job.action_id as never)
    .maybeSingle();
  if (actionError || !action) throw new Error(actionError?.message || "Ação não encontrada.");
  const actionRow = action as unknown as { target_kind: string; target_id: string; revoked_at: string | null };
  if (actionRow.target_kind !== "partner_post" || !actionRow.revoked_at) {
    throw new Error("Ação não está pronta para restauração.");
  }
  const { error: restoreError } = await supabaseAdmin
    .from("partner_posts")
    .update({
      moderation_status: "visible",
      moderated_at: new Date().toISOString(),
      moderation_reason: "Recurso aceito; conteúdo restaurado.",
    } as never)
    .eq("id", actionRow.target_id);
  if (restoreError) throw new Error(restoreError.message);
  await completeJob(supabaseAdmin, job.id, { evidence_path: quarantine.evidence_path });
}

async function processDelete(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  evidence: JsonRecord,
) {
  const path = managedObjectPath(job.source_bucket, job.source_path);
  if (!path) {
    await completeJob(supabaseAdmin, job.id);
    return;
  }
  validateManagedPath(job, path, evidence);
  const removed = await supabaseAdmin.storage.from(job.source_bucket).remove([path]);
  if (removed.error) throw new Error(removed.error.message);
  await completeJob(supabaseAdmin, job.id);
}

export async function processUgcMediaJobsForModerator(userId: string, input: ProcessInput) {
  const supabaseAdmin = await requireModerator(userId);
  let actionId: string | undefined;
  if (input.appealId) {
    const { data: appeal, error } = await supabaseAdmin
      .from("ugc_appeals" as never)
      .select("action_id" as never)
      .eq("id" as never, input.appealId as never)
      .maybeSingle();
    if (error || !appeal) throw new Error(error?.message || "Recurso não encontrado.");
    actionId = (appeal as unknown as { action_id: string }).action_id;
  }

  let query = supabaseAdmin
    .from("ugc_media_jobs" as never)
    .select("id,report_id,action_id,operation,source_bucket,source_path,evidence_bucket,evidence_path,status,attempts" as never)
    .in("status" as never, ["pending", "failed"] as never)
    .lt("attempts" as never, 10 as never)
    .order("created_at" as never, { ascending: true })
    .limit(Math.min(20, Math.max(1, input.limit || 10)));
  if (input.reportId) query = query.eq("report_id" as never, input.reportId as never);
  if (actionId) query = query.eq("action_id" as never, actionId as never);
  const { data, error } = await query;
  if (error) throw new Error(error.message);

  let processed = 0;
  let failed = 0;
  for (const rawJob of (data as unknown as MediaJob[]) || []) {
    const claimed = await supabaseAdmin
      .from("ugc_media_jobs" as never)
      .update({
        status: "processing",
        attempts: rawJob.attempts + 1,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, rawJob.id as never)
      .in("status" as never, ["pending", "failed"] as never)
      .select("id" as never)
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;

    try {
      if (!rawJob.report_id) throw new Error("Job sem denúncia vinculada.");
      const report = await readReport(supabaseAdmin, rawJob.report_id);
      if (rawJob.operation === "quarantine") {
        await processQuarantine(supabaseAdmin, rawJob, report.evidence);
      } else if (rawJob.operation === "restore") {
        await processRestore(supabaseAdmin, rawJob, report.evidence);
      } else {
        await processDelete(supabaseAdmin, rawJob, report.evidence);
      }
      processed += 1;
    } catch (jobError) {
      failed += 1;
      const message = jobError instanceof Error ? jobError.message : "Falha desconhecida";
      await supabaseAdmin
        .from("ugc_media_jobs" as never)
        .update({
          status: "failed",
          last_error: message.slice(0, 1000),
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, rawJob.id as never);
    }
  }

  return { processed, failed };
}
