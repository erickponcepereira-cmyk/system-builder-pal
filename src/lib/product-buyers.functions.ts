import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { ProductBuyersResult } from "@/lib/product-buyers.server";

export type { ProductBuyerRow, ProductBuyersResult } from "@/lib/product-buyers.server";

export const listProductBuyers = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: { productType: "partner" | "professional"; productId: string }) => {
    if (!input?.productId) throw new Error("productId é obrigatório");
    if (input.productType !== "partner" && input.productType !== "professional") {
      throw new Error("productType inválido");
    }
    return input;
  })
  .handler(async ({ context, data }): Promise<ProductBuyersResult> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { assertProductAccess, fetchProductBuyers } = await import("@/lib/product-buyers.server");

    const meta = await assertProductAccess(
      supabaseAdmin,
      context.userId,
      data.productType,
      data.productId,
    );
    const buyers = await fetchProductBuyers(supabaseAdmin, data.productType, data.productId);
    const { CANCELLED_STATUSES } = await import("@/lib/product-buyers.server");
    const isCancelled = (s: string) => CANCELLED_STATUSES.includes(s);
    const paidCount = buyers.filter((b) => b.status === "paid").length;
    const cancelledCount = buyers.filter((b) => isCancelled(b.status)).length;
    const pendingCount = buyers.filter((b) => b.status !== "paid" && !isCancelled(b.status)).length;

    // Vaga ocupada = venda paga + pendente ainda dentro da reserva de 30 min
    const reserveCutoff = Date.now() - 30 * 60 * 1000;
    const reserved = buyers.filter(
      (b) =>
        b.status !== "paid" &&
        !isCancelled(b.status) &&
        b.purchasedAt !== null &&
        new Date(b.purchasedAt).getTime() > reserveCutoff,
    ).length;

    return {
      productName: meta.productName,
      stock: meta.stock,
      remaining: meta.stock === null ? null : Math.max(0, meta.stock - paidCount - reserved),
      paidCount,
      pendingCount,
      cancelledCount,
      buyers,
    };
  });
