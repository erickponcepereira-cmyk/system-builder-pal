import { supabase } from "@/integrations/supabase/client";
import type { UnifiedProduct } from "@/lib/unified-store";

/**
 * Localização da loja.
 *
 * Fatos do banco que definem este desenho (medidos em produção, 22/08/2026):
 *
 *  1. Produto NÃO tem local. Nem `partner_products` nem `professional_products`
 *     têm cidade. Local é propriedade de quem vende, não do item.
 *  2. `partners.latitude/longitude` existem e estão 100% nulas — 0 de 41. Não
 *     há raio nem distância possível. O filtro é por cidade, e "perto de mim"
 *     quer dizer "na minha cidade".
 *  3. O local do profissional mora em `profiles.city`, que a correção de
 *     segurança fechou para leitura direta. Por isso passa por RPC
 *     security-definer, que devolve só cidade e UF — nunca endereço nem CEP.
 *
 * O mapeamento é por VENDEDOR, não por produto. A primeira versão devolvia uma
 * linha por produto e o PostgREST cortava em 1000; com 1814 produtos ativos, a
 * loja perdia ~45% do catálogo em silêncio. Vendedor são ~45 linhas.
 *
 * Nada aqui usa `navigator.geolocation`: o ComplianceGate já exige cidade e UF
 * no cadastro, então "minha localização" sai do perfil. Pedir GPS para
 * descobrir o que já está gravado seria atrito sem ganho.
 */

export type CidadeComLoja = {
  chave: string;
  nome: string;
  uf: string;
  vendedores: number;
};

export type LocalDoVendedor = { chave: string; nome: string; uf: string };

/** sellerId -> cidade. Produtos FitMind não entram: são nacionais. */
export type LocalPorVendedor = Map<string, LocalDoVendedor>;

export type StoreLocation = {
  cidades: CidadeComLoja[];
  porVendedor: LocalPorVendedor;
  erro: string | null;
};

export const EMPTY_LOCATION: StoreLocation = {
  cidades: [],
  porVendedor: new Map(),
  erro: null,
};

export async function loadStoreLocation(): Promise<StoreLocation> {
  try {
    const [cidadesRes, vendRes] = await Promise.all([
      supabase.rpc("cidades_com_loja" as never),
      supabase.rpc("vendedores_por_local" as never),
    ]);

    if (cidadesRes.error) throw cidadesRes.error;
    if (vendRes.error) throw vendRes.error;

    const cidades: CidadeComLoja[] = (
      (cidadesRes.data as unknown as Array<Record<string, unknown>>) || []
    )
      .filter((r) => r.cidade_chave && r.uf)
      .map((r) => ({
        chave: String(r.cidade_chave),
        nome: String(r.cidade_exibicao || r.cidade_chave),
        uf: String(r.uf),
        vendedores: Number(r.vendedores || 0),
      }));

    const porVendedor: LocalPorVendedor = new Map();
    for (const r of (vendRes.data as unknown as Array<Record<string, unknown>>) || []) {
      if (!r.vendedor_id || !r.cidade_chave) continue;
      porVendedor.set(String(r.vendedor_id), {
        chave: String(r.cidade_chave),
        nome: String(r.cidade_exibicao || r.cidade_chave),
        uf: String(r.uf || ""),
      });
    }

    return { cidades, porVendedor, erro: null };
  } catch (error) {
    console.error("[store-location]", error);
    // Falha aberta: sem localização a loja mostra tudo, em vez de esvaziar.
    return { ...EMPTY_LOCATION, erro: "localização" };
  }
}

/** Mesma dobra de acento do SQL, para casar a cidade do perfil com a chave. */
export function chaveCidade(texto: string | null | undefined): string {
  return String(texto || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

export type LocalSelecionado =
  | { modo: "todas" }
  | { modo: "cidade"; chave: string; nome: string; uf: string };

/** Cidade do vendedor de um produto, ou null se for FitMind / sem cadastro. */
export function localDoProduto(
  produto: UnifiedProduct,
  local: StoreLocation,
): LocalDoVendedor | null {
  if (produto.origin === "fitmind" || !produto.sellerId) return null;
  return local.porVendedor.get(produto.sellerId) ?? null;
}

/**
 * Aplica o filtro de local.
 *
 * Produto FitMind (curso, protocolo, ticket) é nacional e passa sempre — é o
 * que impede a loja de ficar vazia para quem mora onde ainda não há parceiro.
 * Produto de vendedor sem cidade cadastrada também passa: esconder o produto de
 * alguém porque o cadastro dele está incompleto pune a pessoa errada.
 */
export function aplicarLocal(
  produtos: UnifiedProduct[],
  local: StoreLocation,
  selecionado: LocalSelecionado,
): UnifiedProduct[] {
  if (selecionado.modo === "todas") return produtos;
  return produtos.filter((p) => {
    const loc = localDoProduto(p, local);
    if (!loc) return true;
    return loc.chave === selecionado.chave;
  });
}

/** Quantos produtos de vendedor local existem numa cidade — decide o estado vazio. */
export function contarLocais(
  produtos: UnifiedProduct[],
  local: StoreLocation,
  chave: string,
): number {
  return produtos.filter((p) => localDoProduto(p, local)?.chave === chave).length;
}
