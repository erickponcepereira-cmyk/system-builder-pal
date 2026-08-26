/**
 * Filtros da vitrine.
 *
 * O que decide o desenho aqui é o tamanho do catálogo: são mais de mil e
 * quinhentos produtos de quatro fontes diferentes. Busca resolve quem sabe o
 * nome; filtro resolve quem sabe o que quer mas não como se chama.
 *
 * Duas escolhas que evitam os problemas de sempre:
 *
 * 1. **Faixa de preço em degraus, não em campo livre.** Campo de mínimo e
 *    máximo parece mais poderoso e é usado por quase ninguém: exige digitar
 *    dois números antes de ver qualquer resultado. Degrau é um toque.
 *
 * 2. **Filtro que zeraria a lista não some — fica desabilitado com o motivo.**
 *    O pior filtro é o que devolve vazio sem explicar: a pessoa conclui que a
 *    loja não tem o produto, quando na verdade ela mesma o excluiu.
 */

import type { UnifiedOrigin, UnifiedProduct } from "@/lib/unified-store";

export type Ordenacao = "relevancia" | "menor-preco" | "maior-preco" | "nome";

export type FiltrosDaLoja = {
  ordenacao: Ordenacao;
  /** Índice em `FAIXAS`, ou `null` para qualquer preço. */
  faixa: number | null;
  origens: UnifiedOrigin[];
  soGratuitos: boolean;
  comCarteirinha: boolean;
  comTickets: boolean;
};

export const FILTROS_VAZIOS: FiltrosDaLoja = {
  ordenacao: "relevancia",
  faixa: null,
  origens: [],
  soGratuitos: false,
  comCarteirinha: false,
  comTickets: false,
};

export const FAIXAS: Array<{ rotulo: string; min: number; max: number | null }> = [
  { rotulo: "Até R$ 50", min: 0, max: 50 },
  { rotulo: "R$ 50 a 150", min: 50, max: 150 },
  { rotulo: "R$ 150 a 300", min: 150, max: 300 },
  { rotulo: "Acima de R$ 300", min: 300, max: null },
];

export const ORDENS: Array<{ id: Ordenacao; rotulo: string }> = [
  { id: "relevancia", rotulo: "Relevância" },
  { id: "menor-preco", rotulo: "Menor preço" },
  { id: "maior-preco", rotulo: "Maior preço" },
  { id: "nome", rotulo: "Nome" },
];

export const ROTULO_ORIGEM: Record<UnifiedOrigin, string> = {
  fitmind: "FitMind",
  partner: "Parceiro",
  professional: "Profissional",
};

/** Quantos filtros estão ligados. É o número no selo do botão. */
export function contarFiltros(f: FiltrosDaLoja): number {
  return (
    (f.faixa !== null ? 1 : 0)
    + (f.origens.length > 0 ? 1 : 0)
    + (f.soGratuitos ? 1 : 0)
    + (f.comCarteirinha ? 1 : 0)
    + (f.comTickets ? 1 : 0)
  );
}

/**
 * Aplica os filtros. A ordenação NÃO entra aqui.
 *
 * Separadas porque a vitrine já tem uma ordem própria — a de recomendação, que
 * pesa compra anterior, escassez e rede. Enquanto a ordenação for
 * "relevância", essa ordem é a que vale e não deve ser sobrescrita.
 */
export function aplicarFiltros(
  produtos: UnifiedProduct[],
  f: FiltrosDaLoja,
): UnifiedProduct[] {
  const faixa = f.faixa !== null ? FAIXAS[f.faixa] : null;

  return produtos.filter((p) => {
    if (f.soGratuitos && !p.isFreebie) return false;
    if (f.comCarteirinha && p.cardDays <= 0) return false;
    if (f.comTickets && p.challengeTickets <= 0) return false;
    if (f.origens.length > 0 && !f.origens.includes(p.origin)) return false;

    if (faixa) {
      // Gratuito não tem preço para comparar: sai de qualquer faixa, e é o que
      // a pessoa espera — quem filtra "R$ 50 a 150" não está procurando algo
      // de graça.
      if (p.isFreebie) return false;
      const preco = p.isPriceRange && p.minPrice != null ? p.minPrice : p.price;
      if (preco < faixa.min) return false;
      if (faixa.max !== null && preco > faixa.max) return false;
    }

    return true;
  });
}

