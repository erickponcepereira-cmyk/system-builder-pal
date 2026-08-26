import { supabase } from "@/integrations/supabase/client";
import { aplicarTaxasVigentes } from "@/lib/partnerFinance";

/**
 * Le a taxa vigente do banco e alinha os padroes do front com ela.
 *
 * Por que existe: os percentuais de maquininha, imposto, sistema e rede
 * viviam cravados em dois lugares — dentro das funcoes SQL de venda e dentro
 * de partnerFinance.ts. Duas copias do mesmo numero e como a tela passa a
 * mostrar um valor enquanto a venda cobra outro. Hoje o SQL le a tabela
 * `taxas_vigentes`; esta funcao faz o front ler a mesma coisa.
 *
 * Falha em silencio de proposito: se a leitura nao vier, os valores de
 * partida de partnerFinance.ts continuam valendo — que sao exatamente os que
 * estao na tabela hoje. Uma tela que nao carrega a taxa e melhor do que uma
 * tela que nao carrega.
 */
export async function carregarTaxasVigentes(): Promise<void> {
  try {
    const { data, error } = await supabase.rpc("taxa_vigente" as never, {} as never);
    if (error) {
      console.warn("[taxas-vigentes] nao foi possivel ler a taxa vigente", error);
      return;
    }
    const linha = Array.isArray(data) ? data[0] : data;
    aplicarTaxasVigentes(linha as Record<string, unknown> | null);
  } catch (e) {
    console.warn("[taxas-vigentes] falha inesperada ao ler a taxa vigente", e);
  }
}
