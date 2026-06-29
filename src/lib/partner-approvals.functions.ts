import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { z } from "zod";
import { ensureStudentForProfile } from "@/lib/registration.server";

async function assertAuthorized(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile) throw new Error("Perfil não encontrado");
  if (profile.role === "admin") return { profileId: profile.id, isAdmin: true };

  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Acesso negado");

  const { data: badges } = await supabaseAdmin
    .from("coach_badges")
    .select("badge_key")
    .eq("coach_id", coach.id)
    .eq("badge_key", "partnership_master");
  if (!badges || badges.length === 0) throw new Error("Acesso restrito à categoria Mestre de Parcerias");
  return { profileId: profile.id, isAdmin: false };
}

export const listPartnersForApproval = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAuthorized(context.userId);
    const { data, error } = await supabaseAdmin
      .from("partners")
      .select(
        "id, fantasy_name, document, whatsapp, city, state, status, photo_url, cover_url, description, instagram, facebook, website, business_area, specialty, created_at, approved_at",
      )
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);
    return data ?? [];
  });

export const getPartnerDetails = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) =>
    z.object({ partnerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAuthorized(context.userId);

    const [partnerRes, productsRes, visitsRes, collabsRes, postsRes] = await Promise.all([
      supabaseAdmin.from("partners").select("*").eq("id", data.partnerId).maybeSingle(),
      supabaseAdmin
        .from("partner_products")
        .select("*")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("partner_visits")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", data.partnerId),
      supabaseAdmin
        .from("students")
        .select("id, created_at, profiles!students_profile_id_fkey(name, email, phone, photo_url)")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("partner_posts")
        .select("id, image_url, caption, created_at")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    if (partnerRes.error) throw new Error(partnerRes.error.message);
    if (!partnerRes.data) throw new Error("Parceiro não encontrado");

    return {
      partner: partnerRes.data,
      products: productsRes.data ?? [],
      visits: visitsRes.count ?? 0,
      collaborators: collabsRes.data ?? [],
      posts: postsRes.data ?? [],
    };
  });

/**
 * Public partner profile (read-only). Available to any authenticated user
 * (students and coaches) for viewing approved partners — no badge required.
 */
export const getPartnerPublicProfile = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) =>
    z.object({ partnerId: z.string().uuid() }).parse(d),
  )
  .handler(async ({ data }) => {
    const [partnerRes, productsRes, visitsRes, collabsRes, postsRes] = await Promise.all([
      supabaseAdmin.from("partners").select("*").eq("id", data.partnerId).maybeSingle(),
      supabaseAdmin
        .from("partner_products")
        .select("id, kind, name, description, image_url, price, status, is_active_by_partner, redemption_instructions, admin_notes, benefit_start_time, benefit_end_time, created_at")
        .eq("partner_id", data.partnerId)
        .eq("status", "approved")
        .eq("is_active_by_partner", true)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("partner_visits")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", data.partnerId),
      supabaseAdmin
        .from("students")
        .select("id, created_at, profiles!students_profile_id_fkey(name, photo_url)")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false }),
      supabaseAdmin
        .from("partner_posts")
        .select("id, image_url, caption, created_at")
        .eq("partner_id", data.partnerId)
        .order("created_at", { ascending: false })
        .limit(60),
    ]);

    if (partnerRes.error) throw new Error(partnerRes.error.message);
    if (!partnerRes.data) throw new Error("Parceiro não encontrado");

    return {
      partner: partnerRes.data,
      products: productsRes.data ?? [],
      visits: visitsRes.count ?? 0,
      collaborators: collabsRes.data ?? [],
      posts: postsRes.data ?? [],
    };
  });


