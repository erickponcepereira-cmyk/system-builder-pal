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
  // Baseada no percentual de gordura em relação à faixa ideal para a idade.
  // Abordagem: delta de gordura vs. ideal é convertido em anos de envelhecimento.
  const idealFatMid = gender === "male" ? 12.5 : 21;  // ponto médio do ideal
  const fatDelta = bodyFat - idealFatMid;
  // Cada 1% além do ideal ≈ +0.5 anos de idade corporal (conservador)
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
// FAIXAS DE REFERÊNCIA PARA RESULTADO (por sexo)
// ============================================================
export function getBodyFatReference(gender: "male" | "female"): string {
  return gender === "male" ? "5–15%" : "13–22%";
}

export function getSkeletalMuscleReference(gender: "male" | "female"): string {
  return gender === "male" ? "33–39%" : "24–30%";
}

export function getWaistHipReference(gender: "male" | "female"): string {
  return gender === "male" ? "< 0,90 (baixo risco)" : "< 0,80 (baixo risco)";
}

// ============================================================
// CLASSIFICAÇÃO DO AVATAR POR % GORDURA (reutilizável)
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
