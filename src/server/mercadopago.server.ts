// Helper server-only para chamar a API do Mercado Pago.
// Nunca importar isto em código cliente.
const MP_BASE = "https://api.mercadopago.com";

function getToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return token;
}

async function mpFetch(
  path: string,
  init: RequestInit & { idempotencyKey?: string; deviceId?: string | null } = {}
) {
  const token = getToken();
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${token}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  // Fingerprint do dispositivo (security.js). É o sinal antifraude de maior peso
  // do Mercado Pago; sem ele, cartões caem em cc_rejected_high_risk com frequência.
  if (init.deviceId) headers["X-meli-session-id"] = init.deviceId;
  const tokenMask = `${token.slice(0, 14)}…${token.slice(-6)} (len=${token.length})`;
  console.log("[MP REQ]", init.method || "GET", path, "token:", tokenMask, "idem:", init.idempotencyKey || "-", "device:", init.deviceId ? "yes" : "no");
  const res = await fetch(`${MP_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || res.statusText;
    console.error("[MP API ERROR]", res.status, msg, "response:", text?.slice(0, 1200));
    throw new Error(`Mercado Pago ${res.status}: ${msg}`);
  }
  return json;
}

export type MpItem = {
  id: string;
  title: string;
  description?: string;
  categoryId?: string;
  quantity: number;
  unitPrice: number;
};

export type MpAdditionalPayer = {
  firstName?: string;
  lastName?: string;
  phoneAreaCode?: string;
  phoneNumber?: string;
  registrationDate?: string | null;
  address?: { zipCode?: string; streetName?: string; streetNumber?: string } | null;
};

export type MpPixInput = {
  amount: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerDoc?: string;
  externalReference: string;
  notificationUrl: string;
  items?: MpItem[];
  additionalPayer?: MpAdditionalPayer;
  deviceId?: string | null;
};

export type MpCardInput = MpPixInput & {
  token?: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  /** Cobrança recorrente com cartão salvo (Customers/Cards API). */
  customerId?: string;
  cardId?: string;
  statementDescriptor?: string;
  threeDs?: boolean;
};

function splitName(name?: string) {
  const parts = (name || "").trim().split(/\s+/).filter(Boolean);
  return { firstName: parts[0], lastName: parts.slice(1).join(" ") || undefined };
}

function buildPayer(input: MpPixInput) {
  const { firstName, lastName } = splitName(input.payerName);
  const digits = (input.payerDoc || "").replace(/\D/g, "");
  const payer: any = {
    email: input.payerEmail,
    first_name: input.additionalPayer?.firstName || firstName,
    last_name: input.additionalPayer?.lastName || lastName,
  };
  if (digits.length >= 11) {
    payer.identification = { type: digits.length > 11 ? "CNPJ" : "CPF", number: digits };
  }
  return payer;
}

function buildAdditionalInfo(input: MpPixInput) {
  const { firstName, lastName } = splitName(input.payerName);
  const ap = input.additionalPayer;
  const info: any = {};

  const items = (input.items && input.items.length
    ? input.items
    : [{ id: input.externalReference, title: input.description, quantity: 1, unitPrice: input.amount }]
  ).map((it) => ({
    id: String(it.id).slice(0, 64),
    title: String(it.title || input.description).slice(0, 120),
    description: it.description ? String(it.description).slice(0, 240) : undefined,
    category_id: it.categoryId || "services",
    quantity: Math.max(1, Number(it.quantity || 1)),
    unit_price: Number(Number(it.unitPrice || 0).toFixed(2)),
  }));
  info.items = items;

  const payer: any = {
    first_name: ap?.firstName || firstName,
    last_name: ap?.lastName || lastName,
  };
  if (ap?.phoneNumber) {
    payer.phone = { area_code: ap.phoneAreaCode || "", number: ap.phoneNumber };
  }
  if (ap?.registrationDate) payer.registration_date = ap.registrationDate;
  if (ap?.address?.zipCode) {
    payer.address = {
      zip_code: ap.address.zipCode,
      street_name: ap.address.streetName || "",
      street_number: ap.address.streetNumber || "",
    };
  }
  info.payer = payer;
  return info;
}

/** Cria pagamento PIX. Retorna o objeto raw com point_of_interaction. */
export async function createPixPayment(input: MpPixInput, idempotencyKey: string) {
  return mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey,
    deviceId: input.deviceId,
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      payer: buildPayer(input),
      additional_info: buildAdditionalInfo(input),
    }),
  });
}

/**
 * Cria pagamento com cartão (token gerado no frontend via SDK MP) ou com
 * cartão salvo (customerId + cardId) para cobranças recorrentes.
 */
export async function createCardPayment(input: MpCardInput, idempotencyKey: string) {
  const payer = buildPayer(input);
  if (input.customerId) payer.type = "customer";
  if (input.customerId) payer.id = input.customerId;

  const body: any = {
    transaction_amount: Number(input.amount.toFixed(2)),
    description: input.description,
    installments: input.installments,
    payment_method_id: input.paymentMethodId,
    issuer_id: input.issuerId,
    external_reference: input.externalReference,
    notification_url: input.notificationUrl,
    payer,
    additional_info: buildAdditionalInfo(input),
    capture: true,
    binary_mode: false,
  };
  if (input.token) body.token = input.token;
  if (input.statementDescriptor) body.statement_descriptor = input.statementDescriptor.slice(0, 22);
  // 3-D Secure: transfere a validação ao banco emissor e reduz muito a recusa
  // por análise de risco. O parâmetro atual da API é three_d_secure_mode.
  // "optional" só desafia quando o emissor pedir.
  if (input.threeDs) body.three_d_secure_mode = "optional";

  return mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey,
    deviceId: input.deviceId,
    body: JSON.stringify(body),
  });
}

export async function getPayment(mpPaymentId: string) {
  return mpFetch(`/v1/payments/${mpPaymentId}`, { method: "GET" });
}

// ───────────────────────── Customers & Cards (cartão salvo) ──────────────────

export async function findOrCreateCustomer(email: string, name?: string, doc?: string) {
  const search = await mpFetch(`/v1/customers/search?email=${encodeURIComponent(email)}`, { method: "GET" });
  const found = search?.results?.[0];
  if (found?.id) return found;
  const { firstName, lastName } = splitName(name);
  const digits = (doc || "").replace(/\D/g, "");
  return mpFetch("/v1/customers", {
    method: "POST",
    body: JSON.stringify({
      email,
      first_name: firstName,
      last_name: lastName,
      identification: digits.length >= 11 ? { type: digits.length > 11 ? "CNPJ" : "CPF", number: digits } : undefined,
    }),
  });
}

export async function createCustomerCard(customerId: string, cardToken: string) {
  return mpFetch(`/v1/customers/${customerId}/cards`, {
    method: "POST",
    body: JSON.stringify({ token: cardToken }),
  });
}

export async function deleteCustomerCard(customerId: string, cardId: string) {
  return mpFetch(`/v1/customers/${customerId}/cards/${cardId}`, { method: "DELETE" });
}

/** Gera um token de pagamento a partir de um cartão já salvo (recorrência). */
export async function createTokenFromSavedCard(cardId: string, customerId: string) {
  return mpFetch("/v1/card_tokens", {
    method: "POST",
    body: JSON.stringify({ card_id: cardId, customer_id: customerId }),
  });
}

// ───────────────────────── Preapproval (assinatura nativa MP) ────────────────

export type MpPreapprovalInput = {
  reason: string;
  externalReference: string;
  payerEmail: string;
  amount: number;
  frequency: number;
  frequencyType: "months" | "days";
  backUrl: string;
  startDate?: string;
  cardTokenId?: string;
};

export async function createPreapproval(input: MpPreapprovalInput) {
  const body: any = {
    reason: input.reason,
    external_reference: input.externalReference,
    payer_email: input.payerEmail,
    back_url: input.backUrl,
    auto_recurring: {
      frequency: input.frequency,
      frequency_type: input.frequencyType,
      transaction_amount: Number(input.amount.toFixed(2)),
      currency_id: "BRL",
      start_date: input.startDate,
    },
  };
  if (input.cardTokenId) {
    body.card_token_id = input.cardTokenId;
    body.status = "authorized";
  }
  return mpFetch("/preapproval", { method: "POST", body: JSON.stringify(body) });
}

export async function getPreapproval(id: string) {
  return mpFetch(`/preapproval/${id}`, { method: "GET" });
}

export async function cancelPreapproval(id: string) {
  return mpFetch(`/preapproval/${id}`, { method: "PUT", body: JSON.stringify({ status: "cancelled" }) });
}

export async function getAuthorizedPayment(id: string) {
  return mpFetch(`/authorized_payments/${id}`, { method: "GET" });
}

/** Mapeia status do MP para nosso enum interno. */
export function mapMpStatus(mpStatus: string): "pending" | "approved" | "rejected" | "cancelled" | "refunded" | "in_process" {
  switch (mpStatus) {
    case "approved": return "approved";
    case "rejected": return "rejected";
    case "cancelled": return "cancelled";
    case "refunded":
    case "charged_back": return "refunded";
    case "in_process":
    case "in_mediation":
    case "authorized": return "in_process";
    default: return "pending";
  }
}
