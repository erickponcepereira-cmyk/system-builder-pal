// Regras de bônus por compra de produto de parceiro / profissional.
// Mantém paridade exata com a função SQL public.compute_partner_product_benefits().
export type PartnerProductBenefits = {
  cardDays: number;
  challengeTickets: number;
};

export function computePartnerProductBenefits(price: number): PartnerProductBenefits {
  const p = Number(price) || 0;
  if (p >= 1000) return { cardDays: 90, challengeTickets: 3 };
  if (p >= 500) return { cardDays: 60, challengeTickets: 2 };
  if (p > 150) return { cardDays: 30, challengeTickets: 1 };
  if (p >= 100) return { cardDays: 15, challengeTickets: 0 };
  return { cardDays: 7, challengeTickets: 0 };
}

// 1 ponto a cada R$2 de taxa de sistema; mínimo de R$2; arredonda pra baixo.
export function computeSystemFeePoints(systemFee: number): number {
  const f = Number(systemFee) || 0;
  if (f < 2) return 0;
  return Math.floor(f / 2);
}
