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
  // Mantida por compatibilidade — não é mais usada no cálculo da liberação.
  if (level >= 8) return { mult: 4, tier: "Patente 8-12 (4x)" };
  if (level >= 4) return { mult: 2, tier: "Patente 4-7 (2x)" };
  return { mult: 1, tier: "Patente 1-3 (base)" };
}

/**
 * Pontos mensais exigidos para liberar as comissões da rede,
 * de acordo com a patente atual do coach (Ordem dos Construtores).
 *   Nível 1–9   → 50 pts
 *   Nível 10–14 → 100 pts
 *   Nível 15–18 → 150 pts
 *   Nível 19–21 → 100 pts
 * Cada venda já credita pontos em `coach_points_log` (mesmo motor
 * usado para viagem/jantar). Os pontos "reiniciam" naturalmente pois
 * são contados por janela mensal (mês do calendário UTC).
 */
export function pointsRequiredForLevel(level: number): { required: number; tier: string } {
  const lvl = Math.max(1, Number(level) || 1);
  if (lvl >= 19) return { required: 100, tier: "Nível 19-21 · 100 pts/mês" };
  if (lvl >= 15) return { required: 150, tier: "Nível 15-18 · 150 pts/mês" };
  if (lvl >= 10) return { required: 100, tier: "Nível 10-14 · 100 pts/mês" };
  return { required: 50, tier: "Nível 1-9 · 50 pts/mês" };
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

  const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
  const cutoff = await getServerCutoffIso();

  const sumFor = async (coachIds: string[], sinceIso: string) => {
    if (coachIds.length === 0) return 0;
    const effSince = cutoff && cutoff > sinceIso ? cutoff : sinceIso;
    const { data: studs } = await supabaseAdmin
      .from("students").select("id").in("coach_id", coachIds);
    const ids = ((studs as { id: string }[] | null) || []).map((s) => s.id);
    if (ids.length === 0) return 0;
    let total = 0;
    const { data: txs } = await supabaseAdmin
      .from("transactions").select("gross_amount")
      .in("student_id", ids).eq("status", "paid")
      .not("paid_at", "is", null).gte("paid_at", effSince);
    ((txs as { gross_amount: number }[] | null) || []).forEach((t) => { total += Number(t.gross_amount) || 0; });
    const { data: orders } = await supabaseAdmin
      .from("store_orders").select("total_amount")
      .in("student_id", ids).eq("status", "paid").gte("updated_at", effSince);
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

  // Soma de pontos do mês (mesmo motor usado para prêmios/viagem).
  let totalPoints = 0;
  if (coachId) {
    const { data: pts } = await supabaseAdmin
      .from("coach_points_log")
      .select("points,created_at")
      .eq("coach_id", coachId)
      .gte("created_at", startIso)
      .lt("created_at", endIso);
    ((pts as Array<{ points: number }> | null) || []).forEach((r) => {
      totalPoints += Number(r.points) || 0;
    });
  }

  const { required, tier } = pointsRequiredForLevel(patentLevel);
  const missing = Math.max(0, required - totalPoints);
  const completed = totalPoints >= required;

  const goals: SnapshotGoal[] = [{
    id: `points-${patentLevel}`,
    label: `Meta de pontos — ${required} pts`,
    product_type: null,
    product_ids: [],
    patent_levels: [patentLevel],
    required_base: required,
    required_scaled: required,
    current: totalPoints,
    completed,
    missing,
    sort_order: 0,
  }];

  return {
    profileId,
    coachId,
    year, month,
    patentLevel,
    multiplier: 1,
    multiplierTier: tier,
    totalSales: totalPoints, // guardamos pontos em total_sales para reaproveitar histórico
    goals,
    anyCompleted: completed,
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
