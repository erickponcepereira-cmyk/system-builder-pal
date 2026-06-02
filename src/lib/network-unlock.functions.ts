import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type UnlockGoal = {
  id: string;
  label: string;
  product_type: string | null;
  required_base: number;
  required_scaled: number;
  current: number;
  completed: boolean;
  sort_order: number;
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

function monthRange(): { start: Date; end: Date } {
  const now = new Date();
  const start = new Date(now.getFullYear(), now.getMonth(), 1, 0, 0, 0, 0);
  const end = new Date(now.getFullYear(), now.getMonth() + 1, 1, 0, 0, 0, 0);
  return { start, end };
}

function multiplierForLevel(level: number): { mult: number; tier: string } {
  if (level >= 8) return { mult: 4, tier: "Patente 8-12 (4x)" };
  if (level >= 4) return { mult: 2, tier: "Patente 4-7 (2x)" };
  return { mult: 1, tier: "Patente 1-3 (base)" };
}

export const getWalletSplit = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletSplit> => {
    const userId = context.userId;
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!profile) {
      return emptySplit();
    }
    const { data: coach } = await supabaseAdmin
      .from("coaches").select("id, patent_key").eq("profile_id", profile.id).maybeSingle();

    // Patent level
    let patentLevel = 1;
    if (coach?.patent_key) {
      const { data: pr } = await supabaseAdmin
        .from("patent_rules").select("level").eq("key", coach.patent_key).maybeSingle();
      patentLevel = Number((pr as { level: number } | null)?.level) || 1;
    }
    const { mult, tier } = multiplierForLevel(patentLevel);

    // Month range
    const { start, end } = monthRange();
    const startIso = start.toISOString();
    const endIso = end.toISOString();

    // Sales this month (own direct sales) — students owned by this coach
    let salesByType = new Map<string, number>();
    let totalSales = 0;
    if (coach?.id) {
      const { data: studs } = await supabaseAdmin
        .from("students").select("id").eq("coach_id", coach.id);
      const studentIds = ((studs as { id: string }[] | null) || []).map((s) => s.id);
      if (studentIds.length > 0) {
        const { data: txs } = await supabaseAdmin
          .from("transactions")
          .select("id, product_id, paid_at, status")
          .in("student_id", studentIds)
          .eq("status", "paid")
          .not("paid_at", "is", null)
          .gte("paid_at", startIso)
          .lt("paid_at", endIso);
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
          const t2 = typeByProduct.get(t.product_id);
          if (t2) salesByType.set(t2, (salesByType.get(t2) || 0) + 1);
          totalSales += 1;
        });
      }
    }

    // Rules
    const { data: rules } = await supabaseAdmin
      .from("network_unlock_rules")
      .select("id,label,product_type,required_sales,is_active,sort_order")
      .eq("is_active", true)
      .order("sort_order", { ascending: true });
    const goals: UnlockGoal[] = ((rules as Array<{ id: string; label: string; product_type: string | null; required_sales: number; sort_order: number }> | null) || []).map((r) => {
      const required_scaled = r.required_sales * mult;
      const current = r.product_type === null ? totalSales : (salesByType.get(r.product_type) || 0);
      return {
        id: r.id,
        label: r.label,
        product_type: r.product_type,
        required_base: r.required_sales,
        required_scaled,
        current,
        completed: current >= required_scaled,
        sort_order: r.sort_order,
      };
    });
    const anyCompleted = goals.length === 0 ? true : goals.some((g) => g.completed);

    // Commissions split: level 0 = direct, level > 0 = network
    const { data: comms } = await supabaseAdmin
      .from("commissions")
      .select("amount, level, status")
      .eq("beneficiary_profile_id", profile.id);
    const direct = { available: 0, pending: 0, total: 0 };
    const network = { available: 0, pending: 0, total: 0, locked: !anyCompleted };
    ((comms as Array<{ amount: number; level: number; status: string }> | null) || []).forEach((c) => {
      const amt = Number(c.amount) || 0;
      const bucket = c.level === 0 ? direct : network;
      bucket.total += amt;
      if (c.status === "available" || c.status === "paid") bucket.available += amt;
      else bucket.pending += amt;
    });

    const withdrawable = direct.available + (anyCompleted ? network.available : 0);

    return {
      direct,
      network,
      withdrawable,
      unlock: {
        monthStart: startIso,
        monthEnd: endIso,
        patentLevel,
        patentMultiplier: mult,
        multiplierTier: tier,
        goals,
        anyCompleted,
      },
    };
  });

function emptySplit(): WalletSplit {
  const { start, end } = monthRange();
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
