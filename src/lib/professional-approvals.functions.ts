import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: me } = await supabaseAdmin
    .from("profiles").select("id, role").eq("user_id", userId).maybeSingle();
  if (!me || me.role !== "admin") throw new Error("Acesso negado");
  return me.id as string;
}

async function logAudit(
  actorProfileId: string,
  targetProfileId: string,
  action: string,
  notes?: string,
) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  await supabaseAdmin.from("admin_audit_log").insert({
    actor_profile_id: actorProfileId,
    target_profile_id: targetProfileId,
    action,
    notes: notes ?? null,
  });
}

export const listAllProfessionalReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { includeApproved?: boolean } | undefined) =>
    z.object({ includeApproved: z.boolean().optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let query = supabaseAdmin
      .from("coaches")
      .select(
        "id, profile_id, specialty_key, specialty_custom_description, specialty_pending_setup, professional_council, council_number, serves_whole_network, approved_at, onboarding_stage, created_at, activation_paid_at, activation_source, activation_note, already_coach, profile:profiles!coaches_profile_id_fkey(id, name, email, phone, user_id)"
      )
      .eq("is_professional", true)
      .order("created_at", { ascending: false });

    if (!data.includeApproved) {
      query = query.is("approved_at", null);
    }

    const { data: pros, error } = await query;
    if (error) throw new Error(error.message);

    const { data: specs } = await supabaseAdmin
      .from("professional_specialties")
      .select("key, label, requires_admin_setup, default_tabs")
      .order("sort_order");

    const rows = (pros || []) as Array<{
      id: string;
      profile_id: string;
      specialty_key: string | null;
      specialty_custom_description: string | null;
      specialty_pending_setup: boolean;
      professional_council: string | null;
      council_number: string | null;
      serves_whole_network: boolean;
      approved_at: string | null;
      onboarding_stage: string | null;
      created_at: string;
      activation_paid_at: string | null;
      activation_source: string | null;
      activation_note: string | null;
      already_coach: boolean | null;
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

    // Mensalidade (assinatura + última fatura) por user_id
    const { data: subs } = userIds.length
      ? await supabaseAdmin
          .from("user_subscriptions")
          .select("user_id, status, paid_until, exempt_until")
          .in("user_id", userIds)
      : { data: [] };
    const subMap = new Map(
      ((subs || []) as Array<{ user_id: string; status: string; paid_until: string | null; exempt_until: string | null }>)
        .map((s) => [s.user_id, s])
    );
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
    const computeMonthly = (uid: string | undefined, historic: boolean) => {
      if (!uid) {
        return {
          status: historic ? ("exempt" as const) : ("none" as const),
          reason: historic ? ("historic" as const) : null,
          paid_until: null,
          last_invoice_status: null,
          last_invoice_month: null,
        };
      }
      const sub = subMap.get(uid);
      const inv = invMap.get(uid) || null;
      let status: "paid" | "exempt" | "pending" | "overdue" | "blocked" | "cancelled" | "none" = "none";
      let reason: "historic" | null = null;
      if (sub && (sub.status === "exempt_monthly" || sub.status === "exempt_annual" || sub.status === "exempt_permanent")) status = "exempt";
      else if (inv?.status === "blocked") status = "blocked";
      else if (inv?.status === "overdue") status = "overdue";
      else if (inv?.status === "pending") status = "pending";
      else if (sub?.paid_until && sub.paid_until >= today) status = "paid";
      else if (inv?.status === "paid") status = "paid";
      else if (inv?.status === "exempted") status = "exempt";
      else if (inv?.status === "cancelled") status = "cancelled";
      else if (historic) { status = "exempt"; reason = "historic"; }
      return {
        status,
        reason,
        paid_until: sub?.paid_until ?? null,
        last_invoice_status: inv?.status ?? null,
        last_invoice_month: inv?.reference_month ?? null,
      };
    };

    return {
      specialties: ((specs || []) as Array<{ key: string; label: string; requires_admin_setup: boolean; default_tabs: unknown }>)
        .map((s) => ({ key: s.key, label: s.label, requires_admin_setup: !!s.requires_admin_setup })),
      professionals: rows.map((r) => ({
        ...r,
        email_confirmed: r.profile?.user_id ? !!confirmedMap.get(r.profile.user_id) : false,
        monthly: computeMonthly(r.profile?.user_id, r.activation_source === "already_coach" || !!r.already_coach),
      })),
    };

  });


export const adminConfirmProfessionalEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ coachId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro } = await supabaseAdmin
      .from("coaches").select("id, profile_id").eq("id", data.coachId).maybeSingle();
    if (!pro) throw new Error("Profissional não encontrado");
    const { confirmAuthEmailByProfileId } = await import("./admin-network.server");
    await confirmAuthEmailByProfileId((pro as { profile_id: string }).profile_id);
    await logAudit(actorId, (pro as { profile_id: string }).profile_id, "professional_email_confirmed", "E-mail confirmado manualmente pelo admin");
    return { ok: true };
  });

