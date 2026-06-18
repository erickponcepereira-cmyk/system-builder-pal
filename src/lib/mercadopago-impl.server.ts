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

export type SourceKind = "store_order" | "transaction" | "partner_product_order" | "subscription_invoice";

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
  if (kind === "subscription_invoice") {
    const { data, error } = await supabaseAdmin
      .from("subscription_invoices" as never)
      .select("id, amount, reference_month, status, mp_payment_id" as never)
      .eq("id" as never, id as never)
      .maybeSingle();
    const row = data as unknown as { id: string; amount: number; reference_month: string; status: string; mp_payment_id: string | null } | null;
    if (error || !row) throw new Error("Fatura não encontrada");
    const ref = new Date(row.reference_month).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
    return {
      amount: Number(row.amount),
      description: `Mensalidade ${ref}`,
      studentId: null as unknown as string,
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
  } else if (kind === "subscription_invoice") {
    await supabaseAdmin
      .from("subscription_invoices" as never)
      .update({ mp_payment_id: mpRowId } as never)
      .eq("id" as never, id as never);
  } else {
    await supabaseAdmin.from("transactions").update({ mp_payment_id: mpRowId }).eq("id", id);
  }
}

export async function applyApproval(kind: SourceKind, id: string) {
  if (kind === "store_order") {
    const { error } = await supabaseAdmin.rpc("mark_store_order_paid_and_process" as never, { _order_id: id } as never);
    if (error) throw new Error(error.message);
    try {
      const { handlePaidStoreOrderForActivation } = await import("./coach-onboarding.server");
      await handlePaidStoreOrderForActivation(id);
    } catch (e) {
      console.error("[coach-onboarding] activation hook failed:", e);
    }
  } else if (kind === "partner_product_order") {
    await supabaseAdmin.rpc("process_partner_product_order_paid" as never, { _order_id: id } as never);
  } else if (kind === "subscription_invoice") {
    // Marca fatura como paga via PIX/cartão (sem débito de carteira interna).
    // Calcula a taxa da maquininha (PIX % ou Cartão %) a partir da config padrão
    // para que ela seja descontada ANTES do imposto Simples Nacional.
    const { data: invRow } = await supabaseAdmin
      .from("subscription_invoices" as never)
      .select("id, amount, mp_payment_id" as never)
      .eq("id" as never, id as never)
      .maybeSingle();
    const inv = invRow as unknown as { id: string; amount: number; mp_payment_id: string | null } | null;

    let method: "pix" | "card" = "pix";
    let mpPaymentIdText: string | null = null;
    if (inv?.mp_payment_id) {
      const { data: mpRow } = await supabaseAdmin
        .from("mercadopago_payments")
        .select("payment_method, mp_payment_id")
        .eq("id", inv.mp_payment_id)
        .maybeSingle();
      if (mpRow) {
        method = (mpRow as any).payment_method === "credit_card" ? "card" : "pix";
        mpPaymentIdText = (mpRow as any).mp_payment_id ?? null;
      }
    }

    const { data: feeCfg } = await supabaseAdmin
      .from("payment_fee_configs")
      .select("pix_fee_percentage, card_fee_percentage")
      .eq("is_default", true)
      .maybeSingle();
    const pixPct = Number((feeCfg as any)?.pix_fee_percentage ?? 0.99);
    const cardPct = Number((feeCfg as any)?.card_fee_percentage ?? 4.98);
    const pct = method === "card" ? cardPct : pixPct;
    const amount = Number(inv?.amount || 0);
    const feeAmount = Math.round(amount * pct) / 100;

    const { error } = await supabaseAdmin.rpc("process_subscription_invoice_payment" as never, {
      _invoice_id: id,
      _method: method,
      _wallet_source: "external",
      _performed_by: null,
      _fee_amount: feeAmount,
      _mp_payment_id: mpPaymentIdText,
    } as never);
    if (error) throw new Error(error.message);
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
    .select("id, mp_payment_id, status, status_detail, paid_at, source_kind, source_id, amount")
    .eq("id", paymentRowId)
    .maybeSingle();
  if (!row) return null;

  // Safety net: se ainda está pendente, consulta o MP diretamente e aplica a
  // aprovação. O webhook pode atrasar/não chegar (preview, redirects, etc.),
  // então o polling do frontend cobre esse caso automaticamente.
  if ((row.status === "pending" || row.status === "in_process") && row.mp_payment_id) {
    try {
      const { getPayment, mapMpStatus } = await import("@/server/mercadopago.server");
      const mp = await getPayment(String(row.mp_payment_id));
      const newStatus = mapMpStatus(mp.status || "pending");
      if (newStatus !== row.status) {
        const paidAt = newStatus === "approved" ? new Date().toISOString() : null;
        await supabaseAdmin
          .from("mercadopago_payments")
          .update({
            status: newStatus,
            status_detail: mp.status_detail || null,
            paid_at: paidAt,
            raw_webhook: mp,
          })
          .eq("id", row.id);
        if (
          newStatus === "approved" &&
          (row.source_kind === "store_order" ||
            row.source_kind === "transaction" ||
            row.source_kind === "partner_product_order" ||
            row.source_kind === "subscription_invoice")
        ) {
          try {
            await applyApproval(row.source_kind as SourceKind, row.source_id as string);
          } catch (e) {
            console.error("[mp poll] applyApproval failed:", e);
          }
        }
        return { ...row, status: newStatus, status_detail: mp.status_detail || null, paid_at: paidAt };
      }
    } catch (e) {
      console.error("[mp poll] getPayment failed:", e);
    }
  }
  return row;
}
