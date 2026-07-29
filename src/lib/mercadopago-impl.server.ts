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

const ANNUAL_ACTIVATION_PRODUCT_ID = "b43baf23-76b6-4abc-91a4-2730b3570d77";

async function isAnnualActivationStoreOrder(orderId: string) {
  const { data } = await supabaseAdmin
    .from("store_order_items")
    .select("id")
    .eq("order_id", orderId)
    .or(
      `product_id.eq.${ANNUAL_ACTIVATION_PRODUCT_ID},store_product_id.eq.${ANNUAL_ACTIVATION_PRODUCT_ID},digital_product_id.eq.${ANNUAL_ACTIVATION_PRODUCT_ID}`,
    )
    .limit(1)
    .maybeSingle();
  return Boolean(data?.id);
}

async function applyAnnualActivationFallback(orderId: string) {
  const { error } = await supabaseAdmin.rpc("apply_annual_activation_for_store_order" as never, { _order_id: orderId } as never);
  if (error) throw new Error(error.message);
}

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

/**
 * Monta os sinais antifraude exigidos pelo Mercado Pago (itens da compra +
 * dados completos do pagador). Payload pobre é a principal causa de
 * `cc_rejected_high_risk`.
 */
export async function buildRiskContext(
  kind: SourceKind,
  id: string,
  payer: { email: string; name?: string; doc?: string },
  fallback: { amount: number; description: string },
  options: { includeProfilePayer?: boolean } = {},
) {
  let items: Array<{ id: string; title: string; quantity: number; unitPrice: number; categoryId?: string }> = [];
  try {
    if (kind === "store_order") {
      const { data } = await supabaseAdmin
        .from("store_order_items")
        .select("id, title, quantity, unit_price")
        .eq("order_id", id);
      items = (data || []).map((it: any) => ({
        id: String(it.id),
        title: String(it.title || fallback.description),
        quantity: Number(it.quantity || 1),
        unitPrice: Number(it.unit_price || 0),
      }));
    }
  } catch (e) {
    console.warn("[mp risk] failed to load items:", e);
  }
  if (!items.length) {
    items = [{ id, title: fallback.description, quantity: 1, unitPrice: fallback.amount }];
  }

  let additionalPayer: any = undefined;
  if (options.includeProfilePayer !== false) {
    try {
      const { data: prof } = await supabaseAdmin
        .from("profiles")
        .select("name, phone, created_at, zip_code, street, number")
        .eq("email", payer.email)
        .maybeSingle();
      if (prof) {
        const parts = String(prof.name || payer.name || "").trim().split(/\s+/).filter(Boolean);
        const phoneDigits = String((prof as any).phone || "").replace(/\D/g, "");
        additionalPayer = {
          firstName: parts[0],
          lastName: parts.slice(1).join(" ") || undefined,
          phoneAreaCode: phoneDigits.length >= 10 ? phoneDigits.slice(0, 2) : undefined,
          phoneNumber: phoneDigits.length >= 10 ? phoneDigits.slice(2) : undefined,
          registrationDate: (prof as any).created_at || null,
          address: (prof as any).zip_code
            ? {
                zipCode: String((prof as any).zip_code).replace(/\D/g, ""),
                streetName: (prof as any).street || "",
                streetNumber: String((prof as any).number || ""),
              }
            : null,
        };
      }
    } catch (e) {
      console.warn("[mp risk] failed to load payer profile:", e);
    }
  }

  return { items, additionalPayer };
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
    const annualActivationOrder = await isAnnualActivationStoreOrder(id);
    const { error } = await supabaseAdmin.rpc("mark_store_order_paid_and_process" as never, { _order_id: id } as never);
    if (error) {
      if (!annualActivationOrder) throw new Error(error.message);
      console.error("[mp] store order financial processing failed; applying annual activation fallback:", error.message);
      await applyAnnualActivationFallback(id);
      return;
    }
    if (annualActivationOrder) {
      await applyAnnualActivationFallback(id);
    }
    try {
      const { handlePaidStoreOrderForActivation } = await import("./coach-onboarding.server");
      await handlePaidStoreOrderForActivation(id);
    } catch (e) {
      console.error("[coach-onboarding] activation hook failed:", e);
    }
  } else if (kind === "partner_product_order") {
    const { error } = await supabaseAdmin.rpc("process_partner_product_order_paid" as never, { _order_id: id } as never);
    if (error) throw new Error(error.message);
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
  deviceId?: string | null;
};


