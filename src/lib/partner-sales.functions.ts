import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type PartnerSaleRow = {
  id: string;
  order_number: string;
  status: string;
  gross_amount: number;
  partner_net_amount: number;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
  sale_channel: string;
  release_status: string | null;
  available_at: string | null;
  student_name: string | null;
  student_photo: string | null;
  seller_name: string | null;
  product_name: string | null;
  coprod_amount: number;
};

export type PartnerSalesPayload = {
  partnerId: string | null;
  sales: PartnerSaleRow[];
};

/**
 * Lista as vendas dos produtos do parceiro logado com o nome do cliente
 * resolvido no servidor. O navegador do parceiro nao consegue ler o cadastro
 * do comprador (RLS), por isso a resolucao de nomes acontece aqui, sempre
 * restrita aos pedidos do proprio parceiro.
 */
export const listMyPartnerSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { limit?: number; fromIso?: string | null } | undefined) => d ?? {})
  .handler(async ({ data, context }): Promise<PartnerSalesPayload> => {
    const { userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!profile) return { partnerId: null, sales: [] };

    const { data: partnerRows } = await supabaseAdmin
      .from("partners").select("id,status,created_at")
      .eq("profile_id", profile.id)
      .order("created_at", { ascending: true });
    const plist = (partnerRows as Array<{ id: string; status: string }> | null) ?? [];
    const partner = plist.find((p) => p.status === "approved") ?? plist[0] ?? null;
    if (!partner) return { partnerId: null, sales: [] };

    let q = supabaseAdmin
      .from("partner_product_orders")
      .select("id,order_number,status,gross_amount,partner_net_amount,payment_method,paid_at,created_at,student_id,selling_coach_id,partner_product_id,professional_product_id,sale_channel,release_status,available_at")
      .eq("partner_id", partner.id)
      .order("created_at", { ascending: false })
      .limit(Math.min(Math.max(Number(data.limit || 200), 1), 500));
    if (data.fromIso) q = q.gte("created_at", data.fromIso);

    const { data: orderRows, error } = await q;
    if (error) throw new Error(error.message);
    type O = {
      id: string; order_number: string; status: string; gross_amount: number; partner_net_amount: number;
      payment_method: string; paid_at: string | null; created_at: string; student_id: string | null;
      selling_coach_id: string | null; partner_product_id: string | null; professional_product_id: string | null;
      sale_channel: string; release_status: string | null; available_at: string | null;
    };
    const orders = ((orderRows as unknown as O[]) || []);
    if (!orders.length) return { partnerId: partner.id, sales: [] };

    const studentIds = Array.from(new Set(orders.map((o) => o.student_id).filter(Boolean))) as string[];
    const coachIds = Array.from(new Set(orders.map((o) => o.selling_coach_id).filter(Boolean))) as string[];
    const partnerProductIds = Array.from(new Set(orders.map((o) => o.partner_product_id).filter(Boolean))) as string[];
    const professionalProductIds = Array.from(new Set(orders.map((o) => o.professional_product_id).filter(Boolean))) as string[];

    const [studentsRes, coachesRes, ppRes, profProdRes, creditsRes] = await Promise.all([
      studentIds.length
        ? supabaseAdmin.from("students").select("id, profiles!students_profile_id_fkey(name, photo_url, avatar_url)").in("id", studentIds)
        : Promise.resolve({ data: [] as unknown }),
      coachIds.length
        ? supabaseAdmin.from("coaches").select("id, profiles!coaches_profile_id_fkey(name)").in("id", coachIds)
        : Promise.resolve({ data: [] as unknown }),
      partnerProductIds.length
        ? supabaseAdmin.from("partner_products").select("id,name").in("id", partnerProductIds)
        : Promise.resolve({ data: [] as unknown }),
      professionalProductIds.length
        ? supabaseAdmin.from("professional_products").select("id,name").in("id", professionalProductIds)
        : Promise.resolve({ data: [] as unknown }),
      supabaseAdmin.from("product_coproduction_credits").select("order_id,amount_brl").in("order_id", orders.map((o) => o.id)),
    ]);

    const sMap = new Map<string, { name: string; photo: string | null }>();
    (((studentsRes as any).data || []) as any[]).forEach((s: any) => {
      sMap.set(s.id, { name: s.profiles?.name || "Cliente", photo: s.profiles?.photo_url || s.profiles?.avatar_url || null });
    });
    const cMap = new Map<string, string>();
    (((coachesRes as any).data || []) as any[]).forEach((c: any) => cMap.set(c.id, c.profiles?.name || "Coach"));
    const pMap = new Map<string, string>();
    (((ppRes as any).data || []) as any[]).forEach((p: any) => pMap.set(p.id, p.name));
    (((profProdRes as any).data || []) as any[]).forEach((p: any) => pMap.set(p.id, p.name));
    const coprodMap = new Map<string, number>();
    (((creditsRes as any).data || []) as any[]).forEach((c: any) => {
      coprodMap.set(c.order_id, (coprodMap.get(c.order_id) || 0) + Number(c.amount_brl || 0));
    });

    const sales = orders.map<PartnerSaleRow>((o) => {
      const student = o.student_id ? sMap.get(o.student_id) : null;
      return {
        id: o.id,
        order_number: o.order_number,
        status: o.status,
        gross_amount: Number(o.gross_amount || 0),
        partner_net_amount: Number(o.partner_net_amount || 0),
        payment_method: o.payment_method,
        paid_at: o.paid_at,
        created_at: o.created_at,
        sale_channel: o.sale_channel,
        release_status: o.release_status,
        available_at: o.available_at,
        student_name: student?.name || null,
        student_photo: student?.photo || null,
        seller_name: o.selling_coach_id ? cMap.get(o.selling_coach_id) || null : null,
        product_name:
          (o.partner_product_id ? pMap.get(o.partner_product_id) : null) ||
          (o.professional_product_id ? pMap.get(o.professional_product_id) : null) ||
          null,
        coprod_amount: coprodMap.get(o.id) || 0,
      };
    });

    return { partnerId: partner.id, sales };
  });
