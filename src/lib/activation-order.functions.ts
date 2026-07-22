import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

type PaymentStatus = "none" | "pending" | "in_process" | "approved" | "rejected" | "cancelled" | "refunded";

export const getOrCreateActivationOrder = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { notes?: string } | undefined) => ({ notes: input?.notes?.slice(0, 180) || "Ativação anual (onboarding)" }))
  .handler(async ({ data, context }) => {
    const activationProductId = "b43baf23-76b6-4abc-91a4-2730b3570d77";
    const activePaymentStatuses = new Set(["pending", "in_process", "approved"]);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile?.id) throw new Error("Perfil não encontrado");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!student?.id) throw new Error("Aluno não encontrado para gerar a anuidade");

    const { data: existingOrders } = await supabaseAdmin
      .from("store_orders")
      .select("id, total_amount, status, mp_payment_id, created_at, store_order_items(product_id, store_product_id, digital_product_id)")
      .eq("student_id", student.id)
      .eq("status", "pending")
      .order("created_at", { ascending: false })
      .limit(20);

    const activationOrders = ((existingOrders || []) as Array<{
      id: string;
      total_amount: number;
      status: string;
      mp_payment_id: string | null;
      store_order_items?: Array<{ product_id?: string | null; store_product_id?: string | null; digital_product_id?: string | null }>;
    }>).filter((order) => (order.store_order_items || []).some((item) =>
      item.product_id === activationProductId ||
      item.store_product_id === activationProductId ||
      item.digital_product_id === activationProductId
    ));

    for (const order of activationOrders) {
      let paymentStatus: PaymentStatus = "none";
      if (order.mp_payment_id) {
        const { data: payment } = await supabaseAdmin
          .from("mercadopago_payments")
          .select("status")
          .eq("id", order.mp_payment_id)
          .maybeSingle();
        paymentStatus = ((payment as { status?: PaymentStatus } | null)?.status || "none") as PaymentStatus;
        if (paymentStatus === "approved") throw new Error("Anuidade já está paga");
        if (!activePaymentStatuses.has(paymentStatus)) {
          await supabaseAdmin.from("store_orders").update({ mp_payment_id: null } as never).eq("id", order.id);
          return { orderId: order.id, totalAmount: Number(order.total_amount || 179.9), reused: true, paymentStatus };
        }
      }
      if (!order.mp_payment_id || paymentStatus === "pending" || paymentStatus === "in_process") {
        return { orderId: order.id, totalAmount: Number(order.total_amount || 179.9), reused: true, paymentStatus };
      }
    }

    const { data: product, error: productError } = await supabaseAdmin
      .from("products")
      .select("id, name, price, stock")
      .eq("id", activationProductId)
      .maybeSingle();
    if (productError || !product) throw new Error("Produto de anuidade não encontrado");

    const { data: order, error: orderError } = await supabaseAdmin
      .from("store_orders")
      .insert({
        student_id: student.id,
        payment_method: "pix",
        notes: data.notes,
        subtotal: Number((product as any).price || 179.9),
        total_amount: Number((product as any).price || 179.9),
      } as never)
      .select("id, total_amount")
      .single();
    if (orderError || !order) throw new Error(orderError?.message || "Falha ao criar pedido de anuidade");

    const kind = (product as any).stock === null || (product as any).stock === undefined ? "digital" : "physical";
    const { error: itemError } = await supabaseAdmin
      .from("store_order_items")
      .insert({
        order_id: (order as any).id,
        product_id: activationProductId,
        title: (product as any).name,
        unit_price: Number((product as any).price || 179.9),
        quantity: 1,
        total_price: Number((product as any).price || 179.9),
        product_kind: kind,
      } as never);
    if (itemError) throw new Error(itemError.message);

    await supabaseAdmin.from("transactions").insert({
      student_id: student.id,
      product_id: activationProductId,
      gross_amount: Number((product as any).price || 179.9),
      payment_fee: 0,
      tax_amount: 0,
      net_amount: Number((product as any).price || 179.9),
      payment_method: "pix",
      installments: 1,
      status: "pending",
      purchase_type: "store_order",
      metadata: { store_order_id: (order as any).id },
    } as never);

    return { orderId: (order as any).id as string, totalAmount: Number((order as any).total_amount || (product as any).price || 179.9), reused: false, paymentStatus: "none" as PaymentStatus };
  });