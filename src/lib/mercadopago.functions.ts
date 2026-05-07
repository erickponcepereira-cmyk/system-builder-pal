import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPixPayment, createCardPayment, mapMpStatus } from "@/server/mercadopago.server";
import { getRequestHost } from "@tanstack/react-start/server";

const PayerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  doc: z.string().optional(),
});

const SourceSchema = z.object({
  kind: z.enum(["store_order", "transaction"]),
  id: z.string().uuid(),
});

function siteUrl() {
  try {
    const host = getRequestHost();
    return `https://${host}`;
  } catch {
    return process.env.SITE_URL || "https://fitmindclub.lovable.app";
  }
}

async function loadSource(kind: "store_order" | "transaction", id: string) {
  if (kind === "store_order") {
    const { data, error } = await supabaseAdmin
      .from("store_orders")
      .select("id, order_number, total_amount, student_id, status, mp_payment_id")
      .eq("id", id)
      .maybeSingle();
    if (error || !data) throw new Error("Pedido não encontrado");
    return {
      amount: Number(data.total_amount),
      description: `Pedido ${data.order_number}`,
      studentId: data.student_id as string,
      alreadyPaid: data.status === "paid",
      existingPaymentId: data.mp_payment_id as string | null,
    };
  }
  const { data, error } = await supabaseAdmin
    .from("transactions")
    .select("id, gross_amount, student_id, status, purchase_type, mp_payment_id")
    .eq("id", id)
    .maybeSingle();
  if (error || !data) throw new Error("Transação não encontrada");
  return {
    amount: Number(data.gross_amount),
    description: `Compra ${data.purchase_type || ""} ${data.id.slice(0, 8)}`,
    studentId: data.student_id as string,
    alreadyPaid: data.status === "paid",
    existingPaymentId: data.mp_payment_id as string | null,
  };
}

async function attachPaymentToSource(kind: "store_order" | "transaction", id: string, mpRowId: string) {
  if (kind === "store_order") {
    await supabaseAdmin.from("store_orders").update({ mp_payment_id: mpRowId }).eq("id", id);
  } else {
    await supabaseAdmin.from("transactions").update({ mp_payment_id: mpRowId }).eq("id", id);
  }
}

/** Cria pagamento PIX no Mercado Pago e retorna QR code + texto copia-e-cola. */
export const createPixCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      source: SourceSchema,
      payer: PayerSchema,
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const src = await loadSource(data.source.kind, data.source.id);
    if (src.alreadyPaid) throw new Error("Pedido já está pago");

    const externalRef = `${data.source.kind}:${data.source.id}`;
    const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
    const idempotencyKey = `pix-${data.source.id}-${Date.now()}`;

    const mpResp = await createPixPayment({
      amount: src.amount,
      description: src.description,
      payerEmail: data.payer.email,
      payerName: data.payer.name,
      payerDoc: data.payer.doc,
      externalReference: externalRef,
      notificationUrl,
    }, idempotencyKey);

    const poi = mpResp?.point_of_interaction?.transaction_data || {};

    const { data: row, error } = await supabaseAdmin
      .from("mercadopago_payments")
      .insert({
        mp_payment_id: String(mpResp.id),
        source_kind: data.source.kind,
        source_id: data.source.id,
        student_id: src.studentId,
        payer_email: data.payer.email,
        payer_name: data.payer.name || null,
        payer_doc: data.payer.doc || null,
        amount: src.amount,
        payment_method: "pix",
        status: mapMpStatus(mpResp.status || "pending"),
        status_detail: mpResp.status_detail || null,
        pix_qr_code: poi.qr_code || null,
        pix_qr_code_base64: poi.qr_code_base64 || null,
        pix_ticket_url: poi.ticket_url || null,
        pix_expires_at: mpResp.date_of_expiration || null,
        raw_response: mpResp,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao registrar pagamento");

    await attachPaymentToSource(data.source.kind, data.source.id, row.id);

    return {
      paymentRowId: row.id,
      mpPaymentId: String(mpResp.id),
      status: mpResp.status as string,
      qrCode: poi.qr_code as string | null,
      qrCodeBase64: poi.qr_code_base64 as string | null,
      ticketUrl: poi.ticket_url as string | null,
      amount: src.amount,
    };
  });

/** Cria pagamento com cartão (token gerado no frontend). */
export const createCardCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({
      source: SourceSchema,
      payer: PayerSchema,
      card: z.object({
        token: z.string(),
        installments: z.number().int().min(1).max(12),
        paymentMethodId: z.string(),
        issuerId: z.string().optional(),
      }),
    }).parse(input)
  )
  .handler(async ({ data }) => {
    const src = await loadSource(data.source.kind, data.source.id);
    if (src.alreadyPaid) throw new Error("Pedido já está pago");

    const externalRef = `${data.source.kind}:${data.source.id}`;
    const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
    const idempotencyKey = `card-${data.source.id}-${Date.now()}`;

    const mpResp = await createCardPayment({
      amount: src.amount,
      description: src.description,
      token: data.card.token,
      installments: data.card.installments,
      paymentMethodId: data.card.paymentMethodId,
      issuerId: data.card.issuerId,
      payerEmail: data.payer.email,
      payerName: data.payer.name,
      payerDoc: data.payer.doc,
      externalReference: externalRef,
      notificationUrl,
    }, idempotencyKey);

    const status = mapMpStatus(mpResp.status || "pending");
    const { data: row, error } = await supabaseAdmin
      .from("mercadopago_payments")
      .insert({
        mp_payment_id: String(mpResp.id),
        source_kind: data.source.kind,
        source_id: data.source.id,
        student_id: src.studentId,
        payer_email: data.payer.email,
        payer_name: data.payer.name || null,
        payer_doc: data.payer.doc || null,
        amount: src.amount,
        payment_method: "credit_card",
        status,
        status_detail: mpResp.status_detail || null,
        paid_at: status === "approved" ? new Date().toISOString() : null,
        raw_response: mpResp,
      })
      .select("id")
      .single();
    if (error || !row) throw new Error(error?.message || "Falha ao registrar pagamento");

    await attachPaymentToSource(data.source.kind, data.source.id, row.id);

    // Se já foi aprovado na hora, libera o produto
    if (status === "approved") {
      await applyApproval(data.source.kind, data.source.id);
    }

    return {
      paymentRowId: row.id,
      mpPaymentId: String(mpResp.id),
      status: mpResp.status as string,
      statusDetail: mpResp.status_detail as string | null,
    };
  });

/** Consulta status atual do pagamento (para polling no frontend). */
export const getPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ paymentRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { data: row } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("status, status_detail, paid_at, source_kind, source_id, amount")
      .eq("id", data.paymentRowId)
      .maybeSingle();
    return row;
  });

/** Aplica liberação do produto/transação após pagamento aprovado. */
export async function applyApproval(kind: "store_order" | "transaction", id: string) {
  if (kind === "store_order") {
    await supabaseAdmin.from("store_orders").update({ status: "paid" }).eq("id", id);
    // O pedido tem uma transação espelho criada por create_store_order; atualiza ela também
    const { data: order } = await supabaseAdmin
      .from("store_orders")
      .select("id, metadata")
      .eq("id", id)
      .maybeSingle();
    // Marca a transação espelho como paga (trigger on_transaction_paid processa comissões)
    await supabaseAdmin
      .from("transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("purchase_type", "store_order")
      .contains("metadata", { store_order_id: id } as never);
    void order;
  } else {
    // Transação direta (ex: desafios/digitais) — trigger on_transaction_paid libera tudo
    await supabaseAdmin
      .from("transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
  }
}
