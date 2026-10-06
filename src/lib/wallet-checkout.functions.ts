import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMyWalletTotals = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const profileId = prof?.id;
    if (!profileId) return { coach: 0, partner: 0, professional: 0, total: 0 };
    // O saldo é UM só e vem de `carteira_atual`, derivada do ledger. As tabelas
    // de carteira envelheciam sozinhas quando um prazo vencia, e o checkout
    // passava a recusar pagamento por dinheiro que já estava liberado.
    //
    // As três chaves abaixo são a ORIGEM do que a pessoa ganhou, não caixas
    // separadas: saque e gasto saem do bolso único e não pertencem a nenhuma
    // delas. Era tentar dividir esse número em três que produzia "R$ 0,01 no
    // coach e R$ 0,01 no parceiro" para quem tinha R$ 0,02 no total.
    const { data: linhas } = await supabase.rpc("carteira_atual" as never, { _profile_id: profileId } as never);
    const c = ((linhas as Array<{
      disponivel: number; ganho_coach: number; ganho_parceiro: number; ganho_profissional: number;
    }> | null) ?? [])[0];
    return {
      coach: Number(c?.ganho_coach || 0),
      partner: Number(c?.ganho_parceiro || 0),
      professional: Number(c?.ganho_profissional || 0),
      total: Number(c?.disponivel || 0),
    };
  });

export const payStoreOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pay_store_order_with_wallet", { _order_id: data.order_id });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; breakdown: Record<string, number> };
  });

export const payPartnerOrderWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { order_id: string }) => z.object({ order_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: res, error } = await context.supabase.rpc("pay_partner_order_with_wallet", { _order_id: data.order_id });
    if (error) throw new Error(error.message);
    return res as { ok: boolean; breakdown: Record<string, number> };
  });

type GroupItemRow = { source_kind: "store_order" | "partner_product_order"; source_id: string };

/**
 * Paga com a carteira todos os pedidos de uma cobrança agrupada.
 *
 * Confere o saldo contra o total antes de começar, para não pagar metade da
 * compra. Pedido que já está pago é pulado, então tentar de novo depois de uma
 * falha no meio é seguro. Cada pedido passa pelo mesmo débito de sempre.
 */
export const payCheckoutGroupWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { group_id: string }) => z.object({ group_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: grupoRaw } = await supabase
      .from("checkout_groups" as never)
      .select("id, total_amount, status" as never)
      .eq("id" as never, data.group_id as never)
      .maybeSingle();
    const grupo = grupoRaw as unknown as { id: string; total_amount: number; status: string } | null;
    if (!grupo) throw new Error("Cobrança não encontrada");
    if (grupo.status === "paid") throw new Error("Esta compra já está paga");

    const { data: itensRaw } = await supabaseAdmin
      .from("checkout_group_items" as never)
      .select("source_kind, source_id" as never)
      .eq("group_id" as never, grupo.id as never);
    const itens = (itensRaw as unknown as GroupItemRow[]) || [];

    const { data: prof } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const { data: linhas } = await supabase.rpc("carteira_atual" as never, { _profile_id: prof?.id } as never);
    const disponivel = Number(((linhas as Array<{ disponivel: number }> | null) ?? [])[0]?.disponivel || 0);
    if (disponivel + 0.001 < Number(grupo.total_amount)) throw new Error("Saldo insuficiente para a compra inteira");

    const breakdown: Record<string, number> = {};
    let pagos = 0;
    for (const item of itens) {
      const tabela = item.source_kind === "store_order" ? "store_orders" : "partner_product_orders";
      const { data: pedido } = await supabaseAdmin.from(tabela as never).select("status" as never).eq("id" as never, item.source_id as never).maybeSingle();
      if ((pedido as unknown as { status?: string } | null)?.status === "paid") { pagos += 1; continue; }

      const rpc = item.source_kind === "store_order" ? "pay_store_order_with_wallet" : "pay_partner_order_with_wallet";
      const { data: res, error } = await supabase.rpc(rpc as never, { _order_id: item.source_id } as never);
      if (error) throw new Error(`Pagou ${pagos} de ${itens.length} pedidos; o próximo falhou: ${error.message}`);
      for (const [origem, valor] of Object.entries((res as { breakdown?: Record<string, number> } | null)?.breakdown || {})) {
        breakdown[origem] = (breakdown[origem] || 0) + Number(valor || 0);
      }
      pagos += 1;
    }

    const agora = new Date().toISOString();
    await supabaseAdmin
      .from("checkout_groups" as never)
      .update({ status: "paid", paid_at: agora, updated_at: agora } as never)
      .eq("id" as never, grupo.id as never);
    return { ok: true, breakdown };
  });
