import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface PartnerOrderRow {
  id: string;
  orderNumber: string;
  status: string;
  paymentMethod: string;
  studentName: string | null;
  productName: string | null;
  professionalName: string | null;
  sellingCoachName: string | null;
  specialty: string | null;
  grossAmount: number;
  systemFee: number;
  coachCommission: number;
  coachNet: number;
  partnerNet: number;
  networkL1: number;
  networkL2: number;
  networkL3: number;
  paidAt: string | null;
  createdAt: string;
}

export const listPartnerProductOrders = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    let q = supabase
      .from("partner_product_orders" as never)
      .select(
        "id,order_number,status,payment_method,gross_amount,system_fee,coach_commission_amount,coach_net_amount,partner_net_amount,network_l1_amount,network_l2_amount,network_l3_amount,paid_at,created_at,partner_product_id,professional_product_id,student:students!partner_product_orders_student_id_fkey(profile:profiles!students_profile_id_fkey(name)),professional:coaches!partner_product_orders_professional_coach_id_fkey(specialty_key,profile:profiles!coaches_profile_id_fkey(name)),selling:coaches!partner_product_orders_selling_coach_id_fkey(profile:profiles!coaches_profile_id_fkey(name))" as never,
      )
      .order("created_at" as never, { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status" as never, data.status as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    const rawRows = ((rows as unknown as any[]) || []);
    const partnerProductIds = Array.from(new Set(rawRows.map((r) => r.partner_product_id).filter(Boolean))) as string[];
    const professionalProductIds = Array.from(new Set(rawRows.map((r) => r.professional_product_id).filter(Boolean))) as string[];
    const [partnerProductsRes, professionalProductsRes] = await Promise.all([
      partnerProductIds.length
        ? supabase.from("partner_products" as never).select("id,name" as never).in("id" as never, partnerProductIds as never)
        : Promise.resolve({ data: [] as unknown }),
      professionalProductIds.length
        ? supabase.from("professional_products" as never).select("id,name" as never).in("id" as never, professionalProductIds as never)
        : Promise.resolve({ data: [] as unknown }),
    ]);
    const productNameById = new Map<string, string>();
    for (const p of (((partnerProductsRes as any).data || []) as Array<{ id: string; name: string }>)) productNameById.set(p.id, p.name);
    for (const p of (((professionalProductsRes as any).data || []) as Array<{ id: string; name: string }>)) productNameById.set(p.id, p.name);
    return rawRows.map<PartnerOrderRow>((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      paymentMethod: r.payment_method,
      studentName: r.student?.profile?.name || null,
      productName: productNameById.get(r.partner_product_id || r.professional_product_id || "") || null,
      professionalName: r.professional?.profile?.name || null,
      sellingCoachName: r.selling?.profile?.name || null,
      specialty: r.professional?.specialty_key || null,
      grossAmount: Number(r.gross_amount || 0),
      systemFee: Number(r.system_fee || 0),
      coachCommission: Number(r.coach_commission_amount || 0),
      coachNet: Number(r.coach_net_amount || 0),
      partnerNet: Number(r.partner_net_amount || 0),
      networkL1: Number(r.network_l1_amount || 0),
      networkL2: Number(r.network_l2_amount || 0),
      networkL3: Number(r.network_l3_amount || 0),
      paidAt: r.paid_at,
      createdAt: r.created_at,
    }));
  });

