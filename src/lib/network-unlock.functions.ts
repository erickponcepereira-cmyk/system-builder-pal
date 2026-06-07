import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { computeMonthlySnapshot, upsertMonthlySnapshot } from "@/lib/network-unlock.server";

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
    const { data: comms } = await supabaseAdmin
      .from("commissions").select("amount, level, status, available_at")
      .eq("beneficiary_profile_id", profile.id);
    const direct = { available: 0, pending: 0, total: 0 };
    const network = { available: 0, pending: 0, total: 0, locked: !snap.anyCompleted };
    const nowMs = Date.now();
    ((comms as Array<{ amount: number; level: number; status: string; available_at: string | null }> | null) || []).forEach((c) => {
      const amt = Number(c.amount) || 0;
      const bucket = c.level === 0 ? direct : network;
      bucket.total += amt;
      const released = c.status === "available" || c.status === "paid"
        || (c.available_at != null && new Date(c.available_at).getTime() <= nowMs);
      if (released) bucket.available += amt;
      else bucket.pending += amt;
    });
    const withdrawable = direct.available + (snap.anyCompleted ? network.available : 0);

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
