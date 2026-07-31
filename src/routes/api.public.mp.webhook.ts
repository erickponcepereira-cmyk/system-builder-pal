import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPayment, mapMpStatus } from "@/server/mercadopago.server";
import { applyApproval, attachPaymentToSource, loadSource, type SourceKind } from "@/lib/mercadopago-impl.server";

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

        // ── Assinaturas nativas do Mercado Pago (Preapproval) ──
        if (topic === "subscription_preapproval" || topic === "preapproval") {
          const preId = String(body?.data?.id || url.searchParams.get("id") || "");
          if (preId) {
            try {
              const { getPreapproval } = await import("@/server/mercadopago.server");
              const pre = await getPreapproval(preId);
              const map: Record<string, string> = { authorized: "active", paused: "paused", cancelled: "cancelled", pending: "pending" };
              await supabaseAdmin
                .from("recurring_subscriptions" as never)
                .update({ status: map[pre?.status] || "pending" } as never)
                .eq("mp_preapproval_id" as never, preId as never);
            } catch (e) {
              console.error("[mp webhook] preapproval:", e);
            }
          }
          return Response.json({ ok: true, topic });
        }

        if (topic === "subscription_authorized_payment") {
          const authId = String(body?.data?.id || url.searchParams.get("id") || "");
          if (authId) {
            try {
              const { getAuthorizedPayment } = await import("@/server/mercadopago.server");
              const ap = await getAuthorizedPayment(authId);
              const { data: sub } = await supabaseAdmin
                .from("recurring_subscriptions" as never)
                .select("id" as never)
                .eq("mp_preapproval_id" as never, String(ap?.preapproval_id || "") as never)
                .maybeSingle();
              if ((sub as any)?.id) {
                const approved = ap?.status === "processed" && ap?.payment?.status === "approved";
                await supabaseAdmin.from("recurring_charges" as never).upsert({
                  subscription_id: (sub as any).id,
                  reference_date: new Date().toISOString().slice(0, 10),
                  attempt: 1,
                  amount: Number(ap?.transaction_amount || 0),
                  status: approved ? "approved" : "rejected",
                  status_detail: ap?.payment?.status_detail || ap?.status || null,
                  mp_payment_id: ap?.payment?.id ? String(ap.payment.id) : null,
                } as never, { onConflict: "subscription_id,reference_date,attempt" } as never);
                await supabaseAdmin
                  .from("recurring_subscriptions" as never)
                  .update({
                    last_charge_at: approved ? new Date().toISOString() : null,
                    failure_count: approved ? 0 : 1,
                    last_failure_reason: approved ? null : (ap?.payment?.status_detail || "recusado"),
                  } as never)
                  .eq("id" as never, (sub as any).id as never);
              }
            } catch (e) {
              console.error("[mp webhook] authorized payment:", e);
            }
          }
          return Response.json({ ok: true, topic });
        }

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
          const pixData = payment?.point_of_interaction?.transaction_data || {};
          const pixPayload: Record<string, string | null> = {};
          if (payment.payment_method_id === "pix") {
            if (pixData.qr_code) pixPayload.pix_qr_code = pixData.qr_code;
            if (pixData.qr_code_base64) pixPayload.pix_qr_code_base64 = pixData.qr_code_base64;
            if (pixData.ticket_url) pixPayload.pix_ticket_url = pixData.ticket_url;
            if (payment.date_of_expiration) pixPayload.pix_expires_at = payment.date_of_expiration;
          }

          // Cobrança recorrente direta: fecha o ciclo da assinatura (a tentativa
          // pode ter ficado "em análise" e só agora vira aprovada/recusada).
          if (kind === "recurring") {
            if (sourceId) {
              try {
                const { settleRecurringCharge } = await import("@/lib/recurring.server");
                await settleRecurringCharge(sourceId, String(mpPaymentId), status as any, payment.status_detail || null);
              } catch (e) {
                console.error("[mp webhook] settleRecurringCharge falhou:", e);
              }
            }
            return Response.json({ ok: true, status, recurring: true });
          }

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
            ...pixPayload,
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
            if (sourceId && ALLOWED_KINDS.has(kind as SourceKind)) {
              try {
                await attachPaymentToSource(kind as SourceKind, sourceId, existing.id);
              } catch (e) {
                console.error("[mp webhook] failed to attach existing payment to source:", e);
              }
            }
          } else if (ALLOWED_KINDS.has(kind as SourceKind)) {
            const { data: inserted } = await supabaseAdmin.from("mercadopago_payments").insert({
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
              ...pixPayload,
            }).select("id").maybeSingle();
            if (sourceId && inserted?.id) {
              try {
                await attachPaymentToSource(kind as SourceKind, sourceId, inserted.id);
              } catch (e) {
                console.error("[mp webhook] failed to attach payment to source:", e);
              }
            }
          }

          // ── 2. Só continua para aplicar aprovação se status = approved ──
          if (status !== "approved") {
            return new Response(JSON.stringify({ ok: true, status }), { status: 200, headers: { "content-type": "application/json" } });
          }

          // ── 3. Idempotência baseada na ORIGEM, não no pagamento. ──
          // Se o pagamento já constava aprovado mas o pedido/fatura continua
          // pendente (falha no meio do processamento anterior), reprocessa.
          if (alreadyApproved) {
            let sourceAlreadyPaid = true;
            if (sourceId && ALLOWED_KINDS.has(kind as SourceKind)) {
              try {
                const src = await loadSource(kind as SourceKind, sourceId);
                sourceAlreadyPaid = !!src.alreadyPaid;
              } catch (e) {
                console.error("[mp webhook] loadSource falhou na verificação de idempotência:", e);
              }
            }
            if (sourceAlreadyPaid) {
              return new Response(JSON.stringify({ ok: true, status, alreadyProcessed: true }), { status: 200, headers: { "content-type": "application/json" } });
            }
            console.warn("[mp webhook] pagamento aprovado com origem pendente — reprocessando", kind, sourceId);
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

          // Se este pagamento veio de uma cobrança recorrente da mensalidade
          // (fluxo de fatura), fecha também o ciclo da assinatura.
          try {
            const { data: chargeRow } = await supabaseAdmin
              .from("recurring_charges" as never)
              .select("subscription_id" as never)
              .eq("mp_payment_id" as never, String(mpPaymentId) as never)
              .maybeSingle();
            const subId = (chargeRow as any)?.subscription_id as string | undefined;
            if (subId) {
              const { settleRecurringCharge } = await import("@/lib/recurring.server");
              await settleRecurringCharge(subId, String(mpPaymentId), status as any, payment.status_detail || null);
            }
          } catch (e) {
            console.error("[mp webhook] settle recorrência via fatura falhou:", e);
          }

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
