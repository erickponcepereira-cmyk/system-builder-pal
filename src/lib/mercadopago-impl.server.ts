import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { createPixPayment, createCardPayment, mapMpStatus } from "@/server/mercadopago.server";
import { getRequestHost } from "@tanstack/react-start/server";

export function siteUrl() {
  try {
    const host = getRequestHost();
    return `https://${host}`;
  } catch {
    return process.env.SITE_URL || "https://fitmindclub.lovable.app";
  }
}

export type SourceKind = "store_order" | "transaction" | "partner_product_order";

export async function loadSource(kind: SourceKind, id: string) {
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
  if (kind === "partner_product_order") {
    const { data, error } = await supabaseAdmin
      .from("partner_product_orders" as never)
      .select("id, order_number, gross_amount, student_id, status, mp_payment_id" as never)
      .eq("id" as never, id as never)
      .maybeSingle();
    const row = data as unknown as { id: string; order_number: string; gross_amount: number; student_id: string; status: string; mp_payment_id: string | null } | null;
    if (error || !row) throw new Error("Pedido de parceiro não encontrado");
    return {
      amount: Number(row.gross_amount),
      description: `Pedido parceiro ${row.order_number}`,
      studentId: row.student_id,
      alreadyPaid: row.status === "paid",
      existingPaymentId: row.mp_payment_id,
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

export async function attachPaymentToSource(
  kind: SourceKind,
  id: string,
  mpRowId: string
) {
  if (kind === "store_order") {
    await supabaseAdmin.from("store_orders").update({ mp_payment_id: mpRowId }).eq("id", id);
  } else if (kind === "partner_product_order") {
    await supabaseAdmin
      .from("partner_product_orders" as never)
      .update({ mp_payment_id: mpRowId } as never)
      .eq("id" as never, id as never);
  } else {
    await supabaseAdmin.from("transactions").update({ mp_payment_id: mpRowId }).eq("id", id);
  }
}

export async function applyApproval(kind: SourceKind, id: string) {
  if (kind === "store_order") {
    await supabaseAdmin.from("store_orders").update({ status: "paid" }).eq("id", id);
    // Marca como paga TODA transação vinculada ao store_order, independente do purchase_type
    // (digital/challenge/store_order). A trigger on_transaction_paid dispara
    // process_paid_transaction e distribui comissões, ativa desafio e libera painéis.
    const nowIso = new Date().toISOString();
    const { data: pendingTxs } = await supabaseAdmin
      .from("transactions")
      .select("id, status")
      .contains("metadata", { store_order_id: id } as never);
    const txIds = ((pendingTxs as any[]) || [])
      .filter((t) => t.status !== "paid")
      .map((t) => t.id);
    if (txIds.length) {
      await supabaseAdmin
        .from("transactions")
        .update({ status: "paid", paid_at: nowIso })
        .in("id", txIds);
      // Salvaguarda: chama o engine explicitamente caso a trigger não tenha rodado
      for (const txId of txIds) {
        try {
          await supabaseAdmin.rpc("process_paid_transaction" as never, { _transaction_id: txId } as never);
        } catch (e) {
          console.error("[applyApproval] process_paid_transaction fallback failed:", e);
        }
      }
    }
    try {
      const { handlePaidStoreOrderForActivation } = await import("./coach-onboarding.server");
      await handlePaidStoreOrderForActivation(id);
    } catch (e) {
      console.error("[coach-onboarding] activation hook failed:", e);
    }
  } else if (kind === "partner_product_order") {
    // Atualiza status e distribui comissões via RPC.
    await supabaseAdmin.rpc("process_partner_product_order_paid" as never, { _order_id: id } as never);
  } else {
    await supabaseAdmin
      .from("transactions")
      .update({ status: "paid", paid_at: new Date().toISOString() })
      .eq("id", id);
  }
}


export type PixInput = {
  source: { kind: SourceKind; id: string };
  payer: { email: string; name?: string; doc?: string };
};


export async function handleCreatePix(data: PixInput) {
  const src = await loadSource(data.source.kind, data.source.id);
  if (src.alreadyPaid) throw new Error("Pedido já está pago");

  const externalRef = `${data.source.kind}:${data.source.id}`;
  const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
  const idempotencyKey = `pix-${data.source.id}-${Date.now()}`;

  let mpResp: any;
  try {
    mpResp = await createPixPayment(
      {
        amount: src.amount,
        description: src.description,
        payerEmail: data.payer.email,
        payerName: data.payer.name,
        payerDoc: data.payer.doc,
        externalReference: externalRef,
        notificationUrl,
      },
      idempotencyKey
    );
  } catch (e: any) {
    throw new Error(`[DIAG] ${e?.message || String(e)}`);
  }

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
    qrCode: (poi.qr_code as string | null) ?? null,
    qrCodeBase64: (poi.qr_code_base64 as string | null) ?? null,
    ticketUrl: (poi.ticket_url as string | null) ?? null,
    amount: src.amount,
  };
}

export type CardInput = {
  source: { kind: SourceKind; id: string };
  payer: { email: string; name?: string; doc?: string };
  card: { token: string; installments: number; paymentMethodId: string; issuerId?: string };
};

export async function handleCreateCard(data: CardInput) {
  const src = await loadSource(data.source.kind, data.source.id);
  if (src.alreadyPaid) throw new Error("Pedido já está pago");

  const externalRef = `${data.source.kind}:${data.source.id}`;
  const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
  const idempotencyKey = `card-${data.source.id}-${Date.now()}`;

  const mpResp = await createCardPayment(
    {
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
    },
    idempotencyKey
  );

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

  if (status === "approved") {
    await applyApproval(data.source.kind, data.source.id);
  }

  return {
    paymentRowId: row.id,
    mpPaymentId: String(mpResp.id),
    status: mpResp.status as string,
    statusDetail: (mpResp.status_detail as string | null) ?? null,
  };
}

export async function handleGetStatus(paymentRowId: string) {
  const { data: row } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("status, status_detail, paid_at, source_kind, source_id, amount")
    .eq("id", paymentRowId)
    .maybeSingle();
  return row;
}
