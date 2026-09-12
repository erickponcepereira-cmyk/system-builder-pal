import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PatentRule = {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  badge_color: string | null;
  badge_icon: string | null;
  image_url: string | null;
  required_revenue: number;
  time_window_months: number;
  min_own_sales_pct: number;
  max_team_sales_pct: number;
  vp_max_pct: number | null;
  ve_max_pct: number | null;
  phase: number | null;
  level: number;
  sort_order: number;
  benefits: string | null;
  is_active: boolean;
};


export type PatentAchievement = {
  patent_key: string;
  patent_level: number;
  achieved_at: string;
  qualifying_revenue: number;
};

export type CareerProgress = {
  coachId: string | null;
  patents: PatentRule[];
  windows: Record<number, { ownRevenue: number; teamRevenue: number; totalRevenue: number; ownPct: number }>;
  currentPatentKey: string | null;
  nextPatentKey: string | null;
  achievements: PatentAchievement[];
};

async function resolveCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}


export const getCareerProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareerProgress> => {
    const { data: rules } = await supabaseAdmin
      .from("patent_rules")
      .select("id,key,display_name,description,badge_color,badge_icon,image_url,required_revenue,time_window_months,min_own_sales_pct,max_team_sales_pct,vp_max_pct,ve_max_pct,phase,level,sort_order,benefits,is_active")

      .eq("is_active", true)
      .not("key", "is", null)
      .order("level", { ascending: true });
    const patents = ((rules as PatentRule[] | null) || []).map((r) => ({
      ...r,
      required_revenue: Number(r.required_revenue) || 0,
      time_window_months: Number(r.time_window_months) || 1,
      min_own_sales_pct: Number(r.min_own_sales_pct) || 0,
      max_team_sales_pct: Number(r.max_team_sales_pct) || 0,
      vp_max_pct: r.vp_max_pct == null ? null : Number(r.vp_max_pct),
      ve_max_pct: r.ve_max_pct == null ? null : Number(r.ve_max_pct),
      phase: r.phase == null ? null : Number(r.phase),
      level: Number(r.level) || 0,
    }));

    const myCoachId = await resolveCoachId(context.userId);
    const windows: CareerProgress["windows"] = {};
    if (!myCoachId) {
      return { coachId: null, patents, windows, currentPatentKey: null, nextPatentKey: patents[0]?.key ?? null, achievements: [] };
    }

    // Venda própria e de equipe vêm do banco, de `coach_vp_no_periodo` e
    // `coach_ve_no_periodo`. Antes cada painel tinha sua própria conta: este
    // somava até produto criado (`professional_coach_id`, `partner_id`), o de
    // medalhas somava só o que o coach vendeu, e o ranking da rede somava por
    // aluno. Três definições de "venda própria" davam três números na mesma
    // tela. A árvore do downline também era montada aqui e refeita a cada
    // janela; agora é uma recursiva dentro da função de equipe.
    const distinctWindows = Array.from(new Set(patents.map((p) => p.time_window_months))).filter((m) => m > 0);
    const ateIso = new Date().toISOString();
    for (const months of distinctWindows) {
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const sinceIso = since.toISOString();
      const [{ data: vpRows }, { data: veRows }] = await Promise.all([
        supabaseAdmin.rpc("coach_vp_no_periodo" as never, { _desde: sinceIso, _ate: ateIso } as never),
        supabaseAdmin.rpc("coach_ve_no_periodo" as never, { _desde: sinceIso, _ate: ateIso } as never),
      ]);
      const own = Number(
        ((vpRows as unknown as Array<{ coach_id: string; vp: number }>) || [])
          .find((r) => r.coach_id === myCoachId)?.vp ?? 0,
      );
      const team = Number(
        ((veRows as unknown as Array<{ coach_id: string; ve: number }>) || [])
          .find((r) => r.coach_id === myCoachId)?.ve ?? 0,
      );
      const total = own + team;
      const ownPct = total > 0 ? (own / total) * 100 : 100;
      windows[months] = { ownRevenue: own, teamRevenue: team, totalRevenue: total, ownPct };
    }

    // Maior patente atingida. Alcançar uma conquista todas as anteriores, e o
    // histórico nunca é removido — "uma vez nessa patente, para sempre".
    let currentPatentKey: string | null = null;
    let currentLevel = 0;
    const achievedNow: Array<{ key: string; level: number; qualifying: number }> = [];

    for (const p of patents) {
      const w = windows[p.time_window_months];
      if (!w) continue;
      if (p.required_revenue === 0) {
        if (p.level > currentLevel) { currentPatentKey = p.key; currentLevel = p.level; }
        achievedNow.push({ key: p.key, level: p.level, qualifying: 0 });
        continue;
      }
      // REGRA: `required_revenue` é a produção da janela ("R$ 20.000 em 6
      // meses") e `max_team_sales_pct` é o TETO da parte que pode vir da
      // equipe. A equipe contribui até esse teto; vender mais por conta própria
      // nunca prejudica.
      //
      // Antes daqui a condição era `own >= required*vp% && team >= required*ve%`,
      // tratando o teto de equipe como piso: quem vendia tudo sozinho não subia,
      // que é o contrário do que a regra existe para proteger.
      const tetoEquipe = (p.required_revenue * (p.max_team_sales_pct ?? 0)) / 100;
      const equipeQueConta = Math.min(w.teamRevenue, tetoEquipe);
      const qualifying = w.ownRevenue + equipeQueConta;
      if (qualifying >= p.required_revenue - 0.001) {
        if (p.level > currentLevel) { currentPatentKey = p.key; currentLevel = p.level; }
        achievedNow.push({ key: p.key, level: p.level, qualifying });
      }
    }

    // Auto-conquer all lower-level patents (history) when a higher one is reached.
    if (currentLevel > 0) {
      for (const p of patents) {
        if (p.level <= currentLevel && !achievedNow.some((a) => a.key === p.key)) {
          achievedNow.push({ key: p.key, level: p.level, qualifying: p.required_revenue });
        }
      }
    }

    const nextPatentKey = patents.find((p) => p.level > currentLevel)?.key ?? null;

    // Persist first-time achievements (idempotent via unique index)
    for (const a of achievedNow) {
      await supabaseAdmin
        .from("coach_patent_achievements" as never)
        .insert({
          coach_id: myCoachId,
          patent_key: a.key,
          patent_level: a.level,
          qualifying_revenue: a.qualifying,
        } as never)
        .then(() => undefined, () => undefined);
    }


    const { data: achRaw } = await supabaseAdmin
      .from("coach_patent_achievements" as never)
      .select("patent_key,patent_level,achieved_at,qualifying_revenue")
      .eq("coach_id", myCoachId)
      .order("achieved_at", { ascending: true });
    const achievements = ((achRaw as unknown as PatentAchievement[] | null) || []).map((a) => ({
      ...a,
      qualifying_revenue: Number(a.qualifying_revenue) || 0,
    }));

    return { coachId: myCoachId, patents, windows, currentPatentKey, nextPatentKey, achievements };
  });
