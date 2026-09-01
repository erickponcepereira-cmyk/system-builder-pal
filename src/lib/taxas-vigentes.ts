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
/**
 * A leitura em voo, para quem precisa ESPERAR por ela.
 *
 * Sem isto havia uma corrida silenciosa: `carregarTaxasVigentes` sai do
 * `useEffect` do __root e `loadUnifiedCatalog` sai da tela da loja, as duas ao
 * mesmo tempo. Quando o catálogo chegava primeiro — e chega, porque a loja
 * monta e busca de imediato — a comissão de cada produto de parceiro era
 * calculada com a taxa VELHA e congelada no objeto. A mutação que chegava
 * depois não corrigia nada, porque o número já tinha sido gravado.
 *
 * O coach via 2,08 numa venda de R$ 25 onde a verdade é 1,88: erro para mais,
 * que é o pior lado para se errar uma promessa de comissão.
 */
let emVoo: Promise<boolean> | null = null;

export function garantirTaxasVigentes(): Promise<boolean> {
  if (!emVoo) emVoo = carregarTaxasVigentes();
  return emVoo;
}

export async function carregarTaxasVigentes(): Promise<boolean> {
  try {
    const { data, error } = await supabase.rpc("taxa_vigente" as never, {} as never);
    if (error) {
      console.warn("[taxas-vigentes] nao foi possivel ler a taxa vigente", error);
      return false;
    }
    const linha = Array.isArray(data) ? data[0] : data;
    return aplicarTaxasVigentes(linha as Record<string, unknown> | null);
  } catch (e) {
    console.warn("[taxas-vigentes] falha inesperada ao ler a taxa vigente", e);
    return false;
  }
}
