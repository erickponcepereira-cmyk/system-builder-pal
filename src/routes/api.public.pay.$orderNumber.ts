import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/pay/$orderNumber")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const { data: order } = await supabaseAdmin
          .from("store_orders")
          .select("id, order_number, status, payment_method, total_amount, created_at, student_id, notes")
          .eq("order_number", params.orderNumber)
          .maybeSingle();
        if (!order) {
          const { data: partnerOrder } = await supabaseAdmin
            .from("partner_product_orders" as never)
            .select("id, order_number, status, payment_method, gross_amount, created_at, student_id, professional_product:professional_product_id(name), partner_product:partner_product_id(name)" as never)
            .eq("order_number" as never, params.orderNumber as never)
            .maybeSingle();
          const po = partnerOrder as unknown as { id: string; order_number: string; status: string; payment_method: string; gross_amount: number; created_at: string; student_id: string; professional_product?: { name: string | null } | null; partner_product?: { name: string | null } | null } | null;
          if (!po) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });

          const { data: student } = await supabaseAdmin
            .from("students")
            .select("profiles:profile_id(name,email)").eq("id", po.student_id).maybeSingle();

          const title = po.professional_product?.name || po.partner_product?.name || "Produto";
          return new Response(JSON.stringify({
            order: {
              id: po.id,
              sourceKind: "partner_product_order",
              number: po.order_number,
              status: po.status,
              paymentMethod: po.payment_method,
              total: Number(po.gross_amount),
              createdAt: po.created_at,
              clientName: (student as any)?.profiles?.name || "Cliente",
              clientEmail: (student as any)?.profiles?.email || null,
            },
            items: [{ title, quantity: 1, unitPrice: Number(po.gross_amount), totalPrice: Number(po.gross_amount) }],
          }), { headers: { "content-type": "application/json" } });
        }

        const [{ data: items }, { data: student }] = await Promise.all([
          supabaseAdmin.from("store_order_items")
            .select("title, quantity, unit_price, total_price").eq("order_id", order.id),
          supabaseAdmin.from("students")
            .select("profiles:profile_id(name,email)").eq("id", order.student_id).maybeSingle(),
        ]);

        return new Response(JSON.stringify({
          order: {
            id: order.id,
            sourceKind: "store_order",
            number: order.order_number,
            status: order.status,
            paymentMethod: order.payment_method,
            total: Number(order.total_amount),
            createdAt: order.created_at,
            clientName: (student as any)?.profiles?.name || "Cliente",
            clientEmail: (student as any)?.profiles?.email || null,
          },
          items: (items || []).map((i: any) => ({
            title: i.title, quantity: i.quantity, unitPrice: Number(i.unit_price), totalPrice: Number(i.total_price),
          })),
        }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
