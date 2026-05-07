import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

const PayerSchema = z.object({
  email: z.string().email(),
  name: z.string().optional(),
  doc: z.string().optional(),
});

const SourceSchema = z.object({
  kind: z.enum(["store_order", "transaction"]),
  id: z.string().uuid(),
});

/** Cria pagamento PIX no Mercado Pago e retorna QR code + texto copia-e-cola. */
export const createPixCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) =>
    z.object({ source: SourceSchema, payer: PayerSchema }).parse(input)
  )
  .handler(async ({ data }) => {
    const { handleCreatePix } = await import("./mercadopago-impl.server");
    return handleCreatePix(data);
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
    const { handleCreateCard } = await import("./mercadopago-impl.server");
    return handleCreateCard(data);
  });

/** Consulta status atual do pagamento (para polling no frontend). */
export const getPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ paymentRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { handleGetStatus } = await import("./mercadopago-impl.server");
    return handleGetStatus(data.paymentRowId);
  });
