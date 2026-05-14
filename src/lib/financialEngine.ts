// ============================================================
// MOTOR FINANCEIRO FITMIND CLUB
// Calcula a distribuição exata de cada venda
// ============================================================

export type PaymentMethod =
  | "pix"
  | "debit"
  | "credit_1x"
  | "credit_2x"
  | "credit_3x"
  | "credit_6x"
  | "credit_12x";

export const PAYMENT_METHOD_LABEL: Record<PaymentMethod, string> = {
  pix: "PIX",
  debit: "Débito",
  credit_1x: "Crédito 1x",
  credit_2x: "Crédito 2x",
  credit_3x: "Crédito 3x",
  credit_6x: "Crédito 6x",
  credit_12x: "Crédito 12x",
};

export interface PaymentFeeConfig {
  card_fee_percentage: number;
  card_fee_3x12_percentage: number;
  pix_fee_percentage: number;
}

export type SlotValueType = "percentage" | "fixed" | "pct_running";

export interface ValueSlot {
  id: string;
  slot_order: number;
  label: string;
  value_type: SlotValueType;
  value_amount: number;
  destination: string;
  destination_label: string;
  is_blocked_until_delivery: boolean;
  is_system_fee: boolean;
  applies_to_referral_sales: boolean;
  applies_to_student_referral: boolean;
  /** Slots com mesmo slot_group são paralelos: usam o mesmo snapshot do saldo no início do grupo. */
  slot_group?: number | null;
}

export interface ReferralRule {
  enabled: boolean;
  pre_deduction_fixed: number;
  student_referral_percentage: number;
  coach_pool_percentage: number;
}

export type LineType = "deduction" | "distribution" | "tax" | "payment_fee";

export interface DistributionLine {
  label: string;
  destination: string;
  destination_label: string;
  amount: number;
  percentage_of_gross: number;
  is_blocked: boolean;
  blocked_reason?: string;
  redirect_to?: string;
  type: LineType;
}

export interface DistributionResult {
  gross_amount: number;
  payment_method: PaymentMethod;
  payment_fee_amount: number;
  payment_fee_pct: number;
  tax_amount: number;
  tax_pct: number;
  base_distributable: number;
  lines: DistributionLine[];
  total_distributed: number;
  remainder: number;
  is_balanced: boolean;
}

