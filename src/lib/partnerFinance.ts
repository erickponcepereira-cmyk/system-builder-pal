// ============================================================
// MOTOR FINANCEIRO DOS PRODUTOS PAGOS DE PARCEIROS/PROFISSIONAIS
// Suporta cascata padrão + overrides por produto (custom_split).
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

// % da comissão do coach destinados à rede (default)
export const NETWORK_SPLIT: { l1: number; l2: number; l3: number } = { l1: 3, l2: 2, l3: 1 };

/**
 * Alinha os padroes do front com a taxa vigente do banco.
 *
 * Estes numeros viviam cravados aqui E dentro de seis funcoes SQL. Enquanto
 * fossem duas copias, mudar a taxa num lugar so fazia a tela mostrar um valor
 * e a venda cobrar outro. Agora o SQL le taxas_vigentes e o front le daqui,
 * alimentado por esta funcao.
 *
 * A mutacao e proposital: os consumidores leem as propriedades na hora do
 * calculo, entao passam a ver o valor novo sem precisar de re-render.
 *
 * Devolve `true` se algum numero mudou. Quem chama usa isso para mandar a tela
 * recalcular: mutar o objeto nao dispara re-render sozinho, entao uma tela que
 * ja renderizou antes de a taxa chegar continuaria exibindo o numero velho.
 */
export function aplicarTaxasVigentes(t: Record<string, unknown> | null | undefined): boolean {
  if (!t) return false;
  const num = (v: unknown): number | null => {
    if (v === null || v === undefined || v === "") return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  };
  const cartao = num(t.maquininha_cartao);
  const pix = num(t.maquininha_pix);
  const imposto = num(t.imposto_pct);
  const sistema = num(t.sistema_pct);
  const l1 = num(t.rede_l1_pct);
  const l2 = num(t.rede_l2_pct);
  const l3 = num(t.rede_l3_pct);
  let mudou = false;
  const set = (alvo: Record<string, number>, chave: string, valor: number | null) => {
    if (valor === null || alvo[chave] === valor) return;
    alvo[chave] = valor;
    mudou = true;
  };
  const fees = DEFAULT_PARTNER_FEES as unknown as Record<string, number>;
  const rede = NETWORK_SPLIT as unknown as Record<string, number>;
  set(fees, "cardFeePct", cartao);
  set(fees, "pixFeePct", pix);
  set(fees, "taxPct", imposto);
  set(fees, "systemFeePct", sistema);
  set(rede, "l1", l1);
  set(rede, "l2", l2);
  set(rede, "l3", l3);
  return mudou;
}

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
  // Contexto para a UI
  taxPct: number;
  systemFeePct: number;
  coachCommissionPct: number;
  networkL1Pct: number;
  networkL2Pct: number;
  networkL3Pct: number;
}

/**
 * Override por produto: espelha `create_partner_product_order` no banco.
 */
export interface PartnerSplitOverride {
  skipTax?: boolean;
  systemFeePctOverride?: number | null;
  /** Taxa do sistema em R$ (tem prioridade sobre o percentual). */
  systemFeeAmountOverride?: number | null;
  creatorPctOverride?: number | null; // % do criador; cadeia = 100 - creator
  networkL1PctOverride?: number | null;
  networkL2PctOverride?: number | null;
  networkL3PctOverride?: number | null;
}

