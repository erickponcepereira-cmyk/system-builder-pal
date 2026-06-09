import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

type Holder =
  | { kind: "coach"; id: string }
  | { kind: "partner"; id: string }
  | null;

async function getHolderForUser(userId: string): Promise<Holder> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;

  // Prefer coach record (covers coach + professional, since professionals live in coaches)
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  if (coach?.id) return { kind: "coach", id: coach.id };

  const { data: partner } = await supabaseAdmin
    .from("partners").select("id").eq("profile_id", profile.id).maybeSingle();
  if (partner?.id) return { kind: "partner", id: partner.id };

  return null;
}

function clampPct(v: unknown): number {
  const n = Number(v);
  if (!isFinite(n)) return 10;
  return Math.min(70, Math.max(10, Math.round(n)));
}

/** Read the current user's Master Coach commission percentage (10..70, default 10). */
export const getMyMasterCoachCommissionPct = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<number> => {
    const holder = await getHolderForUser(context.userId);
    if (!holder) return 10;
    const table = holder.kind === "coach" ? "coaches" : "partners";
    const { data } = await supabaseAdmin
      .from(table)
      .select("master_coach_commission_pct" as never)
      .eq("id", holder.id)
      .maybeSingle();
    return clampPct((data as unknown as { master_coach_commission_pct?: number } | null)?.master_coach_commission_pct ?? 10);
  });

/** Update the current user's Master Coach commission percentage. */
export const updateMyMasterCoachCommissionPct = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { pct: number })
  .handler(async ({ context, data }) => {
    const holder = await getHolderForUser(context.userId);
    if (!holder) throw new Error("Perfil não encontrado");
    const pct = clampPct(data.pct);
    const table = holder.kind === "coach" ? "coaches" : "partners";
    const { error } = await supabaseAdmin
      .from(table)
      .update({ master_coach_commission_pct: pct } as never)
      .eq("id", holder.id);
    if (error) throw new Error(error.message);
    return { ok: true, pct };
  });
