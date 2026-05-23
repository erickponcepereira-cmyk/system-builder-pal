/**
 * ============================================================
 * FITMIND SHAPE — Motor de Cálculo por Medidas Antropométricas
 * ============================================================
 *
 * Substitui a bioimpedância quando o profissional opta por
 * avaliação via fita métrica (medidas virtuais / online).
 *
 * FONTES CIENTÍFICAS:
 *   (A) Lee RC et al. (2000). Total-body skeletal muscle mass.
 *       Am J Clin Nutr 72(3):796–803.
 *   (B) Weltman A et al. (1987/1988). Accurate assessment of
 *       body composition in obese females. Am J Clin Nutr 48(5).
 *   (C) Roza AM & Shizgal HM (1984). The Harris Benedict equation.
 *       Am J Clin Nutr 40(1):168–182. (revisão do Harris-Benedict)
 *   (D) WHO (2000). Waist-hip ratio. Obesity: preventing and managing
 *       the global epidemic. Report of a WHO consultation.
 *   (E) Heyward VH & Stolarczyk LM (2000). Applied Body Composition
 *       Assessment. Human Kinetics.
 * ============================================================
 */

export interface MeasurementInput {
  // ── Dados básicos ─────────────────────────────────────
  weight: number;   // kg
  height: number;   // cm
  age: number;      // anos
  gender: "male" | "female";
  ethnicity: "white" | "black" | "asian" | "hispanic" | "indigenous" | "other";

  // ── Circunferências (cm) ───────────────────────────────
  waist?: number;         // cintura
  abdomen?: number;       // abdômen
  hip?: number;           // quadril
  chest?: number;         // tórax
  leftArm?: number;       // braço esquerdo relaxado
  rightArm?: number;      // braço direito relaxado
  leftForearm?: number;   // antebraço esquerdo
  rightForearm?: number;  // antebraço direito
  leftThigh?: number;     // coxa esquerda medial
  rightThigh?: number;    // coxa direita medial
  leftCalf?: number;      // panturrilha esquerda máxima
  rightCalf?: number;     // panturrilha direita máxima
}

export interface CalculatedResults {
  // ── Básicos ───────────────────────────────────────────
  bmi: number;

  // ── Gordura ───────────────────────────────────────────
  bodyFat: number;        // % gordura corporal
  fatMassKg: number;      // kg de gordura
  leanMassKg: number;     // kg de massa magra

  // ── Músculo Esquelético (Lee et al., 2000) ────────────
  skeletalMuscleKg: number;  // kg (absoluto)
  skeletalMuscle: number;    // % em relação ao peso

  // ── Massa Muscular total estimada ─────────────────────
  muscleMassKg: number;      // kg
  muscleMass: number;        // %

  // ── Metabolismo ───────────────────────────────────────
  basalMetabolism: number;   // kcal/dia (Harris-Benedict revisado)

  // ── RCQ (WHO) ─────────────────────────────────────────
  waistHipRatio: number;
  waistHipRatioClassification: string;
  waistHipRatioRisk: "baixo" | "moderado" | "alto";

  // ── Estimativas derivadas ─────────────────────────────
  bodyWater: number;     // % (estimativa a partir da massa magra)
  boneMass: number;      // % (estimativa populacional)
  bodyAge: number;       // idade corporal estimada (anos)

  // ── Classificação visual (avatar 0–7) ─────────────────
  avatarIndex: number;   // 0=Abaixo … 7=Alto 3
  avatarLabel: string;
  avatarColor: string;

  // ── Flags de confiabilidade ───────────────────────────
  warnings: string[];    // alertas quando faltam dados para fórmulas
}

// ============================================================
// TABELA DE ETNIA para Lee et al. (2000)
// ============================================================
const ETHNICITY_FACTOR: Record<string, number> = {
  white: 0,
  hispanic: 0,
  indigenous: 0,
  black: 1.4,
  asian: -1.2,
  other: 0,
};

