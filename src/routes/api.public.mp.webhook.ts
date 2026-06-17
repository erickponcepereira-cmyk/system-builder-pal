import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPayment, mapMpStatus } from "@/server/mercadopago.server";
import { applyApproval } from "@/lib/mercadopago-impl.server";

// Webhook do Mercado Pago. URL pública: /api/public/mp/webhook
// MP envia POST com { type, data: { id }, action } ou query string.
export const Route = createFileRoute("/api/public/mp/webhook")({
  server: {
    handlers: {
      POST: async ({ request }) => {
        let body: any = {};
        try { body = await request.json(); } catch { /* ignore */ }
        const url = new URL(request.url);
        const topic = body.type || body.topic || url.searchParams.get("type") || url.searchParams.get("topic");
        const mpPaymentId = String(
          body?.data?.id || body?.resource || url.searchParams.get("id") || url.searchParams.get("data.id") || ""
        ).replace(/\D/g, "");

        if (topic && topic !== "payment") {
          return new Response(JSON.stringify({ ignored: true, topic }), { status: 200, headers: { "content-type": "application/json" } });
        }
        if (!mpPaymentId) {
          return new Response("missing payment id", { status: 400 });
        }

        try {
          const payment = await getPayment(mpPaymentId);
          const status = mapMpStatus(payment.status || "pending");
          const externalRef: string = payment.external_reference || "";
          const [kind, sourceId] = externalRef.split(":");

          // Atualiza o registro local (insere se ainda não existir)
          const { data: existing } = await supabaseAdmin
            .from("mercadopago_payments")
            .select("id, status")
            .eq("mp_payment_id", String(mpPaymentId))
            .maybeSingle();

          if (existing) {
            await supabaseAdmin
              .from("mercadopago_payments")
              .update({
                status,
                status_detail: payment.status_detail || null,
                paid_at: status === "approved" ? new Date().toISOString() : null,
                raw_webhook: payment,
              })
              .eq("id", existing.id);
          } else if (kind === "store_order" || kind === "transaction" || kind === "partner_product_order") {
            await supabaseAdmin.from("mercadopago_payments").insert({
              mp_payment_id: String(mpPaymentId),
              source_kind: kind,
              source_id: sourceId,
              amount: Number(payment.transaction_amount || 0),
              payment_method: payment.payment_type_id === "credit_card" ? "credit_card" : payment.payment_method_id === "pix" ? "pix" : "credit_card",
              status,
              status_detail: payment.status_detail || null,
              payer_email: payment.payer?.email || null,
              paid_at: status === "approved" ? new Date().toISOString() : null,
              raw_webhook: payment,
            });
          }

          if (status === "approved" && (kind === "store_order" || kind === "transaction" || kind === "partner_product_order" || kind === "subscription_invoice")) {
            await applyApproval(kind as "store_order" | "transaction" | "partner_product_order" | "subscription_invoice", sourceId);
          }

          return new Response(JSON.stringify({ ok: true, status }), { status: 200, headers: { "content-type": "application/json" } });
        } catch (err: any) {
          console.error("MP webhook error", err);
          return new Response(JSON.stringify({ error: err?.message || "webhook error" }), { status: 200, headers: { "content-type": "application/json" } });
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});
