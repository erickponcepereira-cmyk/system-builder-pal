import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPayment, mapMpStatus } from "@/server/mercadopago.server";
import { applyApproval, loadSource, type SourceKind } from "@/lib/mercadopago-impl.server";

// Webhook do Mercado Pago. URL pública: /api/public/mp/webhook
// MP envia POST com { type, data: { id }, action } ou query string.
//
// Hardening (Fase 1):
//  - Sempre grava raw_webhook, mesmo quando a validação falha.
//  - Valida source_kind permitido antes de aplicar aprovação.
//  - Valida source_id existente antes de aplicar aprovação.
//  - Compara valor do pagamento com valor do pedido (tolerância R$ 0,05).
//  - Idempotência por mp_payment_id: nunca reaplica applyApproval quando o
//    registro local já está approved (existing.status === "approved").
//  - Erros de validação são registrados no raw_webhook mas o pagamento NÃO
//    é marcado como aprovado localmente.
const ALLOWED_KINDS = new Set<SourceKind>([
  "store_order",
  "transaction",
  "partner_product_order",
  "subscription_invoice",
]);

async function persistValidationError(
  mpPaymentId: string,
  payment: any,
  reason: string,
  kind: string | null,
  sourceId: string | null,
) {
  console.warn("[mp webhook] validation failed:", reason, { mpPaymentId, kind, sourceId });
  try {
    const { data: existing } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("id")
      .eq("mp_payment_id", String(mpPaymentId))
      .maybeSingle();
    const payload = {
      status_detail: `validation_failed: ${reason}`.slice(0, 250),
      raw_webhook: { ...payment, __validation_error: reason },
    } as any;
    if (existing) {
      await supabaseAdmin.from("mercadopago_payments").update(payload).eq("id", existing.id);
    }
  } catch (e) {
    console.error("[mp webhook] failed to persist validation error:", e);
  }
}

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
          const [kindRaw, sourceIdRaw] = externalRef.split(":");
          const kind = (kindRaw || "").trim();
          const sourceId = (sourceIdRaw || "").trim();
          const paidAmount = Number(payment.transaction_amount || 0);

          // ── 1. Idempotência local + gravação bruta sempre ──
          const { data: existing } = await supabaseAdmin
            .from("mercadopago_payments")
            .select("id, status, source_kind, source_id, amount")
            .eq("mp_payment_id", String(mpPaymentId))
            .maybeSingle();

          const alreadyApproved = existing?.status === "approved";
          const basePayload = {
            status_detail: payment.status_detail || null,
            raw_webhook: payment,
          } as any;

          if (existing) {
            // Nunca "regride" um pagamento já aprovado localmente.
            const updatePayload = alreadyApproved
              ? basePayload
              : {
                  ...basePayload,
                  status,
                  paid_at: status === "approved" ? new Date().toISOString() : null,
                };
            await supabaseAdmin
              .from("mercadopago_payments")
              .update(updatePayload)
              .eq("id", existing.id);
          } else if (ALLOWED_KINDS.has(kind as SourceKind)) {
            await supabaseAdmin.from("mercadopago_payments").insert({
              mp_payment_id: String(mpPaymentId),
              source_kind: kind,
              source_id: sourceId,
              amount: paidAmount,
              payment_method: payment.payment_type_id === "credit_card" ? "credit_card" : payment.payment_method_id === "pix" ? "pix" : "credit_card",
              status,
              status_detail: payment.status_detail || null,
              payer_email: payment.payer?.email || null,
              paid_at: status === "approved" ? new Date().toISOString() : null,
              raw_webhook: payment,
            });
          }

          // ── 2. Só continua para aplicar aprovação se status = approved ──
          if (status !== "approved") {
            return new Response(JSON.stringify({ ok: true, status }), { status: 200, headers: { "content-type": "application/json" } });
          }

          // ── 3. Idempotência: se já estava approved, não reprocessa. ──
          if (alreadyApproved) {
            return new Response(JSON.stringify({ ok: true, status, alreadyProcessed: true }), { status: 200, headers: { "content-type": "application/json" } });
          }

          // ── 4. Valida source_kind permitido ──
          if (!ALLOWED_KINDS.has(kind as SourceKind)) {
            await persistValidationError(mpPaymentId, payment, `invalid source_kind: ${kind || "empty"}`, kind || null, sourceId || null);
            return new Response(JSON.stringify({ ok: false, error: "invalid source_kind" }), { status: 200, headers: { "content-type": "application/json" } });
          }
          if (!sourceId) {
            await persistValidationError(mpPaymentId, payment, "missing source_id", kind, null);
            return new Response(JSON.stringify({ ok: false, error: "missing source_id" }), { status: 200, headers: { "content-type": "application/json" } });
          }

          // ── 5. Valida existência do pedido + valor pago ──
          let src;
          try {
            src = await loadSource(kind as SourceKind, sourceId);
          } catch (e: any) {
            await persistValidationError(mpPaymentId, payment, `source not found: ${e?.message || e}`, kind, sourceId);
            return new Response(JSON.stringify({ ok: false, error: "source not found" }), { status: 200, headers: { "content-type": "application/json" } });
          }

          if (src.alreadyPaid) {
            // Pedido já foi processado por outro caminho (polling, reconcile).
            // Marca como processado; não reaplica.
            return new Response(JSON.stringify({ ok: true, status, alreadyPaidBySource: true }), { status: 200, headers: { "content-type": "application/json" } });
          }

          const expected = Number(src.amount);
          const diff = Math.abs(paidAmount - expected);
          if (diff > 0.05) {
            await persistValidationError(
              mpPaymentId,
              payment,
              `amount mismatch: paid=${paidAmount} expected=${expected}`,
              kind,
              sourceId,
            );
            return new Response(JSON.stringify({ ok: false, error: "amount mismatch", paid: paidAmount, expected }), { status: 200, headers: { "content-type": "application/json" } });
          }

          // ── 6. Aplica aprovação (motor financeiro existente) ──
          await applyApproval(kind as SourceKind, sourceId);

          return new Response(JSON.stringify({ ok: true, status }), { status: 200, headers: { "content-type": "application/json" } });
        } catch (err: any) {
          console.error("MP webhook error", err);
          // Não devolve 5xx para o MP não ficar reprocessando eternamente por
          // erro nosso. O erro fica no log + raw_webhook do registro local.
          return new Response(JSON.stringify({ error: err?.message || "webhook error" }), { status: 200, headers: { "content-type": "application/json" } });
        }
      },
      GET: async () => new Response("ok"),
    },
  },
});
