import { createServerFn } from "@tanstack/react-start";
import type { SupabaseClient } from "@supabase/supabase-js";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import type { Database } from "@/integrations/supabase/types";

/**
 * O saldo da pessoa: um número só, o mesmo que o admin vê em Pagamentos.
 *
 * Vem de `carteira_atual`, derivada do extrato. As tabelas de carteira
 * (`wallets`, `partner_wallets`, `professional_wallets`) guardam o saldo
 * repartido por origem e envelhecem quando um valor vence a carência. Ler
 * delas, ou mostrar o ganho de uma origem como se fosse saldo, fazia cada tela
 * dizer uma coisa — em 14/10/2026 a mensalidade mostrava R$ 920,60 para quem
 * tinha R$ 26,15.
 *
 * `ganhoCoach`, `ganhoParceiro` e `ganhoProfissional` dizem de onde o dinheiro
 * veio ao longo do tempo. Não são caixas: saque e gasto saem do saldo único.
 */
export type MyBalance = {
  disponivel: number;
  /** Em carência ou esperando a meta da rede. */
  aLiberar: number;
  ganho: number;
  ganhoCoach: number;
  ganhoParceiro: number;
  ganhoProfissional: number;
  sacado: number;
};

type CarteiraRow = {
  disponivel: number;
  pendente: number;
  bloqueado_por_meta: number;
  ganho: number;
  ganho_coach: number;
  ganho_parceiro: number;
  ganho_profissional: number;
  sacado: number;
};

const SALDO_ZERADO: MyBalance = {
  disponivel: 0, aLiberar: 0, ganho: 0, ganhoCoach: 0, ganhoParceiro: 0, ganhoProfissional: 0, sacado: 0,
};

/** Lê a carteira com o cliente da própria pessoa: o banco só devolve a dela. */
export async function loadBalance(supabase: SupabaseClient<Database>, profileId: string): Promise<MyBalance> {
  const { data, error } = await supabase.rpc("carteira_atual" as never, { _profile_id: profileId } as never);
  if (error) throw new Error(error.message);
  const carteira = ((data as CarteiraRow[] | null) ?? [])[0];
  if (!carteira) return SALDO_ZERADO;
  return {
    disponivel: Number(carteira.disponivel || 0),
    aLiberar: Number(carteira.pendente || 0) + Number(carteira.bloqueado_por_meta || 0),
    ganho: Number(carteira.ganho || 0),
    ganhoCoach: Number(carteira.ganho_coach || 0),
    ganhoParceiro: Number(carteira.ganho_parceiro || 0),
    ganhoProfissional: Number(carteira.ganho_profissional || 0),
    sacado: Number(carteira.sacado || 0),
  };
}

export const getMyBalance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyBalance> => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!profile?.id) return SALDO_ZERADO;
    return loadBalance(supabase, profile.id);
  });
