import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ACTIVATION_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77";
export const QUIZ_URL = "https://quiz-remember-share.lovable.app";
const QUIZ_URL_PREFIXES = [
  "https://quiz-remember-share.lovable.app",
  "https://diagnostic-quiz-craft.lovable.app",
];

export const getMyOnboardingStage = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase
      .from("profiles")
      .select("id, role, status, name, email")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return { isCoach: false as const };
    if (profile.role !== "coach" && profile.role !== "admin") return { isCoach: false as const };
    const { data: coach } = await supabase
      .from("coaches")
      .select("id, onboarding_stage, quiz_result_url, activation_paid_at, approved_at, upline_coach_id, already_coach")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) return { isCoach: false as const };

    let stage = (coach.onboarding_stage || "released") as
      | "awaiting_payment"
      | "awaiting_quiz_result"
      | "awaiting_upline_release"
      | "released";

    // Se o usuário é parceiro aprovado e ainda está em awaiting_payment, considera a ativação paga
    // e avança para o quiz comportamental — mas NÃO libera direto o painel; ele ainda precisa
    // enviar o resultado do quiz e digitar o ID do coach para liberar.
    if (stage === "awaiting_payment") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: approvedPartner } = await supabaseAdmin
        .from("partners")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("status", "approved")
        .maybeSingle();
      if (approvedPartner) {
        await supabaseAdmin
          .from("coaches")
          .update({
            onboarding_stage: "awaiting_quiz_result",
            activation_paid_at: coach.activation_paid_at || new Date().toISOString(),
          })
          .eq("id", coach.id);
        stage = "awaiting_quiz_result";
      }
    }


    // Auto-advance: se a pessoa já comprou a Ativação Coach antes de virar coach,
    // pula a etapa de pagamento e vai direto para o quiz de perfil comportamental.
    if (stage === "awaiting_payment") {
      const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
      const { data: student } = await supabaseAdmin
        .from("students")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (student?.id) {
        const { data: paidOrders } = await supabaseAdmin
          .from("store_orders")
          .select("id, store_order_items(product_id, store_product_id, digital_product_id)")
          .eq("student_id", student.id)
          .eq("status", "paid");
        const orderWithActivation = (paidOrders || []).find((o) => {
          const items = (o as { store_order_items?: Array<{ product_id?: string | null; store_product_id?: string | null; digital_product_id?: string | null }> }).store_order_items || [];
          return items.some((i) =>
            i.product_id === ACTIVATION_PRODUCT_ID ||
            i.store_product_id === ACTIVATION_PRODUCT_ID ||
            i.digital_product_id === ACTIVATION_PRODUCT_ID
          );
        });
        if (orderWithActivation) {
          await supabaseAdmin
            .from("coaches")
            .update({
              onboarding_stage: "awaiting_quiz_result",
              activation_paid_at: new Date().toISOString(),
              activation_order_id: (orderWithActivation as { id: string }).id,
              activation_source: "purchased",
            } as never)
            .eq("id", coach.id);
          stage = "awaiting_quiz_result";
        }
      }
    }


    return {
      isCoach: true as const,
      profileId: profile.id,
      coachId: coach.id,
      name: profile.name,
      email: profile.email,
      stage,
      quizResultUrl: coach.quiz_result_url,
      uplineCoachId: coach.upline_coach_id,
      approvedAt: coach.approved_at,
      alreadyCoach: Boolean((coach as { already_coach?: boolean }).already_coach),
    };
  });

export const markAlreadyCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id, name").eq("user_id", userId).maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, onboarding_stage").eq("profile_id", profile.id).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    if (coach.onboarding_stage !== "awaiting_payment") {
      throw new Error("Esta opção só está disponível antes do pagamento da ativação.");
    }
    await supabaseAdmin
      .from("coaches")
      .update({
        already_coach: true,
        onboarding_stage: "awaiting_quiz_result",
        activation_paid_at: new Date().toISOString(),
        activation_source: "already_coach",
      } as never)
      .eq("id", coach.id);

    const { notifyAdmins } = await import("./coach-onboarding.server");
    await notifyAdmins(
      "Coach já formado solicitou liberação",
      `${profile.name} declarou que já fez o curso e já pagou a ativação. Avalie e libere o painel manualmente.`
    );
    return { ok: true };
  });

