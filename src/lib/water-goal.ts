// Cálculo automático de meta diária de água
// Fórmula:
//   até 17 anos: peso × 40ml + 1000ml (exercício + calor regional)
//   18 a 64 anos: peso × 35ml + 1000ml
//   65+ anos: peso × 30ml + 1000ml

const FIXED_BONUS_ML = 1000;

export function getWaterFactor(ageYears: number | null | undefined): number {
  if (ageYears == null) return 35; // default adulto
  if (ageYears <= 17) return 40;
  if (ageYears >= 65) return 30;
  return 35;
}

export function calcWaterGoalMl(
  weightKg: number | null | undefined,
  ageYears: number | null | undefined,
): number | null {
  if (!weightKg || weightKg <= 0) return null;
  const factor = getWaterFactor(ageYears);
  return Math.round(weightKg * factor + FIXED_BONUS_ML);
}

export function describeWaterFormula(
  weightKg: number | null | undefined,
  ageYears: number | null | undefined,
): string {
  if (!weightKg) return "Informe o peso (bioimpedância) para calcular.";
  const factor = getWaterFactor(ageYears);
  const total = calcWaterGoalMl(weightKg, ageYears) ?? 0;
  const ageLabel = ageYears == null
    ? "adulto (padrão)"
    : ageYears <= 17
      ? `${ageYears} anos (até 17)`
      : ageYears >= 65
        ? `${ageYears} anos (65+)`
        : `${ageYears} anos (18–64)`;
  return `${weightKg}kg × ${factor}ml + 1000ml fixos = ${total}ml/dia · faixa ${ageLabel}`;
}

/**
 * Parse a birth date string in ISO (YYYY-MM-DD) or Brazilian (DD/MM/YYYY)
 * format without applying any timezone shift.
 * Returns a Date at UTC midnight or null when the input is invalid.
 */
export function parseBirthDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const s = String(input).trim();
  if (!s) return null;

  // DD/MM/YYYY or DD-MM-YYYY
  const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{2,4})$/);
  if (dmy) {
    const day = parseInt(dmy[1], 10);
    const month = parseInt(dmy[2], 10);
    let year = parseInt(dmy[3], 10);
    if (year < 100) year += year >= 30 ? 1900 : 2000;
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null;
    return d;
  }

  // YYYY-MM-DD (optionally with time). Take just the date portion.
  const iso = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) {
    const year = parseInt(iso[1], 10);
    const month = parseInt(iso[2], 10);
    const day = parseInt(iso[3], 10);
    if (month < 1 || month > 12 || day < 1 || day > 31) return null;
    const d = new Date(Date.UTC(year, month - 1, day));
    if (d.getUTCDate() !== day || d.getUTCMonth() !== month - 1) return null;
    return d;
  }

  return null;
}

export function calcAgeFromBirthdate(birthdate: string | null | undefined): number | null {
  const d = parseBirthDate(birthdate);
  if (!d) return null;
  const now = new Date();
  // Compare in the user's local calendar to avoid TZ off-by-one on birthdays.
  const nowY = now.getFullYear();
  const nowM = now.getMonth();
  const nowD = now.getDate();
  const bY = d.getUTCFullYear();
  const bM = d.getUTCMonth();
  const bD = d.getUTCDate();
  let age = nowY - bY;
  if (nowM < bM || (nowM === bM && nowD < bD)) age--;
  return age >= 0 && age < 130 ? age : null;
}