// ============================================================
// CLASSIFICAÇÃO AVATAR POR %GORDURA (8 níveis)
// ============================================================
const FAT_AVATAR_MALE = [
  { max: 5,   index: 0, label: "Abaixo",  color: "#60a5fa" },
  { max: 15,  index: 1, label: "Normal",  color: "#22c55e" },
  { max: 20,  index: 2, label: "Acima 1", color: "#a3e635" },
  { max: 25,  index: 3, label: "Acima 2", color: "#facc15" },
  { max: 30,  index: 4, label: "Acima 3", color: "#fb923c" },
  { max: 35,  index: 5, label: "Alto 1",  color: "#f87171" },
  { max: 40,  index: 6, label: "Alto 2",  color: "#ef4444" },
  { max: 999, index: 7, label: "Alto 3",  color: "#b91c1c" },
];

const FAT_AVATAR_FEMALE = [
  { max: 13,  index: 0, label: "Abaixo",  color: "#60a5fa" },
  { max: 22,  index: 1, label: "Normal",  color: "#22c55e" },
  { max: 27,  index: 2, label: "Acima 1", color: "#a3e635" },
  { max: 32,  index: 3, label: "Acima 2", color: "#facc15" },
  { max: 37,  index: 4, label: "Acima 3", color: "#fb923c" },
  { max: 42,  index: 5, label: "Alto 1",  color: "#f87171" },
  { max: 47,  index: 6, label: "Alto 2",  color: "#ef4444" },
  { max: 999, index: 7, label: "Alto 3",  color: "#b91c1c" },
];

// ============================================================
// HELPERS
// ============================================================
const avg = (...vals: (number | undefined)[]): number | undefined => {
  const valid = vals.filter((v): v is number => v !== undefined && Number.isFinite(v));
  if (!valid.length) return undefined;
  return valid.reduce((a, b) => a + b, 0) / valid.length;
};

const round = (v: number, dec = 1) =>
  Math.round(v * Math.pow(10, dec)) / Math.pow(10, dec);

