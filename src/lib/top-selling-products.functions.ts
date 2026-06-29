import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getServerCutoffIso } from "@/lib/test-mode.functions";

export type TopSellingSaleRow = {
  product_id: string;
  qty: number;
  revenue: number;
  master_qty: number;
  master_revenue: number;
};

export type TopSellingProductMeta = {
  id: string;
  name: string;
  category_id: string | null;
  section_id: string | null;
};

export type TopSellingPayload = {
  sales: TopSellingSaleRow[];
  extraProducts: TopSellingProductMeta[];
};

function inDateRange(value: string | null | undefined, from: string | null, to: string | null, cutoff: string | null) {
  if (!value) return false;
  const time = new Date(value).getTime();
  if (Number.isNaN(time)) return false;
  if (from && time < new Date(from).getTime()) return false;
  if (to && time > new Date(to).getTime()) return false;
  if (cutoff && time < new Date(cutoff).getTime()) return false;
  return true;
}

export const getTopSellingProducts = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((raw: { from?: string | null; to?: string | null } | undefined) => ({
    from: raw?.from ?? null,
    to: raw?.to ?? null,
  }))
  .handler(async ({ data, context }): Promise<TopSellingPayload> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = await getServerCutoffIso();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    const profileId = (profile as { id: string } | null)?.id ?? null;
    if (!profileId) return { sales: [], extraProducts: [] };

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profileId)
      .maybeSingle();
    const coachId = (coach as { id: string } | null)?.id ?? null;
    if (!coachId) return { sales: [], extraProducts: [] };

    const { data: commissionRows } = await supabaseAdmin
      .from("commissions")
      .select("transaction_id,partner_order_id,is_master_coach_commission")
      .eq("beneficiary_profile_id", profileId)
      .eq("level", 0);

    const txIds = new Set<string>();
    const partnerOrderIds = new Set<string>();
    const myMasterTxIds = new Set<string>();
    const myMasterPartnerOrderIds = new Set<string>();

    ((commissionRows || []) as Array<{ transaction_id: string | null; partner_order_id: string | null; is_master_coach_commission: boolean | null }>).forEach((row) => {
      if (row.transaction_id) {
        txIds.add(row.transaction_id);
        if (row.is_master_coach_commission) myMasterTxIds.add(row.transaction_id);
      }
      if (row.partner_order_id) {
        partnerOrderIds.add(row.partner_order_id);
        if (row.is_master_coach_commission) myMasterPartnerOrderIds.add(row.partner_order_id);
      }
    });

    // Fallback/fonte de verdade para pedidos de parceiro/profissional: em vendas
    // cross-network o próprio pedido guarda quem foi o Master Coach vendedor. Assim
    // o perfil do Master Coach passa a mostrar a venda mesmo que a comissão antiga
    // ainda não tenha sido recriada/backfilled corretamente.
    const { data: directMasterOrders } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("id" as never)
      .eq("master_coach_cross_beneficiary_coach_id" as never, coachId as never)
      .eq("status" as never, "paid" as never);
    ((directMasterOrders || []) as unknown as Array<{ id: string }>).forEach((row) => {
      if (row.id) {
        partnerOrderIds.add(row.id);
        myMasterPartnerOrderIds.add(row.id);
      }
    });

    const masterByOtherTxIds = new Set<string>();
    const masterByOtherPartnerOrderIds = new Set<string>();

    if (txIds.size) {
      const { data: otherMasterComms } = await supabaseAdmin
        .from("commissions")
        .select("transaction_id,beneficiary_profile_id,is_master_coach_commission")
        .eq("is_master_coach_commission", true)
        .in("transaction_id", Array.from(txIds));
      ((otherMasterComms || []) as Array<{ transaction_id: string | null; beneficiary_profile_id: string | null }>).forEach((row) => {
        if (row.transaction_id && row.beneficiary_profile_id !== profileId) masterByOtherTxIds.add(row.transaction_id);
      });
    }

    if (partnerOrderIds.size) {
      const { data: otherMasterComms } = await supabaseAdmin
        .from("commissions")
        .select("partner_order_id,beneficiary_profile_id,is_master_coach_commission")
        .eq("is_master_coach_commission", true)
        .in("partner_order_id", Array.from(partnerOrderIds));
      ((otherMasterComms || []) as Array<{ partner_order_id: string | null; beneficiary_profile_id: string | null }>).forEach((row) => {
        if (row.partner_order_id && row.beneficiary_profile_id !== profileId) masterByOtherPartnerOrderIds.add(row.partner_order_id);
      });
    }

    const map = new Map<string, TopSellingSaleRow>();
    const extraProducts: TopSellingProductMeta[] = [];
    const addSale = (productId: string, amount: number, master: boolean) => {
      const existing = map.get(productId) || { product_id: productId, qty: 0, revenue: 0, master_qty: 0, master_revenue: 0 };
      existing.qty += 1;
      existing.revenue += amount;
      if (master) {
        existing.master_qty += 1;
        existing.master_revenue += amount;
      }
      map.set(productId, existing);
    };

    const visibleTxIds = Array.from(txIds).filter((id) => !masterByOtherTxIds.has(id));
    if (visibleTxIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id,product_id,status,gross_amount,paid_at,created_at")
        .in("id", visibleTxIds)
        .eq("status", "paid");
      ((txs || []) as Array<{ id: string; product_id: string | null; gross_amount: number | null; paid_at: string | null; created_at: string | null }>).forEach((tx) => {
        if (!tx.product_id) return;
        if (!inDateRange(tx.paid_at || tx.created_at, data.from, data.to, cutoff)) return;
        addSale(tx.product_id, Number(tx.gross_amount) || 0, myMasterTxIds.has(tx.id));
      });
    }

    const visiblePartnerOrderIds = Array.from(partnerOrderIds).filter((id) => !masterByOtherPartnerOrderIds.has(id));
    if (visiblePartnerOrderIds.length) {
      const { data: ordersData } = await supabaseAdmin
        .from("partner_product_orders" as never)
        .select("id,partner_product_id,professional_product_id,gross_amount,paid_at,created_at,status,master_coach_cross_beneficiary_coach_id" as never)
        .in("id" as never, visiblePartnerOrderIds as never)
        .eq("status" as never, "paid" as never);
      const orders = (ordersData || []) as unknown as Array<{
        id: string;
        partner_product_id: string | null;
        professional_product_id: string | null;
        gross_amount: number | null;
        paid_at: string | null;
        created_at: string | null;
        master_coach_cross_beneficiary_coach_id: string | null;
      }>;
      const partnerIds = Array.from(new Set(orders.map((o) => o.partner_product_id).filter(Boolean))) as string[];
      const professionalIds = Array.from(new Set(orders.map((o) => o.professional_product_id).filter(Boolean))) as string[];
      const [partnerProductsRes, professionalProductsRes] = await Promise.all([
        partnerIds.length ? supabaseAdmin.from("partner_products" as never).select("id,name" as never).in("id" as never, partnerIds as never) : Promise.resolve({ data: [] }),
        professionalIds.length ? supabaseAdmin.from("professional_products" as never).select("id,name" as never).in("id" as never, professionalIds as never) : Promise.resolve({ data: [] }),
      ]);
      const partnerNames = new Map(((partnerProductsRes.data || []) as Array<any>).map((p) => [p.id, p.name]));
      const professionalNames = new Map(((professionalProductsRes.data || []) as Array<any>).map((p) => [p.id, p.name]));

      orders.forEach((order) => {
        if (!inDateRange(order.paid_at || order.created_at, data.from, data.to, cutoff)) return;
        const masterCoachId = order.master_coach_cross_beneficiary_coach_id;
        if (masterCoachId && masterCoachId !== coachId) return;
        const isPartner = !!order.partner_product_id;
        const rawId = order.partner_product_id || order.professional_product_id;
        if (!rawId) return;
        const productId = `${isPartner ? "partner" : "professional"}:${rawId}`;
        addSale(productId, Number(order.gross_amount) || 0, myMasterPartnerOrderIds.has(order.id) || masterCoachId === coachId);
        extraProducts.push({
          id: productId,
          name: isPartner ? (partnerNames.get(rawId) || "Produto de parceiro") : (professionalNames.get(rawId) || "Produto profissional"),
          category_id: isPartner ? "__partner_products" : "__professional_products",
          section_id: isPartner ? "__partner_store" : "__professional_store",
        });
      });
    }

    return { sales: Array.from(map.values()), extraProducts };
  });