/**
 * Busca pagamento MP existente para o par (source_kind, source_id).
 * Retorna o mais recente. Usado para dedupe antes de criar novo pagamento.
 */
async function findExistingPaymentForSource(kind: SourceKind, id: string) {
  const { data } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("id, mp_payment_id, status, payment_method, amount, pix_qr_code, pix_qr_code_base64, pix_ticket_url, pix_expires_at, raw_response, raw_webhook")
    .eq("source_kind", kind)
    .eq("source_id", id)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  return data as any | null;
}

const REUSABLE_STATUSES = new Set(["pending", "in_process"]);
const BLOCKING_STATUSES = new Set(["approved"]);
// "rejected" | "cancelled" | "refunded" → permite criar novo

const ACTIVE_PAYMENT_STATUSES = new Set(["pending", "in_process", "approved"]);

async function clearRejectedSourcePointer(kind: SourceKind, id: string, mpRowId: string, status: string) {
  if (ACTIVE_PAYMENT_STATUSES.has(status)) return;
  const patch = { mp_payment_id: null } as never;
  if (kind === "store_order") {
    await supabaseAdmin.from("store_orders").update(patch).eq("id", id).eq("mp_payment_id", mpRowId as never);
  } else if (kind === "partner_product_order") {
    await supabaseAdmin.from("partner_product_orders" as never).update(patch).eq("id" as never, id as never).eq("mp_payment_id" as never, mpRowId as never);
  } else if (kind === "subscription_invoice") {
    await supabaseAdmin.from("subscription_invoices" as never).update(patch).eq("id" as never, id as never).eq("mp_payment_id" as never, mpRowId as never);
  } else {
    await supabaseAdmin.from("transactions").update(patch).eq("id", id).eq("mp_payment_id", mpRowId as never);
  }
}

function extractPixData(payment: any) {
  const transactionData = payment?.point_of_interaction?.transaction_data || {};
  return {
    qrCode: (transactionData.qr_code as string | null | undefined) || null,
    qrCodeBase64: (transactionData.qr_code_base64 as string | null | undefined) || null,
    ticketUrl: (transactionData.ticket_url as string | null | undefined) || null,
    expiresAt: (payment?.date_of_expiration as string | null | undefined) || null,
  };
}

function hasPixPayload(payment: any) {
  const pix = extractPixData(payment);
  return Boolean(pix.qrCode || pix.qrCodeBase64 || pix.ticketUrl);
}

function rowHasPixPayload(row: any) {
  return Boolean(row?.pix_qr_code || row?.pix_qr_code_base64 || row?.pix_ticket_url);
}

async function hydrateExistingPixPayment(existing: any) {
  if (!existing?.mp_payment_id) return null;

  const rawPix = hasPixPayload(existing.raw_response)
    ? extractPixData(existing.raw_response)
    : hasPixPayload(existing.raw_webhook)
      ? extractPixData(existing.raw_webhook)
      : null;

  if (rawPix) {
    await supabaseAdmin
      .from("mercadopago_payments")
      .update({
        pix_qr_code: rawPix.qrCode,
        pix_qr_code_base64: rawPix.qrCodeBase64,
        pix_ticket_url: rawPix.ticketUrl,
        pix_expires_at: rawPix.expiresAt,
      })
      .eq("id", existing.id);
    return { ...existing, pix_qr_code: rawPix.qrCode, pix_qr_code_base64: rawPix.qrCodeBase64, pix_ticket_url: rawPix.ticketUrl, pix_expires_at: rawPix.expiresAt };
  }

  try {
    const { getPayment, mapMpStatus } = await import("@/server/mercadopago.server");
    const mp = await getPayment(String(existing.mp_payment_id));
    const pix = extractPixData(mp);
    if (!pix.qrCode && !pix.qrCodeBase64 && !pix.ticketUrl) return null;
    const status = mapMpStatus(mp.status || existing.status || "pending");
    await supabaseAdmin
      .from("mercadopago_payments")
      .update({
        status,
        status_detail: mp.status_detail || existing.status_detail || null,
        pix_qr_code: pix.qrCode,
        pix_qr_code_base64: pix.qrCodeBase64,
        pix_ticket_url: pix.ticketUrl,
        pix_expires_at: pix.expiresAt,
        raw_response: mp,
      })
      .eq("id", existing.id);
    return { ...existing, status, pix_qr_code: pix.qrCode, pix_qr_code_base64: pix.qrCodeBase64, pix_ticket_url: pix.ticketUrl, pix_expires_at: pix.expiresAt };
  } catch (e) {
    console.error("[mp pix] failed to hydrate existing payment:", e);
    return null;
  }
}