// Verifica se o aluno (ainda não-coach) já comprou a Ativação Coach.
export const hasPurchasedActivation = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return { purchased: false as const };
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!student?.id) return { purchased: false as const };
    const { data: paidOrders } = await supabaseAdmin
      .from("store_orders")
      .select("id, store_order_items(product_id, store_product_id, digital_product_id)")
      .eq("student_id", student.id)
      .eq("status", "paid");
    const found = (paidOrders || []).some((o) => {
      const items = (o as { store_order_items?: Array<{ product_id?: string | null; store_product_id?: string | null; digital_product_id?: string | null }> }).store_order_items || [];
      return items.some((i) =>
        i.product_id === ACTIVATION_PRODUCT_ID ||
        i.store_product_id === ACTIVATION_PRODUCT_ID ||
        i.digital_product_id === ACTIVATION_PRODUCT_ID
      );
    });
    return { purchased: found };
  });

export const submitQuizResult = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ url: z.string().min(1).max(5000) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const raw = data.url.trim();
    // Aceita tanto um link puro quanto o texto colado do resultado (extrai o primeiro URL válido).
    let url = raw;
    if (!/^https?:\/\//i.test(url)) {
      const match = raw.match(/https?:\/\/[^\s)>\]"']+/i);
      if (match) url = match[0];
    }
    url = url.replace(/[.,;)\]>"']+$/, "");
    if (url.length > 1000) url = url.slice(0, 1000);
    if (!/^https?:\/\//i.test(url) || !QUIZ_URL_PREFIXES.some((p) => url.startsWith(p))) {
      throw new Error(`Cole o link da página de resultado (deve começar com ${QUIZ_URL}).`);
    }
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, onboarding_stage")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    if (coach.onboarding_stage !== "awaiting_quiz_result") {
      throw new Error("Sua etapa atual não permite o envio do resultado.");
    }
    await supabaseAdmin
      .from("coaches")
      .update({
        quiz_result_url: url,
        quiz_result_submitted_at: new Date().toISOString(),
        onboarding_stage: "awaiting_upline_release",
      })
      .eq("id", coach.id);

    const { notifyUpline, notifyAdmins } = await import("./coach-onboarding.server");
    await notifyUpline(
      coach.id,
      "Novo coach aguardando liberação",
      `${profile.name} enviou o resultado do quiz e aguarda liberação do painel.`
    );
    await notifyAdmins(
      "Coach aguardando liberação",
      `${profile.name} concluiu o quiz de formação e aguarda liberação.`
    );
    return { ok: true };
  });

export const unlockCoachWithId = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z
      .object({ coachNumber: z.number().int().positive().max(9999999) })
      .parse(input)
  )
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, name")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");
    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, coach_number, onboarding_stage, unlock_attempts, approved_at")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");

    if (coach.onboarding_stage === "released") {
      return {
        ok: true,
        alreadyReleased: true,
        approvedAt: coach.approved_at as string | null,
        coachNumber: coach.coach_number as number | null,
      };
    }
    if (coach.onboarding_stage !== "awaiting_upline_release") {
      throw new Error("Conclua as etapas anteriores antes de liberar o ID.");
    }

    const attempts = (coach as { unlock_attempts?: number }).unlock_attempts ?? 0;
    if (attempts >= 10) {
      throw new Error(
        "Limite de tentativas excedido. Entre em contato com o suporte para liberar o seu ID."
      );
    }

    const success = !!coach.coach_number && coach.coach_number === data.coachNumber;
    const nowIso = new Date().toISOString();

    await supabaseAdmin.from("coach_unlock_attempts" as never).insert({
      coach_id: coach.id,
      profile_id: coach.profile_id,
      attempted_number: data.coachNumber,
      success,
    } as never);

    if (!success) {
      await supabaseAdmin
        .from("coaches")
        .update({
          unlock_attempts: attempts + 1,
          last_unlock_attempt_at: nowIso,
          last_unlock_failed_at: nowIso,
        })
        .eq("id", coach.id);
      throw new Error(
        `ID inválido. Confira o número que veio com seu certificado. (${attempts + 1}/10 tentativas)`
      );
    }

    await supabaseAdmin
      .from("coaches")
      .update({
        onboarding_stage: "released",
        approved_at: nowIso,
        last_unlock_attempt_at: nowIso,
      })
      .eq("id", coach.id);
    await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", coach.profile_id);
    await supabaseAdmin.from("notifications").insert({
      profile_id: coach.profile_id,
      type: "coach_onboarding",
      title: "🎉 Seu painel de coach foi liberado!",
      message: "Acesso completo ao painel e ao app do aluno disponível.",
      action_url: "/coach",
    });
    return {
      ok: true,
      alreadyReleased: false,
      approvedAt: nowIso,
      coachNumber: coach.coach_number as number | null,
    };
  });

