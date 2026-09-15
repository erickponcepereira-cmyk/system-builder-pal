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