// ============================================================
// FUNÇÃO PRINCIPAL
// ============================================================
export function calculateBodyComposition(input: MeasurementInput): CalculatedResults {
  const warnings: string[] = [];
  const {
    weight, height, age, gender, ethnicity,
    waist, abdomen, hip,
    leftArm, rightArm,
    leftCalf, rightCalf,
    leftThigh, rightThigh,
  } = input;

  const heightM = height / 100;

  // ── 1. IMC ──────────────────────────────────────────────
  const bmi = round(weight / (heightM * heightM));

  // Médias bilaterais (em cm)
  const armCm = avg(leftArm, rightArm);
  const thighCm = avg(leftThigh, rightThigh);
  const calfCm = avg(leftCalf, rightCalf);
  const abdoAvg = avg(waist, abdomen);

  // ── 2. MÚSCULO ESQUELÉTICO — Lee et al. (2000), versão antropométrica ──
  //   SMM(kg) = Altura(m) × (0.00744·CB² + 0.00088·CC² + 0.00441·CP²)
  //             + 2.4·sexo − 0.048·idade + etnia + 7.8
  //   CB/CC/CP em cm. Fallback: equação simplificada por peso/altura.
  const sexScore = gender === "male" ? 1 : 0;
  const ethScore = ETHNICITY_FACTOR[ethnicity] ?? 0;

  let skeletalMuscleKg: number;
  if (armCm !== undefined && thighCm !== undefined && calfCm !== undefined) {
    skeletalMuscleKg =
      heightM *
        (0.00744 * armCm * armCm +
          0.00088 * thighCm * thighCm +
          0.00441 * calfCm * calfCm) +
      2.4 * sexScore -
      0.048 * age +
      ethScore +
      7.8;
  } else {
    // Fallback geral (Lee, versão por massa corporal)
    skeletalMuscleKg =
      0.244 * weight + 7.8 * heightM + 6.6 * sexScore - 0.098 * age + ethScore - 3.3;
    warnings.push(
      "Informe braço, coxa e panturrilha para cálculo de músculo esquelético mais preciso.",
    );
  }
  skeletalMuscleKg = Math.max(5, round(skeletalMuscleKg));
  const skeletalMuscle = round((skeletalMuscleKg / weight) * 100);

  // ── 3. % GORDURA CORPORAL ───────────────────────────────
  // Estratégia (alinhada ao FineShape):
  //  (a) Mulher → Tran & Weltman (1988): densidade corporal a partir de
  //      abdômen, quadril, altura e idade; %BF via Siri (495/BD − 450).
  //  (b) Homem  → Penrose-Nelson-Fisher (1985): LBM a partir de peso e
  //      cintura (polegadas).
  //  (c) Fallback Weltman obeso quando faltar quadril/cintura adequados.
  //  (d) Último recurso: Deurenberg (1991) por IMC.
  let bodyFat = 0;
  const waistOrAbd = waist ?? abdomen;
  const isObeseWaist =
    waistOrAbd !== undefined &&
    ((gender === "female" && waistOrAbd >= 80) || (gender === "male" && waistOrAbd >= 90));

  if (gender === "female" && abdoAvg !== undefined && hip !== undefined && hip > 0) {
    // Tran-Weltman 1988 (mulheres)
    const BD =
      1.168297
      - 0.002824 * abdoAvg
      + 0.0000122098 * abdoAvg * abdoAvg
      - 0.000733128 * hip
      + 0.000510477 * height
      - 0.000216161 * age;
    bodyFat = 495 / BD - 450;
  } else if (gender === "male" && waistOrAbd !== undefined) {
    // Penrose-Nelson-Fisher 1985 (homens) — cintura em polegadas, peso em libras
    const waistIn = waistOrAbd / 2.54;
    const weightLb = weight * 2.20462;
    const lbmLb = 98.42 + 1.082 * weightLb - 4.15 * waistIn;
    const lbmKg = lbmLb / 2.20462;
    bodyFat = ((weight - lbmKg) / weight) * 100;
  } else if (waistOrAbd !== undefined && isObeseWaist) {
    if (gender === "male") {
      bodyFat = 0.31457 * waistOrAbd - 0.10969 * weight + 10.8336;
    } else {
      bodyFat = 0.11077 * waistOrAbd - 0.17666 * height + 0.14354 * weight + 51.03301;
    }
  } else {
    const sexFactor = gender === "male" ? 1 : 0;
    bodyFat = 1.2 * bmi + 0.23 * age - 10.8 * sexFactor - 5.4;
    warnings.push("Cintura/quadril não informados — % gordura estimada pelo IMC (Deurenberg et al.).");
  }
  bodyFat = round(Math.max(3, Math.min(bodyFat, 60)));

  const fatMassKg = round((bodyFat / 100) * weight);
  const leanMassKg = round(weight - fatMassKg);


  // ── 4. MASSA ÓSSEA (estimativa populacional) ─────────────
  // Heyward & Stolarczyk: ~4–5% do peso corporal total.
  const boneMassKgEarly = round(weight * 0.045);

  // ── 5. MASSA MUSCULAR TOTAL ──────────────────────────────
  // Massa magra menos massa óssea (modelo FineShape).
  const muscleMassKg = round(Math.max(0, leanMassKg - boneMassKgEarly));
  const muscleMass = round((muscleMassKg / weight) * 100);

  // ── 5. METABOLISMO BASAL — Harris-Benedict revisado ─────
  //    Roza & Shizgal (1984)
  //    Homens:  88.36 + 13.4×Peso + 4.8×Altura(cm) − 5.7×Idade
  //    Mulheres: 447.6 + 9.2×Peso + 3.1×Altura(cm) − 4.3×Idade
  let basalMetabolism: number;
  if (gender === "male") {
    basalMetabolism = 88.36 + 13.4 * weight + 4.8 * height - 5.7 * age;
  } else {
    basalMetabolism = 447.6 + 9.2 * weight + 3.1 * height - 4.3 * age;
  }
  basalMetabolism = Math.round(basalMetabolism);

  // ── 6. RELAÇÃO CINTURA-QUADRIL (WHO, 2000) ───────────────
  let waistHipRatio = 0;
  let waistHipRatioClassification = "—";
  let waistHipRatioRisk: "baixo" | "moderado" | "alto" = "baixo";

  const waistRef = waist ?? abdomen;
  if (waistRef !== undefined && hip !== undefined && hip > 0) {
    waistHipRatio = round(waistRef / hip, 2);
    if (gender === "male") {
      if (waistHipRatio < 0.90) { waistHipRatioClassification = "Baixo risco"; waistHipRatioRisk = "baixo"; }
      else if (waistHipRatio <= 0.95) { waistHipRatioClassification = "Risco moderado"; waistHipRatioRisk = "moderado"; }
      else { waistHipRatioClassification = "Alto risco"; waistHipRatioRisk = "alto"; }
    } else {
      if (waistHipRatio < 0.80) { waistHipRatioClassification = "Baixo risco"; waistHipRatioRisk = "baixo"; }
      else if (waistHipRatio <= 0.85) { waistHipRatioClassification = "Risco moderado"; waistHipRatioRisk = "moderado"; }
      else { waistHipRatioClassification = "Alto risco"; waistHipRatioRisk = "alto"; }
    }
  } else {
    warnings.push("Informe cintura e quadril para calcular a Relação Cintura-Quadril (RCQ).");
  }

  // ── 7. ÁGUA CORPORAL (estimativa) ───────────────────────
  // Aproximadamente 73% da massa magra é água (Wang et al., 1999).
  const bodyWaterKg = leanMassKg * 0.73;
  const bodyWater = round((bodyWaterKg / weight) * 100);

  // ── 8. MASSA ÓSSEA (já calculada acima, ~4.5% do peso) ───
  const boneMassKg = boneMassKgEarly;
  const boneMass = round((boneMassKg / weight) * 100);

  // ── 9. IDADE CORPORAL ESTIMADA ───────────────────────────
  // Baseada no % gordura vs. ponto médio da faixa saudável ACSM por sexo+idade.
  const acsmForAge = getAcsmBand(gender, age);
  const idealFatMid = (acsmForAge.healthyMin + acsmForAge.healthyMax) / 2;
  const fatDelta = bodyFat - idealFatMid;
  // Cada 1% além do ideal ≈ +0.5 anos de idade corporal (Tanita-like, conservador)
  const bodyAge = Math.round(Math.max(age - 10, Math.min(age + 25, age + fatDelta * 0.5)));

  // ── 10. CLASSIFICAÇÃO AVATAR ─────────────────────────────
  const avatarTable = gender === "male" ? FAT_AVATAR_MALE : FAT_AVATAR_FEMALE;
  const avatarEntry = avatarTable.find((e) => bodyFat <= e.max) ?? avatarTable[avatarTable.length - 1];

  return {
    bmi,
    bodyFat,
    fatMassKg,
    leanMassKg,
    skeletalMuscleKg,
    skeletalMuscle,
    muscleMassKg,
    muscleMass,
    basalMetabolism,
    waistHipRatio,
    waistHipRatioClassification,
    waistHipRatioRisk,
    bodyWater,
    boneMass,
    bodyAge,
    avatarIndex: avatarEntry.index,
    avatarLabel: avatarEntry.label,
    avatarColor: avatarEntry.color,
    warnings,
  };
}