export const listCoachIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || me.role !== "admin") throw new Error("Acesso negado");

    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select(
        "id, coach_number, onboarding_stage, activation_paid_at, approved_at, unlock_attempts, last_unlock_attempt_at, last_unlock_failed_at, profile:profiles!coaches_profile_id_fkey(name,email)"
      )
      .order("coach_number", { ascending: true, nullsFirst: false });

    return (coaches || []) as unknown as Array<{
      id: string;
      coach_number: number | null;
      onboarding_stage: string;
      activation_paid_at: string | null;
      approved_at: string | null;
      unlock_attempts: number | null;
      last_unlock_attempt_at: string | null;
      last_unlock_failed_at: string | null;
      profile: { name?: string; email?: string } | null;
    }>;
  });

export const listPendingReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || me.role !== "admin") throw new Error("Acesso negado");
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select(
        "id, onboarding_stage, quiz_result_url, quiz_result_submitted_at, activation_paid_at, upline_coach_id, profile:profiles!coaches_profile_id_fkey(name,email,phone)"
      )
      .in("onboarding_stage", ["awaiting_quiz_result", "awaiting_upline_release"])
      .order("quiz_result_submitted_at", { ascending: false });

    const uplineIds = [
      ...new Set(
        ((coaches || []) as Array<{ upline_coach_id: string | null }>)
          .map((c) => c.upline_coach_id)
          .filter(Boolean) as string[]
      ),
    ];
    const { data: uplines } = uplineIds.length
      ? await supabaseAdmin
          .from("coaches")
          .select("id, profile:profiles!coaches_profile_id_fkey(name)")
          .in("id", uplineIds)
      : { data: [] };
    const uplineMap = new Map(
      ((uplines || []) as Array<{ id: string; profile?: { name?: string } | null }>).map((u) => [
        u.id,
        u.profile?.name || "—",
      ])
    );
    return ((coaches || []) as Array<Record<string, unknown>>).map((c) => ({
      ...c,
      upline_name: c.upline_coach_id ? uplineMap.get(c.upline_coach_id as string) || null : null,
    }));
  });

export const releaseCoach = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ coachId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("id, role")
      .eq("user_id", userId)
      .maybeSingle();
    if (!me || me.role !== "admin") throw new Error("Acesso negado");

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .eq("id", data.coachId)
      .maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");

    const { confirmAuthEmailByProfileId } = await import("./admin-network.server");
    await confirmAuthEmailByProfileId(coach.profile_id);

    await supabaseAdmin
      .from("coaches")
      .update({
        onboarding_stage: "released",
        approved_at: new Date().toISOString(),
      })
      .eq("id", coach.id);
    await supabaseAdmin
      .from("profiles")
      .update({ status: "active" })
      .eq("id", coach.profile_id);
    await supabaseAdmin.from("notifications").insert({
      profile_id: coach.profile_id,
      type: "coach_onboarding",
      title: "🎉 Seu painel de coach foi liberado!",
      message: "Acesso completo ao painel e ao app do aluno disponível.",
      action_url: "/coach",
    });
    return { ok: true };
  });

// ============================================================
// ADMIN: liberação de coach por etapas (checkpoints individuais)
// ============================================================

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: me } = await supabaseAdmin
    .from("profiles").select("id, role").eq("user_id", userId).maybeSingle();
  if (!me || me.role !== "admin") throw new Error("Acesso negado");
  return me.id as string;
}