export const reviewPartnerStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; status: "approved" | "blocked" | "pending"; reason?: string }) =>
    z
      .object({
        partnerId: z.string().uuid(),
        status: z.enum(["approved", "blocked", "pending"]),
        reason: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    await assertAuthorized(context.userId);
    const patch: {
      status: string;
      approved_at?: string | null;
      blocked_at?: string | null;
      blocked_reason?: string | null;
    } = { status: data.status };
    if (data.status === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.blocked_at = null;
      patch.blocked_reason = null;
    } else if (data.status === "blocked") {
      patch.blocked_at = new Date().toISOString();
      patch.blocked_reason = data.reason ?? null;
    } else {
      patch.approved_at = null;
    }
    const { data: partnerRow, error } = await supabaseAdmin
      .from("partners")
      .update(patch)
      .eq("id", data.partnerId)
      .select("id, profile_id, upline_coach_id")
      .maybeSingle();
    if (error) throw new Error(error.message);

    // Se aprovou parceiro, considera a ativação do coach já paga (caso ele também seja coach),
    // mas NÃO libera o painel — ele continua precisando enviar o quiz e digitar o ID.
    if (data.status === "approved" && partnerRow?.profile_id) {
      await ensureStudentForProfile((partnerRow as any).profile_id, (partnerRow as any).upline_coach_id, (partnerRow as any).id);
      await supabaseAdmin
        .from("coaches")
        .update({
          onboarding_stage: "awaiting_quiz_result",
          activation_paid_at: new Date().toISOString(),
        })
        .eq("profile_id", partnerRow.profile_id)
        .eq("onboarding_stage", "awaiting_payment");
    }
    return { ok: true };
  });


export const reviewPartnerProduct = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { productId: string; decision: "approved" | "rejected"; notes?: string }) =>
    z
      .object({
        productId: z.string().uuid(),
        decision: z.enum(["approved", "rejected"]),
        notes: z.string().max(500).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data, context }) => {
    const { profileId } = await assertAuthorized(context.userId);
    const patch: {
      status: string;
      admin_notes: string | null;
      approved_at?: string;
      approved_by?: string;
    } = {
      status: data.decision,
      admin_notes: data.notes ?? null,
    };
    if (data.decision === "approved") {
      patch.approved_at = new Date().toISOString();
      patch.approved_by = profileId;
    }
    const { error } = await supabaseAdmin
      .from("partner_products")
      .update(patch)
      .eq("id", data.productId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ============================================================
// ADMIN: liberação de parceiros por etapas (mesmo modelo dos coaches)
// ============================================================

async function assertAdmin(userId: string) {
  const { data: me } = await supabaseAdmin
    .from("profiles").select("id, role").eq("user_id", userId).maybeSingle();
  if (!me || me.role !== "admin") throw new Error("Acesso negado");
  return me.id as string;
}

async function logPartnerAudit(
  actorProfileId: string,
  targetProfileId: string,
  action: string,
  notes?: string,
) {
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_profile_id: actorProfileId,
    target_profile_id: targetProfileId,
    action,
    notes: notes ?? null,
  });
}