export function getPaymentFeePct(method: PaymentMethod, cfg: PaymentFeeConfig): number {
  if (method === "pix") return cfg.pix_fee_percentage;
  if (method === "debit" || method === "credit_1x" || method === "credit_2x") return cfg.card_fee_percentage;
  return cfg.card_fee_3x12_percentage;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

// ─── VENDA NORMAL ────────────────────────────────────────────
export function calculateDistribution(
  grossAmount: number,
  paymentMethod: PaymentMethod,
  feeConfig: PaymentFeeConfig,
  slots: ValueSlot[],
  taxPct = 6,
): DistributionResult {
  const lines: DistributionLine[] = [];
  const paymentFeePct = getPaymentFeePct(paymentMethod, feeConfig);
  const paymentFeeAmt = round2(grossAmount * (paymentFeePct / 100));

  let remaining = grossAmount - paymentFeeAmt;
  lines.push({
    label: `Taxa ${PAYMENT_METHOD_LABEL[paymentMethod]} (${paymentFeePct}%)`,
    destination: "payment_gateway",
    destination_label: "Gateway de Pagamento",
    amount: -paymentFeeAmt,
    percentage_of_gross: (paymentFeeAmt / grossAmount) * 100,
    is_blocked: false,
    type: "payment_fee",
  });

  const taxAmt = round2(remaining * (taxPct / 100));
  remaining -= taxAmt;
  lines.push({
    label: `Simples Nacional (${taxPct}%)`,
    destination: "government_tax",
    destination_label: "Receita Federal",
    amount: -taxAmt,
    percentage_of_gross: (taxAmt / grossAmount) * 100,
    is_blocked: false,
    type: "tax",
  });

  const baseDistributable = round2(remaining);
  const activeSlots = slots
    .filter((s) => s.applies_to_referral_sales)
    .sort((a, b) => a.slot_order - b.slot_order);

  // Cálculo com suporte a slot_group (paralelo) e pct_running (sobre saldo).
  let runningBalance = baseDistributable;
  let groupSnapshot = baseDistributable;
  let groupTotal = 0;
  let currentGroup: number | null | undefined = -1 as number;
  const slotAmts: number[] = [];

  const flushGroup = () => {
    runningBalance = Math.max(0, runningBalance - groupTotal);
    groupSnapshot = runningBalance;
    groupTotal = 0;
  };

  for (let i = 0; i < activeSlots.length; i++) {
    const slot = activeSlots[i];
    const slotGroup = slot.slot_group ?? null;
    if (slotGroup !== currentGroup) {
      flushGroup();
      currentGroup = slotGroup;
    }
    let amount: number;
    if (slot.value_type === "fixed") amount = slot.value_amount;
    else if (slot.value_type === "pct_running") amount = groupSnapshot * (slot.value_amount / 100);
    else amount = baseDistributable * (slot.value_amount / 100);
    amount = round2(Math.max(0, amount));

    if (slotGroup === null) {
      runningBalance = Math.max(0, runningBalance - amount);
      groupSnapshot = runningBalance;
    } else {
      groupTotal += amount;
    }
    slotAmts.push(amount);
  }
  flushGroup();

  let totalDistributed = 0;
  activeSlots.forEach((slot, i) => {
    const amount = slotAmts[i];
    totalDistributed += amount;
    lines.push({
      label: slot.label,
      destination: slot.destination,
      destination_label: slot.destination_label,
      amount,
      percentage_of_gross: (amount / grossAmount) * 100,
      is_blocked: slot.is_blocked_until_delivery,
      blocked_reason: slot.is_blocked_until_delivery ? "Aguardando entrega do protocolo/dieta" : undefined,
      redirect_to: slot.destination === "product_order_pool" ? "Painel de Pedidos" : undefined,
      type: "distribution",
    });
  });

  const remainder = round2(baseDistributable - totalDistributed);
  return {
    gross_amount: grossAmount,
    payment_method: paymentMethod,
    payment_fee_amount: paymentFeeAmt,
    payment_fee_pct: paymentFeePct,
    tax_amount: taxAmt,
    tax_pct: taxPct,
    base_distributable: baseDistributable,
    lines,
    total_distributed: totalDistributed,
    remainder,
    is_balanced: Math.abs(remainder) < 0.01,
  };
}

// ─── INDICAÇÃO ALUNO → ALUNO ─────────────────────────────────
export interface ReferralDistributionResult {
  studentLine: DistributionLine;
  coach: DistributionResult;
}

export function calculateReferralDistribution(
  grossAmount: number,
  paymentMethod: PaymentMethod,
  feeConfig: PaymentFeeConfig,
  rule: ReferralRule,
  slots: ValueSlot[],
  taxPct = 6,
): ReferralDistributionResult {
  const afterPre = grossAmount - rule.pre_deduction_fixed;
  const studentAmount = round2(afterPre * (rule.student_referral_percentage / 100));
  const coachPool = round2(afterPre * (rule.coach_pool_percentage / 100));

  const studentLine: DistributionLine = {
    label: `Aluno Indicador (${rule.student_referral_percentage}% após taxa fixa)`,
    destination: "referral_student",
    destination_label: "Carteira do Aluno Indicador",
    amount: studentAmount,
    percentage_of_gross: (studentAmount / grossAmount) * 100,
    is_blocked: false,
    type: "distribution",
  };

  const paymentFeePct = getPaymentFeePct(paymentMethod, feeConfig);
  const paymentFeeAmt = round2(grossAmount * (paymentFeePct / 100));
  const taxAmt = round2((grossAmount - paymentFeeAmt) * (taxPct / 100));
  const coachPoolAfterFees = round2(coachPool - paymentFeeAmt - taxAmt);

  const lines: DistributionLine[] = [
    {
      label: `Taxa ${PAYMENT_METHOD_LABEL[paymentMethod]} (${paymentFeePct}% sobre bruto)`,
      destination: "payment_gateway",
      destination_label: "Gateway",
      amount: -paymentFeeAmt,
      percentage_of_gross: (paymentFeeAmt / grossAmount) * 100,
      is_blocked: false,
      type: "payment_fee",
    },
    {
      label: `Simples Nacional ${taxPct}%`,
      destination: "government_tax",
      destination_label: "Receita Federal",
      amount: -taxAmt,
      percentage_of_gross: (taxAmt / grossAmount) * 100,
      is_blocked: false,
      type: "tax",
    },
  ];

  const activeSlots = slots
    .filter((s) => s.applies_to_student_referral)
    .sort((a, b) => a.slot_order - b.slot_order);

  let distributed = 0;
  for (const slot of activeSlots) {
    const amount = round2(
      slot.value_type === "fixed" ? slot.value_amount : coachPoolAfterFees * (slot.value_amount / 100),
    );
    distributed += amount;
    lines.push({
      label: slot.label,
      destination: slot.destination,
      destination_label: slot.destination_label,
      amount,
      percentage_of_gross: (amount / grossAmount) * 100,
      is_blocked: slot.is_blocked_until_delivery,
      type: "distribution",
    });
  }

  return {
    studentLine,
    coach: {
      gross_amount: coachPool,
      payment_method: paymentMethod,
      payment_fee_amount: paymentFeeAmt,
      payment_fee_pct: paymentFeePct,
      tax_amount: taxAmt,
      tax_pct: taxPct,
      base_distributable: coachPoolAfterFees,
      lines,
      total_distributed: distributed,
      remainder: round2(coachPoolAfterFees - distributed),
      is_balanced: Math.abs(coachPoolAfterFees - distributed) < 0.01,
    },
  };
}

// ─── PONTOS ──────────────────────────────────────────────────
/** Calcula pontos a partir do total de "Taxa do Sistema": FLOOR(taxa / 20) * 10. */
export function calculatePointsFromSystemFee(systemFeeTotal: number): number {
  if (!Number.isFinite(systemFeeTotal) || systemFeeTotal <= 0) return 0;
  return Math.floor(systemFeeTotal / 20) * 10;
}

/** Soma o valor (em R$) de todos os slots marcados como is_system_fee. */
export function sumSystemFee(slots: ValueSlot[], productPrice: number): number {
  return slots
    .filter((s) => s.is_system_fee)
    .reduce(
      (acc, s) =>
        acc + (s.value_type === "fixed" ? s.value_amount : productPrice * (s.value_amount / 100)),
      0,
    );
}
