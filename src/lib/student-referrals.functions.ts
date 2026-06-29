import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type ReferralCommissionRow = {
  id: string;
  amount: number;
  status: string | null;
  available_at: string | null;
  created_at: string;
  buyer_name: string | null;
  product_label: string | null;
  purchase_type: string | null;
  gross_amount: number | null;
};

export const getMyReferralCommissions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReferralCommissionRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoffIso = await getServerCutoffIso();
    const cutoffTime = cutoffIso ? new Date(cutoffIso).getTime() : null;
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) return [];
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("profile_id", (profile as any).id)
      .maybeSingle();
    if (!student) return [];

    const { data: comms } = await supabaseAdmin
      .from("commissions")
      .select("id, amount, status, available_at, created_at, transaction_id")
      .eq("is_referral", true as never)
      .eq("referred_by_student_id", (student as any).id as never)
      .eq("beneficiary_profile_id", (profile as any).id as never)
      .order("created_at", { ascending: false })
      .limit(200);

    const rows = (comms as any[]) || [];
    const txIds = Array.from(new Set(rows.map((c) => c.transaction_id).filter(Boolean)));
    const txMap = new Map<string, any>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id, gross_amount, purchase_type, product_id, store_product_id, student_id, paid_at, created_at")
        .in("id", txIds);
      ((txs as any[]) || []).forEach((t) => txMap.set(t.id, t));
    }

    const productIds = Array.from(new Set([...txMap.values()].map((t) => t.product_id).filter(Boolean)));
    const storeProductIds = Array.from(new Set([...txMap.values()].map((t) => t.store_product_id).filter(Boolean)));
    const buyerStudentIds = Array.from(new Set([...txMap.values()].map((t) => t.student_id).filter(Boolean)));

    const productMap = new Map<string, string>();
    if (productIds.length) {
      const { data: prods } = await supabaseAdmin.from("products").select("id,name").in("id", productIds);
      ((prods as any[]) || []).forEach((p) => productMap.set(p.id, p.name));
    }
    if (storeProductIds.length) {
      const { data: sps } = await supabaseAdmin.from("store_products").select("id,name").in("id", storeProductIds);
      ((sps as any[]) || []).forEach((p) => productMap.set(`sp:${p.id}`, p.name));
    }

    const buyerMap = new Map<string, string>();
    if (buyerStudentIds.length) {
      const { data: studs } = await supabaseAdmin
        .from("students")
        .select("id, profile:profiles!students_profile_id_fkey(name)")
        .in("id", buyerStudentIds);
      ((studs as any[]) || []).forEach((s) => buyerMap.set(s.id, s.profile?.name || ""));
    }

    return rows.filter((c) => {
      if (!cutoffTime) return true;
      const tx = txMap.get(c.transaction_id);
      const txTime = new Date(tx?.paid_at || tx?.created_at || c.created_at).getTime();
      return Number.isFinite(txTime) && txTime >= cutoffTime;
    }).map((c) => {
      const tx = txMap.get(c.transaction_id);
      const productLabel = tx
        ? productMap.get(tx.product_id) || productMap.get(`sp:${tx.store_product_id}`) ||
          (tx.purchase_type ? String(tx.purchase_type).replace(/_/g, " ") : null)
        : null;
      const buyerName = tx ? buyerMap.get(tx.student_id) || null : null;
      return {
        id: c.id,
        amount: Number(c.amount || 0),
        status: c.status,
        available_at: c.available_at,
        created_at: c.created_at,
        buyer_name: buyerName,
        product_label: productLabel,
        purchase_type: tx?.purchase_type || null,
        gross_amount: tx?.gross_amount != null ? Number(tx.gross_amount) : null,
      };
    });
  });