export const listAllPartnerReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { includeApproved?: boolean } | undefined) =>
    z.object({ includeApproved: z.boolean().optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const statuses = data.includeApproved
      ? ["pending", "approved", "blocked"]
      : ["pending", "blocked"];
    const { data: partners } = await supabaseAdmin
      .from("partners")
      .select(
        "id, fantasy_name, document, document_type, whatsapp, city, state, status, photo_url, description, business_area, specialty, approved_at, blocked_at, blocked_reason, activation_paid_at, activation_source, activation_note, activation_granted_by, documents_reviewed_at, documents_reviewed_by, created_at, profile:profiles!partners_profile_id_fkey(id, name, email, phone, user_id)"
      )
      .in("status", statuses)
      .order("created_at", { ascending: false });

    const rows = (partners || []) as Array<{
      id: string;
      fantasy_name: string;
      document: string | null;
      whatsapp: string | null;
      city: string | null;
      state: string | null;
      status: string;
      photo_url: string | null;
      description: string | null;
      business_area: string | null;
      specialty: string | null;
      approved_at: string | null;
      activation_paid_at: string | null;
      activation_source: string | null;
      activation_note: string | null;
      documents_reviewed_at: string | null;
      profile: { id: string; name?: string; email?: string; phone?: string; user_id?: string } | null;
    }>;

    const userIds = rows.map((r) => r.profile?.user_id).filter(Boolean) as string[];
    const confirmedMap = new Map<string, boolean>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data: u } = await supabaseAdmin.auth.admin.getUserById(uid);
          confirmedMap.set(uid, !!u.user?.email_confirmed_at);
        } catch {
          confirmedMap.set(uid, false);
        }
      })
    );

    // Mensalidade
    const { data: subs } = userIds.length
      ? await supabaseAdmin
          .from("user_subscriptions")
          .select("user_id, status, paid_until, exempt_until")
          .in("user_id", userIds)
      : { data: [] };
    const subMap = new Map(((subs || []) as Array<{ user_id: string; status: string; paid_until: string | null }>).map((s) => [s.user_id, s]));
    const { data: invs } = userIds.length
      ? await supabaseAdmin
          .from("subscription_invoices")
          .select("user_id, status, reference_month, due_date")
          .in("user_id", userIds)
          .order("reference_month", { ascending: false })
      : { data: [] };
    const invMap = new Map<string, { status: string; reference_month: string; due_date: string }>();
    for (const i of (invs || []) as Array<{ user_id: string; status: string; reference_month: string; due_date: string }>) {
      if (!invMap.has(i.user_id)) invMap.set(i.user_id, i);
    }
    const today = new Date().toISOString().slice(0, 10);
    const computeMonthly = (uid?: string) => {
      if (!uid) return { status: "none" as const, paid_until: null, last_invoice_status: null, last_invoice_month: null };
      const sub = subMap.get(uid);
      const inv = invMap.get(uid) || null;
      if (!sub && !inv) return { status: "none" as const, paid_until: null, last_invoice_status: null, last_invoice_month: null };
      let status: "paid" | "exempt" | "pending" | "overdue" | "blocked" | "cancelled" | "none" = "none";
      if (sub && (sub.status === "exempt_monthly" || sub.status === "exempt_annual" || sub.status === "exempt_permanent")) status = "exempt";
      else if (inv?.status === "blocked") status = "blocked";
      else if (inv?.status === "overdue") status = "overdue";
      else if (inv?.status === "pending") status = "pending";
      else if (sub?.paid_until && sub.paid_until >= today) status = "paid";
      else if (inv?.status === "paid") status = "paid";
      else if (inv?.status === "exempted") status = "exempt";
      else if (inv?.status === "cancelled") status = "cancelled";
      return {
        status,
        paid_until: sub?.paid_until ?? null,
        last_invoice_status: inv?.status ?? null,
        last_invoice_month: inv?.reference_month ?? null,
      };
    };

    return rows.map((r) => ({
      ...r,
      email_confirmed: r.profile?.user_id ? !!confirmedMap.get(r.profile.user_id) : false,
      monthly: computeMonthly(r.profile?.user_id),
    }));
  });

export const adminConfirmPartnerEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { data: partner } = await supabaseAdmin
      .from("partners").select("id, profile_id").eq("id", data.partnerId).maybeSingle();
    if (!partner) throw new Error("Parceiro não encontrado");
    const { confirmAuthEmailByProfileId } = await import("./admin-network.server");
    await confirmAuthEmailByProfileId((partner as { profile_id: string }).profile_id);
    await logPartnerAudit(actorId, (partner as { profile_id: string }).profile_id, "partner_email_confirmed", "E-mail confirmado manualmente pelo admin");
    return { ok: true };
  });

export const adminGrantPartnerActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      partnerId: z.string().uuid(),
      note: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres)").max(500),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { data: partner } = await supabaseAdmin
      .from("partners").select("id, profile_id, activation_paid_at").eq("id", data.partnerId).maybeSingle();
    if (!partner) throw new Error("Parceiro não encontrado");
    const p = partner as { id: string; profile_id: string; activation_paid_at: string | null };
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("partners").update({
      activation_paid_at: p.activation_paid_at || nowIso,
      activation_source: "admin_grant",
      activation_granted_by: context.userId,
      activation_note: data.note,
    } as never).eq("id", p.id);
    // Espelha no coach quando existir
    await supabaseAdmin.from("coaches").update({
      activation_paid_at: nowIso,
      activation_source: "partner_approved",
      onboarding_stage: "awaiting_quiz_result",
    } as never).eq("profile_id", p.profile_id).eq("onboarding_stage", "awaiting_payment");
    await supabaseAdmin.from("notifications").insert({
      profile_id: p.profile_id,
      type: "partner_onboarding",
      title: "Anuidade liberada",
      message: "A anuidade da sua empresa parceira foi liberada pelo admin.",
      action_url: "/partner",
    });
    await logPartnerAudit(actorId, p.profile_id, "partner_activation_paid", `Anuidade concedida pelo admin. Motivo: ${data.note}`);
    return { ok: true };
  });

