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
        "id,order_number,status,payment_method,gross_amount,system_fee,coach_commission_amount,coach_net_amount,partner_net_amount,network_l1_amount,network_l2_amount,network_l3_amount,paid_at,created_at,student:students!partner_product_orders_student_id_fkey(profile:profiles!students_profile_id_fkey(name)),product:professional_products!partner_product_orders_professional_product_id_fkey(name),professional:coaches!partner_product_orders_professional_coach_id_fkey(specialty_key,profile:profiles!coaches_profile_id_fkey(name)),selling:coaches!partner_product_orders_selling_coach_id_fkey(profile:profiles!coaches_profile_id_fkey(name))" as never,
      )
      .order("created_at" as never, { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status" as never, data.status as never);
    const { data: rows, error } = await q;
    if (error) throw new Error(error.message);
    return ((rows as unknown as any[]) || []).map<PartnerOrderRow>((r) => ({
      id: r.id,
      orderNumber: r.order_number,
      status: r.status,
      paymentMethod: r.payment_method,
      studentName: r.student?.profile?.name || null,
      productName: r.product?.name || null,
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
  partnerOrders: { paidCount: number; paidGross: number; partnerNet: number; coachNet: number; systemFee: number };
  pendingWithdrawals: { coachAmount: number; coachCount: number; studentAmount: number; studentCount: number };
}

export const getFinancialSummary = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase } = context;
    const [adminEntries, cw, sw, nw, pw, profw, ppo, wr, swr] = await Promise.all([
      supabase.from("admin_system_wallet_entries" as never).select("slot_label,kind,amount" as never),
      supabase.from("wallets" as never).select("available_balance,total_earned,total_withdrawn" as never),
      supabase.from("student_wallets" as never).select("available_balance,total_earned,total_withdrawn" as never),
      supabase.from("nutritionist_wallets" as never).select("available_balance,blocked_balance,total_earned" as never),
      supabase.from("partner_wallets" as never).select("available_balance,total_earned,total_withdrawn" as never),
      supabase.from("professional_wallets" as never).select("available_balance,total_earned,total_withdrawn" as never),
      supabase.from("partner_product_orders" as never).select("status,gross_amount,partner_net_amount,coach_net_amount,system_fee" as never).eq("status" as never, "paid" as never),
      supabase.from("withdrawal_requests" as never).select("amount,status" as never).in("status" as never, ["pending", "approved", "processing"] as never),
      supabase.from("student_withdrawal_requests" as never).select("amount,status" as never).in("status" as never, ["pending", "approved", "processing"] as never),
    ]);
    const sum = (arr: any[] | null | undefined, k: string) =>
      (arr || []).reduce((a, r: any) => a + Number(r?.[k] || 0), 0);
    let adminCredits = 0;
    let adminDebits = 0;
    let nutriAdminCredits = 0;
    let nutriAdminDebits = 0;
    ((adminEntries.data as any[]) || []).forEach((entry) => {
      const slot = String(entry?.slot_label || "").toLowerCase();
      const amount = Number(entry?.amount || 0);
      const isNutritionist = slot.includes("nutricion");
      if (isNutritionist) {
        if (entry?.kind === "debit") nutriAdminDebits += amount;
        else nutriAdminCredits += amount;
      } else if (!slot.includes("taxa de pagamento") && !slot.includes("imposto")) {
        if (entry?.kind === "debit") adminDebits += amount;
        else adminCredits += amount;
      }
    });
    const adminAvailable = Math.max(0, adminCredits - adminDebits);
    const nutriAdminAvailable = Math.max(0, nutriAdminCredits - nutriAdminDebits);
    const nutritionistRows = (nw.data as any[]) || [];
    const hasUnassignedNutritionist = nutriAdminCredits > 0 || nutriAdminDebits > 0;
    return {
      adminWallet: {
        available: adminAvailable,
        totalEarned: adminCredits,
        totalWithdrawn: adminDebits,
      },
      coachWalletsTotal: {
        available: sum(cw.data as any[], "available_balance"),
        totalEarned: sum(cw.data as any[], "total_earned"),
        totalWithdrawn: sum(cw.data as any[], "total_withdrawn"),
        count: (cw.data as any[] | null)?.length || 0,
      },
      studentWalletsTotal: {
        available: sum(sw.data as any[], "available_balance"),
        totalEarned: sum(sw.data as any[], "total_earned"),
        totalWithdrawn: sum(sw.data as any[], "total_withdrawn"),
        count: (sw.data as any[] | null)?.length || 0,
      },
      nutritionistTotal: {
        available: sum(nutritionistRows, "available_balance") + nutriAdminAvailable,
        blocked: sum(nutritionistRows, "blocked_balance"),
        totalEarned: sum(nutritionistRows, "total_earned") + nutriAdminCredits,
        count: nutritionistRows.length + (hasUnassignedNutritionist ? 1 : 0),
      },
      partnerOrders: {
        paidCount: (ppo.data as any[] | null)?.length || 0,
        paidGross: sum(ppo.data as any[], "gross_amount"),
        partnerNet: sum(ppo.data as any[], "partner_net_amount"),
        coachNet: sum(ppo.data as any[], "coach_net_amount"),
        systemFee: sum(ppo.data as any[], "system_fee"),
      },
      pendingWithdrawals: {
        coachAmount: sum(wr.data as any[], "amount"),
        coachCount: (wr.data as any[] | null)?.length || 0,
        studentAmount: sum(swr.data as any[], "amount"),
        studentCount: (swr.data as any[] | null)?.length || 0,
      },
    } satisfies FinancialSummary;
  });