export async function handleCreatePix(data: PixInput) {
  const src = await loadSource(data.source.kind, data.source.id);
  if (src.alreadyPaid) throw new Error("Pedido já está pago");

  // ── Dedupe: reutiliza pagamento existente se aplicável ──
  const existing = await findExistingPaymentForSource(data.source.kind, data.source.id);
  if (existing && existing.payment_method === "pix") {
    if (BLOCKING_STATUSES.has(existing.status)) {
      throw new Error("Pedido já está pago");
    }
    if (REUSABLE_STATUSES.has(existing.status)) {
      const reusable = rowHasPixPayload(existing) ? existing : await hydrateExistingPixPayment(existing);
      if (!reusable || !rowHasPixPayload(reusable)) {
        console.warn("[mp pix] ignoring pending PIX without QR payload", { paymentRowId: existing.id, mpPaymentId: existing.mp_payment_id });
      } else {
        await attachPaymentToSource(data.source.kind, data.source.id, reusable.id);
        return {
          paymentRowId: reusable.id,
          mpPaymentId: String(reusable.mp_payment_id || ""),
          status: reusable.status,
          qrCode: (reusable.pix_qr_code as string | null) ?? null,
          qrCodeBase64: (reusable.pix_qr_code_base64 as string | null) ?? null,
          ticketUrl: (reusable.pix_ticket_url as string | null) ?? null,
          amount: Number(reusable.amount),
        };
      }
    }
  } else if (existing && BLOCKING_STATUSES.has(existing.status)) {
    throw new Error("Pedido já está pago");
  }

  const externalRef = `${data.source.kind}:${data.source.id}`;
  const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
  // A tentativa precisa ser única: quando o webhook chega antes do registro
  // local e salva um PIX sem QR, uma chave fixa prende a fatura nessa tentativa.
  // Pagamento aprovado continua bloqueado por source/status antes de chegar aqui.
  const idempotencyKey = `pix-${data.source.kind}-${data.source.id}-${crypto.randomUUID()}`;

  const risk = await buildRiskContext(data.source.kind, data.source.id, data.payer, {
    amount: src.amount,
    description: src.description,
  }, { includeProfilePayer: false });

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
        items: risk.items,
        additionalPayer: risk.additionalPayer,
        deviceId: data.deviceId ?? null,
      },
      idempotencyKey
    );

  } catch (e: any) {
    throw new Error(`[DIAG] ${e?.message || String(e)}`);
  }

  let pix = extractPixData(mpResp);
  if (!pix.qrCode && !pix.qrCodeBase64 && !pix.ticketUrl && mpResp?.id) {
    try {
      const { getPayment } = await import("@/server/mercadopago.server");
      const hydrated = await getPayment(String(mpResp.id));
      pix = extractPixData(hydrated);
      mpResp = { ...mpResp, ...hydrated };
    } catch (e) {
      console.error("[mp pix] failed to hydrate just-created payment:", e);
    }
  }

  const { data: row, error } = await supabaseAdmin
    .from("mercadopago_payments")
    .upsert({
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
      pix_qr_code: pix.qrCode,
      pix_qr_code_base64: pix.qrCodeBase64,
      pix_ticket_url: pix.ticketUrl,
      pix_expires_at: pix.expiresAt,
      raw_response: mpResp,
    }, { onConflict: "mp_payment_id" })
    .select("id")
    .single();
  if (error || !row) throw new Error(error?.message || "Falha ao registrar pagamento");

  if (!pix.qrCode && !pix.qrCodeBase64 && !pix.ticketUrl) {
    throw new Error("Mercado Pago criou o pagamento, mas ainda não retornou o QR Code. Tente gerar novamente em alguns segundos.");
  }

  await attachPaymentToSource(data.source.kind, data.source.id, row.id);

  return {
    paymentRowId: row.id,
    mpPaymentId: String(mpResp.id),
    status: mpResp.status as string,
    qrCode: pix.qrCode,
    qrCodeBase64: pix.qrCodeBase64,
    ticketUrl: pix.ticketUrl,
    amount: src.amount,
  };
}

