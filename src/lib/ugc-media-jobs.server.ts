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
  status: "pending" | "processing" | "completed" | "failed" | "dead";
  attempts: number;
};

type ReportRecord = {
  id: string;
  target_kind: string;
  target_id: string;
  status: string;
  evidence: JsonRecord;
};

type ModerationAction = {
  id: string;
  report_id: string | null;
  action_type: string;
  target_kind: string | null;
  target_id: string | null;
  revoked_at: string | null;
};

const MAX_ATTEMPTS = 10;
const JOB_LEASE_MS = 10 * 60 * 1000;

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

export function canonicalizeUgcObjectPath(value: string): string {
  let normalized = value;
  for (let pass = 0; pass < 8 && normalized.includes("%"); pass += 1) {
    if (/%(?:2f|5c)/i.test(normalized)) {
      throw new Error("Caminho de mídia contém separador codificado.");
    }
    let decoded: string;
    try {
      decoded = decodeURIComponent(normalized);
    } catch {
      throw new Error("Caminho de mídia possui codificação inválida.");
    }
    if (decoded === normalized) break;
    normalized = decoded;
  }
  const segments = normalized.split("/");
  const hasControlCharacter = Array.from(normalized).some((character) => {
    const code = character.charCodeAt(0);
    return code <= 31 || code === 127;
  });
  if (
    !normalized
    || normalized.startsWith("/")
    || normalized.includes("%")
    || normalized.includes("\\")
    || /[?#]/.test(normalized)
    || hasControlCharacter
    || segments.some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Caminho de mídia inválido.");
  }
  return normalized;
}

function managedObjectPath(bucket: string, source: string): string | null {
  if (!/^https?:\/\//i.test(source)) return canonicalizeUgcObjectPath(source);

  const supabaseUrl = process.env.SUPABASE_URL;
  if (!supabaseUrl) throw new Error("SUPABASE_URL não configurada.");
  const parsed = new URL(source);
  if (parsed.origin !== new URL(supabaseUrl).origin) return null;
  if (parsed.username || parsed.password || parsed.search || parsed.hash) {
    throw new Error("URL de mídia inválida.");
  }

  const marker = `/storage/v1/object/public/${bucket}/`;
  if (!parsed.pathname.startsWith(marker)) {
    throw new Error("URL do Storage possui formato não autorizado.");
  }
  return canonicalizeUgcObjectPath(parsed.pathname.slice(marker.length));
}

function validateManagedPath(job: MediaJob, path: string, evidence: JsonRecord) {
  const safeFileName = /^[A-Za-z0-9][A-Za-z0-9._-]{0,254}$/;
  if (job.source_bucket === "store-images") {
    const partnerId = String(evidence["partner_id"] || "");
    const prefix = `partners/${partnerId}/posts/`;
    const fileName = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    if (!partnerId || !safeFileName.test(fileName)) {
      throw new Error("A mídia não pertence ao post denunciado.");
    }
    return;
  }
  if (job.source_bucket === "group-media") {
    const groupId = String(evidence["group_id"] || "");
    const senderId = String(evidence["sender_profile_id"] || "");
    const prefix = `${groupId}/${senderId}/`;
    const fileName = path.startsWith(prefix) ? path.slice(prefix.length) : "";
    if (!groupId || !senderId || !safeFileName.test(fileName)) {
      throw new Error("A mídia não pertence à mensagem denunciada.");
    }
    return;
  }
  if (job.source_bucket === "ugc-evidence") {
    const prefix = `reports/${job.report_id}/`;
    const remainder = job.report_id && path.startsWith(prefix) ? path.slice(prefix.length) : "";
    const parts = remainder.split("/");
    if (!job.report_id || parts.length !== 2 || !parts[0] || !safeFileName.test(parts[1])) {
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
    .select("id,target_kind,target_id,status,evidence_snapshot" as never)
    .eq("id" as never, reportId as never)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Denúncia não encontrada.");
  const row = data as unknown as {
    id: string;
    target_kind: string;
    target_id: string;
    status: string;
    evidence_snapshot: unknown;
  };
  return { ...row, evidence: asRecord(row.evidence_snapshot) };
}

async function readAction(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  actionId: string,
): Promise<ModerationAction> {
  const { data, error } = await supabaseAdmin
    .from("ugc_moderation_actions" as never)
    .select("id,report_id,action_type,target_kind,target_id,revoked_at" as never)
    .eq("id" as never, actionId as never)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Ação não encontrada.");
  return data as unknown as ModerationAction;
}

async function completeJob(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  jobId: string,
  patch: JsonRecord = {},
) {
  const lastError = Object.prototype.hasOwnProperty.call(patch, "last_error")
    ? patch["last_error"]
    : null;
  const { error } = await supabaseAdmin
    .from("ugc_media_jobs" as never)
    .update({
      ...patch,
      status: "completed",
      last_error: lastError,
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .eq("id" as never, jobId as never);
  if (error) throw new Error(error.message);
}

function assertJobContext(
  job: MediaJob,
  report: ReportRecord,
  action: ModerationAction,
) {
  if (
    !job.report_id
    || !job.action_id
    || report.id !== job.report_id
    || action.id !== job.action_id
    || action.report_id !== report.id
    || action.action_type !== "hide_content"
    || action.target_kind !== report.target_kind
    || action.target_id !== report.target_id
    || report.status !== "actioned"
  ) {
    throw new Error("Job de mídia não corresponde à denúncia e à ação de moderação.");
  }
}

async function readPartnerPost(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  postId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("partner_posts")
    .select("id,partner_id,image_url,moderation_status")
    .eq("id", postId)
    .maybeSingle();
  if (error || !data) throw new Error(error?.message || "Publicação não encontrada.");
  return data as unknown as {
    id: string;
    partner_id: string;
    image_url: string | null;
    moderation_status: string;
  };
}

async function sourceIsSharedByAnotherPost(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  source: string,
  postId: string,
) {
  const { data, error } = await supabaseAdmin
    .from("partner_posts")
    .select("id")
    .eq("image_url", source)
    .neq("id", postId)
    .limit(1)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return Boolean(data);
}

async function processQuarantine(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  report: ReportRecord,
  action: ModerationAction,
) {
  assertJobContext(job, report, action);
  if (report.target_kind !== "partner_post" || job.source_bucket !== "store-images") {
    throw new Error("Quarentena não autorizada para este tipo de conteúdo.");
  }
  if (action.revoked_at) {
    await completeJob(supabaseAdmin, job.id, { last_error: "quarantine_superseded" });
    return;
  }

  const evidence = report.evidence;
  const expectedSource = String(
    evidence["quarantined_source_path"] || evidence["image_url"] || "",
  );
  if (!expectedSource || expectedSource !== job.source_path) {
    throw new Error("A mídia do job não corresponde à evidência denunciada.");
  }
  const post = await readPartnerPost(supabaseAdmin, report.target_id);
  if (
    post.moderation_status !== "hidden"
    || post.partner_id !== String(evidence["partner_id"] || "")
    || post.image_url !== expectedSource
  ) {
    throw new Error("A publicação mudou após a denúncia; quarentena cancelada.");
  }

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
  let sourceWasShared = false;
  const sourceDownload = await supabaseAdmin.storage.from(job.source_bucket).download(sourcePath);
  if (!sourceDownload.error && sourceDownload.data) {
    const uploaded = await supabaseAdmin.storage
      .from(job.evidence_bucket)
      .upload(evidencePath, sourceDownload.data, {
        upsert: true,
        contentType: sourceDownload.data.type || "application/octet-stream",
      });
    if (uploaded.error) throw new Error(uploaded.error.message);
    sourceWasShared = await sourceIsSharedByAnotherPost(
      supabaseAdmin,
      job.source_path,
      report.target_id,
    );
    if (!sourceWasShared) {
      const removed = await supabaseAdmin.storage.from(job.source_bucket).remove([sourcePath]);
      if (removed.error) throw new Error(removed.error.message);
    }
  } else {
    // Idempotent retry after a successful copy/removal but before the DB update.
    const evidenceDownload = await supabaseAdmin.storage
      .from(job.evidence_bucket)
      .download(evidencePath);
    if (evidenceDownload.error || !evidenceDownload.data) {
      throw new Error(sourceDownload.error?.message || "Mídia original não encontrada.");
    }
  }

  const updatedEvidence = {
    ...evidence,
    image_url: null,
    quarantined_source_path: expectedSource,
    quarantined: true,
    evidence_bucket: job.evidence_bucket,
    evidence_path: evidencePath,
  };
  const { error } = await supabaseAdmin
    .from("ugc_reports" as never)
    .update({ evidence_snapshot: updatedEvidence, updated_at: new Date().toISOString() } as never)
    .eq("id" as never, job.report_id as never);
  if (error) throw new Error(error.message);
  await completeJob(supabaseAdmin, job.id, {
    evidence_path: evidencePath,
    ...(sourceWasShared ? { last_error: "shared_source_not_removed" } : {}),
  });
}

async function processRestore(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  report: ReportRecord,
  action: ModerationAction,
) {
  assertJobContext(job, report, action);
  if (
    report.target_kind !== "partner_post"
    || action.revoked_at === null
    || job.source_bucket !== "store-images"
  ) {
    throw new Error("Ação não está pronta para restauração.");
  }
  const { data: quarantineData, error: quarantineError } = await supabaseAdmin
    .from("ugc_media_jobs" as never)
    .select("report_id,action_id,source_bucket,source_path,evidence_bucket,evidence_path,status" as never)
    .eq("action_id" as never, job.action_id as never)
    .eq("operation" as never, "quarantine" as never)
    .order("created_at" as never, { ascending: false })
    .limit(1)
    .maybeSingle();
  if (quarantineError || !quarantineData) {
    throw new Error(quarantineError?.message || "Quarentena da mídia não encontrada.");
  }
  const quarantine = quarantineData as unknown as {
    report_id: string | null;
    action_id: string | null;
    source_bucket: string;
    source_path: string;
    evidence_bucket: string;
    evidence_path: string | null;
    status: string;
  };
  if (
    quarantine.status !== "completed"
    || quarantine.report_id !== report.id
    || quarantine.action_id !== action.id
    || quarantine.source_bucket !== job.source_bucket
    || quarantine.source_path !== job.source_path
  ) {
    throw new Error("Quarentena não corresponde à restauração solicitada.");
  }

  const originalPath = managedObjectPath(quarantine.source_bucket, quarantine.source_path);
  let createdObject = false;
  if (originalPath) {
    validateManagedPath(
      { ...job, source_bucket: quarantine.source_bucket } as MediaJob,
      originalPath,
      report.evidence,
    );
    const original = await supabaseAdmin.storage
      .from(quarantine.source_bucket)
      .download(originalPath);
    if (original.error || !original.data) {
      if (!quarantine.evidence_path) throw new Error("Evidência privada não encontrada.");
      const downloaded = await supabaseAdmin.storage
        .from(quarantine.evidence_bucket)
        .download(quarantine.evidence_path);
      if (downloaded.error || !downloaded.data) {
        throw new Error(downloaded.error?.message || "Evidência não encontrada.");
      }
      const uploaded = await supabaseAdmin.storage
        .from(quarantine.source_bucket)
        .upload(originalPath, downloaded.data, {
          upsert: false,
          contentType: downloaded.data.type || "application/octet-stream",
        });
      if (uploaded.error) {
        const racedOriginal = await supabaseAdmin.storage
          .from(quarantine.source_bucket)
          .download(originalPath);
        if (racedOriginal.error || !racedOriginal.data) throw new Error(uploaded.error.message);
      } else {
        createdObject = true;
      }
    }
  }

  const { data: restored, error: restoreError } = await supabaseAdmin.rpc(
    "ugc_finalize_partner_post_restore" as never,
    { _action_id: action.id } as never,
  );
  if (restoreError) throw new Error(restoreError.message);

  let outcome: string | undefined;
  if (restored !== true) {
    const post = await readPartnerPost(supabaseAdmin, report.target_id);
    if (post.moderation_status === "visible") {
      outcome = "restore_already_visible";
    } else {
      outcome = "restore_superseded";
      if (
        createdObject
        && originalPath
        && !await sourceIsSharedByAnotherPost(
          supabaseAdmin,
          quarantine.source_path,
          report.target_id,
        )
      ) {
        const removed = await supabaseAdmin.storage
          .from(quarantine.source_bucket)
          .remove([originalPath]);
        if (removed.error) throw new Error(removed.error.message);
      }
    }
  }
  await completeJob(supabaseAdmin, job.id, {
    evidence_path: quarantine.evidence_path,
    ...(outcome ? { last_error: outcome } : {}),
  });
}

async function processDelete(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  job: MediaJob,
  report: ReportRecord,
  action: ModerationAction,
) {
  assertJobContext(job, report, action);
  if (action.revoked_at) {
    await completeJob(supabaseAdmin, job.id, { last_error: "delete_superseded" });
    return;
  }
  if (
    (job.source_bucket === "group-media" && report.target_kind !== "group_message")
    || (job.source_bucket === "ugc-evidence" && report.target_kind !== "partner_post")
    || !["group-media", "ugc-evidence"].includes(job.source_bucket)
  ) {
    throw new Error("Exclusão não autorizada para este tipo de conteúdo.");
  }
  const path = managedObjectPath(job.source_bucket, job.source_path);
  if (!path) {
    await completeJob(supabaseAdmin, job.id);
    return;
  }
  validateManagedPath(job, path, report.evidence);
  const removed = await supabaseAdmin.storage.from(job.source_bucket).remove([path]);
  if (removed.error) throw new Error(removed.error.message);
  await completeJob(supabaseAdmin, job.id);
}

async function countJobsByStatus(
  supabaseAdmin: Awaited<ReturnType<typeof requireModerator>>,
  input: ProcessInput,
  actionId: string | undefined,
  statuses: MediaJob["status"][],
) {
  let query = supabaseAdmin
    .from("ugc_media_jobs" as never)
    .select("id" as never, { count: "exact", head: true })
    .in("status" as never, statuses as never);
  if (input.reportId) query = query.eq("report_id" as never, input.reportId as never);
  if (actionId) query = query.eq("action_id" as never, actionId as never);
  const { count, error } = await query;
  if (error) throw new Error(error.message);
  return count || 0;
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

  // A worker interrupted after claiming a job must not leave it stuck forever.
  // Only expired leases are reclaimed; a concurrently active worker keeps its
  // claim until the ten-minute window closes.
  let recoverQuery = supabaseAdmin
    .from("ugc_media_jobs" as never)
    .update({
      status: "failed",
      last_error: "processing_lease_expired",
      updated_at: new Date().toISOString(),
    } as never)
    .eq("status" as never, "processing" as never)
    .lt(
      "updated_at" as never,
      new Date(Date.now() - JOB_LEASE_MS).toISOString() as never,
    );
  if (input.reportId) {
    recoverQuery = recoverQuery.eq("report_id" as never, input.reportId as never);
  }
  if (actionId) recoverQuery = recoverQuery.eq("action_id" as never, actionId as never);
  const recovered = await recoverQuery;
  if (recovered.error) throw new Error(recovered.error.message);

  let exhaustQuery = supabaseAdmin
    .from("ugc_media_jobs" as never)
    .update({
      status: "dead",
      last_error: "maximum_attempts_reached",
      completed_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    } as never)
    .in("status" as never, ["pending", "failed"] as never)
    .gte("attempts" as never, MAX_ATTEMPTS as never);
  if (input.reportId) {
    exhaustQuery = exhaustQuery.eq("report_id" as never, input.reportId as never);
  }
  if (actionId) exhaustQuery = exhaustQuery.eq("action_id" as never, actionId as never);
  const exhausted = await exhaustQuery;
  if (exhausted.error) throw new Error(exhausted.error.message);

  let query = supabaseAdmin
    .from("ugc_media_jobs" as never)
    .select("id,report_id,action_id,operation,source_bucket,source_path,evidence_bucket,evidence_path,status,attempts" as never)
    .in("status" as never, ["pending", "failed"] as never)
    .lt("attempts" as never, MAX_ATTEMPTS as never)
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
        last_error: null,
        completed_at: null,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id" as never, rawJob.id as never)
      .eq("attempts" as never, rawJob.attempts as never)
      .in("status" as never, ["pending", "failed"] as never)
      .select("id" as never)
      .maybeSingle();
    if (claimed.error || !claimed.data) continue;

    try {
      if (!rawJob.report_id || !rawJob.action_id) {
        throw new Error("Job sem denúncia ou ação vinculada.");
      }
      const report = await readReport(supabaseAdmin, rawJob.report_id);
      const action = await readAction(supabaseAdmin, rawJob.action_id);
      if (rawJob.operation === "quarantine") {
        await processQuarantine(supabaseAdmin, rawJob, report, action);
      } else if (rawJob.operation === "restore") {
        await processRestore(supabaseAdmin, rawJob, report, action);
      } else {
        await processDelete(supabaseAdmin, rawJob, report, action);
      }
      processed += 1;
    } catch (jobError) {
      failed += 1;
      const message = jobError instanceof Error ? jobError.message : "Falha desconhecida";
      const nextAttempts = rawJob.attempts + 1;
      await supabaseAdmin
        .from("ugc_media_jobs" as never)
        .update({
          status: nextAttempts >= MAX_ATTEMPTS ? "dead" : "failed",
          last_error: message.slice(0, 1000),
          completed_at: nextAttempts >= MAX_ATTEMPTS ? new Date().toISOString() : null,
          updated_at: new Date().toISOString(),
        } as never)
        .eq("id" as never, rawJob.id as never)
        .eq("status" as never, "processing" as never);
    }
  }

  const remaining = await countJobsByStatus(
    supabaseAdmin,
    input,
    actionId,
    ["pending", "failed", "processing"],
  );
  const dead = await countJobsByStatus(supabaseAdmin, input, actionId, ["dead"]);
  return { processed, failed, remaining, dead };
}