export const adminReviewPartnerDocuments = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { data: partner } = await supabaseAdmin
      .from("partners").select("id, profile_id, documents_reviewed_at").eq("id", data.partnerId).maybeSingle();
    if (!partner) throw new Error("Parceiro não encontrado");
    const p = partner as { id: string; profile_id: string; documents_reviewed_at: string | null };
    await supabaseAdmin.from("partners").update({
      documents_reviewed_at: p.documents_reviewed_at || new Date().toISOString(),
      documents_reviewed_by: context.userId,
    } as never).eq("id", p.id);
    await logPartnerAudit(actorId, p.profile_id, "partner_documents_reviewed", "Documentos / perfil revisados pelo admin");
    return { ok: true };
  });

export const adminApprovePartnerFinal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ partnerId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { data: partner } = await supabaseAdmin
      .from("partners").select("id, profile_id, status, upline_coach_id").eq("id", data.partnerId).maybeSingle();
    if (!partner) throw new Error("Parceiro não encontrado");
    const p = partner as { id: string; profile_id: string; status: string; upline_coach_id: string | null };
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("partners").update({
      status: "approved",
      approved_at: nowIso,
      blocked_at: null,
      blocked_reason: null,
    }).eq("id", p.id);
    await ensureStudentForProfile(p.profile_id, p.upline_coach_id, p.id);
    // Garante anuidade marcada se ainda não estava
    await supabaseAdmin.from("partners").update({
      activation_paid_at: nowIso,
      activation_source: "partner_approved",
    } as never).eq("id", p.id).is("activation_paid_at", null);
    // Espelha no coach
    await supabaseAdmin.from("coaches").update({
      onboarding_stage: "awaiting_quiz_result",
      activation_paid_at: nowIso,
      activation_source: "partner_approved",
    } as never).eq("profile_id", p.profile_id).eq("onboarding_stage", "awaiting_payment");
    await supabaseAdmin.from("notifications").insert({
      profile_id: p.profile_id,
      type: "partner_onboarding",
      title: "🎉 Empresa parceira aprovada!",
      message: "Seu painel de parceiro foi liberado. Acesse e configure seus produtos.",
      action_url: "/partner",
    });
    await logPartnerAudit(actorId, p.profile_id, "partner_approved_final", "Parceiro aprovado e painel liberado");
    return { ok: true };
  });

export const getPartnerReleaseAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, notes, created_at, actor_profile_id")
      .eq("target_profile_id", data.profileId)
      .in("action", [
        "partner_email_confirmed",
        "partner_activation_paid",
        "partner_documents_reviewed",
        "partner_approved_final",
      ])
      .order("created_at", { ascending: false });

    const actorIds = [
      ...new Set(((rows || []) as Array<{ actor_profile_id: string | null }>)
        .map((r) => r.actor_profile_id)
        .filter(Boolean) as string[]),
    ];
    const { data: actors } = actorIds.length
      ? await supabaseAdmin.from("profiles").select("id, name").in("id", actorIds)
      : { data: [] };
    const actorMap = new Map(((actors || []) as Array<{ id: string; name?: string }>).map((a) => [a.id, a.name || "—"]));
    return ((rows || []) as Array<{ id: string; action: string; notes: string | null; created_at: string; actor_profile_id: string | null }>).map((r) => ({
      ...r,
      actor_name: r.actor_profile_id ? actorMap.get(r.actor_profile_id) || "—" : "—",
    }));
  });
