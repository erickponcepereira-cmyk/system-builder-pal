export type CommissionLike = {
  id?: string | null;
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
  for (const r of rows || []) {
    const source = r.transaction_id ? `tx:${r.transaction_id}` : r.partner_order_id ? `po:${r.partner_order_id}` : `row:${r.id || Math.random()}`;
    const key = [
      source,
      r.beneficiary_profile_id || "",
      r.beneficiary_coach_id || "",
      Number(r.level || 0),
      String(r.slot_label || "").trim().toLowerCase(),
      cents(r.amount),
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