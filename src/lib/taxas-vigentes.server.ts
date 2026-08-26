import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { aplicarTaxasVigentes } from "@/lib/partnerFinance";

/**
 * A mesma leitura de `taxas-vigentes.ts`, so que do lado do servidor.
 *
 * Por que precisa existir uma segunda: `carregarTaxasVigentes()` roda no
 * `useEffect` do __root, ou seja, no navegador. As server functions rodam em
 * OUTRO processo, com outra copia do modulo partnerFinance.ts — e la ninguem
 * nunca chamou a leitura. O resultado era a pior forma de erro possivel: o
 * simulador de rede do coach devolvia numeros calculados com a taxa velha
 * enquanto a venda de verdade cobrava a nova, e nada quebrava para avisar.
 *
 * O cache de 60s existe porque estas funcoes sao chamadas em lista (um produto
 * por vez) e a taxa muda uma vez a cada varios meses.
 */
let cacheAte = 0;

export async function carregarTaxasVigentesServidor(): Promise<void> {
  if (Date.now() < cacheAte) return;
  try {
    const { data, error } = await supabaseAdmin.rpc("taxa_vigente" as never, {} as never);
    if (error) {
      console.warn("[taxas-vigentes/server] nao foi possivel ler a taxa vigente", error);
      return;
    }
    const linha = Array.isArray(data) ? data[0] : data;
    aplicarTaxasVigentes(linha as Record<string, unknown> | null);
    cacheAte = Date.now() + 60_000;
  } catch (e) {
    console.warn("[taxas-vigentes/server] falha inesperada ao ler a taxa vigente", e);
  }
}
