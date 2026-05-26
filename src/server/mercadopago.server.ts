// Helper server-only para chamar a API do Mercado Pago.
// Nunca importar isto em código cliente.
const MP_BASE = "https://api.mercadopago.com";

function getToken(): string {
  const token = process.env.MERCADOPAGO_ACCESS_TOKEN;
  if (!token) throw new Error("MERCADOPAGO_ACCESS_TOKEN não configurado");
  return token;
}

async function mpFetch(path: string, init: RequestInit & { idempotencyKey?: string } = {}) {
  const headers: Record<string, string> = {
    "Authorization": `Bearer ${getToken()}`,
    "Content-Type": "application/json",
    ...(init.headers as Record<string, string> | undefined),
  };
  if (init.idempotencyKey) headers["X-Idempotency-Key"] = init.idempotencyKey;
  const res = await fetch(`${MP_BASE}${path}`, { ...init, headers });
  const text = await res.text();
  let json: any = null;
  try { json = text ? JSON.parse(text) : null; } catch { /* ignore */ }
  if (!res.ok) {
    const msg = json?.message || json?.error || res.statusText;
    console.error("[MP API ERROR]", res.status, msg, "body:", text?.slice(0, 800));
    throw new Error(`Mercado Pago ${res.status}: ${msg}`);
  }
  return json;
}

export type MpPixInput = {
  amount: number;
  description: string;
  payerEmail: string;
  payerName?: string;
  payerDoc?: string;
  externalReference: string;
  notificationUrl: string;
};

export type MpCardInput = {
  amount: number;
  description: string;
  token: string;
  installments: number;
  paymentMethodId: string;
  issuerId?: string;
  payerEmail: string;
  payerName?: string;
  payerDoc?: string;
  externalReference: string;
  notificationUrl: string;
};

/** Cria pagamento PIX. Retorna o objeto raw com point_of_interaction. */
export async function createPixPayment(input: MpPixInput, idempotencyKey: string) {
  return mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey,
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      payment_method_id: "pix",
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      payer: {
        email: input.payerEmail,
        first_name: input.payerName?.split(" ")[0],
        last_name: input.payerName?.split(" ").slice(1).join(" ") || undefined,
        identification: input.payerDoc ? { type: "CPF", number: input.payerDoc.replace(/\D/g, "") } : undefined,
      },
    }),
  });
}

/** Cria pagamento com cartão (token gerado no frontend via SDK MP). */
export async function createCardPayment(input: MpCardInput, idempotencyKey: string) {
  return mpFetch("/v1/payments", {
    method: "POST",
    idempotencyKey,
    body: JSON.stringify({
      transaction_amount: Number(input.amount.toFixed(2)),
      description: input.description,
      token: input.token,
      installments: input.installments,
      payment_method_id: input.paymentMethodId,
      issuer_id: input.issuerId,
      external_reference: input.externalReference,
      notification_url: input.notificationUrl,
      payer: {
        email: input.payerEmail,
        first_name: input.payerName?.split(" ")[0],
        last_name: input.payerName?.split(" ").slice(1).join(" ") || undefined,
        identification: input.payerDoc ? { type: "CPF", number: input.payerDoc.replace(/\D/g, "") } : undefined,
      },
    }),
  });
}

export async function getPayment(mpPaymentId: string) {
  return mpFetch(`/v1/payments/${mpPaymentId}`, { method: "GET" });
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
