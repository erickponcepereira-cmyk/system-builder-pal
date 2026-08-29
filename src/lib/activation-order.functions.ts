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

    const { data: orderId, error: createError } = await context.supabase.rpc("create_store_order", {
      // A adesão anual é um plano cadastrado em `products`, não um curso de
      // `digital_products`. Enviá-la como digital fazia o banco procurar um
      // curso com este UUID e rejeitar o checkout antes do pagamento.
      _items: [{ kind: "plan", sourceId: activationProductId, quantity: 1 }],
      _payment_method: "pix",
      _shipping: {},
      _notes: data.notes,
    });
    if (createError || !orderId) throw new Error(createError?.message || "Falha ao criar pedido de anuidade");

    const { data: createdOrder } = await supabaseAdmin
      .from("store_orders")
      .select("id, total_amount")
      .eq("id", orderId)
      .maybeSingle();

    return { orderId: String(orderId), totalAmount: Number((createdOrder as any)?.total_amount || 179.9), reused: false, paymentStatus: "none" as PaymentStatus };
  });