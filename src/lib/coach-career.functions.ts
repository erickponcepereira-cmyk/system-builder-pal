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

async function sumRevenueForCoaches(coachIds: string[], sinceIso: string): Promise<number> {
  if (coachIds.length === 0) return 0;
  const { data: studs } = await supabaseAdmin
    .from("students").select("id").in("coach_id", coachIds);
  const ids = ((studs as { id: string }[] | null) || []).map((s) => s.id);
  if (ids.length === 0) return 0;
  let total = 0;
  const { data: txs } = await supabaseAdmin
    .from("transactions").select("gross_amount")
    .in("student_id", ids).eq("status", "paid")
    .not("paid_at", "is", null).gte("paid_at", sinceIso);
  ((txs as { gross_amount: number }[] | null) || []).forEach((t) => { total += Number(t.gross_amount) || 0; });
  const { data: orders } = await supabaseAdmin
    .from("store_orders").select("total_amount")
    .in("student_id", ids).eq("status", "paid").gte("updated_at", sinceIso);
  ((orders as { total_amount: number }[] | null) || []).forEach((o) => { total += Number(o.total_amount) || 0; });
  return total;
}

export const getCareerProgress = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<CareerProgress> => {
    const { data: rules } = await supabaseAdmin
      .from("patent_rules")
      .select("id,key,display_name,description,badge_color,badge_icon,required_revenue,time_window_months,min_own_sales_pct,max_team_sales_pct,vp_max_pct,ve_max_pct,phase,level,sort_order,benefits,is_active")
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

    // Build full downline (all depths) for "team" sales
    const { data: allCoaches } = await supabaseAdmin
      .from("coaches").select("id, upline_coach_id");
    const byUpline = new Map<string, string[]>();
    ((allCoaches as { id: string; upline_coach_id: string | null }[] | null) || []).forEach((c) => {
      const k = c.upline_coach_id || "__root__";
      const arr = byUpline.get(k) || [];
      arr.push(c.id);
      byUpline.set(k, arr);
    });
    const downline: string[] = [];
    const queue = [...(byUpline.get(myCoachId) || [])];
    while (queue.length) {
      const cur = queue.shift()!;
      downline.push(cur);
      (byUpline.get(cur) || []).forEach((c) => queue.push(c));
    }

    const distinctWindows = Array.from(new Set(patents.map((p) => p.time_window_months))).filter((m) => m > 0);
    for (const months of distinctWindows) {
      const since = new Date();
      since.setMonth(since.getMonth() - months);
      const sinceIso = since.toISOString();
      const own = await sumRevenueForCoaches([myCoachId], sinceIso);
      const team = await sumRevenueForCoaches(downline, sinceIso);
      const total = own + team;
      const ownPct = total > 0 ? (own / total) * 100 : 100;
      windows[months] = { ownRevenue: own, teamRevenue: team, totalRevenue: total, ownPct };
    }

    // Determine current patent (highest level whose rules are met) + track achievements
    let currentPatentKey: string | null = null;
    const achievedNow: Array<{ key: string; level: number; qualifying: number }> = [];
    for (const p of patents) {
      const w = windows[p.time_window_months];
      if (!w) continue;
      if (p.required_revenue === 0) {
        currentPatentKey = p.key;
        achievedNow.push({ key: p.key, level: p.level, qualifying: 0 });
        continue;
      }
      const vpMax = p.vp_max_pct != null ? p.vp_max_pct : p.min_own_sales_pct;
      const cap = (p.required_revenue * (vpMax || 100)) / 100;
      const cappedOwn = Math.min(w.ownRevenue, cap);
      const qualifying = cappedOwn + w.teamRevenue;
      if (qualifying >= p.required_revenue) {
        currentPatentKey = p.key;
        achievedNow.push({ key: p.key, level: p.level, qualifying });
      } else break;
    }
    const currentLevel = patents.find((p) => p.key === currentPatentKey)?.level ?? 0;
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
