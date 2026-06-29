import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { dedupeCommissions } from "@/lib/financial-dedupe";

export type WalletHistoryItem = {
  id: string;
  amount: number;
  level: number;
  created_at: string;
  transaction_id: string | null;
  partner_order_id: string | null;
  slot_label: string | null;
  purchase_type: string | null;
  customer: string | null;
  product: string | null;
  is_master_coach_sale: boolean;
  master_coach_name: string | null;
};

export const getMyWalletHistory = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<WalletHistoryItem[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const profileId = (
      await supabaseAdmin.from("profiles").select("id").eq("user_id", context.userId).maybeSingle()
    ).data?.id;
    if (!profileId) return [];

    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    let commQ = supabaseAdmin
      .from("commissions")
      .select("id,amount,level,created_at,transaction_id,partner_order_id,slot_label,is_master_coach_commission,beneficiary_profile_id,beneficiary_coach_id,status,is_referral")
      .eq("beneficiary_profile_id", profileId);
    if (cutoff) commQ = commQ.gte("created_at", cutoff);
    const { data: comm } = await commQ.order("created_at", { ascending: false }).limit(50);
    const rows = dedupeCommissions(comm as any[]) as Array<{
      id: string; amount: number; level: number; created_at: string;
      transaction_id: string | null; partner_order_id: string | null;
      slot_label: string | null; is_master_coach_commission: boolean | null;
    }>;
    if (!rows.length) return [];

    // Resolve transactions
    const txIds = Array.from(new Set(rows.map((r) => r.transaction_id).filter(Boolean) as string[]));
    const txMap = new Map<string, { purchase_type: string | null; student_id: string | null; product_id: string | null; store_product_id: string | null; digital_product_id: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id,purchase_type,student_id,product_id,store_product_id,digital_product_id")
        .in("id", txIds);
      ((txs as Array<{ id: string; purchase_type: string | null; student_id: string | null; product_id: string | null; store_product_id: string | null; digital_product_id: string | null }>) || []).forEach((t) => txMap.set(t.id, t));
    }

    // Resolve partner/professional orders
    const poIds = Array.from(new Set(rows.map((r) => r.partner_order_id).filter(Boolean) as string[]));
    const poMap = new Map<string, {
      student_id: string | null; partner_product_id: string | null; professional_product_id: string | null;
      master_coach_cross_beneficiary_coach_id: string | null; selling_coach_id: string | null;
    }>();
    if (poIds.length) {
      const { data: pos } = await supabaseAdmin
        .from("partner_product_orders")
        .select("id,student_id,partner_product_id,professional_product_id,master_coach_cross_beneficiary_coach_id,selling_coach_id")
        .in("id", poIds);
      ((pos as Array<any>) || []).forEach((p) => poMap.set(p.id, p));
    }

    // Students from both sources (transactions.student_id is students.id, partner_product_orders.student_id is also students.id)
    const studentIds = Array.from(new Set([
      ...Array.from(txMap.values()).map((t) => t.student_id).filter(Boolean) as string[],
      ...Array.from(poMap.values()).map((p) => p.student_id).filter(Boolean) as string[],
    ]));
    const studentNameMap = new Map<string, string>();
    if (studentIds.length) {
      const { data: studs } = await supabaseAdmin.from("students").select("id,profile_id").in("id", studentIds);
      const pIds = ((studs as Array<{ id: string; profile_id: string | null }>) || []).map((s) => s.profile_id).filter(Boolean) as string[];
      const pmap = new Map<string, string>();
      if (pIds.length) {
        const { data: profs } = await supabaseAdmin.from("profiles").select("id,name").in("id", pIds);
        ((profs as Array<{ id: string; name: string | null }>) || []).forEach((p) => pmap.set(p.id, p.name || "Cliente"));
      }
      ((studs as Array<{ id: string; profile_id: string | null }>) || []).forEach((s) => {
        studentNameMap.set(s.id, (s.profile_id && pmap.get(s.profile_id)) || "Cliente");
      });
    }

    // Products
    const regularIds = Array.from(new Set(Array.from(txMap.values()).map((t) => t.product_id).filter(Boolean) as string[]));
    const storeIds = Array.from(new Set(Array.from(txMap.values()).filter((t) => t.purchase_type === "store_order").map((t) => t.store_product_id).filter(Boolean) as string[]));
    const digitalIds = Array.from(new Set(Array.from(txMap.values()).filter((t) => t.purchase_type === "digital").map((t) => t.digital_product_id).filter(Boolean) as string[]));
    const partnerProductIds = Array.from(new Set(Array.from(poMap.values()).map((p) => p.partner_product_id).filter(Boolean) as string[]));
    const professionalProductIds = Array.from(new Set(Array.from(poMap.values()).map((p) => p.professional_product_id).filter(Boolean) as string[]));
    const productNameMap = new Map<string, string>();
    if (regularIds.length) {
      const { data } = await supabaseAdmin.from("products").select("id,name").in("id", regularIds);
      ((data as Array<{ id: string; name: string }>) || []).forEach((p) => productNameMap.set(`p:${p.id}`, p.name));
    }
    if (storeIds.length) {
      const { data } = await supabaseAdmin.from("store_products").select("id,name").in("id", storeIds);
      ((data as Array<{ id: string; name: string }>) || []).forEach((p) => productNameMap.set(`s:${p.id}`, p.name));
    }
    if (digitalIds.length) {
      const { data } = await supabaseAdmin.from("digital_products").select("id,title").in("id", digitalIds);
      ((data as Array<{ id: string; title: string }>) || []).forEach((p) => productNameMap.set(`d:${p.id}`, p.title));
    }
    if (partnerProductIds.length) {
      const { data } = await supabaseAdmin.from("partner_products").select("id,name").in("id", partnerProductIds);
      ((data as Array<{ id: string; name: string }>) || []).forEach((p) => productNameMap.set(`pp:${p.id}`, p.name));
    }
    if (professionalProductIds.length) {
      const { data } = await supabaseAdmin.from("professional_products").select("id,name").in("id", professionalProductIds);
      ((data as Array<{ id: string; name: string }>) || []).forEach((p) => productNameMap.set(`prof:${p.id}`, p.name));
    }

    // Master coach names (resolve from coach_id → profile.name)
    const masterCoachIds = Array.from(new Set(Array.from(poMap.values()).map((p) => p.master_coach_cross_beneficiary_coach_id).filter(Boolean) as string[]));
    const masterCoachNameMap = new Map<string, string>();
    if (masterCoachIds.length) {
      const { data: coachRows } = await supabaseAdmin.from("coaches").select("id,profile_id").in("id", masterCoachIds);
      const pIds = ((coachRows as Array<{ id: string; profile_id: string | null }>) || []).map((c) => c.profile_id).filter(Boolean) as string[];
      const nm = new Map<string, string>();
      if (pIds.length) {
        const { data: profs } = await supabaseAdmin.from("profiles").select("id,name").in("id", pIds);
        ((profs as Array<{ id: string; name: string | null }>) || []).forEach((p) => nm.set(p.id, p.name || "Master Coach"));
      }
      ((coachRows as Array<{ id: string; profile_id: string | null }>) || []).forEach((c) => {
        masterCoachNameMap.set(c.id, (c.profile_id && nm.get(c.profile_id)) || "Master Coach");
      });
    }

    return rows.map((r) => {
      const tx = r.transaction_id ? txMap.get(r.transaction_id) : undefined;
      const po = r.partner_order_id ? poMap.get(r.partner_order_id) : undefined;
      const ptype = tx?.purchase_type || (po ? (po.partner_product_id ? "partner_product" : "professional_product") : null);

      let customer: string | null = null;
      let product: string | null = null;
      if (tx) {
        if (tx.student_id) customer = studentNameMap.get(tx.student_id) || null;
        if (ptype === "store_order" && tx.store_product_id) product = productNameMap.get(`s:${tx.store_product_id}`) || null;
        else if (ptype === "digital" && tx.digital_product_id) product = productNameMap.get(`d:${tx.digital_product_id}`) || null;
        if (!product && tx.product_id) product = productNameMap.get(`p:${tx.product_id}`) || null;
      }
      if (po) {
        if (!customer && po.student_id) customer = studentNameMap.get(po.student_id) || null;
        if (!product && po.partner_product_id) product = productNameMap.get(`pp:${po.partner_product_id}`) || null;
        if (!product && po.professional_product_id) product = productNameMap.get(`prof:${po.professional_product_id}`) || null;
      }

      const isMaster = Boolean(r.is_master_coach_commission) || Boolean(po?.master_coach_cross_beneficiary_coach_id);
      const masterCoachName = po?.master_coach_cross_beneficiary_coach_id
        ? masterCoachNameMap.get(po.master_coach_cross_beneficiary_coach_id) || null
        : null;

      return {
        id: r.id,
        amount: Number(r.amount),
        level: r.level,
        created_at: r.created_at,
        transaction_id: r.transaction_id,
        partner_order_id: r.partner_order_id,
        slot_label: r.slot_label,
        purchase_type: ptype,
        customer,
        product,
        is_master_coach_sale: isMaster,
        master_coach_name: masterCoachName,
      };
    });
  });
