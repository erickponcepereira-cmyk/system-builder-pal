import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type WalletHistoryItem = {
  id: string;
  amount: number;
  level: number;
  created_at: string;
  transaction_id: string | null;
  slot_label: string | null;
  purchase_type: string | null;
  customer: string | null;
  product: string | null;
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
      .select("id,amount,level,created_at,transaction_id,slot_label")
      .eq("beneficiary_profile_id", profileId);
    if (cutoff) commQ = commQ.gte("created_at", cutoff);
    const { data: comm } = await commQ
      .order("created_at", { ascending: false })
      .limit(30);
    const rows = (comm || []) as Array<{ id: string; amount: number; level: number; created_at: string; transaction_id: string | null; slot_label: string | null }>;
    if (!rows.length) return [];

    const txIds = Array.from(new Set(rows.map((r) => r.transaction_id).filter(Boolean) as string[]));
    const txMap = new Map<string, { purchase_type: string | null; student_id: string | null; product_id: string | null; store_product_id: string | null; digital_product_id: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id,purchase_type,student_id,product_id,store_product_id,digital_product_id")
        .in("id", txIds);
      ((txs as Array<{ id: string; purchase_type: string | null; student_id: string | null; product_id: string | null; store_product_id: string | null; digital_product_id: string | null }>) || []).forEach((t) => {
        txMap.set(t.id, t);
      });
    }

    const studentIds = Array.from(new Set(Array.from(txMap.values()).map((t) => t.student_id).filter(Boolean) as string[]));
    const studentNameMap = new Map<string, string>();
    if (studentIds.length) {
      const { data: studs } = await supabaseAdmin
        .from("students")
        .select("id,profile_id")
        .in("id", studentIds);
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

    const regularIds = Array.from(new Set(Array.from(txMap.values()).filter((t) => t.purchase_type !== "store_order" && t.purchase_type !== "digital").map((t) => t.product_id).filter(Boolean) as string[]));
    const storeIds = Array.from(new Set(Array.from(txMap.values()).filter((t) => t.purchase_type === "store_order").map((t) => t.store_product_id).filter(Boolean) as string[]));
    const digitalIds = Array.from(new Set(Array.from(txMap.values()).filter((t) => t.purchase_type === "digital").map((t) => t.digital_product_id).filter(Boolean) as string[]));
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

    return rows.map((r) => {
      const info = r.transaction_id ? txMap.get(r.transaction_id) : undefined;
      const ptype = info?.purchase_type || null;
      const customer = info?.student_id ? studentNameMap.get(info.student_id) || null : null;
      let product: string | null = null;
      if (info) {
        if (ptype === "store_order" && info.store_product_id) product = productNameMap.get(`s:${info.store_product_id}`) || null;
        else if (ptype === "digital" && info.digital_product_id) product = productNameMap.get(`d:${info.digital_product_id}`) || null;
        else if (info.product_id) product = productNameMap.get(`p:${info.product_id}`) || null;
      }
      return {
        id: r.id,
        amount: Number(r.amount),
        level: r.level,
        created_at: r.created_at,
        transaction_id: r.transaction_id,
        slot_label: r.slot_label,
        purchase_type: ptype,
        customer,
        product,
      };
    });
  });
