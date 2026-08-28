import { z } from "zod";

export const PayerSchema = z.object({
  email: z.string().trim().email().max(254),
  name: z.string().trim().max(120).optional(),
  doc: z.string().trim().max(30).optional(),
});

export const PaymentSourceKindSchema = z.enum([
  "store_order",
  "transaction",
  "partner_product_order",
  "subscription_invoice",
]);

export type PaymentSourceKind = z.infer<typeof PaymentSourceKindSchema>;

const AuthenticatedSourceSchema = z.object({
  kind: PaymentSourceKindSchema,
  id: z.string().uuid(),
}).strict();

const PublicSourceSchema = z.object({
  kind: z.enum(["store_order", "partner_product_order"]),
  publicPaymentToken: z.string().uuid(),
}).strict();

/**
 * Internal checkout uses an authenticated source UUID. Public links never
 * receive that UUID: the unguessable token is resolved and authorized only on
 * the server.
 */
export const SourceSchema = z.union([AuthenticatedSourceSchema, PublicSourceSchema]);
export type CheckoutSource = z.infer<typeof SourceSchema>;

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