/** Ordena uma lista já filtrada. "Relevância" devolve a ordem que chegou. */
export function ordenar(produtos: UnifiedProduct[], ordenacao: Ordenacao): UnifiedProduct[] {
  if (ordenacao === "relevancia") return produtos;
  const copia = [...produtos];
  switch (ordenacao) {
    case "menor-preco":
      return copia.sort((a, b) => precoDeOrdem(a) - precoDeOrdem(b));
    case "maior-preco":
      return copia.sort((a, b) => precoDeOrdem(b) - precoDeOrdem(a));
    case "nome":
      return copia.sort((a, b) => a.title.localeCompare(b.title, "pt-BR"));
    default:
      return copia;
  }
}

/** Produto de faixa ordena pelo mínimo: é o número que a pessoa comparou. */
const precoDeOrdem = (p: UnifiedProduct): number =>
  p.isFreebie ? 0 : (p.isPriceRange && p.minPrice != null ? p.minPrice : p.price);

/**
 * Quais filtros deixariam a lista vazia, dado o catálogo atual.
 *
 * Serve para desabilitar a opção em vez de deixar a pessoa escolher e receber
 * "nada encontrado" sem entender por quê.
 */
export function opcoesUteis(produtos: UnifiedProduct[]) {
  return {
    temGratuitos: produtos.some((p) => p.isFreebie),
    temCarteirinha: produtos.some((p) => p.cardDays > 0),
    temTickets: produtos.some((p) => p.challengeTickets > 0),
    origens: (["fitmind", "partner", "professional"] as UnifiedOrigin[])
      .filter((o) => produtos.some((p) => p.origin === o)),
    faixas: FAIXAS.map((faixa) =>
      produtos.some((p) => {
        if (p.isFreebie) return false;
        const preco = p.isPriceRange && p.minPrice != null ? p.minPrice : p.price;
        return preco >= faixa.min && (faixa.max === null || preco <= faixa.max);
      })),
  };
}

/** As três abas da vitrine. Gratuito e pago não dividem grade. */
export type AbaDaLoja = "tudo" | "comprar" | "gratuitos";

export function aplicarAba(produtos: UnifiedProduct[], aba: AbaDaLoja): UnifiedProduct[] {
  if (aba === "comprar") return produtos.filter((p) => !p.isFreebie);
  if (aba === "gratuitos") return produtos.filter((p) => p.isFreebie);
  return produtos;
}

/**
 * Qual filtro está deixando a lista vazia.
 *
 * Estado vazio sem motivo é o pior resultado possível: a pessoa conclui que a
 * loja não tem o produto quando na verdade ela mesma o excluiu. Devolve o
 * rótulo do primeiro filtro que, sozinho, explica o vazio.
 */
export function motivoDoVazio(
  antes: UnifiedProduct[],
  f: FiltrosDaLoja,
): string | null {
  if (antes.length === 0) return null;
  const testes: Array<{ rotulo: string; f: FiltrosDaLoja }> = [];
  if (f.faixa !== null) testes.push({ rotulo: `faixa de preço "${FAIXAS[f.faixa].rotulo}"`, f: { ...f, faixa: null } });
  if (f.origens.length > 0) testes.push({ rotulo: "filtro de origem", f: { ...f, origens: [] } });
  if (f.soGratuitos) testes.push({ rotulo: "filtro de gratuitos", f: { ...f, soGratuitos: false } });
  if (f.comCarteirinha) testes.push({ rotulo: "filtro de carteirinha", f: { ...f, comCarteirinha: false } });
  if (f.comTickets) testes.push({ rotulo: "filtro de tickets", f: { ...f, comTickets: false } });
  for (const t of testes) {
    if (aplicarFiltros(antes, t.f).length > 0) return t.rotulo;
  }
  return testes.length > 0 ? "os filtros aplicados" : null;
}

