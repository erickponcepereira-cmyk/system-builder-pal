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
    const paidCount = buyers.filter((b) => b.status === "paid").length;
    const pendingCount = buyers.filter((b) => b.status !== "paid").length;

    return {
      productName: meta.productName,
      stock: meta.stock,
      paidCount,
      pendingCount,
      buyers,
    };
  });
