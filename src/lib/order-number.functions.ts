import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

/**
 * Resolve o número do pedido a partir do id.
 * Necessário porque o vendedor (coach/master coach) nem sempre tem permissão
 * de leitura direta na tabela do pedido do cliente — sem isso o link de
 * pagamento saía como /pay/pedido e quebrava.
 */
export const resolveOrderNumber = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { kind: "store_order" | "partner_product_order"; id: string }) =>
    z.object({
      kind: z.enum(["store_order", "partner_product_order"]),
      id: z.string().uuid(),
    }).parse(d)
  )
  .handler(async ({ data }): Promise<{ number: string | null; total: number | null; publicPaymentToken: string | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { authorizePaymentSource } = await import("./payment-source-authorization.server");
    const access = await authorizePaymentSource({ kind: data.kind, id: data.id });
    if (data.kind === "store_order") {
      const { data: row } = await supabaseAdmin
        .from("store_orders")
        .select("order_number,total_amount,public_payment_token")
        .eq("id", access.source.id)
        .maybeSingle();
      const r = row as { order_number?: string | null; total_amount?: number | null; public_payment_token?: string | null } | null;
      return {
        number: r?.order_number ?? null,
        total: r ? Number(r.total_amount ?? 0) : null,
        publicPaymentToken: r?.public_payment_token ?? null,
      };
    }
    const { data: row } = await supabaseAdmin
      .from("partner_product_orders")
      .select("order_number,gross_amount,public_payment_token")
      .eq("id", access.source.id)
      .maybeSingle();
    const r = row as { order_number?: string | null; gross_amount?: number | null; public_payment_token?: string | null } | null;
    return {
      number: r?.order_number ?? null,
      total: r ? Number(r.gross_amount ?? 0) : null,
      publicPaymentToken: r?.public_payment_token ?? null,
    };
  });
