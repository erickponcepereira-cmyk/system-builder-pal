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