export type CardInput = {
  source: { kind: SourceKind; id: string };
  payer: { email: string; name?: string; doc?: string };
  card: { token: string; installments: number; paymentMethodId: string; issuerId?: string };
  deviceId?: string | null;
  saveCard?: boolean;
  /** Desliga 3DS para cobranças off-session com cartão salvo. */
  threeDs?: boolean;
  /** Cliente escolheu assinar (cobrança automática recorrente). */
  subscribe?: boolean;
};

/**
 * O Mercado Pago endurece a análise a cada nova tentativa no mesmo pedido logo
 * após uma recusa por risco. Bloqueamos por alguns minutos e sugerimos PIX.
 */
async function assertNotRecentlyHighRisk(kind: SourceKind, id: string) {
  const since = new Date(Date.now() - 5 * 60 * 1000).toISOString();
  const { data } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("id, status_detail, created_at")
    .eq("source_kind", kind)
    .eq("source_id", id)
    .eq("payment_method", "credit_card")
    .eq("status", "rejected")
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (data && String(data.status_detail || "").includes("high_risk")) {
    throw new Error(
      "O Mercado Pago recusou a última tentativa por análise de risco. Aguarde 5 minutos antes de tentar outro cartão, ou pague via PIX (aprovação imediata)."
    );
  }
}

async function persistSavedCard(params: {
  studentId: string | null;
  payer: { email: string; name?: string; doc?: string };
  cardToken: string;
  mpResp: any;
}): Promise<string | null> {
  try {
    if (!params.studentId) return null;
    const { findOrCreateCustomer, createCustomerCard } = await import("@/server/mercadopago.server");
    const customer = await findOrCreateCustomer(params.payer.email, params.payer.name, params.payer.doc);
    const card = await createCustomerCard(String(customer.id), params.cardToken);
    const { data: saved } = await supabaseAdmin.from("saved_payment_cards" as never).insert({
      student_id: params.studentId,
      mp_customer_id: String(customer.id),
      mp_card_id: String(card.id),
      payer_email: params.payer.email,
      cardholder_name: card?.cardholder?.name || params.payer.name || null,
      brand: card?.payment_method?.id || params.mpResp?.payment_method_id || null,
      last_four: card?.last_four_digits || null,
      first_six: card?.first_six_digits || null,
      expiration_month: card?.expiration_month || null,
      expiration_year: card?.expiration_year || null,
      payment_method_id: card?.payment_method?.id || params.mpResp?.payment_method_id || null,
      issuer_id: card?.issuer?.id ? String(card.issuer.id) : null,
      is_default: true,
    } as never).select("id").maybeSingle();
    return (saved as any)?.id ?? null;
  } catch (e) {
    console.error("[mp save card] falhou (pagamento não é afetado):", e);
    return null;
  }
}


