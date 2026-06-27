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

async function sumRevenueForCoaches(coachIds: string[], sinceIso: string): Promise<number> {
  if (coachIds.length === 0) return 0;
  const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
  const cutoff = await getServerCutoffIso();
  const effectiveSince = cutoff && cutoff > sinceIso ? cutoff : sinceIso;
  const { data: studs } = await supabaseAdmin
    .from("students").select("id").in("coach_id", coachIds);
  const ids = ((studs as { id: string }[] | null) || []).map((s) => s.id);
  let total = 0;
  const linkedOrderIds = new Set<string>();
  if (ids.length > 0) {
    const { data: txs } = await supabaseAdmin
      .from("transactions").select("gross_amount, metadata")
      .in("student_id", ids).eq("status", "paid")
      .not("paid_at", "is", null).gte("paid_at", effectiveSince);
    ((txs as { gross_amount: number; metadata: any }[] | null) || []).forEach((t) => {
      total += Number(t.gross_amount) || 0;
      const linked = t?.metadata?.store_order_id;
      if (linked) linkedOrderIds.add(String(linked));
    });
    const { data: orders } = await supabaseAdmin
      .from("store_orders").select("id,total_amount")
      .in("student_id", ids).eq("status", "paid").gte("updated_at", effectiveSince);
    ((orders as { id: string; total_amount: number }[] | null) || []).forEach((o) => {
      if (linkedOrderIds.has(o.id)) return;
      total += Number(o.total_amount) || 0;
    });
    const { data: partnerOrders } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("gross_amount" as never)
      .in("student_id" as never, ids as never)
      .eq("status" as never, "paid" as never)
      .gte("created_at" as never, effectiveSince as never);
    ((partnerOrders as unknown as { gross_amount: number }[] | null) || []).forEach((o) => {
      total += Number(o.gross_amount) || 0;
    });
  }

  const { data: coachProfiles } = await supabaseAdmin
    .from("coaches")
    .select("id,profile_id")
    .in("id", coachIds);
  const profileIds = ((coachProfiles as Array<{ id: string; profile_id: string | null }> | null) || [])
    .map((c) => c.profile_id)
    .filter(Boolean) as string[];
  const { data: partnerRows } = profileIds.length
    ? await supabaseAdmin.from("partners" as never).select("id" as never).in("profile_id" as never, profileIds as never)
    : { data: [] as unknown };
  const partnerIds = (((partnerRows as unknown as Array<{ id: string }>) || []).map((p) => p.id));
  const partnerOrderMap = new Map<string, number>();
  const loadPartnerOrders = async (column: "selling_coach_id" | "professional_coach_id" | "partner_id", values: string[]) => {
    if (!values.length) return;
    const { data: rows } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("id,gross_amount" as never)
      .in(column as never, values as never)
      .eq("status" as never, "paid" as never)
      .gte("created_at" as never, effectiveSince as never);
    ((rows as unknown as Array<{ id: string; gross_amount: number }>) || []).forEach((o) => {
      partnerOrderMap.set(o.id, Number(o.gross_amount) || 0);
    });
  };
  await Promise.all([
    loadPartnerOrders("selling_coach_id", coachIds),
    loadPartnerOrders("professional_coach_id", coachIds),
    loadPartnerOrders("partner_id", partnerIds),
  ]);
  partnerOrderMap.forEach((amount) => { total += amount; });
  return total;
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

    // Determine highest patent met (cap BOTH VP and VE by their allowed %).
    // Once a higher patent is reached, all lower ones are auto-conquered.
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
      const vpPct = p.vp_max_pct != null ? p.vp_max_pct : (p.min_own_sales_pct || 100);
      const vePct = p.ve_max_pct != null ? p.ve_max_pct : Math.max(0, 100 - vpPct);
      const vpRequired = (p.required_revenue * vpPct) / 100;
      const veRequired = (p.required_revenue * vePct) / 100;
      // REGRA: precisa atingir AMBOS — mínimo de VP E mínimo de VE
      const meetsVP = w.ownRevenue >= vpRequired - 0.001;
      const meetsVE = veRequired === 0 || w.teamRevenue >= veRequired - 0.001;
      if (meetsVP && meetsVE) {
        if (p.level > currentLevel) { currentPatentKey = p.key; currentLevel = p.level; }
        const qualifying = Math.min(w.ownRevenue, vpRequired) + Math.min(w.teamRevenue, veRequired);
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
