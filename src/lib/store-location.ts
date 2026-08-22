import { supabase } from "@/integrations/supabase/client";
import type { UnifiedProduct } from "@/lib/unified-store";

/**
 * Localização da loja.
 *
 * Três fatos do banco que definem este desenho (verificados em 22/08/2026):
 *
 *  1. Produto NÃO tem local. Nem `partner_products` nem `professional_products`
 *     têm cidade. Local é propriedade de quem vende, não do item.
 *  2. `partners.latitude/longitude` existem e estão 100% nulas — 0 de 41. Então
 *     não há raio nem distância. O filtro é por cidade, e "perto de mim" quer
 *     dizer "na minha cidade".
 *  3. O local do profissional mora em `profiles.city`, que a correção de
 *     segurança fechou para leitura direta. Por isso tudo passa por RPC
 *     security-definer, que devolve só cidade e UF — nunca endereço nem CEP.
 *
 * Nada aqui usa `navigator.geolocation`: o ComplianceGate já exige cidade e UF
 * no cadastro, então "minha localização" sai do perfil. Pedir GPS para descobrir
 * o que já está gravado seria atrito sem ganho.
 */

export type CidadeComLoja = {
  chave: string;
  nome: string;
  uf: string;
  vendedores: number;
};

/** produto -> cidade do vendedor. Produtos FitMind não entram: são nacionais. */
export type LocalPorProduto = Map<string, { chave: string; nome: string; uf: string }>;

export type StoreLocation = {
  cidades: CidadeComLoja[];
  porProduto: LocalPorProduto;
  erro: string | null;
};

export const EMPTY_LOCATION: StoreLocation = {
  cidades: [],
  porProduto: new Map(),
  erro: null,
};

export async function loadStoreLocation(): Promise<StoreLocation> {
  try {
    const [cidadesRes, produtosRes] = await Promise.all([
      supabase.rpc("cidades_com_loja" as never),
      supabase.rpc("produtos_por_local" as never),
    ]);

    if (cidadesRes.error) throw cidadesRes.error;
    if (produtosRes.error) throw produtosRes.error;

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

    const porProduto: LocalPorProduto = new Map();
    for (const r of ((produtosRes.data as unknown as Array<Record<string, unknown>>) || [])) {
      if (!r.produto_id || !r.cidade_chave) continue;
      porProduto.set(String(r.produto_id), {
        chave: String(r.cidade_chave),
        nome: String(r.cidade_exibicao || r.cidade_chave),
        uf: String(r.uf || ""),
      });
    }

    return { cidades, porProduto, erro: null };
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
    if (p.origin === "fitmind") return true;
    const loc = local.porProduto.get(p.sourceId);
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
  return produtos.filter((p) => {
    if (p.origin === "fitmind") return false;
    return local.porProduto.get(p.sourceId)?.chave === chave;
  }).length;
}
