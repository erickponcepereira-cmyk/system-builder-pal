import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CoachGoalsPayload = {
  new_students: number;
  renewals: number;
  prospections: number;
  revenue: number;
  reference_month?: string; // YYYY-MM-01; defaults to current month
  coachId?: string; // optional override (admins only)
};

async function resolveCoachId(userId: string, override?: string): Promise<string> {
  // If override provided, check admin
  if (override) {
    const { data: prof } = await supabaseAdmin
      .from("profiles")
      .select("role")
      .eq("user_id", userId)
      .maybeSingle();
    if (prof?.role !== "admin") throw new Error("Apenas admin pode editar metas de outro coach");
    return override;
  }
  // Resolve via profile -> coach
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Você não está vinculado a um cadastro de coach");
  return coach.id;
}

export const getCoachGoals = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => (d || {}) as { coachId?: string; reference_month?: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const coachId = await resolveCoachId(context.userId, data.coachId);
    const month = data.reference_month || new Date().toISOString().slice(0, 7) + "-01";
    const { data: row } = await supabaseAdmin
      .from("coach_goals")
      .select("new_students,renewals,prospections,revenue")
      .eq("coach_id", coachId)
      .eq("reference_month", month)
      .maybeSingle();
    return { coachId, month, goals: row || null };
  });

export const saveCoachGoals = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as CoachGoalsPayload)
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const coachId = await resolveCoachId(context.userId, data.coachId);
    const month = data.reference_month || new Date().toISOString().slice(0, 7) + "-01";
    const { error } = await supabaseAdmin
      .from("coach_goals")
      .upsert(
        {
          coach_id: coachId,
          reference_month: month,
          new_students: Number(data.new_students) || 0,
          renewals: Number(data.renewals) || 0,
          prospections: Number(data.prospections) || 0,
          revenue: Number(data.revenue) || 0,
        },
        { onConflict: "coach_id,reference_month" },
      );
    if (error) throw new Error(error.message);
    return { ok: true, coachId, month };
  });
