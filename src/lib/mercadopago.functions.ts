import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { cleanCheckoutError, DeviceIdSchema, PayerSchema, SourceSchema } from "./mercadopago-checkout";

/** Cria pagamento PIX no Mercado Pago e retorna QR code + texto copia-e-cola. */
export const createPixCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    try {
      return {
        ok: true as const,
        data: z.object({
          source: SourceSchema,
          payer: PayerSchema,
          deviceId: DeviceIdSchema,
        }).parse(input),
      };
    } catch (e: any) {
      return { ok: false as const, error: `VALIDATION: ${e?.message || String(e)}` };
    }
  })
  .handler(async ({ data }) => {
    if (!data.ok) return { _error: data.error } as any;
    try {
      const { handleCreatePix } = await import("./mercadopago-impl.server");
      return await handleCreatePix(data.data);
    } catch (e: any) {
      return { _error: cleanCheckoutError(e) } as any;
    }
  });

/** Cria pagamento com cartão (token gerado no frontend). */
export const createCardCheckout = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => {
    try {
      return {
        ok: true as const,
        data: z.object({
          source: SourceSchema,
          payer: PayerSchema,
          card: z.object({
            token: z.string(),
            installments: z.number().int().min(1).max(12),
            paymentMethodId: z.string(),
            issuerId: z.string().optional(),
          }),
          deviceId: DeviceIdSchema,
          saveCard: z.boolean().optional(),
          subscribe: z.boolean().optional(),
        }).parse(input),
      };
    } catch (e: any) {
      return { ok: false as const, error: "Não foi possível validar os dados do cartão. Tente novamente." };
    }
  })
  .handler(async ({ data }) => {
    if (!data.ok) throw new Error(data.error);
    try {
      const { handleCreateCard } = await import("./mercadopago-impl.server");
      return await handleCreateCard(data.data);
    } catch (e) {
      throw new Error(cleanCheckoutError(e));
    }
  });


/** Consulta status atual do pagamento (para polling no frontend). */
export const getPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({ paymentRowId: z.string().uuid() }).parse(input))
  .handler(async ({ data }) => {
    const { handleGetStatus } = await import("./mercadopago-impl.server");
    return handleGetStatus(data.paymentRowId);
  });

/** Informa se a origem (pedido) corresponde a um produto de assinatura recorrente. */
export const getSourceRecurrence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SourceSchema.parse(input))
  .handler(async ({ data }) => {
    const { resolveSourceRecurrence } = await import("./recurrence-source.server");
    return await resolveSourceRecurrence(data.kind, data.id);
  });
