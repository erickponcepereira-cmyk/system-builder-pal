import { supabase } from "@/integrations/supabase/client";

/**
 * A ficha pública de um vendedor.
 *
 * Tudo por RPC, e isso não é preferência de estilo. `unified-store.ts:585`
 * registra a lição: `partners`, `coaches` e `profiles` estão fechadas para
 * leitura direta desde a correção de segurança, e pedir um join embutido faz o
 * PostgREST recusar a consulta INTEIRA — foi assim que o catálogo de parceiros
 * sumiu da loja de uma vez.
 */

export type TipoDeVendedor = "partner" | "professional";

export type Vendedor = {
  id: string;
  tipo: TipoDeVendedor;
  nome: string;
  descricao: string | null;
  foto: string | null;
  capa: string | null;
  cidade: string | null;
  uf: string | null;
  ramo: string | null;
  especialidade: string | null;
  instagram: string | null;
  site: string | null;
  desde: string;
  aprovado: boolean;
};

export type Reputacao = {
  produtos: number;
  avaliacoes: number;
  nota: number | null;
  vendas: number;
};

/** O vendedor de um produto, quando ele tem página. */
export function vendedorDoProduto(
  origin: string,
  sellerId: string | null,
): { tipo: TipoDeVendedor; id: string } | null {
  if (!sellerId) return null;
  if (origin === "partner") return { tipo: "partner", id: sellerId };
  if (origin === "professional") return { tipo: "professional", id: sellerId };
  // Produto da própria FitMind não tem página de vendedor: a loja é a FitMind.
  return null;
}

export async function carregarVendedor(
  tipo: TipoDeVendedor,
  id: string,
): Promise<Vendedor | null> {
  const { data, error } = await supabase.rpc("vendedor_publico" as never, {
    _tipo: tipo,
    _id: id,
  } as never);

  if (error) {
    console.error("[vendedor] não foi possível carregar", error);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  return (linha as Vendedor) ?? null;
}

export async function carregarReputacao(
  tipo: TipoDeVendedor,
  id: string,
): Promise<Reputacao | null> {
  const { data, error } = await supabase.rpc("reputacao_do_vendedor" as never, {
    _tipo: tipo,
    _id: id,
  } as never);

  if (error) {
    console.warn("[vendedor] não foi possível ler a reputação", error);
    return null;
  }
  const linha = Array.isArray(data) ? data[0] : data;
  if (!linha) return null;
  const r = linha as Record<string, unknown>;
  return {
    produtos: Number(r.produtos ?? 0),
    avaliacoes: Number(r.avaliacoes ?? 0),
    nota: r.nota == null ? null : Number(r.nota),
    vendas: Number(r.vendas ?? 0),
  };
}

export type ProdutoDoVendedor = {
  /** Id no formato do catálogo unificado — é o que abre o produto na vitrine. */
  id: string;
  titulo: string;
  preco: number;
  precoOriginal: number | null;
  imagem: string | null;
  gratuito: boolean;
};

/**
 * Os produtos deste vendedor, e só eles.
 *
 * A primeira versão desta página chamava `loadUnifiedCatalog` — as cinco
 * leituras paginadas, os 1.911 produtos, a resolução de nome de vendedor — para
 * depois filtrar por `sellerId` no navegador e ficar com uma dúzia. A espera
 * caía justamente sobre quem clicou no vendedor porque estava decidindo comprar.
 */
export async function carregarProdutosDoVendedor(
  tipo: TipoDeVendedor,
  id: string,
): Promise<ProdutoDoVendedor[]> {
  const { data, error } = await supabase.rpc("produtos_do_vendedor" as never, {
    _tipo: tipo,
    _id: id,
  } as never);

  if (error) {
    console.error("[vendedor] não foi possível carregar os produtos", error);
    return [];
  }

  return ((data as unknown as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    titulo: String(r.titulo || ""),
    preco: Number(r.preco || 0),
    precoOriginal: r.preco_original == null ? null : Number(r.preco_original),
    imagem: (r.imagem as string) || null,
    gratuito: r.gratuito === true,
  }));
}

/** "vende há 8 meses" diz mais que uma data. */
export function tempoDeCasa(desde: string): string {
  const inicio = new Date(desde).getTime();
  if (!Number.isFinite(inicio)) return "";
  const meses = Math.floor((Date.now() - inicio) / (30 * 24 * 60 * 60 * 1000));
  if (meses < 1) return "entrou este mês";
  if (meses < 12) return `vende há ${meses} ${meses === 1 ? "mês" : "meses"}`;
  const anos = Math.floor(meses / 12);
  return `vende há ${anos} ${anos === 1 ? "ano" : "anos"}`;
}
