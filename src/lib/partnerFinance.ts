// ============================================================
// MOTOR FINANCEIRO DOS PRODUTOS PAGOS DE PARCEIROS
// Mesmo sistema do admin: taxas → comissão coach → rede MLM
// ============================================================

export type PartnerPaymentMethod = "pix" | "card";
export type PartnerPriceMode = "charge" | "receive";

export interface PartnerFeeConfig {
  systemFeeFixed: number;    // R$ 20 por transação
  taxPct: number;            // 6%
  cardFeePct: number;        // 4,98%
  pixFeePct: number;         // 0,99%
}

export const DEFAULT_PARTNER_FEES: PartnerFeeConfig = {
  systemFeeFixed: 20,
  taxPct: 6,
  cardFeePct: 4.98,
  pixFeePct: 0.99,
};

export const COACH_COMMISSION_OPTIONS = [10, 20, 30] as const;
export type CoachCommissionPct = (typeof COACH_COMMISSION_OPTIONS)[number];

// Distribuição da rede (sobre o valor da comissão do coach vendedor)
export const NETWORK_SPLIT = { l1: 3, l2: 2, l3: 1 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PartnerBreakdown {
  gross: number;              // bruto cobrado do cliente
  paymentFee: number;         // taxa de gateway (pior caso = cartão)
  tax: number;                // imposto
  systemFee: number;          // taxa fixa do sistema
  coachCommission: number;    // valor total da comissão do coach (bruto)
  networkL1: number;          // 3% do gross para 1ª linha
  networkL2: number;          // 2% do gross para 2ª linha
  networkL3: number;          // 1% do gross para 3ª linha
  coachNet: number;           // comissão líquida do coach vendedor
  partnerNet: number;         // o que sobra para o parceiro
}

/**
 * Calcula o breakdown a partir do bruto (preço cobrado do cliente).
 * Cenário pior (cartão) por padrão para o parceiro ter previsibilidade.
 */
export function computeFromCharge(
  gross: number,
  coachCommissionPct: CoachCommissionPct,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
): PartnerBreakdown {
  const g = Math.max(0, gross);
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;
  const paymentFee = round2(g * (feePct / 100));
  const tax = round2(g * (fees.taxPct / 100));
  const systemFee = fees.systemFeeFixed;
  const coachCommission = round2(g * (coachCommissionPct / 100));
  // Rede é calculada sobre a comissão do coach
  const networkL1 = round2(coachCommission * (NETWORK_SPLIT.l1 / coachCommissionPct) * (coachCommissionPct / 100) * 0); // placeholder removed below
  // Spec: rede = % do BRUTO (3/2/1%) — sai do bolo da comissão
  const nL1 = round2(g * (NETWORK_SPLIT.l1 / 100));
  const nL2 = round2(g * (NETWORK_SPLIT.l2 / 100));
  const nL3 = round2(g * (NETWORK_SPLIT.l3 / 100));
  const coachNet = round2(coachCommission - nL1 - nL2 - nL3);
  const partnerNet = round2(g - paymentFee - tax - systemFee - coachCommission);
  // network values are within coachCommission, so partner is unaffected
  void networkL1;
  return {
    gross: g,
    paymentFee,
    tax,
    systemFee,
    coachCommission,
    networkL1: nL1,
    networkL2: nL2,
    networkL3: nL3,
    coachNet,
    partnerNet,
  };
}

/**
 * Inverte: dado quanto o parceiro quer RECEBER líquido, retorna o preço
 * bruto a cobrar do cliente. Aproximação iterativa (5 iterações basta).
 */
export function computeFromReceive(
  desiredNet: number,
  coachCommissionPct: CoachCommissionPct,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
): PartnerBreakdown {
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;
  // partnerNet = g - g*feePct - g*taxPct - systemFee - g*commPct
  // partnerNet = g * (1 - (feePct + taxPct + commPct)/100) - systemFee
  // g = (partnerNet + systemFee) / (1 - (feePct + taxPct + commPct)/100)
  const denom = 1 - (feePct + fees.taxPct + coachCommissionPct) / 100;
  const gross = denom > 0 ? round2((Math.max(0, desiredNet) + fees.systemFeeFixed) / denom) : 0;
  return computeFromCharge(gross, coachCommissionPct, method, fees);
}
