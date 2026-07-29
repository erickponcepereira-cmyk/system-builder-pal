export type CommissionLike = {
  id?: string | null;
  created_at?: string | null;
  transaction_id?: string | null;
  partner_order_id?: string | null;
  beneficiary_profile_id?: string | null;
  beneficiary_coach_id?: string | null;
  level?: number | null;
  slot_label?: string | null;
  amount?: number | string | null;
  status?: string | null;
  is_referral?: boolean | null;
};

const cents = (v: unknown) => Math.round(Number(v || 0) * 100);

export function dedupeCommissions<T extends CommissionLike>(rows: T[] | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  const ordered = [...(rows || [])].sort((a, b) => String(b.created_at || "").localeCompare(String(a.created_at || "")));
  for (const r of ordered) {
    const source = r.transaction_id ? `tx:${r.transaction_id}` : r.partner_order_id ? `po:${r.partner_order_id}` : `row:${r.id || Math.random()}`;
    const key = [
      source,
      r.beneficiary_profile_id || "",
      r.beneficiary_coach_id || "",
      Number(r.level || 0),
      String(r.slot_label || "").trim().toLowerCase(),
      String(r.status || ""),
      r.is_referral ? "ref" : "sale",
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

export type PointLogLike = {
  id?: string | null;
  coach_id?: string | null;
  transaction_id?: string | null;
  product_id?: string | null;
  points?: number | string | null;
  reason?: string | null;
};

export function dedupePointLogs<T extends PointLogLike>(rows: T[] | null | undefined): T[] {
  const seen = new Set<string>();
  const out: T[] = [];
  for (const r of rows || []) {
    if (!r.transaction_id) { out.push(r); continue; }
    const key = [r.coach_id || "", r.transaction_id, r.product_id || "", cents(r.points), String(r.reason || "")].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(r);
  }
  return out;
}

/**
 * Toda compra na loja grava duas linhas: `store_orders` + uma `transactions`
 * espelho com `purchase_type = 'store_order'`. Somar as duas fontes dobra o
 * faturamento. Use este filtro sempre que somar transações junto de pedidos.
 */
export const NON_MIRRORED_TX_FILTER = "purchase_type.is.null,purchase_type.neq.store_order";

export function isMirroredStoreOrderTx(purchaseType: string | null | undefined) {
  return purchaseType === "store_order";
}


/**
 * Classificação única de "comissão de rede" usada pelo painel Financeiro e
 * pelos relatórios. Parte das comissões antigas gravou `level = 0` mesmo sendo
 * Linha/Upline 1-3; sem isso elas apareciam como comissão de coach.
 * Exceção: rótulos "(sem upline → vendedor)" caem para o próprio vendedor.
 */
export function isNetworkCommissionRow(level: unknown, slotLabel: unknown) {
  if (Number(level || 0) > 0) return true;
  const s = String(slotLabel || "").toLowerCase();
  if (s.includes("sem upline")) return false;
  return /(^|\s)(linha|upline)\s*[0-9]+/.test(s);
}
