import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SnapshotGoal = {
  id: string;
  label: string;
  product_type: string | null;
  product_ids: string[];
  patent_levels: number[];
  required_base: number;
  required_scaled: number;
  current: number;
  completed: boolean;
  missing: number;
  sort_order: number;
};

export type MonthlySnapshot = {
  profileId: string;
  coachId: string | null;
  year: number;
  month: number; // 1-12
  patentLevel: number;
  multiplier: number;
  multiplierTier: string;
  totalSales: number;
  goals: SnapshotGoal[];
  anyCompleted: boolean;
  monthStart: string;
  monthEnd: string;
};

export function multiplierForLevel(level: number): { mult: number; tier: string } {
  if (level >= 8) return { mult: 4, tier: "Patente 8-12 (4x)" };
  if (level >= 4) return { mult: 2, tier: "Patente 4-7 (2x)" };
  return { mult: 1, tier: "Patente 1-3 (base)" };
}

export function monthBounds(year: number, month: number): { start: Date; end: Date } {
  // month: 1-12
  const start = new Date(Date.UTC(year, month - 1, 1, 0, 0, 0, 0));
  const end = new Date(Date.UTC(year, month, 1, 0, 0, 0, 0));
  return { start, end };
}

/**
 * Compute the patent level for a given coach by replicating the same windowed
 * revenue check used in `getCareerProgress` (own + downline). Returns 1 by
 * default. Heavy but only called by the monthly snapshot job.
 */
export async function computePatentLevelForCoach(coachId: string): Promise<number> {
  const { data: rules } = await supabaseAdmin
    .from("patent_rules")
    .select("key,required_revenue,time_window_months,min_own_sales_pct,level")
    .eq("is_active", true)
    .not("key", "is", null)
    .order("level", { ascending: true });
  const patents = ((rules as Array<{ key: string; required_revenue: number; time_window_months: number; min_own_sales_pct: number; level: number }> | null) || []);
  if (patents.length === 0) return 1;

  // Build full downline
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
  const seen = new Set<string>([coachId]);
  const queue = [...(byUpline.get(coachId) || [])];
  while (queue.length) {
    const cur = queue.shift()!;
    if (seen.has(cur)) continue;
    seen.add(cur);
    downline.push(cur);
    (byUpline.get(cur) || []).forEach((c) => queue.push(c));
  }

  const sumFor = async (coachIds: string[], sinceIso: string) => {
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
  };

  const windows: Record<number, { own: number; team: number; total: number; ownPct: number }> = {};
  const distinctWindows = Array.from(new Set(patents.map((p) => Number(p.time_window_months) || 1))).filter((m) => m > 0);
  for (const months of distinctWindows) {
    const since = new Date();
    since.setMonth(since.getMonth() - months);
    const sinceIso = since.toISOString();
    const own = await sumFor([coachId], sinceIso);
    const team = await sumFor(downline, sinceIso);
    const total = own + team;
    const ownPct = total > 0 ? (own / total) * 100 : 100;
    windows[months] = { own, team, total, ownPct };
  }

  let currentLevel = 1;
  for (const p of patents) {
    const w = windows[p.time_window_months];
    if (!w) continue;
    const meetsRev = Number(p.required_revenue) === 0 || w.total >= Number(p.required_revenue);
    const meetsPct = w.ownPct >= Number(p.min_own_sales_pct) - 0.0001;
    if (meetsRev && meetsPct) currentLevel = Number(p.level) || currentLevel;
    else break;
  }
  return currentLevel;
}

/**
 * Compute a monthly gamification snapshot for one coach.
 */