// ============================================================
// FAIXAS DE REFERÊNCIA — ACSM (padrão FineShape) por idade e sexo
// ============================================================
// Fonte: American College of Sports Medicine — Guidelines, tabela de
// composição corporal por faixa etária. Mesma tabela usada pelo FineShape.

type AcsmBand = { healthyMin: number; healthyMax: number; overweightMax: number };

function getAcsmBand(gender: "male" | "female", age: number): AcsmBand {
  if (gender === "male") {
    if (age < 40) return { healthyMin: 8,  healthyMax: 19, overweightMax: 24 };
    if (age < 60) return { healthyMin: 11, healthyMax: 21, overweightMax: 27 };
    return            { healthyMin: 13, healthyMax: 24, overweightMax: 29 };
  }
  if (age < 40) return { healthyMin: 21, healthyMax: 32, overweightMax: 38 };
  if (age < 60) return { healthyMin: 23, healthyMax: 33, overweightMax: 39 };
  return            { healthyMin: 24, healthyMax: 35, overweightMax: 41 };
}

export function getBodyFatReference(gender: "male" | "female", age = 30): string {
  const b = getAcsmBand(gender, age);
  return `${b.healthyMin}–${b.healthyMax}%`;
}

export function getBodyFatHealthyRange(
  gender: "male" | "female",
  age = 30,
): { min: number; max: number } {
  const b = getAcsmBand(gender, age);
  return { min: b.healthyMin, max: b.healthyMax };
}