export const adminSetProfessionalSpecialty = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      coachId: z.string().uuid(),
      specialtyKey: z.string().min(1),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro } = await supabaseAdmin
      .from("coaches").select("id, profile_id").eq("id", data.coachId).maybeSingle();
    if (!pro) throw new Error("Profissional não encontrado");
    const { data: spec } = await supabaseAdmin
      .from("professional_specialties")
      .select("key, label, requires_admin_setup")
      .eq("key", data.specialtyKey)
      .maybeSingle();
    if (!spec) throw new Error("Especialidade inválida");
    const s = spec as { key: string; label: string; requires_admin_setup: boolean };
    const { error } = await supabaseAdmin
      .from("coaches")
      .update({
        specialty_key: s.key,
        specialty_pending_setup: !!s.requires_admin_setup,
      } as never)
      .eq("id", data.coachId);
    if (error) throw new Error(error.message);
    await logAudit(actorId, (pro as { profile_id: string }).profile_id, "professional_specialty_set", `Especialidade definida: ${s.label}`);
    return { ok: true };
  });

export const adminGrantProfessionalActivation = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      coachId: z.string().uuid(),
      note: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres)").max(500),
      source: z.enum(["admin_grant", "waived_annual"]).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro } = await supabaseAdmin
      .from("coaches").select("id, profile_id, activation_paid_at").eq("id", data.coachId).maybeSingle();
    if (!pro) throw new Error("Profissional não encontrado");
    const p = pro as { id: string; profile_id: string; activation_paid_at: string | null };
    const nowIso = new Date().toISOString();
    const source = data.source
      ?? (data.note.toLowerCase().startsWith("anuidade isenta") ? "waived_annual" : "admin_grant");
    const { error } = await supabaseAdmin.from("coaches").update({
      activation_paid_at: p.activation_paid_at || nowIso,
      activation_source: source,
      activation_granted_by: context.userId,
      activation_note: data.note,
    } as never).eq("id", p.id);
    if (error) throw new Error(error.message);
    await supabaseAdmin.from("notifications").insert({
      profile_id: p.profile_id,
      type: "professional_onboarding",
      title: source === "waived_annual" ? "Anuidade isenta" : "Ativação liberada",
      message: source === "waived_annual"
        ? "Sua anuidade de profissional foi isenta pelo admin."
        : "Sua ativação de profissional foi liberada pelo admin.",
      action_url: "/professional",
    });
    await logAudit(actorId, p.profile_id, "professional_activation_paid",
      `${source === "waived_annual" ? "Anuidade isenta" : "Ativação concedida"} pelo admin. Motivo: ${data.note}`);
    return { ok: true };
  });

export const adminApproveProfessionalFinal = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ coachId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: pro } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, specialty_key, approved_at, activation_paid_at")
      .eq("id", data.coachId)
      .maybeSingle();
    if (!pro) throw new Error("Profissional não encontrado");
    const p = pro as { id: string; profile_id: string; specialty_key: string | null; approved_at: string | null; activation_paid_at: string | null };
    if (!p.specialty_key) throw new Error("Defina a especialidade antes de aprovar.");
    if (!p.activation_paid_at) throw new Error("Conceda / confirme a ativação antes de aprovar.");

    const nowIso = new Date().toISOString();
    const { confirmAuthEmailByProfileId, notifyProfile } = await import("./admin-network.server");

    // Garante e-mail confirmado
    await confirmAuthEmailByProfileId(p.profile_id);

    const { error: updErr } = await supabaseAdmin
      .from("coaches")
      .update({
        approved_at: p.approved_at || nowIso,
        approved_by: actorId,
        onboarding_stage: "released",
      } as never)
      .eq("id", p.id);
    if (updErr) throw new Error("Falha ao aprovar profissional: " + updErr.message);

    const { error: profErr } = await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", p.profile_id);
    if (profErr) throw new Error("Falha ao ativar perfil: " + profErr.message);

    await notifyProfile(
      p.profile_id,
      "professional_approved",
      "Cadastro de profissional aprovado! 🎉",
      "Seu painel de profissional foi liberado. Acesse e configure seu atendimento.",
      "/professional",
    );

    await logAudit(actorId, p.profile_id, "professional_approved_final", "Profissional aprovado e painel liberado");
    return { ok: true };
  });

export const getMyProfessionalOnboarding = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id, name, email").eq("user_id", context.userId).maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");
    const p = profile as { id: string; name?: string; email?: string };
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, is_professional, specialty_key, activation_paid_at, activation_source, approved_at, already_coach")
      .eq("profile_id", p.id).maybeSingle();
    if (!coach) return null;
    const c = coach as {
      id: string; is_professional: boolean | null; specialty_key: string | null;
      activation_paid_at: string | null; activation_source: string | null;
      approved_at: string | null; already_coach: boolean | null;
    };
    return {
      isProfessional: !!c.is_professional,
      profileId: p.id,
      coachId: c.id,
      name: p.name || "",
      email: p.email || "",
      specialtyKey: c.specialty_key,
      activationPaidAt: c.activation_paid_at,
      activationSource: c.activation_source,
      approvedAt: c.approved_at,
      alreadyCoach: !!c.already_coach,
    };
  });


export const getProfessionalReleaseAudit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ profileId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: rows } = await supabaseAdmin
      .from("admin_audit_log")
      .select("id, action, notes, created_at, actor_profile_id")
      .eq("target_profile_id", data.profileId)
      .in("action", [
        "professional_email_confirmed",
        "professional_specialty_set",
        "professional_activation_paid",
        "professional_approved_final",
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
