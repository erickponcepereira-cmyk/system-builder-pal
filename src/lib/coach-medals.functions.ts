import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { tzCurrentYearMonth } from "@/lib/timezone";


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

/**
 * Venda própria do coach, da mesma fonte que as patentes e o ranking usam.
 *
 * Era calculada aqui à mão, e cada painel calculava do seu jeito — três contas
 * para a mesma coisa, três números na mesma tela. Agora é `coach_vp_no_periodo`
 * no banco: transações e pedidos de loja dos alunos dele, mais os pedidos de
 * parceiro/profissional que ELE vendeu (`selling_coach_id`). Ser dono do produto
 * não entra: contar produto criado premiava quem só cadastrou.
 *
 * A função no banco já descarta `is_test`, que este cálculo não filtrava.
 */
async function sumOwnVp(coachId: string, sinceIso: string | null): Promise<number> {
  const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
  const cutoff = await getServerCutoffIso();
  const effectiveSince = cutoff
    ? (sinceIso && sinceIso > cutoff ? sinceIso : cutoff)
    : sinceIso;
  const { data } = await supabaseAdmin.rpc("coach_vp_no_periodo" as never, {
    _desde: effectiveSince,
    _ate: new Date().toISOString(),
  } as never);
  const linha = ((data as unknown as Array<{ coach_id: string; vp: number }>) || [])
    .find((r) => r.coach_id === coachId);
  return Number(linha?.vp ?? 0);
}


export const getIndividualCareer = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<IndividualCareer> => {
    const { year: tzYear, month: tzMonth0 } = tzCurrentYearMonth();
    const year = tzYear;
    const month = tzMonth0 + 1;
    // Início do mês no fuso do app (UTC-4), evitando virada antecipada.
    const startOfMonth = new Date(Date.UTC(year, month - 1, 1, 4)).toISOString();


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
