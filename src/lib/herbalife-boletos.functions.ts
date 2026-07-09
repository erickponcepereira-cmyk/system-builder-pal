import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type HerbalifeBoletoStatus = "pending_admin_payment" | "paid";

export type HerbalifeBoletoRow = {
  id: string;
  order_id: string;
  order_number: string | null;
  student_name: string | null;
  product_name: string | null;
  gross_amount: number;
  payment_method: string | null;
  paid_at: string | null;
  shipping_summary: string | null;
  boleto_file_url: string | null;
  boleto_barcode: string | null;
  submitted_at: string | null;
  admin_paid_at: string | null;
  payment_proof_url: string | null;
  status: HerbalifeBoletoStatus;
  notes: string | null;
  created_at: string;
};

async function isAdmin(supabase: any, userId: string) {
  const { data } = await supabase.rpc("has_role", { _user_id: userId, _role: "admin" });
  return Boolean(data);
}

/**
 * Lista as vendas Herbalife (produtos espelho) do parceiro/profissional logado,
 * com o boleto atrelado (se houver).
 */
export const listMyHerbalifeSales = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<HerbalifeBoletoRow[]> => {
    const { supabase, userId } = context;

    // Descobrir partner_id / coach_id do usuário
    const [{ data: profile }] = await Promise.all([
      supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle(),
    ]);
    if (!profile) return [];

    const [{ data: partner }, { data: coach }] = await Promise.all([
      supabase.from("partners").select("id").eq("profile_id", (profile as any).id).maybeSingle(),
      supabase.from("coaches").select("id").eq("profile_id", (profile as any).id).maybeSingle(),
    ]);

    const partnerId = (partner as any)?.id ?? null;
    const coachId = (coach as any)?.id ?? null;
    if (!partnerId && !coachId) return [];

    // 1) IDs de partner_products / professional_products espelhados
    const [pp, prp] = await Promise.all([
      partnerId
        ? supabase
            .from("partner_products")
            .select("id")
            .eq("partner_id", partnerId)
            .eq("is_mirrored", true)
        : Promise.resolve({ data: [] as any[] }),
      coachId
        ? supabase
            .from("professional_products")
            .select("id")
            .eq("coach_id", coachId)
            .eq("is_mirrored", true)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const mirroredPartnerIds = ((pp.data as any[]) || []).map((r) => r.id);
    const mirroredProfIds = ((prp.data as any[]) || []).map((r) => r.id);
    if (!mirroredPartnerIds.length && !mirroredProfIds.length) return [];

    // 2) Pedidos pagos desses produtos espelho
    let ordersQ = supabase
      .from("partner_product_orders")
      .select(
        "id, order_number, gross_amount, payment_method, paid_at, status, created_at, partner_product_id, professional_product_id, shipping_zip, shipping_address, shipping_number, shipping_reference, student_id",
      )
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(300);

    // Filter orders: partner_product_id in mirroredPartnerIds OR professional_product_id in mirroredProfIds
    // Do two queries and merge (PostgREST OR across arrays is possible but noisy)
    const results: any[] = [];
    if (mirroredPartnerIds.length) {
      const { data } = await ordersQ.in("partner_product_id", mirroredPartnerIds);
      if (data) results.push(...data);
    }
    if (mirroredProfIds.length) {
      const { data } = await supabase
        .from("partner_product_orders")
        .select(
          "id, order_number, gross_amount, payment_method, paid_at, status, created_at, partner_product_id, professional_product_id, shipping_zip, shipping_address, shipping_number, shipping_reference, student_id",
        )
        .eq("status", "paid")
        .in("professional_product_id", mirroredProfIds)
        .order("paid_at", { ascending: false })
        .limit(300);
      if (data) results.push(...data);
    }

    if (!results.length) return [];

    const orderIds = results.map((o) => o.id);
    const studentIds = Array.from(new Set(results.map((o) => o.student_id).filter(Boolean)));
    const ppIds = Array.from(new Set(results.map((o) => o.partner_product_id).filter(Boolean)));
    const prpIds = Array.from(new Set(results.map((o) => o.professional_product_id).filter(Boolean)));

    const [{ data: boletos }, { data: students }, { data: partnerProds }, { data: profProds }] = await Promise.all([
      supabase.from("herbalife_boletos").select("*").in("order_id", orderIds),
      studentIds.length
        ? supabase.from("students").select("id, profile:profiles(name)").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      ppIds.length
        ? supabase.from("partner_products").select("id, name").in("id", ppIds)
        : Promise.resolve({ data: [] as any[] }),
      prpIds.length
        ? supabase.from("professional_products").select("id, name").in("id", prpIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const boletoByOrder = new Map<string, any>();
    ((boletos as any[]) || []).forEach((b) => boletoByOrder.set(b.order_id, b));
    const sNameMap = new Map<string, string>();
    ((students as any[]) || []).forEach((s) => sNameMap.set(s.id, s.profile?.name || "—"));
    const ppNameMap = new Map<string, string>();
    ((partnerProds as any[]) || []).forEach((p) => ppNameMap.set(p.id, p.name));
    const prpNameMap = new Map<string, string>();
    ((profProds as any[]) || []).forEach((p) => prpNameMap.set(p.id, p.name));

    return results.map((o) => {
      const b = boletoByOrder.get(o.id) || null;
      const productName =
        (o.partner_product_id && ppNameMap.get(o.partner_product_id)) ||
        (o.professional_product_id && prpNameMap.get(o.professional_product_id)) ||
        null;
      const shipping =
        [o.shipping_address, o.shipping_number, o.shipping_zip].filter(Boolean).join(", ") || null;
      return {
        id: b?.id || o.id,
        order_id: o.id,
        order_number: o.order_number,
        student_name: o.student_id ? sNameMap.get(o.student_id) || null : null,
        product_name: productName,
        gross_amount: Number(o.gross_amount || 0),
        payment_method: o.payment_method,
        paid_at: o.paid_at,
        shipping_summary: shipping,
        boleto_file_url: b?.boleto_file_url ?? null,
        boleto_barcode: b?.boleto_barcode ?? null,
        submitted_at: b?.submitted_at ?? null,
        admin_paid_at: b?.admin_paid_at ?? null,
        payment_proof_url: b?.payment_proof_url ?? null,
        status: (b?.status as HerbalifeBoletoStatus) ?? "pending_admin_payment",
        notes: b?.notes ?? null,
        created_at: b?.created_at ?? o.created_at,
      };
    });
  });

/**
 * Parceiro/profissional envia boleto (arquivo e/ou código de barras).
 */
export const submitHerbalifeBoleto = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as { orderId: string; boletoFileUrl?: string | null; boletoBarcode?: string | null; notes?: string | null },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    if (!data.boletoFileUrl && !data.boletoBarcode) {
      throw new Error("Anexe o arquivo do boleto OU informe o código de barras.");
    }
    const { supabase, userId } = context;

    const { data: existing } = await supabase
      .from("herbalife_boletos")
      .select("id, status")
      .eq("order_id", data.orderId)
      .maybeSingle();

    if (existing && (existing as any).status === "paid") {
      throw new Error("Este boleto já foi pago pelo admin e não pode mais ser alterado.");
    }

    const payload = {
      order_id: data.orderId,
      boleto_file_url: data.boletoFileUrl ?? null,
      boleto_barcode: data.boletoBarcode ?? null,
      submitted_at: new Date().toISOString(),
      submitted_by: userId,
      status: "pending_admin_payment" as const,
      notes: data.notes ?? null,
    };

    if (existing) {
      const { error } = await supabase
        .from("herbalife_boletos")
        .update(payload)
        .eq("id", (existing as any).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabase.from("herbalife_boletos").insert(payload);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

/**
 * Admin lista todos os boletos Herbalife.
 */
export const adminListHerbalifeBoletos = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => (d as { status?: HerbalifeBoletoStatus | "all" }) || {})
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<HerbalifeBoletoRow[]> => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    let q = supabaseAdmin
      .from("herbalife_boletos")
      .select("*")
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status && data.status !== "all") q = q.eq("status", data.status);
    const { data: rows } = await q;
    if (!rows?.length) return [];

    const orderIds = (rows as any[]).map((r) => r.order_id);
    const { data: orders } = await supabaseAdmin
      .from("partner_product_orders")
      .select(
        "id, order_number, gross_amount, payment_method, paid_at, created_at, partner_product_id, professional_product_id, shipping_zip, shipping_address, shipping_number, student_id",
      )
      .in("id", orderIds);

    const ordersMap = new Map<string, any>();
    ((orders as any[]) || []).forEach((o) => ordersMap.set(o.id, o));

    const studentIds = Array.from(
      new Set(((orders as any[]) || []).map((o) => o.student_id).filter(Boolean)),
    );
    const ppIds = Array.from(
      new Set(((orders as any[]) || []).map((o) => o.partner_product_id).filter(Boolean)),
    );
    const prpIds = Array.from(
      new Set(((orders as any[]) || []).map((o) => o.professional_product_id).filter(Boolean)),
    );

    const [{ data: students }, { data: pps }, { data: prps }] = await Promise.all([
      studentIds.length
        ? supabaseAdmin.from("students").select("id, profile:profiles(name)").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      ppIds.length
        ? supabaseAdmin.from("partner_products").select("id, name").in("id", ppIds)
        : Promise.resolve({ data: [] as any[] }),
      prpIds.length
        ? supabaseAdmin.from("professional_products").select("id, name").in("id", prpIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const sNameMap = new Map<string, string>();
    ((students as any[]) || []).forEach((s) => sNameMap.set(s.id, s.profile?.name || "—"));
    const ppNameMap = new Map<string, string>();
    ((pps as any[]) || []).forEach((p) => ppNameMap.set(p.id, p.name));
    const prpNameMap = new Map<string, string>();
    ((prps as any[]) || []).forEach((p) => prpNameMap.set(p.id, p.name));

    return (rows as any[]).map((b) => {
      const o = ordersMap.get(b.order_id) || {};
      const productName =
        (o.partner_product_id && ppNameMap.get(o.partner_product_id)) ||
        (o.professional_product_id && prpNameMap.get(o.professional_product_id)) ||
        null;
      const shipping =
        [o.shipping_address, o.shipping_number, o.shipping_zip].filter(Boolean).join(", ") || null;
      return {
        id: b.id,
        order_id: b.order_id,
        order_number: o.order_number ?? null,
        student_name: o.student_id ? sNameMap.get(o.student_id) || null : null,
        product_name: productName,
        gross_amount: Number(o.gross_amount || 0),
        payment_method: o.payment_method ?? null,
        paid_at: o.paid_at ?? null,
        shipping_summary: shipping,
        boleto_file_url: b.boleto_file_url,
        boleto_barcode: b.boleto_barcode,
        submitted_at: b.submitted_at,
        admin_paid_at: b.admin_paid_at,
        payment_proof_url: b.payment_proof_url,
        status: b.status,
        notes: b.notes,
        created_at: b.created_at,
      };
    });
  });

/**
 * Admin confirma o pagamento do boleto e anexa comprovante.
 */
export const adminConfirmHerbalifeBoleto = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as { boletoId: string; paymentProofUrl: string; notes?: string | null })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    if (!(await isAdmin(context.supabase, context.userId))) throw new Error("Acesso negado");
    if (!data.paymentProofUrl) throw new Error("Anexe o comprovante de pagamento.");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { error } = await supabaseAdmin
      .from("herbalife_boletos")
      .update({
        status: "paid",
        admin_paid_at: new Date().toISOString(),
        admin_paid_by: context.userId,
        payment_proof_url: data.paymentProofUrl,
        notes: data.notes ?? undefined,
      })
      .eq("id", data.boletoId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