export function getBodyFatCategoryACSM(
  bodyFat: number,
  gender: "male" | "female",
  age = 30,
): { label: string; eval: "good" | "normal" | "warning" | "danger"; color: string } {
  const b = getAcsmBand(gender, age);
  if (bodyFat < b.healthyMin)
    return { label: "Abaixo do saudável", eval: "warning", color: "#60a5fa" };
  if (bodyFat <= b.healthyMax)
    return { label: "Saudável", eval: "good", color: "#22c55e" };
  if (bodyFat <= b.overweightMax)
    return { label: "Sobrepeso", eval: "warning", color: "#facc15" };
  return { label: "Obesidade", eval: "danger", color: "#ef4444" };
}

// ============================================================
// MÚSCULO ESQUELÉTICO — Janssen et al. (2002) por sexo+idade
// % do peso corporal (FineShape adota a mesma referência)
// ============================================================
type SmmBand = { min: number; max: number };

function getJanssenBand(gender: "male" | "female", age: number): SmmBand {
  if (gender === "male") {
    if (age < 40) return { min: 37, max: 43 };
    if (age < 60) return { min: 34, max: 39 };
    return            { min: 31, max: 35 };
  }
  if (age < 40) return { min: 28, max: 33 };
  if (age < 60) return { min: 26, max: 30 };
  return            { min: 24, max: 27 };
}

export function getSkeletalMuscleReference(gender: "male" | "female", age = 30): string {
  const b = getJanssenBand(gender, age);
  return `${b.min}–${b.max}%`;
}

export function getSkeletalMuscleCategoryJanssen(
  pct: number,
  gender: "male" | "female",
  age = 30,
): { label: string; eval: "good" | "normal" | "warning" | "danger"; color: string } {
  const b = getJanssenBand(gender, age);
  if (pct < b.min) return { label: "Baixo",  eval: "warning", color: "#facc15" };
  if (pct <= b.max) return { label: "Normal", eval: "good",    color: "#22c55e" };
  return                   { label: "Alto",   eval: "good",    color: "#16a34a" };
}

// ============================================================
// MASSA MUSCULAR TOTAL — referência FineShape
// ============================================================
export function getMuscleMassReference(gender: "male" | "female"): string {
  return gender === "male" ? "33–39%" : "24–30%";
}

export function getMuscleMassCategory(
  pct: number,
  gender: "male" | "female",
): { label: string; eval: "good" | "warning" | "danger"; color: string } {
  const min = gender === "male" ? 33 : 24;
  const max = gender === "male" ? 39 : 30;
  if (pct < min) return { label: "Baixo",  eval: "warning", color: "#facc15" };
  if (pct <= max) return { label: "Normal", eval: "good",    color: "#22c55e" };
  return                  { label: "Alto",   eval: "good",    color: "#16a34a" };
}

// ============================================================
// ÁGUA CORPORAL — Watson et al. (1980), adulto
// ============================================================
export function getBodyWaterReference(gender: "male" | "female"): string {
  return gender === "male" ? "50–65%" : "45–60%";
}

