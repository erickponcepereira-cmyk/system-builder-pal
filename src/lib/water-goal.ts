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

export function calcAgeFromBirthdate(birthdate: string | null | undefined): number | null {
  if (!birthdate) return null;
  const d = new Date(birthdate);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  const m = now.getMonth() - d.getMonth();
  if (m < 0 || (m === 0 && now.getDate() < d.getDate())) age--;
  return age >= 0 && age < 130 ? age : null;
}
