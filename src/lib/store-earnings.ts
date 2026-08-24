/**
 * Quanto o coach ganha vendendo um produto.
 *
 * Cópia do cálculo que vive dentro do `ProductDetailModal` da loja atual
 * (linhas 104-133), trazido para fora porque é aritmética de dinheiro e
 * aritmética de dinheiro merece ficar num lugar onde se possa conferir.
 *
 * Duas fontes, nesta ordem de confiança:
 *
 * 1. **Valores absolutos do motor de slots** (`listProductsWithRealEarnings`).
 *    São a sobra real, já descontadas taxas e custos. Quando existem, mandam.
 * 2. **Percentuais da própria linha do produto** (`commission_coach` e irmãos),
 *    aplicados sobre o líquido. É fallback: cobre o que o motor de slots não
 *    alcança, porque ele só enxerga a tabela `products`.
 *
 * PIX e cartão dão números diferentes de propósito: PIX não paga taxa de
 * cartão, então sobra mais. Mostrar um número só esconderia a diferença que o
 * coach usa para decidir como cobrar.
 */

/** As colunas financeiras cruas, como vêm do banco. */
export type ComissaoBruta = {
  commissionCoach: number | null;
  commissionLevel1: number | null;
  commissionLevel2: number | null;
  commissionLevel3: number | null;
  /** Absolutos do motor de slots — PIX. */
  commissionCoachAbsolute: number | null;
  commissionLevel1Absolute: number | null;
  commissionLevel2Absolute: number | null;
  commissionLevel3Absolute: number | null;
  /** Absolutos do motor de slots — cartão. */
  commissionCoachAbsoluteCard: number | null;
  commissionLevel1AbsoluteCard: number | null;
  commissionLevel2AbsoluteCard: number | null;
  commissionLevel3AbsoluteCard: number | null;
  /** Custos e taxas, para o fallback por percentual. */
  appFee: number | null;
  appFeePercentage: number | null;
  cardFeePercentage: number | null;
  taxPercentage: number | null;
  cost: number | null;
  otherCosts: number | null;
};

export type Ganhos = {
  coachPix: number;
  coachCard: number;
  l1Pix: number; l2Pix: number; l3Pix: number;
  l1Card: number; l2Card: number; l3Card: number;
  /** Níveis que sobram para o próprio coach quando ele não tem upline. */
  extraPix: number;
  extraCard: number;
  totalPix: number;
  totalCard: number;
};

/**
 * A guarda é por DADO, não por papel.
 *
 * Isso é herdado de propósito: as colunas financeiras só descem para o
 * navegador quando a consulta pede, e a consulta só pede em modo coach. Se um
 * dia descerem para aluno, é a consulta que está errada — não esta função.
 */
export function temDadosDeComissao(c: ComissaoBruta | null | undefined): boolean {
  if (!c) return false;
  return c.commissionCoach != null
    || c.commissionCoachAbsolute != null
    || c.commissionLevel1 != null
    || c.commissionLevel2 != null
    || c.commissionLevel3 != null;
}

const n = (v: number | null | undefined): number => Number(v || 0);

/** Absoluto do motor de slots quando existe; senão, percentual sobre o líquido. */
const escolher = (absoluto: number | null | undefined, pct: number, base: number): number =>
  absoluto != null ? Number(absoluto) : (base * pct) / 100;

export function calcularGanhos(
  price: number,
  c: ComissaoBruta | null | undefined,
  hasUpline: boolean,
): Ganhos | null {
  if (!temDadosDeComissao(c) || !c) return null;

  const preco = Number(price || 0);
  const taxaFixa = n(c.appFee);
  const pctApp = n(c.appFeePercentage);
  const pctCartao = n(c.cardFeePercentage);
  const pctImposto = n(c.taxPercentage);
  const custos = n(c.cost) + n(c.otherCosts);

  // O líquido do cartão é menor porque só ele paga a taxa de cartão.
  const liquidoCartao = Math.max(0, preco - (taxaFixa + (preco * (pctApp + pctCartao + pctImposto)) / 100 + custos));
  const liquidoPix = Math.max(0, preco - (taxaFixa + (preco * (pctApp + pctImposto)) / 100 + custos));

  const pctCoach = n(c.commissionCoach);
  const pct1 = n(c.commissionLevel1);
  const pct2 = n(c.commissionLevel2);
  const pct3 = n(c.commissionLevel3);

  const coachPix = escolher(c.commissionCoachAbsolute, pctCoach, liquidoPix);
  const coachCard = escolher(c.commissionCoachAbsoluteCard, pctCoach, liquidoCartao);
  const l1Pix = escolher(c.commissionLevel1Absolute, pct1, liquidoPix);
  const l2Pix = escolher(c.commissionLevel2Absolute, pct2, liquidoPix);
  const l3Pix = escolher(c.commissionLevel3Absolute, pct3, liquidoPix);
  const l1Card = escolher(c.commissionLevel1AbsoluteCard, pct1, liquidoCartao);
  const l2Card = escolher(c.commissionLevel2AbsoluteCard, pct2, liquidoCartao);
  const l3Card = escolher(c.commissionLevel3AbsoluteCard, pct3, liquidoCartao);

  // Sem upline, os três níveis não têm para onde subir e ficam com o vendedor.
  const extraPix = hasUpline ? 0 : l1Pix + l2Pix + l3Pix;
  const extraCard = hasUpline ? 0 : l1Card + l2Card + l3Card;

  return {
    coachPix, coachCard,
    l1Pix, l2Pix, l3Pix,
    l1Card, l2Card, l3Card,
    extraPix, extraCard,
    totalPix: coachPix + extraPix,
    totalCard: coachCard + extraCard,
  };
}

/** Linha devolvida por `listProductsWithRealEarnings`, no que nos interessa. */
export type GanhoReal = {
  id: string;
  coachCommission?: number | null;
  networkL1?: number | null;
  networkL2?: number | null;
  networkL3?: number | null;
  coachCommissionCard?: number | null;
  networkL1Card?: number | null;
  networkL2Card?: number | null;
  networkL3Card?: number | null;
};

/**
 * Costura os absolutos do motor de slots por cima das colunas cruas.
 *
 * O motor só cobre a tabela `products`; produto que não estiver no mapa
 * mantém os percentuais e cai no fallback. Por isso a costura é por id e
 * nunca apaga o que já existia.
 */
export function comAbsolutosReais(
  bruta: ComissaoBruta,
  real: GanhoReal | undefined,
): ComissaoBruta {
  if (!real) return bruta;
  return {
    ...bruta,
    commissionCoachAbsolute: real.coachCommission ?? bruta.commissionCoachAbsolute,
    commissionLevel1Absolute: real.networkL1 ?? bruta.commissionLevel1Absolute,
    commissionLevel2Absolute: real.networkL2 ?? bruta.commissionLevel2Absolute,
    commissionLevel3Absolute: real.networkL3 ?? bruta.commissionLevel3Absolute,
    commissionCoachAbsoluteCard: real.coachCommissionCard ?? bruta.commissionCoachAbsoluteCard,
    commissionLevel1AbsoluteCard: real.networkL1Card ?? bruta.commissionLevel1AbsoluteCard,
    commissionLevel2AbsoluteCard: real.networkL2Card ?? bruta.commissionLevel2AbsoluteCard,
    commissionLevel3AbsoluteCard: real.networkL3Card ?? bruta.commissionLevel3AbsoluteCard,
  };
}
