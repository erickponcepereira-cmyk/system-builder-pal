import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const ACTIVATION_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77";
export const QUIZ_URL = "https://diagnostic-quiz-craft.lovable.app";

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
      .select("id, onboarding_stage, quiz_result_url, activation_paid_at, approved_at, upline_coach_id")
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
            })
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
    };
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
    z.object({ url: z.string().url().max(500) }).parse(input)
  )
  .handler(async ({ data, context }) => {
    const url = data.url.trim();
    if (!url.startsWith("https://diagnostic-quiz-craft.lovable.app")) {
      throw new Error("O link deve começar com https://diagnostic-quiz-craft.lovable.app");
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
