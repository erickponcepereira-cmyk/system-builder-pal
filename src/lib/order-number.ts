import { resolveOrderNumber } from "./order-number.functions";

/**
 * Retorna o número do pedido, buscando no servidor quando a leitura direta
 * (bloqueada por regras de acesso) não devolveu nada. Nunca inventa um valor.
 */
export async function ensureOrderNumber(
  kind: "store_order" | "partner_product_order",
  id: string,
  known?: string | null,
): Promise<string | null> {
  if (known) return known;
  try {
    const res = await resolveOrderNumber({ data: { kind, id } });
    return res?.number ?? null;
  } catch {
    return null;
  }
}

/** Resolve, com autorização, os dados necessários para montar um link público. */
export async function ensureOrderPaymentReference(
  kind: "store_order" | "partner_product_order",
  id: string,
  known?: { number?: string | null; publicPaymentToken?: string | null },
): Promise<{ number: string | null; publicPaymentToken: string | null }> {
  if (known?.number && known.publicPaymentToken) {
    return { number: known.number, publicPaymentToken: known.publicPaymentToken };
  }
  try {
    const res = await resolveOrderNumber({ data: { kind, id } });
    return {
      number: known?.number || res?.number || null,
      publicPaymentToken: known?.publicPaymentToken || res?.publicPaymentToken || null,
    };
  } catch {
    return { number: known?.number || null, publicPaymentToken: known?.publicPaymentToken || null };
  }
}
