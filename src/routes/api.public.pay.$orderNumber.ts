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
        if (!order) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });

        const [{ data: items }, { data: student }] = await Promise.all([
          supabaseAdmin.from("store_order_items")
            .select("title, quantity, unit_price, total_price").eq("order_id", order.id),
          supabaseAdmin.from("students")
            .select("profiles:profile_id(name,email)").eq("id", order.student_id).maybeSingle(),
        ]);

        return new Response(JSON.stringify({
          order: {
            number: order.order_number,
            status: order.status,
            paymentMethod: order.payment_method,
            total: Number(order.total_amount),
            createdAt: order.created_at,
            clientName: (student as any)?.profiles?.name || "Cliente",
          },
          items: (items || []).map((i: any) => ({
            title: i.title, quantity: i.quantity, unitPrice: Number(i.unit_price), totalPrice: Number(i.total_price),
          })),
        }), { headers: { "content-type": "application/json" } });
      },
    },
  },
});
