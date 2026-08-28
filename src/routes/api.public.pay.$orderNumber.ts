import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

const RESPONSE_HEADERS = {
  "cache-control": "no-store, private",
  "content-type": "application/json; charset=utf-8",
  "referrer-policy": "no-referrer",
  "x-content-type-options": "nosniff",
  "x-robots-tag": "noindex, nofollow, noarchive",
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: RESPONSE_HEADERS });

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export const Route = createFileRoute("/api/public/pay/$orderNumber")({
  server: {
    handlers: {
      GET: async ({ params }) => {
        const publicPaymentToken = decodeURIComponent(params.orderNumber).trim().toLowerCase();
        if (!UUID_PATTERN.test(publicPaymentToken)) return json({ error: "not_found" }, 404);

        const { data: order, error: storeError } = await supabaseAdmin
          .from("store_orders")
          .select("id,order_number,status,payment_method,total_amount,created_at")
          .eq("public_payment_token", publicPaymentToken)
          .maybeSingle();
        if (storeError) {
          console.error("[public payment] store order lookup failed", storeError.message);
          return json({ error: "temporarily_unavailable" }, 503);
        }

        if (order) {
          const { data: items, error: itemsError } = await supabaseAdmin
            .from("store_order_items")
            .select("title,quantity,unit_price,total_price")
            .eq("order_id", order.id);
          if (itemsError) {
            console.error("[public payment] store items lookup failed", itemsError.message);
            return json({ error: "temporarily_unavailable" }, 503);
          }

          return json({
            order: {
              sourceKind: "store_order",
              number: order.order_number,
              status: order.status,
              paymentMethod: order.payment_method,
              total: Number(order.total_amount),
              createdAt: order.created_at,
            },
            items: (items || []).map((item) => ({
              title: item.title,
              quantity: item.quantity,
              unitPrice: Number(item.unit_price),
              totalPrice: Number(item.total_price),
            })),
          });
        }

        const { data: partnerOrder, error: partnerError } = await supabaseAdmin
          .from("partner_product_orders")
          .select("id,order_number,status,payment_method,gross_amount,created_at,professional_product_id,partner_product_id,professional_product:professional_product_id(name),partner_product:partner_product_id(name)")
          .eq("public_payment_token", publicPaymentToken)
          .maybeSingle();
        if (partnerError) {
          console.error("[public payment] partner order lookup failed", partnerError.message);
          return json({ error: "temporarily_unavailable" }, 503);
        }
        if (!partnerOrder) return json({ error: "not_found" }, 404);

        const row = partnerOrder as unknown as {
          order_number: string;
          status: string;
          payment_method: string;
          gross_amount: number;
          created_at: string;
          professional_product_id: string | null;
          partner_product_id: string | null;
          professional_product?: { name: string | null } | null;
          partner_product?: { name: string | null } | null;
        };
        const title = row.professional_product?.name || row.partner_product?.name || "Produto";
        const kind: "partner" | "professional" = row.partner_product_id ? "partner" : "professional";
        const productId = row.partner_product_id || row.professional_product_id || null;
        let whatsapp: string | null = null;
        let sellerName: string | null = null;

        if (productId && kind === "partner") {
          const { data: product } = await supabaseAdmin
            .from("partner_products")
            .select("partner_id")
            .eq("id", productId)
            .maybeSingle();
          if (product?.partner_id) {
            const { data: partner } = await supabaseAdmin
              .from("partners")
              .select("fantasy_name,public_whatsapp")
              .eq("id", product.partner_id)
              .maybeSingle();
            whatsapp = partner?.public_whatsapp || null;
            sellerName = partner?.fantasy_name || null;
          }
        } else if (productId) {
          const { data: product } = await supabaseAdmin
            .from("professional_products")
            .select("coach_id")
            .eq("id", productId)
            .maybeSingle();
          if (product?.coach_id) {
            const { data: coach } = await supabaseAdmin
              .from("coaches")
              .select("profile_id")
              .eq("id", product.coach_id)
              .maybeSingle();
            if (coach?.profile_id) {
              const [{ data: publicProfile }, { data: profile }] = await Promise.all([
                supabaseAdmin
                  .from("professional_public_profile")
                  .select("public_whatsapp")
                  .eq("profile_id", coach.profile_id)
                  .maybeSingle(),
                supabaseAdmin.from("profiles").select("name").eq("id", coach.profile_id).maybeSingle(),
              ]);
              whatsapp = publicProfile?.public_whatsapp || null;
              sellerName = profile?.name || null;
            }
          }
        }

        if (!whatsapp) {
          const { data: setting } = await supabaseAdmin
            .from("app_settings")
            .select("value")
            .eq("key", "fitmind_whatsapp")
            .maybeSingle();
          whatsapp = setting?.value || null;
        }

        return json({
          order: {
            sourceKind: "partner_product_order",
            number: row.order_number,
            status: row.status,
            paymentMethod: row.payment_method,
            total: Number(row.gross_amount),
            createdAt: row.created_at,
          },
          items: [{
            title,
            quantity: 1,
            unitPrice: Number(row.gross_amount),
            totalPrice: Number(row.gross_amount),
          }],
          products: productId
            ? [{ productId, kind, productName: title, price: Number(row.gross_amount), sellerName, whatsapp }]
            : [],
        });
      },
    },
  },
});
