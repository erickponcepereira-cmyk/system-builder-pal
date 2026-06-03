import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

async function assertAdmin(supabaseAdmin: any, userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

export interface ReconcileResult {
  mpPaymentId: string;
  mpStatus: string;
  localStatus: string;
  sourceKind: string | null;
  sourceId: string | null;
  amount: number;
  applied: boolean;
  message: string;
}

/**
 * Consulta o status real do pagamento no Mercado Pago e atualiza o registro local + source.
 * Útil quando o webhook não chega (preview URLs, MP indisponível, etc).
 *
 * Aceita o ID interno do nosso registro OU o mp_payment_id do MP.
 */
export const reconcileMpPayment = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { mpPaymentId?: string; paymentRowId?: string })
  .handler(async ({ context, data }): Promise<ReconcileResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const { getPayment, mapMpStatus } = await import("@/server/mercadopago.server");
    const { applyApproval } = await import("@/lib/mercadopago-impl.server");

    let row: {
      id: string;
      mp_payment_id: string | null;
      source_kind: string;
      source_id: string;
      amount: number;
      status: string;
    } | null = null;

    if (data.paymentRowId) {
      const { data: r } = await supabaseAdmin
        .from("mercadopago_payments")
        .select("id, mp_payment_id, source_kind, source_id, amount, status")
        .eq("id", data.paymentRowId)
        .maybeSingle();
      row = (r as any) || null;
    } else if (data.mpPaymentId) {
      const { data: r } = await supabaseAdmin
        .from("mercadopago_payments")
        .select("id, mp_payment_id, source_kind, source_id, amount, status")
        .eq("mp_payment_id", String(data.mpPaymentId).replace(/\D/g, ""))
        .maybeSingle();
      row = (r as any) || null;
    }

    const mpId = row?.mp_payment_id || data.mpPaymentId;
    if (!mpId) throw new Error("Pagamento não encontrado");

    const payment = await getPayment(String(mpId));
    const localStatus = mapMpStatus(payment.status || "pending");
    const paidAt = localStatus === "approved" ? new Date().toISOString() : null;

    let kind: string | null = row?.source_kind || null;
    let sourceId: string | null = row?.source_id || null;
    if (!kind || !sourceId) {
      const externalRef: string = payment.external_reference || "";
      const [k, s] = externalRef.split(":");
      kind = k || null;
      sourceId = s || null;
    }

    if (row) {
      await supabaseAdmin
        .from("mercadopago_payments")
        .update({
          status: localStatus,
          status_detail: payment.status_detail || null,
          paid_at: paidAt,
          raw_webhook: payment,
        })
        .eq("id", row.id);
    } else if (kind && sourceId) {
      const { data: inserted } = await supabaseAdmin
        .from("mercadopago_payments")
        .insert({
          mp_payment_id: String(mpId),
          source_kind: kind,
          source_id: sourceId,
          amount: Number(payment.transaction_amount || 0),
          payment_method:
            payment.payment_type_id === "credit_card"
              ? "credit_card"
              : payment.payment_method_id === "pix"
                ? "pix"
                : "credit_card",
          status: localStatus,
          status_detail: payment.status_detail || null,
          payer_email: payment.payer?.email || null,
          paid_at: paidAt,
          raw_webhook: payment,
        })
        .select("id")
        .single();
      row = inserted ? ({ ...(inserted as any), source_kind: kind, source_id: sourceId, amount: Number(payment.transaction_amount || 0), status: localStatus, mp_payment_id: String(mpId) } as any) : null;
    }

    let applied = false;
    let message = `Status sincronizado: ${localStatus}`;
    if (localStatus === "approved" && kind && sourceId && (kind === "store_order" || kind === "transaction" || kind === "partner_product_order")) {
      try {
        await applyApproval(kind as any, sourceId);
        applied = true;
        message = `Aprovado e processado (${kind})`;
      } catch (e: any) {
        message = `Aprovado mas falhou ao processar: ${e?.message || e}`;
      }
    }

    return {
      mpPaymentId: String(mpId),
      mpStatus: String(payment.status || "unknown"),
      localStatus,
      sourceKind: kind,
      sourceId,
      amount: Number(payment.transaction_amount || row?.amount || 0),
      applied,
      message,
    };
  });

/**
 * Lista pagamentos MP locais que ainda estão "pending" há mais de 5 minutos —
 * candidatos a reconciliação manual.
 */
export const listPendingMpPayments = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    await assertAdmin(supabaseAdmin, context.userId);

    const { data, error } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("id, mp_payment_id, source_kind, source_id, amount, payment_method, status, payer_email, created_at")
      .in("status", ["pending", "in_process"])
      .lte("created_at", new Date(Date.now() - 5 * 60 * 1000).toISOString())
      .order("created_at", { ascending: false })
      .limit(100);
    if (error) throw new Error(error.message);
    return (data || []) as Array<{
      id: string;
      mp_payment_id: string | null;
      source_kind: string;
      source_id: string;
      amount: number;
      payment_method: string;
      status: string;
      payer_email: string | null;
      created_at: string;
    }>;
  });
