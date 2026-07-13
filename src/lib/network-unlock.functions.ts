import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMonthlySnapshot, upsertMonthlySnapshot } from "@/lib/network-unlock.server";
import { dedupeCommissions } from "@/lib/financial-dedupe";

export type UnlockGoal = {
  id: string;
  label: string;
  product_type: string | null;
  required_base: number;
  required_scaled: number;
  current: number;
  completed: boolean;
  sort_order: number;
  missing: number;
};

export type WalletSplit = {
  direct: { available: number; pending: number; total: number };
  network: { available: number; pending: number; total: number; locked: boolean };
  withdrawable: number;
  unlock: {
    monthStart: string;
    monthEnd: string;
    patentLevel: number;
    patentMultiplier: number;
    multiplierTier: string;
    goals: UnlockGoal[];
    anyCompleted: boolean;
  };
};

export type HistoryEntry = {
  year: number;
  month: number;
  patent_level: number;
  multiplier: number;
  total_sales: number;
  any_completed: boolean;
  goals: UnlockGoal[];
};

export const getWalletSplit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletSplit> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const userId = context.userId;
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!profile) return emptySplit();

    const now = new Date();
    const snap = await computeMonthlySnapshot(profile.id, now.getFullYear(), now.getMonth() + 1);

    // Persist live snapshot so admin reports always reflect latest progress.
    // Best-effort — never fail the wallet because of this.
    try { await upsertMonthlySnapshot(snap); } catch (e) { console.error("live snapshot upsert failed", e); }

    // Commissions split. Treat a commission as "available" once its
    // available_at has elapsed, even if status still says pending — there is
    // no cron job promoting pending → available yet.
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    let commQ = supabaseAdmin
      .from("commissions").select("id,transaction_id,partner_order_id,beneficiary_profile_id,beneficiary_coach_id,amount,level,status,available_at,created_at,slot_label,is_referral")
      .eq("beneficiary_profile_id", profile.id)
      .eq("is_referral", false);
    if (cutoff) commQ = commQ.gte("created_at", cutoff);
    const { data: comms } = await commQ;

    const monthKeys = Array.from(new Set(((comms as Array<any> | null) || []).map((c) => {
      const created = new Date(c.created_at);
      if (Number.isNaN(created.getTime())) return null;
      return `${created.getUTCFullYear()}-${created.getUTCMonth() + 1}`;
    }).filter(Boolean) as string[]));

    const unlockByMonth = new Map<string, boolean>([
      [`${now.getFullYear()}-${now.getMonth() + 1}`, snap.anyCompleted],
    ]);
    if (monthKeys.length) {
      const years = Array.from(new Set(monthKeys.map((k) => Number(k.split("-")[0]))));
      const { data: unlockRows } = await supabaseAdmin
        .from("network_unlock_history")
        .select("period_year,period_month,any_completed")
        .eq("profile_id", profile.id)
        .in("period_year", years);
      ((unlockRows as Array<{ period_year: number; period_month: number; any_completed: boolean }> | null) || []).forEach((row) => {
        unlockByMonth.set(`${row.period_year}-${row.period_month}`, Boolean(row.any_completed));
      });
    }

    const { data: withdrawalRows } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("amount,status")
      .eq("profile_id", profile.id)
      .is("partner_id", null)
      .is("professional_coach_id", null)
      .in("status", ["requested", "approved", "processing", "paid"] as never);
    const withdrawalDeduction = ((withdrawalRows as Array<{ amount: number | string; status: string }> | null) || [])
      .reduce((sum, row) => sum + Number(row.amount || 0), 0);

    const direct = { available: 0, pending: 0, total: 0 };
    const network = { available: 0, pending: 0, total: 0, locked: !snap.anyCompleted };
    const nowMs = Date.now();
    dedupeCommissions((comms as Array<any> | null) || []).forEach((c) => {
      const amt = Number(c.amount) || 0;
      const label = String(c.slot_label || "");
      const isNetwork = Number(c.level || 0) > 0 || (/(^|\s)(linha|upline)\s*\d+/i.test(label) && !/sem\s+upline/i.test(label));
      const bucket = isNetwork ? network : direct;
      bucket.total += amt;
      const released = c.status === "available" || (c.status === "pending" && c.available_at != null && new Date(c.available_at).getTime() <= nowMs);
      const created = new Date(c.created_at);
      const monthUnlocked = !Number.isNaN(created.getTime())
        ? Boolean(unlockByMonth.get(`${created.getUTCFullYear()}-${created.getUTCMonth() + 1}`))
        : false;
      if (released && (!isNetwork || monthUnlocked)) bucket.available += amt;
      else if (c.status === "pending") bucket.pending += amt;
    });

    let remainingDeduction = withdrawalDeduction;
    const directDeduction = Math.min(direct.available, remainingDeduction);
    direct.available = Math.max(0, direct.available - directDeduction);
    remainingDeduction -= directDeduction;
    if (remainingDeduction > 0) network.available = Math.max(0, network.available - remainingDeduction);

    const withdrawable = direct.available + network.available;

    return {
      direct,
      network,
      withdrawable,
      unlock: {
        monthStart: snap.monthStart,
        monthEnd: snap.monthEnd,
        patentLevel: snap.patentLevel,
        patentMultiplier: snap.multiplier,
        multiplierTier: snap.multiplierTier,
        goals: snap.goals,
        anyCompleted: snap.anyCompleted,
      },
    };
  });

export const getMyUnlockHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<HistoryEntry[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
    if (!profile) return [];
    const { data } = await supabaseAdmin
      .from("network_unlock_history")
      .select("period_year,period_month,patent_level,multiplier,total_sales,any_completed,goals_snapshot")
      .eq("profile_id", profile.id)
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(24);
    return ((data as Array<{ period_year: number; period_month: number; patent_level: number; multiplier: number; total_sales: number; any_completed: boolean; goals_snapshot: UnlockGoal[] }> | null) || []).map((r) => ({
      year: r.period_year, month: r.period_month,
      patent_level: r.patent_level, multiplier: r.multiplier,
      total_sales: r.total_sales, any_completed: r.any_completed,
      goals: r.goals_snapshot || [],
    }));
  });

function emptySplit(): WalletSplit {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1);
  return {
    direct: { available: 0, pending: 0, total: 0 },
    network: { available: 0, pending: 0, total: 0, locked: true },
    withdrawable: 0,
    unlock: {
      monthStart: start.toISOString(),
      monthEnd: end.toISOString(),
      patentLevel: 1,
      patentMultiplier: 1,
      multiplierTier: "Patente 1-3 (base)",
      goals: [],
      anyCompleted: false,
    },
  };
}
