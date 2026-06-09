import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

async function getCoachIdForUser(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

/** Read the current coach's Master Coach commission percentage (10..70, default 10). */
export const getMyMasterCoachCommissionPct = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) return 10;
    const { data } = await supabaseAdmin
      .from("coaches")
      .select("master_coach_commission_pct" as never)
      .eq("id", coachId)
      .maybeSingle();
    const v = Number((data as unknown as { master_coach_commission_pct?: number } | null)?.master_coach_commission_pct ?? 10);
    if (!isFinite(v)) return 10;
    return Math.min(70, Math.max(10, v));
  });

/** Update the current coach's Master Coach commission percentage. */
export const updateMyMasterCoachCommissionPct = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { pct: number })
  .handler(async ({ context, data }) => {
    const coachId = await getCoachIdForUser(context.userId);
    if (!coachId) throw new Error("Coach não encontrado");
    let pct = Number(data.pct);
    if (!isFinite(pct)) throw new Error("Valor inválido");
    pct = Math.min(70, Math.max(10, Math.round(pct)));
    const { error } = await supabaseAdmin
      .from("coaches")
      .update({ master_coach_commission_pct: pct } as never)
      .eq("id", coachId);
    if (error) throw new Error(error.message);
    return { ok: true, pct };
  });