export function getBodyWaterCategory(
  pct: number,
  gender: "male" | "female",
): { label: string; eval: "good" | "warning"; color: string } {
  const min = gender === "male" ? 50 : 45;
  const max = gender === "male" ? 65 : 60;
  if (pct < min) return { label: "Baixa",  eval: "warning", color: "#facc15" };
  if (pct <= max) return { label: "Normal", eval: "good",    color: "#22c55e" };
  return                  { label: "Alta",   eval: "warning", color: "#facc15" };
}

// ============================================================
// MASSA ÓSSEA — Heyward & Stolarczyk (faixa por peso e sexo)
// ============================================================
function getBoneTarget(gender: "male" | "female", weightKg: number): number {
  if (gender === "male") {
    if (weightKg < 60) return 2.5;
    if (weightKg <= 75) return 2.9;
    return 3.2;
  }
  if (weightKg < 60) return 1.8;
  if (weightKg <= 75) return 2.2;
  return 2.5;
}

export function getBoneMassReference(gender: "male" | "female", weightKg: number): string {
  return `≥ ${getBoneTarget(gender, weightKg).toFixed(1).replace(".", ",")} kg`;
}

export function getBoneMassCategory(
  boneKg: number,
  gender: "male" | "female",
  weightKg: number,
): { label: string; eval: "good" | "warning"; color: string } {
  const target = getBoneTarget(gender, weightKg);
  if (boneKg >= target) return { label: "Normal", eval: "good", color: "#22c55e" };
  return { label: "Baixa", eval: "warning", color: "#facc15" };
}

// ============================================================
// GORDURA VISCERAL — Tanita (padrão FineShape)
// ============================================================
export function getVisceralFatCategory(
  v: number,
): { label: string; eval: "good" | "warning" | "danger"; color: string } {
  if (v <= 9)  return { label: "Saudável",  eval: "good",    color: "#22c55e" };
  if (v <= 14) return { label: "Alto",      eval: "warning", color: "#fb923c" };
  return                { label: "Muito alto", eval: "danger",  color: "#ef4444" };
}

export function getVisceralFatReference(): string {
  return "1–9 (saudável)";
}

// ============================================================
// METABOLISMO BASAL — Harris-Benedict revisado (Roza-Shizgal)
// ============================================================
export function calculateHarrisBenedict(
  gender: "male" | "female",
  weightKg: number,
  heightCm: number,
  age: number,
): number {
  return Math.round(
    gender === "male"
      ? 88.36 + 13.4 * weightKg + 4.8 * heightCm - 5.7 * age
      : 447.6 + 9.2 * weightKg + 3.1 * heightCm - 4.3 * age,
  );
}

export function getBasalMetabolismCategory(
  kcal: number,
  reference: number,
): { label: string; eval: "good" | "warning"; color: string } {
  if (!reference) return { label: "—", eval: "warning", color: "#94a3b8" };
  const ratio = kcal / reference;
  if (ratio < 0.9) return { label: "Baixo",  eval: "warning", color: "#fb923c" };
  if (ratio <= 1.1) return { label: "Normal", eval: "good",    color: "#22c55e" };
  return                    { label: "Acima",  eval: "warning", color: "#facc15" };
}

export function getWaistHipReference(gender: "male" | "female"): string {
  return gender === "male" ? "< 0,90 (baixo risco)" : "< 0,80 (baixo risco)";
}

// ============================================================
// DEPRECATED — mantido por compatibilidade. Avatar agora é
// derivado do IMC, não da % de gordura.
// ============================================================
export function getAvatarFromBodyFat(
  bodyFat: number,
  gender: "male" | "female",
): { index: number; label: string; color: string } {
  const table = gender === "male" ? FAT_AVATAR_MALE : FAT_AVATAR_FEMALE;
  return table.find((e) => bodyFat <= e.max) ?? table[table.length - 1];
}

// ============================================================
// AVATAR LABELS (8 níveis — sincronizado com BODY_AVATAR_IMAGES)
// ============================================================
export const AVATAR_LABELS_8 = [
  "Abaixo",
  "Normal",
  "Acima 1",
  "Acima 2",
  "Acima 3",
  "Alto 1",
  "Alto 2",
  "Alto 3",
] as const;