export async function handleCreateCard(data: CardInput) {
  const src = await loadSource(data.source.kind, data.source.id);
  if (src.alreadyPaid) throw new Error("Pedido já está pago");

  // ── Dedupe: bloqueia se já existe pagamento aprovado para o mesmo pedido ──
  const existing = await findExistingPaymentForSource(data.source.kind, data.source.id);
  if (existing && BLOCKING_STATUSES.has(existing.status)) {
    throw new Error("Pedido já está pago");
  }
  if (existing && !ACTIVE_PAYMENT_STATUSES.has(existing.status)) {
    await clearRejectedSourcePointer(data.source.kind, data.source.id, existing.id, existing.status);
  }
  // Cartão pendente é raro (autorização é síncrona), mas se existir "in_process"
  // não criamos duplicata — devolvemos o existente para o frontend fazer polling.
  if (existing && existing.payment_method === "credit_card" && REUSABLE_STATUSES.has(existing.status)) {
    return {
      paymentRowId: existing.id,
      mpPaymentId: String(existing.mp_payment_id || ""),
      status: existing.status,
      statusDetail: null,
    };
  }

  await assertNotRecentlyHighRisk(data.source.kind, data.source.id);

  // ── Titular do cartão ─────────────────────────────────────────────────────
  // O Brick não devolve o nome do titular no onSubmit; sem nome o antifraude do
  // MP recusa por risco. Lemos o cardholder direto do card token.
  let holderSource = "form";
  const cardPayer = { ...data.payer };
  try {
    const { getCardToken } = await import("@/server/mercadopago.server");
    const tk: any = await getCardToken(data.card.token);
    const tkName = String(tk?.cardholder?.name || "").trim();
    const tkDoc = String(tk?.cardholder?.identification?.number || "").replace(/\D/g, "");
    if (tkName) { cardPayer.name = tkName; holderSource = "token"; }
    if (tkDoc.length >= 11) cardPayer.doc = tkDoc;
  } catch (e) {
    console.error("[mp card token] não foi possível ler o titular:", e);
  }
  if (!cardPayer.name) holderSource = "empty";
  console.log("[mp card] titular origem:", holderSource, "nome?", !!cardPayer.name, "doc?", !!cardPayer.doc);

  const externalRef = `${data.source.kind}:${data.source.id}`;
  const notificationUrl = `${siteUrl()}/api/public/mp/webhook`;
  // Cada submissão de cartão precisa ser uma tentativa nova. Quando o Mercado Pago
  // recusa por risco, reutilizar a mesma chave prende a fatura no mesmo pagamento.
  const idempotencyKey = `card-${data.source.kind}-${data.source.id}-${crypto.randomUUID()}`;

  const risk = await buildRiskContext(data.source.kind, data.source.id, cardPayer, {
    amount: src.amount,
    description: src.description,
  }, { includeProfilePayer: false });

  const mpResp = await createCardPayment(
    {
      amount: src.amount,
      description: src.description,
      token: data.card.token,
      installments: data.card.installments,
      paymentMethodId: data.card.paymentMethodId,
      issuerId: data.card.issuerId,
      payerEmail: cardPayer.email,
      payerName: cardPayer.name,
      payerDoc: cardPayer.doc,
      externalReference: externalRef,
      notificationUrl,
      items: risk.items,
      additionalPayer: {
        ...(risk.additionalPayer || {}),
        firstName: (cardPayer.name || "").trim().split(/\s+/)[0] || undefined,
        lastName: (cardPayer.name || "").trim().split(/\s+/).slice(1).join(" ") || undefined,
      },
      deviceId: data.deviceId ?? null,
      statementDescriptor: "FITMINDCLUB",
      threeDs: data.threeDs !== false,
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
      payer_email: cardPayer.email,
      payer_name: cardPayer.name || null,
      payer_doc: cardPayer.doc || null,
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

  if (ACTIVE_PAYMENT_STATUSES.has(status)) {
    await attachPaymentToSource(data.source.kind, data.source.id, row.id);
  } else {
    await clearRejectedSourcePointer(data.source.kind, data.source.id, row.id, status);
  }

  if (status === "approved") {
    await applyApproval(data.source.kind, data.source.id);
    if ((data.saveCard || data.subscribe) && data.card.token) {
      const savedCardId = await persistSavedCard({ studentId: src.studentId, payer: cardPayer, cardToken: data.card.token, mpResp });
      if (data.subscribe) {
        try {
          const { activateSubscriptionForSource } = await import("./recurrence-source.server");
          await activateSubscriptionForSource({
            kind: data.source.kind,
            id: data.source.id,
            studentId: src.studentId,
            savedCardId,
          });
        } catch (e) {
          console.error("[mp subscribe] falha ao criar assinatura:", e);
        }
      }
    }
  }

  // 3-D Secure: quando o emissor pede desafio, devolvemos a URL para o
  // frontend exibir o iframe do banco.
  const threeDs = (mpResp as any)?.three_ds_info || null;

  return {
    paymentRowId: row.id,
    mpPaymentId: String(mpResp.id),
    status: mpResp.status as string,
    statusDetail: (mpResp.status_detail as string | null) ?? null,
    threeDs: threeDs ? { externalResourceUrl: threeDs.external_resource_url, creq: threeDs.creq } : null,
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
  if (row.status === "approved" && row.source_kind === "store_order") {
    try {
      await applyApproval("store_order", row.source_id as string);
    } catch (e) {
      console.error("[mp poll] approved store order reapply failed:", e);
    }
  }
  return row;
}
