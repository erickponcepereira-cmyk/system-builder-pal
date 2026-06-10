// ============================================================
// MOTOR FINANCEIRO DOS PRODUTOS PAGOS DE PARCEIROS/PROFISSIONAIS
// Cálculo em CASCATA (linha a linha), não % do bruto:
//   gross
//   - taxa cartão/pix    (% sobre o RESTANTE corrente)
//   - imposto 6%         (% sobre o RESTANTE corrente)
//   - taxa do sistema    (% sobre o RESTANTE corrente)
//   - comissão coach     (% sobre o RESTANTE corrente)
//   = líquido parceiro
// Dentro da comissão do coach, a rede MLM (3/2/1%) é deduzida
// da própria comissão.
// ============================================================

export type PartnerPaymentMethod = "pix" | "card";
export type PartnerPriceMode = "charge" | "receive";

export interface PartnerFeeConfig {
  systemFeePct: number;
  taxPct: number;
  cardFeePct: number;
  pixFeePct: number;
}

export const DEFAULT_PARTNER_FEES: PartnerFeeConfig = {
  systemFeePct: 5,
  taxPct: 6,
  cardFeePct: 4.98,
  pixFeePct: 0.99,
};

export const COACH_COMMISSION_OPTIONS = [10, 20, 30, 40, 50] as const;
export type CoachCommissionPct = (typeof COACH_COMMISSION_OPTIONS)[number];

// % da comissão do coach destinados à rede
export const NETWORK_SPLIT = { l1: 3, l2: 2, l3: 1 } as const;

const round2 = (n: number) => Math.round(n * 100) / 100;

export interface PartnerBreakdown {
  gross: number;
  paymentFee: number;
  tax: number;
  systemFee: number;
  coachCommission: number;
  networkL1: number;
  networkL2: number;
  networkL3: number;
  coachNet: number;
  partnerNet: number;
}

export function computeFromCharge(
  gross: number,
  coachCommissionPct: CoachCommissionPct,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
): PartnerBreakdown {
  const g = Math.max(0, gross);
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;

  // Cascata linha a linha
  const paymentFee = round2(g * (feePct / 100));
  let remaining = round2(g - paymentFee);

  const tax = round2(remaining * (fees.taxPct / 100));
  remaining = round2(remaining - tax);

  const systemFee = round2(remaining * (fees.systemFeePct / 100));
  remaining = round2(remaining - systemFee);

  // Comissão do coach: % do saldo atual, vai inteira pro coach
  const coachCommission = round2(remaining * (coachCommissionPct / 100));
  const coachNet = coachCommission;
  const afterCoach = round2(remaining - coachCommission);

  // Rede L1/L2/L3: paralelo sobre o saldo APÓS a comissão do coach (modelo admin)
  const networkL1 = round2(afterCoach * (NETWORK_SPLIT.l1 / 100));
  const networkL2 = round2(afterCoach * (NETWORK_SPLIT.l2 / 100));
  const networkL3 = round2(afterCoach * (NETWORK_SPLIT.l3 / 100));

  // Sobra é do parceiro/profissional
  const partnerNet = round2(afterCoach - networkL1 - networkL2 - networkL3);


  return {
    gross: round2(g),
    paymentFee,
    tax,
    systemFee,
    coachCommission,
    networkL1,
    networkL2,
    networkL3,
    coachNet,
    partnerNet,
  };
}

/**
 * Inverso da cascata: dado o líquido desejado para o parceiro, retorna o
 * preço bruto a cobrar. Como funciona simulação de cartão em apps bancários:
 * o cliente paga MAIS para que o parceiro receba o valor desejado.
 *
 * Resolução algébrica direta (não iterativa):
 *   remaining_after_commission = partnerNet / (1 - commPct/100)
 *   remaining_after_system     = remaining_after_commission / (1 - systemFeePct/100)
 *   remaining_after_tax        = remaining_after_system / (1 - taxPct/100)
 *   gross                      = remaining_after_tax / (1 - feePct/100)
 */
export function computeFromReceive(
  desiredNet: number,
  coachCommissionPct: CoachCommissionPct,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
): PartnerBreakdown {
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;
  const net = Math.max(0, desiredNet);

  const commFactor = 1 - coachCommissionPct / 100;
  const systemFactor = 1 - fees.systemFeePct / 100;
  const taxFactor = 1 - fees.taxPct / 100;
  const feeFactor = 1 - feePct / 100;

  if (commFactor <= 0 || systemFactor <= 0 || taxFactor <= 0 || feeFactor <= 0) {
    return computeFromCharge(0, coachCommissionPct, method, fees);
  }

  const afterSystem = net / commFactor;
  const afterTax = afterSystem / systemFactor;
  const afterFee = afterTax / taxFactor;
  const gross = round2(afterFee / feeFactor);
  return computeFromCharge(gross, coachCommissionPct, method, fees);
}