function resolveCfg(
  fees: PartnerFeeConfig,
  coachPct: number,
  split?: PartnerSplitOverride | null,
) {
  const active = !!split;
  const taxPct = active && split?.skipTax ? 0 : fees.taxPct;
  const systemFeePct = active && split?.systemFeePctOverride != null
    ? Number(split.systemFeePctOverride) : fees.systemFeePct;
  const systemFeeAmount = active && split?.systemFeeAmountOverride != null
    ? Math.max(0, Number(split.systemFeeAmountOverride)) : null;
  const l1Pct = active && split?.networkL1PctOverride != null
    ? Number(split.networkL1PctOverride) : NETWORK_SPLIT.l1;
  const l2Pct = active && split?.networkL2PctOverride != null
    ? Number(split.networkL2PctOverride) : NETWORK_SPLIT.l2;
  const l3Pct = active && split?.networkL3PctOverride != null
    ? Number(split.networkL3PctOverride) : NETWORK_SPLIT.l3;
  const coachPctEffective = active && split?.creatorPctOverride != null
    ? Math.max(0, 100 - Number(split.creatorPctOverride))
    : coachPct;
  return { taxPct, systemFeePct, systemFeeAmount, l1Pct, l2Pct, l3Pct, coachPctEffective };
}


export function computeFromCharge(
  gross: number,
  coachCommissionPct: CoachCommissionPct | number,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
  split?: PartnerSplitOverride | null,
): PartnerBreakdown {
  const g = Math.max(0, gross);
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;
  const cfg = resolveCfg(fees, Number(coachCommissionPct), split);

  const paymentFee = round2(g * (feePct / 100));
  let remaining = round2(g - paymentFee);

  const tax = round2(remaining * (cfg.taxPct / 100));
  remaining = round2(remaining - tax);

  const baseForSystem = remaining;
  const systemFee = cfg.systemFeeAmount != null
    ? round2(Math.min(cfg.systemFeeAmount, Math.max(0, baseForSystem)))
    : round2(remaining * (cfg.systemFeePct / 100));
  const systemFeePctEffective = baseForSystem > 0
    ? Math.round((systemFee / baseForSystem) * 10000) / 100
    : cfg.systemFeePct;
  remaining = round2(remaining - systemFee);


  const coachCommission = round2(remaining * (cfg.coachPctEffective / 100));

  const networkL1 = round2(coachCommission * (cfg.l1Pct / 100));
  const networkL2 = round2(coachCommission * (cfg.l2Pct / 100));
  const networkL3 = round2(coachCommission * (cfg.l3Pct / 100));
  const coachNet = round2(coachCommission - networkL1 - networkL2 - networkL3);

  const partnerNet = round2(remaining - coachCommission);

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
    taxPct: cfg.taxPct,
    systemFeePct: systemFeePctEffective,
    coachCommissionPct: cfg.coachPctEffective,
    networkL1Pct: cfg.l1Pct,
    networkL2Pct: cfg.l2Pct,
    networkL3Pct: cfg.l3Pct,
  };
}

/**
 * Inverso: dado o líquido desejado do parceiro, retorna a cascata equivalente.
 */
export function computeFromReceive(
  desiredNet: number,
  coachCommissionPct: CoachCommissionPct | number,
  method: PartnerPaymentMethod = "card",
  fees: PartnerFeeConfig = DEFAULT_PARTNER_FEES,
  split?: PartnerSplitOverride | null,
): PartnerBreakdown {
  const feePct = method === "pix" ? fees.pixFeePct : fees.cardFeePct;
  const net = Math.max(0, desiredNet);
  const cfg = resolveCfg(fees, Number(coachCommissionPct), split);

  const commFactor = 1 - cfg.coachPctEffective / 100;
  const systemFactor = 1 - cfg.systemFeePct / 100;
  const taxFactor = 1 - cfg.taxPct / 100;
  const feeFactor = 1 - feePct / 100;

  if (commFactor <= 0 || systemFactor <= 0 || taxFactor <= 0 || feeFactor <= 0) {
    return computeFromCharge(0, coachCommissionPct, method, fees, split);
  }

  const afterSystem = net / commFactor;
  const afterTax = cfg.systemFeeAmount != null
    ? afterSystem + cfg.systemFeeAmount
    : afterSystem / systemFactor;
  const afterFee = afterTax / taxFactor;
  const gross = round2(afterFee / feeFactor);


  return computeFromCharge(gross, coachCommissionPct, method, fees, split);
}
