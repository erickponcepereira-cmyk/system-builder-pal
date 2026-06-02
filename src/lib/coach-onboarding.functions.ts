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
    return {
      isCoach: true as const,
      profileId: profile.id,
      coachId: coach.id,
      name: profile.name,
      email: profile.email,
      stage: (coach.onboarding_stage || "released") as
        | "awaiting_payment"
        | "awaiting_quiz_result"
        | "awaiting_upline_release"
        | "released",
      quizResultUrl: coach.quiz_result_url,
      uplineCoachId: coach.upline_coach_id,
      approvedAt: coach.approved_at,
    };
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
    z.object({ coachNumber: z.number().int().positive().max(9999999) }).parse(input)
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
      .select("id, profile_id, coach_number, onboarding_stage")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) throw new Error("Coach não encontrado");
    if (coach.onboarding_stage === "released") {
      return { ok: true, alreadyReleased: true };
    }
    if (coach.onboarding_stage !== "awaiting_upline_release") {
      throw new Error("Conclua as etapas anteriores antes de liberar o ID.");
    }
    if (!coach.coach_number || coach.coach_number !== data.coachNumber) {
      throw new Error("ID inválido. Confira o número que veio com seu certificado.");
    }
    await supabaseAdmin
      .from("coaches")
      .update({ onboarding_stage: "released", approved_at: new Date().toISOString() })
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
    return { ok: true, alreadyReleased: false };
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