async function logCoachAudit(
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

export const listAllCoachReleases = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { includeReleased?: boolean } | undefined) =>
    z.object({ includeReleased: z.boolean().optional() }).parse(input ?? {})
  )
  .handler(async ({ data, context }) => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const stages = data.includeReleased
      ? ["awaiting_payment", "awaiting_quiz_result", "awaiting_upline_release", "released"]
      : ["awaiting_payment", "awaiting_quiz_result", "awaiting_upline_release"];
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select(
        "id, onboarding_stage, quiz_result_url, quiz_result_submitted_at, activation_paid_at, approved_at, coach_number, upline_coach_id, already_coach, is_professional, profile:profiles!coaches_profile_id_fkey(id,name,email,phone,user_id)"
      )
      .in("onboarding_stage", stages)
      .order("created_at", { ascending: false });

    const rows = (coaches || []) as Array<{
      id: string;
      onboarding_stage: string;
      quiz_result_url: string | null;
      quiz_result_submitted_at: string | null;
      activation_paid_at: string | null;
      approved_at: string | null;
      coach_number: number | null;
      upline_coach_id: string | null;
      already_coach: boolean | null;
      is_professional: boolean | null;
      profile: { id: string; name?: string; email?: string; phone?: string; user_id?: string } | null;
    }>;

    // Partner status por profile_id
    const profileIds = rows.map((r) => r.profile?.id).filter(Boolean) as string[];
    const { data: partnersData } = profileIds.length
      ? await supabaseAdmin.from("partners").select("profile_id, status").in("profile_id", profileIds)
      : { data: [] };
    const partnerMap = new Map(
      ((partnersData || []) as Array<{ profile_id: string; status: string }>).map((p) => [p.profile_id, p.status])
    );

    // upline names
    const uplineIds = [...new Set(rows.map((r) => r.upline_coach_id).filter(Boolean) as string[])];
    const { data: uplines } = uplineIds.length
      ? await supabaseAdmin.from("coaches")
          .select("id, profile:profiles!coaches_profile_id_fkey(name)").in("id", uplineIds)
      : { data: [] };
    const uplineMap = new Map(
      ((uplines || []) as Array<{ id: string; profile?: { name?: string } | null }>).map(
        (u) => [u.id, u.profile?.name || "—"]
      )
    );

    // email_confirmed por user_id (best-effort, paralelo)
    const userIds = rows.map((r) => r.profile?.user_id).filter(Boolean) as string[];
    const confirmedMap = new Map<string, boolean>();
    await Promise.all(
      userIds.map(async (uid) => {
        try {
          const { data } = await supabaseAdmin.auth.admin.getUserById(uid);
          confirmedMap.set(uid, !!data.user?.email_confirmed_at);
        } catch {
          confirmedMap.set(uid, false);
        }
      })
    );

    // Mensalidade por user_id: pega assinatura + última fatura
    const subUserIds = rows.map((r) => r.profile?.user_id).filter(Boolean) as string[];
    const { data: subs } = subUserIds.length
      ? await supabaseAdmin
          .from("user_subscriptions")
          .select("user_id, status, paid_until, exempt_until")
          .in("user_id", subUserIds)
      : { data: [] };
    const subMap = new Map(
      ((subs || []) as Array<{ user_id: string; status: string; paid_until: string | null; exempt_until: string | null }>)
        .map((s) => [s.user_id, s])
    );
    const { data: invs } = subUserIds.length
      ? await supabaseAdmin
          .from("subscription_invoices")
          .select("user_id, status, reference_month, due_date")
          .in("user_id", subUserIds)
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
      upline_name: r.upline_coach_id ? uplineMap.get(r.upline_coach_id) || null : null,
      email_confirmed: r.profile?.user_id ? !!confirmedMap.get(r.profile.user_id) : false,
      monthly: computeMonthly(r.profile?.user_id),
      partner_status: r.profile?.id ? partnerMap.get(r.profile.id) ?? null : null,
    }));
  });

export const adminConfirmCoachEmail = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ coachId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, profile_id").eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    const { confirmAuthEmailByProfileId } = await import("./admin-network.server");
    await confirmAuthEmailByProfileId(coach.profile_id);
    await logCoachAudit(actorId, coach.profile_id, "coach_email_confirmed", "E-mail confirmado manualmente pelo admin");
    return { ok: true };
  });

