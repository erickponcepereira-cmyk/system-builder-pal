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
      const { authorizePaymentSource } = await import("./payment-source-authorization.server");
      const { handleCreatePix } = await import("./mercadopago-impl.server");
      const access = await authorizePaymentSource(data.data.source, { requirePayer: true });
      if (!access.payer) throw new Error("Não foi possível identificar o comprador deste pagamento.");
      const result = await handleCreatePix({
        ...data.data,
        source: access.source,
        payer: {
          ...data.data.payer,
          email: access.payer.email,
          name: access.payer.name || data.data.payer.name,
        },
      });
      return {
        paymentRowId: result.paymentRowId,
        status: result.status,
        qrCode: result.qrCode,
        qrCodeBase64: result.qrCodeBase64,
        ticketUrl: result.ticketUrl,
        amount: result.amount,
      };
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
            token: z.string().min(10).max(4096),
            installments: z.number().int().min(1).max(12),
            paymentMethodId: z.string().trim().min(1).max(80),
            issuerId: z.string().trim().max(80).optional(),
          }),
          holder: z.object({
            name: z.string().trim().max(120).optional(),
            doc: z.string().trim().max(30).optional(),
          }).optional(),
          cardMeta: z.object({
            bin: z.string().max(10).optional(),
            lastFour: z.string().max(4).optional(),
            cardholderName: z.string().max(120).optional(),
          }).optional(),
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
      const { authorizePaymentSource } = await import("./payment-source-authorization.server");
      const { handleCreateCard } = await import("./mercadopago-impl.server");
      const access = await authorizePaymentSource(data.data.source, { requirePayer: true });
      if (!access.payer) throw new Error("Não foi possível identificar o comprador deste pagamento.");
      if ((data.data.saveCard || data.data.subscribe) && !access.canPersistPaymentMethod) {
        throw new Error("Somente o titular do pedido pode salvar um cartão ou ativar uma assinatura.");
      }
      const result = await handleCreateCard({
        ...data.data,
        source: access.source,
        payer: {
          ...data.data.payer,
          email: access.payer.email,
          name: access.payer.name || data.data.payer.name,
        },
      });
      return {
        paymentRowId: result.paymentRowId,
        status: result.status,
        statusDetail: result.statusDetail,
        threeDs: "threeDs" in result ? result.threeDs : null,
      };
    } catch (e) {
      throw new Error(cleanCheckoutError(e));
    }
  });


/** Consulta status atual do pagamento (para polling no frontend). */
export const getPaymentStatus = createServerFn({ method: "GET" })
  .inputValidator((input: unknown) => z.object({
    paymentRowId: z.string().uuid(),
    source: SourceSchema,
  }).parse(input))
  .handler(async ({ data }) => {
    const { authorizePaymentSource, assertPaymentBelongsToSource } = await import("./payment-source-authorization.server");
    const access = await authorizePaymentSource(data.source);
    await assertPaymentBelongsToSource(data.paymentRowId, access.source);
    const { handleGetStatus } = await import("./mercadopago-impl.server");
    return handleGetStatus(data.paymentRowId);
  });

/** Informa se a origem (pedido) corresponde a um produto de assinatura recorrente. */
export const getSourceRecurrence = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => SourceSchema.parse(input))
  .handler(async ({ data }) => {
    const { authorizePaymentSource } = await import("./payment-source-authorization.server");
    const access = await authorizePaymentSource(data);
    if (!access.canPersistPaymentMethod) return null;
    const { resolveSourceRecurrence } = await import("./recurrence-source.server");
    return await resolveSourceRecurrence(access.source.kind, access.source.id);
  });
