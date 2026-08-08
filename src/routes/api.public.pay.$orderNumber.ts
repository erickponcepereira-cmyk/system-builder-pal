import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const Route = createFileRoute("/api/public/pay/$orderNumber")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const orderNumber = decodeURIComponent(params.orderNumber).trim().toUpperCase();
        if (!/^(PP-[A-Z0-9]+|[A-Z]+-[A-Z0-9]+)$/.test(orderNumber)) {
          return new Response(JSON.stringify({ error: "invalid_order_number" }), { status: 400, headers: { "content-type": "application/json" } });
        }
        const { data: order } = await supabaseAdmin
          .from("store_orders")
          .select("id, order_number, status, payment_method, total_amount, created_at, student_id, notes")
          .eq("order_number", orderNumber)
          .maybeSingle();
        if (!order) {
          const { data: partnerOrder } = await supabaseAdmin
            .from("partner_product_orders" as never)
            .select("id, order_number, status, payment_method, gross_amount, created_at, student_id, professional_product_id, partner_product_id, professional_product:professional_product_id(name), partner_product:partner_product_id(name)" as never)
            .eq("order_number" as never, orderNumber as never)
            .maybeSingle();
          const po = partnerOrder as unknown as { id: string; order_number: string; status: string; payment_method: string; gross_amount: number; created_at: string; student_id: string; professional_product_id?: string | null; partner_product_id?: string | null; professional_product?: { name: string | null } | null; partner_product?: { name: string | null } | null } | null;
          if (!po) return new Response(JSON.stringify({ error: "not_found" }), { status: 404, headers: { "content-type": "application/json" } });

          const { data: student } = await supabaseAdmin
            .from("students")
            .select("profiles:profile_id(name,email)").eq("id", po.student_id).maybeSingle();

          const title = po.professional_product?.name || po.partner_product?.name || "Produto";

          // Contato público do dono do produto (mesmo dado já exibido na loja),
          // para o pop-up de compra aprovada nesta página sem sessão.
          const kind: "partner" | "professional" = po.partner_product_id ? "partner" : "professional";
          const productId = po.partner_product_id || po.professional_product_id || null;
          let whatsapp: string | null = null;
          let sellerName: string | null = null;
          if (productId && kind === "partner") {
            const { data: pp } = await supabaseAdmin
              .from("partner_products").select("partner_id").eq("id", productId).maybeSingle();
            const partnerId = (pp as { partner_id?: string } | null)?.partner_id;
            if (partnerId) {
              const { data: p } = await supabaseAdmin
                .from("partners").select("fantasy_name,whatsapp,public_whatsapp").eq("id", partnerId).maybeSingle();
              const row = p as { fantasy_name?: string; whatsapp?: string | null; public_whatsapp?: string | null } | null;
              whatsapp = row?.public_whatsapp || row?.whatsapp || null;
              sellerName = row?.fantasy_name || null;
            }
          } else if (productId) {
            const { data: pp } = await supabaseAdmin
              .from("professional_products").select("coach_id").eq("id", productId).maybeSingle();
            const coachId = (pp as { coach_id?: string } | null)?.coach_id;
            if (coachId) {
              const { data: c } = await supabaseAdmin
                .from("coaches").select("profile_id").eq("id", coachId).maybeSingle();
              const profileId = (c as { profile_id?: string } | null)?.profile_id;
              if (profileId) {
                const [{ data: pub }, { data: prof }] = await Promise.all([
                  supabaseAdmin.from("professional_public_profile").select("public_whatsapp").eq("profile_id", profileId).maybeSingle(),
                  supabaseAdmin.from("profiles").select("name,phone").eq("id", profileId).maybeSingle(),
                ]);
                whatsapp = (pub as { public_whatsapp?: string | null } | null)?.public_whatsapp
                  || (prof as { phone?: string | null } | null)?.phone || null;
                sellerName = (prof as { name?: string } | null)?.name || null;
              }
            }
          }
          if (!whatsapp) {
            const { data: setting } = await supabaseAdmin
              .from("app_settings").select("value").eq("key", "fitmind_whatsapp").maybeSingle();
            whatsapp = (setting as { value?: string } | null)?.value || null;
          }

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
            products: productId ? [{ productId, kind, productName: title, price: Number(po.gross_amount), sellerName, whatsapp }] : [],
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
