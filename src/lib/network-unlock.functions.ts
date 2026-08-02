import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { computeMonthlySnapshot, upsertMonthlySnapshot } from "@/lib/network-unlock.server";
import { dedupeCommissions, isNetworkCommissionRow } from "@/lib/financial-dedupe";

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

    const { year: curYear, month: curMonth0 } = tzCurrentYearMonth();
    const snap = await computeMonthlySnapshot(profile.id, curYear, curMonth0 + 1);


    // Persist live snapshot so admin reports always reflect latest progress.
    try { await upsertMonthlySnapshot(snap); } catch (e) { console.error("live snapshot upsert failed", e); }

    // Ensure the DB-side wallet reflects the current recalc rules (network
    // unlock, withdrawals, etc.) before we read it as source of truth.
    try {
      await supabaseAdmin.rpc("recalc_wallet_for_profile" as never, { _profile_id: profile.id } as never);
    } catch (e) { console.error("recalc wallet failed", e); }

    // Single source of truth: `wallets.available_balance` (kept in sync by the
    // `recalc_wallet_for_profile` trigger and the admin payout flow). This is
    // the same value the admin panel reads, so both views agree.
    const [{ data: walletRow }, { data: partnerRows }, { data: coachRows }] = await Promise.all([
      supabaseAdmin.from("wallets").select("available_balance,pending_balance").eq("profile_id", profile.id).maybeSingle(),
      supabaseAdmin.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id as never),
      supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id),
    ]);
    const partnerIds = ((partnerRows as unknown as Array<{ id: string }>) || []).map((r) => r.id);
    const coachIds = ((coachRows as unknown as Array<{ id: string }>) || []).map((r) => r.id);
    const [{ data: pwRows }, { data: profwRows }] = await Promise.all([
      partnerIds.length
        ? supabaseAdmin.from("partner_wallets" as never).select("available_balance,pending_balance" as never).in("partner_id" as never, partnerIds as never)
        : Promise.resolve({ data: [] as unknown }),
      coachIds.length
        ? supabaseAdmin.from("professional_wallets" as never).select("available_balance,pending_balance" as never).in("professional_coach_id" as never, coachIds as never)
        : Promise.resolve({ data: [] as unknown }),
    ]);
    const sumField = (rows: unknown, field: "available_balance" | "pending_balance"): number =>
      ((rows as Array<Record<string, number>> | null) || []).reduce((acc, r) => acc + Number(r[field] || 0), 0);
    const creatorAvailable = sumField(pwRows, "available_balance") + sumField(profwRows, "available_balance");
    const creatorPending = sumField(pwRows, "pending_balance") + sumField(profwRows, "pending_balance");
    const walletAvailable = Number((walletRow as { available_balance?: number } | null)?.available_balance || 0);
    const walletPending = Number((walletRow as { pending_balance?: number } | null)?.pending_balance || 0);


    // Classify commissions into direct vs network — display-only breakdown.
    // We use it to decide how much of `walletAvailable` is direct vs network
    // and to show pending totals per bucket.
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    let commQ = supabaseAdmin
      .from("commissions").select("id,transaction_id,partner_order_id,beneficiary_profile_id,beneficiary_coach_id,amount,level,is_network,status,available_at,created_at,slot_label,is_referral")
      .eq("beneficiary_profile_id", profile.id)
      .or("is_referral.is.null,is_referral.eq.false");
    if (cutoff) commQ = commQ.gte("created_at", cutoff);
    const { data: comms } = await commQ;

    const monthKeyOf = (d: Date) => {
      const [y, m] = tzDateKey(d).split("-").map(Number);
      return `${y}-${m}`;
    };
    const monthKeys = Array.from(new Set(((comms as Array<any> | null) || []).map((c) => {
      const created = new Date(c.created_at);
      if (Number.isNaN(created.getTime())) return null;
      return monthKeyOf(created);
    }).filter(Boolean) as string[]));

    const unlockByMonth = new Map<string, boolean>([
      [`${curYear}-${curMonth0 + 1}`, snap.anyCompleted],
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

    // Raw sums from commissions, before reconciling with the wallet.
    let directAvailableRaw = 0;
    let directPending = 0;
    let directTotal = 0;
    let networkAvailableRaw = 0;
    let networkPending = 0;
    let networkTotal = 0;
    const nowMs = Date.now();
    dedupeCommissions((comms as Array<any> | null) || []).forEach((c) => {
      const amt = Number(c.amount) || 0;
      const label = String(c.slot_label || "");
      const isNetwork = isNetworkCommissionRow(c.level, label, (c as any).is_network);
      const released = c.status === "available" || (c.status === "pending" && c.available_at != null && new Date(c.available_at).getTime() <= nowMs);
      const created = new Date(c.created_at);
      const monthUnlocked = !Number.isNaN(created.getTime())
        ? Boolean(unlockByMonth.get(`${created.getUTCFullYear()}-${created.getUTCMonth() + 1}`))
        : false;
      if (isNetwork) {
        networkTotal += amt;
        if (released && monthUnlocked) networkAvailableRaw += amt;
        else if (c.status === "pending" || (released && !monthUnlocked)) networkPending += amt;
      } else {
        directTotal += amt;
        if (released) directAvailableRaw += amt;
        else if (c.status === "pending") directPending += amt;
      }
    });

    // Reconcile: `walletAvailable` is truth. Distribute it into direct/network
    // proportionally to the raw released amounts. Direct gets first pick.
    const rawAvailable = directAvailableRaw + networkAvailableRaw;
    let directAvailable = directAvailableRaw;
    let networkAvailable = networkAvailableRaw;
    if (rawAvailable > walletAvailable + 0.005) {
      // Wallet is smaller than raw (withdrawals subtracted). Drain direct first,
      // then network — matches the display expectation of "vendas diretas primeiro".
      const takeDirect = Math.min(directAvailableRaw, walletAvailable);
      directAvailable = takeDirect;
      networkAvailable = Math.max(0, walletAvailable - takeDirect);
    } else if (rawAvailable < walletAvailable - 0.005) {
      // Wallet is larger than raw (rare — e.g. legacy adjustments). Attribute
      // the extra to direct so the coach sees it as withdrawable.
      directAvailable = walletAvailable - networkAvailable;
    }

    // Sum creator earnings (partner_wallets + professional_wallets) into the
    // direct bucket so the coach sees the full amount they can withdraw.
    const direct = {
      available: directAvailable + creatorAvailable,
      pending: directPending + creatorPending,
      total: directTotal + creatorAvailable + creatorPending,
    };
    const network = { available: networkAvailable, pending: networkPending, total: networkTotal, locked: !snap.anyCompleted };
    // Withdrawable = soma das 3 carteiras (principal + parceiro + profissional).
    // Todas são mantidas pelo mesmo recalc no banco e correspondem 1:1 ao que
    // o admin lê e ao que o RPC de saque valida.
    const withdrawable = walletAvailable + creatorAvailable;
    // Surface any pending discrepancy (should normally be zero).
    void walletPending;


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
