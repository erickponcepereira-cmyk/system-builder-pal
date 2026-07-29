/**
 * Datas de cobrança recorrente.
 *
 * Somar meses direto em uma data com dia alto transborda em JS
 * (31/01 + 1 mês = 03/03), o que faz a assinatura PULAR um mês.
 * Por isso normalizamos o dia para 1 antes de somar e só depois
 * aplicamos o dia de cobrança, limitado ao último dia do mês.
 */

export function addMonthsSafe(date: Date, months: number, day: number) {
  const year = date.getFullYear();
  const month = date.getMonth();
  const target = new Date(year, month + months, 1);
  const lastDay = new Date(target.getFullYear(), target.getMonth() + 1, 0).getDate();
  target.setDate(Math.min(Math.max(1, day), lastDay));
  return target;
}

function toISODate(d: Date) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

/** Próxima data de cobrança (YYYY-MM-DD) a partir de `from`. */
export function nextChargeDate(
  sub: { interval_type: string; billing_day: number },
  from: Date = new Date(),
) {
  const months = sub.interval_type === "yearly" ? 12 : 1;
  const day = Number(sub.billing_day) || from.getDate();
  return toISODate(addMonthsSafe(from, months, day));
}

export { toISODate };
