import { z } from "zod";

export const PayerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  doc: z.string().optional(),
});

export const SourceSchema = z.object({
  kind: z.enum(["store_order", "transaction", "partner_product_order", "subscription_invoice"]),
  id: z.string().uuid(),
});

// O device fingerprint do Mercado Pago (security.js) pode ser bem longo.
// Nunca deve derrubar o pagamento: se vier inválido/gigante, seguimos sem ele.
export const DeviceIdSchema = z
  .any()
  .transform((v) => {
    if (typeof v !== "string") return null;
    const s = v.trim();
    if (!s || s.length > 4000) return null;
    return s;
  })
  .nullable()
  .optional();

export const cleanCheckoutError = (error: unknown) => {
  const message = error instanceof Error ? error.message : String(error || "Falha ao criar pagamento");
  if (
    /three[_-]?ds|three_d_secure|wrong parameters?|name of the following parameters is wrong/i.test(message)
  ) {
    return "Falha na validação de segurança do cartão. Atualize a página e tente novamente; se persistir, use PIX ou outro cartão.";
  }
  return message
    .replace(/^\[DIAG\]\s*/i, "")
    .replace(/^Error:\s*/i, "")
    .replace(/\n[\s\S]*$/g, "")
    .trim() || "Falha ao criar pagamento";
};