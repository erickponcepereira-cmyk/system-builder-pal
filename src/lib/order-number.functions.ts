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
  .handler(async ({ data }): Promise<{ number: string | null; total: number | null }> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    if (data.kind === "store_order") {
      const { data: row } = await supabaseAdmin
        .from("store_orders")
        .select("order_number,total_amount")
        .eq("id", data.id)
        .maybeSingle();
      const r = row as { order_number?: string | null; total_amount?: number | null } | null;
      return { number: r?.order_number ?? null, total: r ? Number(r.total_amount ?? 0) : null };
    }
    const { data: row } = await supabaseAdmin
      .from("partner_product_orders")
      .select("order_number,gross_amount")
      .eq("id", data.id)
      .maybeSingle();
    const r = row as { order_number?: string | null; gross_amount?: number | null } | null;
    return { number: r?.order_number ?? null, total: r ? Number(r.gross_amount ?? 0) : null };
  });