export const updatePartnerProductOrderStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { orderId: string; status: "pending" | "paid" | "cancelled" | "refunded"; note?: string }) => d)
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase.rpc("update_partner_product_order_status" as never, {
      _order_id: data.orderId,
      _status: data.status,
      _note: data.note || null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface FinancialSummary {
  adminWallet: { available: number; totalEarned: number; totalWithdrawn: number };
  coachWalletsTotal: { available: number; totalEarned: number; totalWithdrawn: number; count: number };
  studentWalletsTotal: { available: number; totalEarned: number; totalWithdrawn: number; count: number };
  nutritionistTotal: { available: number; blocked: number; totalEarned: number; count: number };
  professorTotal: { available: number; blocked: number; totalEarned: number; count: number };
  partnerOrders: { paidCount: number; paidGross: number; partnerNet: number; coachNet: number; systemFee: number };
  professionalOrders: { paidCount: number; paidGross: number; professionalNet: number; coachNet: number; systemFee: number };
  pendingWithdrawals: { coachAmount: number; coachCount: number; studentAmount: number; studentCount: number };
}

export const getFinancialSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    const applyCutoff = <T extends { gte: (col: any, v: any) => T; not?: (col: any, op: any, v: any) => T }>(q: T, col: string): T =>
      (cutoff ? q.gte(col as any, cutoff as any) : q);
    const applyPaidCutoff = <T extends { gte: (col: any, v: any) => T; not: (col: any, op: any, v: any) => T }>(q: T): T =>
      (cutoff ? q.not("paid_at" as any, "is" as any, null as any).gte("paid_at" as any, cutoff as any) : q);
    const [adminEntries, cw, sw, nw, pw, profw, profsw, ppo, wr, swr, commAll] = await Promise.all([
      applyCutoff(supabase.from("admin_system_wallet_entries" as never).select("slot_label,kind,amount,created_at" as never), "created_at"),
      supabase.from("wallets" as never).select("profile_id,available_balance,total_earned,total_withdrawn" as never),
      supabase.from("student_wallets" as never).select("profile_id,available_balance,total_earned,total_withdrawn" as never),
      supabase.from("nutritionist_wallets" as never).select("available_balance,blocked_balance,total_earned" as never),
      supabase.from("partner_wallets" as never).select("partner_id,available_balance,total_earned,total_withdrawn" as never),
      supabase.from("professional_wallets" as never).select("professional_coach_id,available_balance,total_earned,total_withdrawn" as never),
      supabase.from("professor_wallets" as never).select("available_balance,blocked_balance,total_earned" as never),
      applyPaidCutoff(supabase.from("partner_product_orders" as never).select("status,gross_amount,partner_net_amount,coach_net_amount,system_fee,payment_fee,tax_amount,network_l1_amount,network_l2_amount,network_l3_amount,master_coach_cross_bonus_amount,paid_at,created_at,partner_product_id,professional_product_id" as never).eq("status" as never, "paid" as never)),
      applyCutoff(supabase.from("withdrawal_requests" as never).select("amount,status,requested_at" as never).in("status" as never, ["pending", "approved", "processing"] as never), "requested_at"),
      applyCutoff(supabase.from("student_withdrawal_requests" as never).select("amount,status,requested_at" as never).in("status" as never, ["pending", "approved", "processing"] as never), "requested_at"),
      cutoff
        ? supabase.from("commissions" as never).select("amount,beneficiary_profile_id,created_at" as never).gte("created_at" as never, cutoff as never)
        : Promise.resolve({ data: null as any }),
    ]);
    const sum = (arr: any[] | null | undefined, k: string) =>
      (arr || []).reduce((a, r: any) => a + Number(r?.[k] || 0), 0);
    let adminCredits = 0;
    let adminDebits = 0;
    let nutriAdminCredits = 0;
    let nutriAdminDebits = 0;
    let profAdminCredits = 0;
    let profAdminDebits = 0;
    ((adminEntries.data as any[]) || []).forEach((entry) => {
      const slot = String(entry?.slot_label || "").toLowerCase();
      const amount = Number(entry?.amount || 0);
      const isNutritionist = slot.includes("nutricion");
      const isProfessor = slot.includes("professor");
      if (isNutritionist) {
        if (entry?.kind === "debit") nutriAdminDebits += amount;
        else nutriAdminCredits += amount;
      } else if (isProfessor) {
        if (entry?.kind === "debit") profAdminDebits += amount;
        else profAdminCredits += amount;
      } else if (!slot.includes("taxa de pagamento") && !slot.includes("imposto")) {
        if (entry?.kind === "debit") adminDebits += amount;
        else adminCredits += amount;
      }
    });
    const adminAvailable = Math.max(0, adminCredits - adminDebits);
    const nutriAdminAvailable = Math.max(0, nutriAdminCredits - nutriAdminDebits);
    const profAdminAvailable = Math.max(0, profAdminCredits - profAdminDebits);
    const nutritionistRows = (nw.data as any[]) || [];
    const hasUnassignedNutritionist = nutriAdminCredits > 0 || nutriAdminDebits > 0;
    const hasUnassignedProfessor = profAdminCredits > 0 || profAdminDebits > 0;
    return {
      adminWallet: {
        available: adminAvailable,
        totalEarned: adminCredits,
        totalWithdrawn: adminDebits,
      },
      coachWalletsTotal: (() => {
        if (cutoff) {
          const byProfile = new Map<string, number>();
          ((commAll.data as any[] | null) || []).forEach((c: any) => {
            byProfile.set(c.beneficiary_profile_id, (byProfile.get(c.beneficiary_profile_id) || 0) + Number(c.amount || 0));
          });
          const sumIn = (rows: any[] | null) => (rows || []).reduce((a: number, r: any) => a + (byProfile.get(r.profile_id) || 0), 0);
          const total = sumIn(cw.data as any[]) + sumIn(pw.data as any[]) + sumIn(profw.data as any[]);
          return { available: total, totalEarned: total, totalWithdrawn: 0,
            count: ((cw.data as any[] | null)?.length || 0) + ((pw.data as any[] | null)?.length || 0) + ((profw.data as any[] | null)?.length || 0) };
        }
        return {
          available: sum(cw.data as any[], "available_balance") + sum(pw.data as any[], "available_balance") + sum(profw.data as any[], "available_balance"),
          totalEarned: sum(cw.data as any[], "total_earned") + sum(pw.data as any[], "total_earned") + sum(profw.data as any[], "total_earned"),
          totalWithdrawn: sum(cw.data as any[], "total_withdrawn") + sum(pw.data as any[], "total_withdrawn") + sum(profw.data as any[], "total_withdrawn"),
          count: ((cw.data as any[] | null)?.length || 0) + ((pw.data as any[] | null)?.length || 0) + ((profw.data as any[] | null)?.length || 0),
        };
      })(),
      studentWalletsTotal: (() => {
        if (cutoff) {
          const byProfile = new Map<string, number>();
          ((commAll.data as any[] | null) || []).forEach((c: any) => {
            byProfile.set(c.beneficiary_profile_id, (byProfile.get(c.beneficiary_profile_id) || 0) + Number(c.amount || 0));
          });
          const sumIn = (rows: any[] | null) => (rows || []).reduce((a: number, r: any) => a + (byProfile.get(r.profile_id) || 0), 0);
          const total = sumIn(sw.data as any[]);
          return { available: total, totalEarned: total, totalWithdrawn: 0, count: (sw.data as any[] | null)?.length || 0 };
        }
        return {
          available: sum(sw.data as any[], "available_balance"),
          totalEarned: sum(sw.data as any[], "total_earned"),
          totalWithdrawn: sum(sw.data as any[], "total_withdrawn"),
          count: (sw.data as any[] | null)?.length || 0,
        };
      })(),
      nutritionistTotal: cutoff ? {
        available: nutriAdminAvailable,
        blocked: 0,
        totalEarned: nutriAdminCredits,
        count: nutritionistRows.length + (hasUnassignedNutritionist ? 1 : 0),
      } : {
        available: sum(nutritionistRows, "available_balance") + nutriAdminAvailable,
        blocked: sum(nutritionistRows, "blocked_balance"),
        totalEarned: sum(nutritionistRows, "total_earned") + nutriAdminCredits,
        count: nutritionistRows.length + (hasUnassignedNutritionist ? 1 : 0),
      },
      professorTotal: (() => {
        const profRows = (profsw.data as any[]) || [];
        if (cutoff) {
          return {
            available: profAdminAvailable,
            blocked: 0,
            totalEarned: profAdminCredits,
            count: profRows.length + (hasUnassignedProfessor ? 1 : 0),
          };
        }
        return {
          available: sum(profRows, "available_balance") + profAdminAvailable,
          blocked: sum(profRows, "blocked_balance"),
          totalEarned: sum(profRows, "total_earned") + profAdminCredits,
          count: profRows.length + (hasUnassignedProfessor ? 1 : 0),
        };
      })(),
      partnerOrders: (() => {
        const rows = ((ppo.data as any[] | null) || []).filter((r: any) => r.partner_product_id);
        const realSystemFee = rows.reduce((acc, r: any) => {
          const gross = Number(r.gross_amount || 0);
          const paidOut = Number(r.partner_net_amount || 0)
            + Number(r.coach_net_amount || 0)
            + Number(r.network_l1_amount || 0)
            + Number(r.network_l2_amount || 0)
            + Number(r.network_l3_amount || 0)
            + Number(r.master_coach_cross_bonus_amount || 0)
            + Number(r.payment_fee || 0)
            + Number(r.tax_amount || 0);
          const computed = gross - paidOut;
          return acc + (Number.isFinite(computed) ? Math.max(0, computed) : Number(r.system_fee || 0));
        }, 0);
        return {
          paidCount: rows.length,
          paidGross: sum(rows, "gross_amount"),
          partnerNet: sum(rows, "partner_net_amount"),
          coachNet: sum(rows, "coach_net_amount"),
          systemFee: Math.round(realSystemFee * 100) / 100,
        };
      })(),
      professionalOrders: (() => {
        const rows = ((ppo.data as any[] | null) || []).filter((r: any) => r.professional_product_id);
        const realSystemFee = rows.reduce((acc, r: any) => {
          const gross = Number(r.gross_amount || 0);
          const paidOut = Number(r.partner_net_amount || 0)
            + Number(r.coach_net_amount || 0)
            + Number(r.network_l1_amount || 0)
            + Number(r.network_l2_amount || 0)
            + Number(r.network_l3_amount || 0)
            + Number(r.master_coach_cross_bonus_amount || 0)
            + Number(r.payment_fee || 0)
            + Number(r.tax_amount || 0);
          const computed = gross - paidOut;
          return acc + (Number.isFinite(computed) ? Math.max(0, computed) : Number(r.system_fee || 0));
        }, 0);
        return {
          paidCount: rows.length,
          paidGross: sum(rows, "gross_amount"),
          professionalNet: sum(rows, "partner_net_amount"),
          coachNet: sum(rows, "coach_net_amount"),
          systemFee: Math.round(realSystemFee * 100) / 100,
        };
      })(),
      pendingWithdrawals: {
        coachAmount: sum(wr.data as any[], "amount"),
        coachCount: (wr.data as any[] | null)?.length || 0,
        studentAmount: sum(swr.data as any[], "amount"),
        studentCount: (swr.data as any[] | null)?.length || 0,
      },
    } satisfies FinancialSummary;
  });