export const adminMarkActivationPaid = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      coachId: z.string().uuid(),
      note: z.string().trim().min(5, "Justificativa obrigatória (mín. 5 caracteres)").max(500),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, profile_id, onboarding_stage, activation_paid_at")
      .eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    const nowIso = new Date().toISOString();
    const nextStage = coach.onboarding_stage === "awaiting_payment"
      ? "awaiting_quiz_result"
      : coach.onboarding_stage;
    await supabaseAdmin.from("coaches").update({
      activation_paid_at: coach.activation_paid_at || nowIso,
      activation_source: "admin_grant",
      activation_granted_by: context.userId,
      activation_note: data.note,
      onboarding_stage: nextStage,
    } as never).eq("id", coach.id);
    await supabaseAdmin.from("notifications").insert({
      profile_id: coach.profile_id,
      type: "coach_onboarding",
      title: "Pagamento da ativação confirmado",
      message: "Agora envie o resultado do quiz comportamental para seguir.",
      action_url: "/coach",
    });
    await logCoachAudit(actorId, coach.profile_id, "coach_activation_paid", `Ativação concedida pelo admin. Motivo: ${data.note}`);
    return { ok: true };
  });


export const adminApproveQuiz = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ coachId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, profile_id, onboarding_stage, quiz_result_submitted_at")
      .eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("coaches").update({
      onboarding_stage: "awaiting_upline_release",
      quiz_result_submitted_at: coach.quiz_result_submitted_at || nowIso,
    }).eq("id", coach.id);
    await supabaseAdmin.from("notifications").insert({
      profile_id: coach.profile_id,
      type: "coach_onboarding",
      title: "Quiz aprovado",
      message: "Aguarde a liberação final do seu painel de coach.",
      action_url: "/coach",
    });
    await logCoachAudit(actorId, coach.profile_id, "coach_quiz_approved", "Quiz comportamental aprovado pelo admin");
    return { ok: true };
  });

export const adminAssignCoachIdAndRelease = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      coachId: z.string().uuid(),
      coachNumber: z.number().int().positive().max(9999999).optional(),
    }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const actorId = await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, profile_id, coach_number, onboarding_stage")
      .eq("id", data.coachId).maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");

    let nextNumber = coach.coach_number as number | null;
    if (data.coachNumber) {
      // garante unicidade
      const { data: dup } = await supabaseAdmin
        .from("coaches").select("id").eq("coach_number", data.coachNumber).neq("id", coach.id).maybeSingle();
      if (dup) throw new Error("Este ID já está em uso por outro coach.");
      nextNumber = data.coachNumber;
    }
    if (!nextNumber) throw new Error("Informe o ID de coach para liberar.");

    // garante email confirmado
    const { confirmAuthEmailByProfileId } = await import("./admin-network.server");
    try { await confirmAuthEmailByProfileId(coach.profile_id); } catch { /* ignore se já confirmado */ }

    const nowIso = new Date().toISOString();
    await supabaseAdmin.from("coaches").update({
      coach_number: nextNumber,
      onboarding_stage: "released",
      approved_at: nowIso,
    }).eq("id", coach.id);
    await supabaseAdmin.from("profiles").update({ status: "active" }).eq("id", coach.profile_id);
    await supabaseAdmin.from("notifications").insert({
      profile_id: coach.profile_id,
      type: "coach_onboarding",
      title: "🎉 Seu painel de coach foi liberado!",
      message: `Seu ID de coach é ${nextNumber}. Acesso completo disponível.`,
      action_url: "/coach",
    });
    await logCoachAudit(
      actorId,
      coach.profile_id,
      "coach_id_assigned_released",
      `ID ${nextNumber} atribuído e painel liberado`,
    );
    return { ok: true, coachNumber: nextNumber };
  });

export const getCoachReleaseAudit = createServerFn({ method: "GET" })
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
        "coach_email_confirmed",
        "coach_activation_paid",
        "coach_quiz_approved",
        "coach_id_assigned_released",
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
    const actorMap = new Map(
      ((actors || []) as Array<{ id: string; name?: string }>).map((a) => [a.id, a.name || "—"]),
    );
    return ((rows || []) as Array<{
      id: string;
      action: string;
      notes: string | null;
      created_at: string;
      actor_profile_id: string | null;
    }>).map((r) => ({
      ...r,
      actor_name: r.actor_profile_id ? actorMap.get(r.actor_profile_id) || "—" : "—",
    }));
  });