export async function computeMonthlySnapshot(profileId: string, year: number, month: number): Promise<MonthlySnapshot> {
  const { start, end } = monthBounds(year, month);
  const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
  const cutoff = await getServerCutoffIso();
  const startIso = cutoff && cutoff > start.toISOString() ? cutoff : start.toISOString();
  const endIso = end.toISOString();

  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profileId).maybeSingle();
  const coachId = (coach as { id: string } | null)?.id ?? null;

  let patentLevel = 1;
  if (coachId) {
    try { patentLevel = await computePatentLevelForCoach(coachId); } catch { /* default 1 */ }
  }
  const { mult, tier } = multiplierForLevel(patentLevel);

  const salesByType = new Map<string, number>();
  const salesByProduct = new Map<string, number>();
  let totalSales = 0;
  if (coachId) {
    const { data: studs } = await supabaseAdmin
      .from("students").select("id").eq("coach_id", coachId);
    const studentIds = ((studs as { id: string }[] | null) || []).map((s) => s.id);
    if (studentIds.length > 0) {
      const { data: txs } = await supabaseAdmin
        .from("transactions").select("id, product_id, paid_at, status")
        .in("student_id", studentIds).eq("status", "paid")
        .not("paid_at", "is", null).gte("paid_at", startIso).lt("paid_at", endIso);
      const txRows = (txs as { id: string; product_id: string }[] | null) || [];
      const productIds = Array.from(new Set(txRows.map((t) => t.product_id).filter(Boolean)));
      const typeByProduct = new Map<string, string>();
      if (productIds.length > 0) {
        const { data: prods } = await supabaseAdmin
          .from("products").select("id,type").in("id", productIds);
        ((prods as { id: string; type: string }[] | null) || []).forEach((p) => {
          typeByProduct.set(p.id, p.type);
        });
      }
      txRows.forEach((t) => {
        const tp = typeByProduct.get(t.product_id);
        if (tp) salesByType.set(tp, (salesByType.get(tp) || 0) + 1);
        if (t.product_id) salesByProduct.set(t.product_id, (salesByProduct.get(t.product_id) || 0) + 1);
        totalSales += 1;
      });
    }
  }

  const { data: rules } = await supabaseAdmin
    .from("network_unlock_rules")
    .select("id,label,product_type,required_sales,sort_order,product_ids,patent_levels")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });
  type RuleRow = { id: string; label: string; product_type: string | null; required_sales: number; sort_order: number; product_ids: string[] | null; patent_levels: number[] | null };
  const allRules = (rules as RuleRow[] | null) || [];
  const applicableRules = allRules.filter((r) => {
    const lvls = r.patent_levels || [];
    return lvls.length === 0 || lvls.includes(patentLevel);
  });
  const goals: SnapshotGoal[] = applicableRules.map((r) => {
    const required_scaled = Number(r.required_sales) * mult;
    const pids = r.product_ids || [];
    let current: number;
    if (pids.length > 0) {
      current = pids.reduce((acc, id) => acc + (salesByProduct.get(id) || 0), 0);
    } else {
      current = r.product_type === null ? totalSales : (salesByType.get(r.product_type) || 0);
    }
    const completed = current >= required_scaled;
    return {
      id: r.id,
      label: r.label,
      product_type: r.product_type,
      product_ids: pids,
      patent_levels: r.patent_levels || [],
      required_base: Number(r.required_sales),
      required_scaled,
      current,
      completed,
      missing: Math.max(0, required_scaled - current),
      sort_order: r.sort_order,
    };
  });
  const anyCompleted = goals.length === 0 ? true : goals.some((g) => g.completed);

  return {
    profileId,
    coachId,
    year, month,
    patentLevel, multiplier: mult, multiplierTier: tier,
    totalSales, goals, anyCompleted,
    monthStart: startIso, monthEnd: endIso,
  };
}

/**
 * Persist a monthly snapshot (idempotent upsert by profile_id+year+month).
 */
export async function upsertMonthlySnapshot(s: MonthlySnapshot): Promise<void> {
  const payload = {
    profile_id: s.profileId,
    coach_id: s.coachId,
    period_year: s.year,
    period_month: s.month,
    patent_level: s.patentLevel,
    multiplier: s.multiplier,
    total_sales: s.totalSales,
    any_completed: s.anyCompleted,
    goals_snapshot: s.goals as unknown as object,
    computed_at: new Date().toISOString(),
  };
  const { error } = await supabaseAdmin
    .from("network_unlock_history")
    .upsert(payload as never, { onConflict: "profile_id,period_year,period_month" });
  if (error) throw error;
}

/**
 * Snapshot a month for every coach (used by monthly cron and admin manual run).
 */
export async function snapshotMonthForAllCoaches(year: number, month: number): Promise<{ count: number; errors: number }> {
  const { data: coaches } = await supabaseAdmin
    .from("coaches").select("id, profile_id");
  const rows = ((coaches as Array<{ id: string; profile_id: string }> | null) || []).filter((c) => c.profile_id);
  let ok = 0, errors = 0;
  for (const c of rows) {
    try {
      const snap = await computeMonthlySnapshot(c.profile_id, year, month);
      await upsertMonthlySnapshot(snap);
      ok += 1;
    } catch (e) {
      console.error("snapshot failed for coach", c.id, e);
      errors += 1;
    }
  }
  return { count: ok, errors };
}
