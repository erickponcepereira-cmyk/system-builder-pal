import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type MedalRule = {
  id: string;
  kind: "monthly" | "cumulative";
  key: string;
  display_name: string;
  threshold: number;
  tier: string | null;
  icon: string | null;
  image_url: string | null;
  sort_order: number;
};


export type EarnedMedal = {
  medal_kind: "monthly" | "cumulative";
  medal_key: string;
  period_year: number | null;
  period_month: number | null;
  vp_amount: number;
  awarded_at: string;
};

export type IndividualCareer = {
  coachId: string | null;
  vpThisMonth: number;
  vpLifetime: number;
  currentMonth: { year: number; month: number };
  monthlyRules: MedalRule[];
  cumulativeRules: MedalRule[];
  earned: EarnedMedal[];
};

async function resolveCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

async function sumOwnVp(coachId: string, sinceIso: string | null): Promise<number> {
  const { data: studs } = await supabaseAdmin
    .from("students").select("id").eq("coach_id", coachId);
  const ids = ((studs as { id: string }[] | null) || []).map((s) => s.id);
  if (ids.length === 0) return 0;
  let total = 0;
  let txq = supabaseAdmin
    .from("transactions").select("gross_amount")
    .in("student_id", ids).eq("status", "paid")
    .not("paid_at", "is", null);
  if (sinceIso) txq = txq.gte("paid_at", sinceIso);
  const { data: txs } = await txq;
  ((txs as { gross_amount: number }[] | null) || []).forEach((t) => { total += Number(t.gross_amount) || 0; });
  let oq = supabaseAdmin
    .from("store_orders").select("total_amount")
    .in("student_id", ids).eq("status", "paid");
  if (sinceIso) oq = oq.gte("updated_at", sinceIso);
  const { data: orders } = await oq;
  ((orders as { total_amount: number }[] | null) || []).forEach((o) => { total += Number(o.total_amount) || 0; });
  return total;
}

export const getIndividualCareer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IndividualCareer> => {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = now.getUTCMonth() + 1;
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1)).toISOString();

    const { data: rulesRaw } = await supabaseAdmin
      .from("career_medal_rules" as never)
      .select("id,kind,key,display_name,threshold,tier,icon,image_url,sort_order")

      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const allRules = ((rulesRaw as unknown as MedalRule[] | null) || []).map((r) => ({
      ...r,
      threshold: Number(r.threshold) || 0,
      sort_order: Number(r.sort_order) || 0,
    }));
    const monthlyRules = allRules.filter((r) => r.kind === "monthly");
    const cumulativeRules = allRules.filter((r) => r.kind === "cumulative");

    const coachId = await resolveCoachId(context.userId);
    if (!coachId) {
      return {
        coachId: null,
        vpThisMonth: 0,
        vpLifetime: 0,
        currentMonth: { year, month },
        monthlyRules,
        cumulativeRules,
        earned: [],
      };
    }

    const [vpThisMonth, vpLifetime] = await Promise.all([
      sumOwnVp(coachId, startOfMonth),
      sumOwnVp(coachId, null),
    ]);

    // Auto-award: insert any medal rules now satisfied (monthly for this period; cumulative all-time)
    const toInsert: Array<{
      coach_id: string;
      medal_kind: "monthly" | "cumulative";
      medal_key: string;
      period_year: number | null;
      period_month: number | null;
      vp_amount: number;
    }> = [];
    for (const r of monthlyRules) {
      if (vpThisMonth >= r.threshold) {
        toInsert.push({ coach_id: coachId, medal_kind: "monthly", medal_key: r.key, period_year: year, period_month: month, vp_amount: vpThisMonth });
      }
    }
    for (const r of cumulativeRules) {
      if (vpLifetime >= r.threshold) {
        toInsert.push({ coach_id: coachId, medal_kind: "cumulative", medal_key: r.key, period_year: null, period_month: null, vp_amount: vpLifetime });
      }
    }
    if (toInsert.length) {
      // Insert ignoring duplicates (unique index on coach+kind+key+period)
      for (const row of toInsert) {
        await supabaseAdmin
          .from("coach_medals_individual" as never)
          .insert(row as never)
          .then(() => undefined, () => undefined);
      }
    }

    const { data: earnedRaw } = await supabaseAdmin
      .from("coach_medals_individual" as never)
      .select("medal_kind,medal_key,period_year,period_month,vp_amount,awarded_at")
      .eq("coach_id", coachId)
      .order("awarded_at", { ascending: false });
    const earned = ((earnedRaw as unknown as EarnedMedal[] | null) || []).map((e) => ({
      ...e,
      vp_amount: Number(e.vp_amount) || 0,
    }));

    return {
      coachId,
      vpThisMonth,
      vpLifetime,
      currentMonth: { year, month },
      monthlyRules,
      cumulativeRules,
      earned,
    };
  });
