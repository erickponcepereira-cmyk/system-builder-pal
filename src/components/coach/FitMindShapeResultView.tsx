/**
 * FitMindShapeResultView
 *
 * Componente reutilizável que renderiza EXATAMENTE a mesma tela
 * "Resultado da Avaliação" do FitMindShape — usado tanto no painel
 * do coach quanto na página pública de compartilhamento (/resultado/$token).
 *
 * Recebe props normalizados em vez de depender do estado interno do
 * FitMindShape, para que possa ser montado a partir de dados públicos.
 */
import React, { useState, useMemo } from "react";
import {
  LineChart, Line, PieChart, Pie, Cell, BarChart, Bar,
  XAxis, YAxis, CartesianGrid, Tooltip as RechartsTooltip,
  Legend, ResponsiveContainer,
} from "recharts";
import {
  User, ChevronLeft, HelpCircle, Camera, Activity, Heart,
  Droplets, Bone, Share2, Eye, EyeOff,
} from "lucide-react";
import {
  getBodyFatCategoryACSM,
  getBodyFatReference,
  getBodyFatHealthyRange,
  getSkeletalMuscleReference,
  getSkeletalMuscleCategoryJanssen,
  getMuscleMassReference,
  getBodyWaterReference,
  getBoneMassReference,
  getVisceralFatCategory,
  getVisceralFatReference,
  getBasalMetabolismCategory,
  AVATAR_LABELS_8,
} from "@/lib/body-composition-calculator";
import type { FitMindClient, FitMindAssessment } from "./FitMindShape";

import bodyAbaixo from "@/assets/body-abaixo.png";
import bodyNormal from "@/assets/body-normal.png";
import bodyAcima1 from "@/assets/body-acima-1.png";
import bodyAcima2 from "@/assets/body-acima-2.png";
import bodyAcima3 from "@/assets/body-acima-3.png";
import bodyAlto1 from "@/assets/body-alto-1.png";
import bodyAlto2 from "@/assets/body-alto-2.png";
import bodyAlto3 from "@/assets/body-alto-3.png";
import bodyFAbaixo from "@/assets/body-f-abaixo.png";
import bodyFNormal from "@/assets/body-f-normal.png";
import bodyFAcima1 from "@/assets/body-f-acima-1.png";
import bodyFAcima2 from "@/assets/body-f-acima-2.png";
import bodyFAcima3 from "@/assets/body-f-acima-3.png";
import bodyFAlto1 from "@/assets/body-f-alto-1.png";
import bodyFAlto2 from "@/assets/body-f-alto-2.png";
import bodyFAlto3 from "@/assets/body-f-alto-3.png";

const BODY_AVATAR_IMAGES = [bodyAbaixo, bodyNormal, bodyAcima1, bodyAcima2, bodyAcima3, bodyAlto1, bodyAlto2, bodyAlto3];
const BODY_AVATAR_IMAGES_FEMALE = [bodyFAbaixo, bodyFNormal, bodyFAcima1, bodyFAcima2, bodyFAcima3, bodyFAlto1, bodyFAlto2, bodyFAlto3];

const isFemaleGender = (g?: string) => {
  if (!g) return false;
  const v = g.toLowerCase().trim();
  return v === "f" || v === "feminino" || v === "female" || v === "mulher";
};

const BMI_RANGES = [
  { max: 18.5, label: "Abaixo do peso", color: "#60a5fa", avatar: 0 },
  { max: 24.9, label: "Saudável", color: "#22c55e", avatar: 1 },
  { max: 27.4, label: "Acima 1", color: "#a3e635", avatar: 2 },
  { max: 29.9, label: "Acima 2", color: "#facc15", avatar: 3 },
  { max: 34.9, label: "Acima 3", color: "#fb923c", avatar: 4 },
  { max: 39.9, label: "Alto 1", color: "#f87171", avatar: 5 },
  { max: 44.9, label: "Alto 2", color: "#ef4444", avatar: 6 },
  { max: 100, label: "Alto 3", color: "#b91c1c", avatar: 7 },
];

const RCQ_RISK = { male: { low: 0.9, mod: 0.95 }, female: { low: 0.8, mod: 0.85 } };
function classifyRCQ(rcq: number, gender: string) {
  const limits = gender === "male" ? RCQ_RISK.male : RCQ_RISK.female;
  if (rcq < limits.low) return { label: "Baixo risco", color: "#22c55e", eval: "normal" };
  if (rcq <= limits.mod) return { label: "Risco moderado", color: "#facc15", eval: "warning" };
  return { label: "Alto risco", color: "#ef4444", eval: "danger" };
}

const TOOLTIPS: Record<string, string> = {
  bodyWater: "Percentual de água corporal. Fonte: (2) Omron Healthcare e (9) Omron Healthcare/Tanita.",
  boneMass: "Percentual estimado de massa óssea. Fonte: (9) Omron Healthcare/Tanita.",
};

const CLINICAL_SOURCES =
  "Fontes: (1) OMS - Organização Mundial da Saúde; (2) Omron Healthcare; (8) diretrizes NIH/OMS para IMC; (9) Omron Healthcare e Tanita; (10) Harris-Benedict revisado (Roza & Shizgal, 1984); (11) Lee RC et al. (2000) — músculo esquelético por antropometria; (12) Weltman A et al. (1988) — % gordura por circunferências; (13) WHO (2000) — Relação Cintura-Quadril.";

const getBMICategory = (bmi: number) =>
  BMI_RANGES.find((r) => bmi <= r.max) ?? BMI_RANGES[BMI_RANGES.length - 1];
const getBodyFatCategory = (pct: number, gender: string, age = 30) =>
  getBodyFatCategoryACSM(pct || 0, gender === "male" ? "male" : "female", age);
const getVisceralCategory = (v: number) => getVisceralFatCategory(v || 0);

// ── Props ────────────────────────────────────────────────────────────────────

export interface FitMindShapeResultViewCoach {
  name: string;
  logo?: string | null;
  specialty?: string | null;
  email?: string | null;
  whatsapp?: string | null;
  instagram?: string | null;
  tiktok?: string | null;
  website?: string | null;
}

export interface FitMindShapeResultViewProps {
  client: FitMindClient;
  assessment: FitMindAssessment;
  allAssessments?: FitMindAssessment[];
  coach: FitMindShapeResultViewCoach;
  themeColor?: string;
  themeFontFamily?: string;
  mode?: "coach" | "public";
  // Coach mode callbacks
  onBack?: () => void;
  onShare?: () => void;
  sharingResult?: boolean;
  onNewAssessment?: () => void;
  onCompare?: () => void;
  canCompare?: boolean;
  onPrint?: () => void;
}

// ── Component ────────────────────────────────────────────────────────────────

const FitMindShapeResultView: React.FC<FitMindShapeResultViewProps> = ({
  client,
  assessment: a,
  allAssessments,
  coach,
  themeColor = "#dc2626",
  themeFontFamily = "'Outfit', 'Inter', sans-serif",
  mode = "coach",
  onBack,
  onShare,
  sharingResult,
  onNewAssessment,
  onCompare,
  canCompare = true,
  onPrint,
}) => {
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [photosOpen, setPhotosOpen] = useState(false);

  const computedBMI = useMemo(() => {
    if (!a.weight || !a.height) return 0;
    const hm = a.height / 100;
    return +(a.weight / (hm * hm)).toFixed(1);
  }, [a.weight, a.height]);

  const historicalData = useMemo(() => {
    const past = (allAssessments ?? client.assessments ?? [])
      .filter((x) => x?.date)
      .slice()
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
    return past.map((x) => ({
      date: new Date(x.date).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" }),
      peso: x.weight,
      gordura: x.bodyFat,
      musculo: x.skeletalMuscle,
      idadeCorp: x.bodyAge,
    }));
  }, [allAssessments, client.assessments]);

  const Tooltip: React.FC<{ id: string }> = ({ id }) => (
    <span className="fm-tooltip" style={{ marginLeft: 4 }}>
      <HelpCircle
        size={13}
        color="var(--muted-foreground)"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setActiveTooltip(id)}
        onMouseLeave={() => setActiveTooltip(null)}
      />
      {activeTooltip === id && <span className="fm-tooltip-box">{TOOLTIPS[id]}</span>}
    </span>
  );

  const AvatarFigure: React.FC<{ level: number; active?: boolean; label: string; gender?: string }> = ({
    level, active, label, gender,
  }) => {
    const images = isFemaleGender(gender) ? BODY_AVATAR_IMAGES_FEMALE : BODY_AVATAR_IMAGES;
    return (
      <div className={`fm-avatar-item ${active ? "fm-avatar-active" : ""}`} style={{ opacity: active ? 1 : 0.35 }}>
        <img className="fm-avatar-img" src={images[level] ?? images[1]} alt={label} style={{ filter: active ? "none" : "grayscale(0.4)" }} />
        <span style={{ fontSize: 9, color: active ? "var(--fm-primary)" : "var(--muted-foreground)", fontWeight: active ? 700 : 400, textAlign: "center", maxWidth: "100%", whiteSpace: "nowrap" }}>
          {label}
        </span>
      </div>
    );
  };

  const AvatarLabels = AVATAR_LABELS_8;

  const bmiCat = getBMICategory(a.bmi || computedBMI);
  const avatarEntry = { index: bmiCat.avatar, label: bmiCat.label, color: bmiCat.color };
  const avatarIndex = avatarEntry.index;
  const clientGenderBin: "male" | "female" = client.gender === "male" ? "male" : "female";
  const fatCat = getBodyFatCategory(a.bodyFat, client.gender, a.age || 30);
  const viscCat = getVisceralCategory(a.visceralFat);
  const ageBodyDiff = a.bodyAge && a.age ? a.bodyAge - a.age : 0;

  const evalColor = (ev: string) =>
    ({ excellent: "#16a34a", good: "#16a34a", normal: "#16a34a", warning: "#eab308", danger: "#dc2626" })[ev] || "#eab308";
  const evalLabel = (ev: string) =>
    ({ excellent: "Excelente", good: "Bom", normal: "Normal", warning: "Atenção", danger: "Risco" })[ev] || ev;

  const leanPct = +(100 - (a.bodyFat || 0)).toFixed(1);
  const fatPct = +(a.bodyFat || 0).toFixed(1);
  const pieData = [
    { name: "Massa Magra", value: leanPct, fill: "var(--fm-primary)" },
    { name: "Gordura", value: fatPct, fill: "#fca5a5" },
  ];

  const todayLabel = "Hoje";
  const hasTodayInHistory = historicalData.some((h) => h.peso === a.weight);
  const histWeight = hasTodayInHistory
    ? historicalData
    : [...historicalData, { date: todayLabel, peso: a.weight, gordura: a.bodyFat, musculo: a.skeletalMuscle, idadeCorp: a.bodyAge }];

  const allA = (() => {
    const existing = allAssessments ?? client.assessments ?? [];
    const merged = a?.id && existing.some((item) => item.id === a.id) ? existing : (a?.date ? [...existing, a] : existing);
    return merged.filter((item) => item?.date).sort((l, r) => new Date(l.date).getTime() - new Date(r.date).getTime());
  })();
  const N = allA.length;
  const firstA = allA[0] ?? a;
  const previousA = N >= 3 ? allA[N - 2] : (allA[N - 1] ?? a);
  const daysFollow = (() => {
    if (!firstA?.date) return 0;
    const d = (Date.now() - new Date(firstA.date).getTime()) / 86400000;
    return Math.max(0, Math.round(d));
  })();
  const followLabel = (() => {
    if (!daysFollow) return "Hoje";
    const years = Math.floor(daysFollow / 365);
    const remAfterYears = daysFollow - years * 365;
    const months = Math.floor(remAfterYears / 30);
    const days = remAfterYears - months * 30;
    const parts: string[] = [];
    if (years > 0) parts.push(`${years} ${years === 1 ? "ano" : "anos"}`);
    if (months > 0) parts.push(`${months} ${months === 1 ? "mês" : "meses"}`);
    if (days > 0 || parts.length === 0) parts.push(`${days} ${days === 1 ? "dia" : "dias"}`);
    return parts.join(", ");
  })();
  const diff = (curr?: number, base?: number, unit = "") => {
    if (curr == null || !Number.isFinite(curr)) return "—";
    const d = base != null && Number.isFinite(base) ? +(curr - base).toFixed(1) : null;
    const valStr = `${+curr.toFixed(1)}${unit}`;
    if (d == null || d === 0 || curr === base) return valStr;
    const sign = d > 0 ? "+" : "";
    return `${valStr} (${sign}${d}${unit})`;
  };
  const metric = (value?: number, unit = "") =>
    value == null || !Number.isFinite(value) ? "—" : `${+value.toFixed(1)}${unit}`;
  const dateLabel = (value?: string) => (value ? new Date(value).toLocaleDateString("pt-BR") : "—");

  const heightM = (a.height || 0) / 100;
  const idealWeightMin = heightM ? +(18.5 * heightM * heightM).toFixed(1) : 0;
  const idealWeightMax = heightM ? +(24.9 * heightM * heightM).toFixed(1) : 0;
  const refWeight = heightM ? `${idealWeightMin}–${idealWeightMax} kg` : "—";
  const refSkeletal = getSkeletalMuscleReference(clientGenderBin, a.age || 30);
  const refBMI = "18,5–24,9 kg/m²";
  const refBodyFat = getBodyFatReference(clientGenderBin, a.age || 30);
  const refVisceral = getVisceralFatReference();
  void getMuscleMassReference(clientGenderBin);
  const refWater = getBodyWaterReference(clientGenderBin);
  const refBone = a.weight ? getBoneMassReference(clientGenderBin, a.weight) : "—";

  const waistRef = a.circumferences?.waist ?? a.circumferences?.abdomen;
  const hipRef = a.circumferences?.hip;
  const rcq = waistRef && hipRef ? +(waistRef / hipRef).toFixed(2) : null;
  const rcqCat = rcq ? classifyRCQ(rcq, client.gender) : null;
  const refRcq = client.gender === "male" ? "< 0,90" : "< 0,80";
  const harrisBenedict = (() => {
    if (!a.weight || !a.height || !a.age) return 0;
    return Math.round(
      client.gender === "male"
        ? 88.36 + 13.4 * a.weight + 4.8 * a.height - 5.7 * a.age
        : 447.6 + 9.2 * a.weight + 3.1 * a.height - 4.3 * a.age,
    );
  })();
  const basalKcal = a.basalMetabolism && a.basalMetabolism > 0 ? Math.round(a.basalMetabolism) : harrisBenedict;
  const refBasal = harrisBenedict ? `${Math.round(harrisBenedict * 0.95)}–${Math.round(harrisBenedict * 1.05)} kcal` : "—";

  const weightEval = (() => {
    if (!a.weight || !idealWeightMax) return { c: "var(--muted-foreground)", t: "—" };
    if (a.weight < idealWeightMin) return { c: "#facc15", t: "Abaixo" };
    if (a.weight <= idealWeightMax) return { c: "#22c55e", t: "Normal" };
    const over = a.weight - idealWeightMax;
    if (over < 5) return { c: "#facc15", t: "Acima" };
    if (over < 12) return { c: "#fb923c", t: "Muito acima" };
    return { c: "#dc2626", t: "Risco alto" };
  })();
  const skEval = (() => {
    if (!a.skeletalMuscle) return { c: "var(--muted-foreground)", t: "—" };
    const cat = getSkeletalMuscleCategoryJanssen(a.skeletalMuscle, clientGenderBin, a.age || 30);
    return { c: cat.color, t: cat.label };
  })();
  const skKg = a.skeletalMuscle && a.weight ? +((a.skeletalMuscle / 100) * a.weight).toFixed(1) : 0;
  const bodyAgeYears = a.bodyAge ? Math.round(a.bodyAge) : 0;
  const bodyAgeDelta = bodyAgeYears - (a.age || 0);
  const bodyAgeEval = (() => {
    if (!bodyAgeYears) return { c: "var(--muted-foreground)", t: "—" };
    if (bodyAgeDelta <= 0) return { c: "#22c55e", t: bodyAgeDelta === 0 ? "Igual à idade real" : `${bodyAgeDelta} anos (excelente)` };
    if (bodyAgeDelta <= 3) return { c: "#facc15", t: `+${bodyAgeDelta} anos` };
    if (bodyAgeDelta <= 7) return { c: "#fb923c", t: `+${bodyAgeDelta} anos` };
    return { c: "#dc2626", t: `+${bodyAgeDelta} anos` };
  })();
  const fatKg = a.bodyFat && a.weight ? +((a.bodyFat / 100) * a.weight).toFixed(1) : 0;

  const weightDelta = (() => {
    if (!a.weight || !idealWeightMax) return null as null | string;
    if (a.weight < idealWeightMin) return `Faltam ${(+(idealWeightMin - a.weight).toFixed(1))} kg para o mínimo recomendado`;
    if (a.weight <= idealWeightMax) return "Dentro do recomendado";
    return `Precisa perder ${(+(a.weight - idealWeightMax).toFixed(1))} kg para entrar no recomendado`;
  })();
  const fatDelta = (() => {
    if (!a.bodyFat || !a.weight) return null as null | string;
    const { min: idealMinPct, max: idealMaxPct } = getBodyFatHealthyRange(clientGenderBin, a.age || 30);
    if (a.bodyFat < idealMinPct) return `Faltam ${(+((idealMinPct - a.bodyFat) * a.weight / 100).toFixed(1))} kg de gordura para o mínimo`;
    if (a.bodyFat <= idealMaxPct) return "Dentro do recomendado";
    const kgToLose = +((a.bodyFat - idealMaxPct) * a.weight / 100).toFixed(1);
    return `Precisa perder ${kgToLose} kg de gordura para entrar no recomendado`;
  })();
  const basalEval = (() => {
    if (!basalKcal || !harrisBenedict) return { c: "var(--muted-foreground)", t: "—" };
    const cat = getBasalMetabolismCategory(basalKcal, harrisBenedict);
    return { c: cat.color, t: cat.label };
  })();

  const histGordura = histWeight;

  const css = `
    :root {
      --fm-primary: ${themeColor};
      --fm-primary-light: ${themeColor}22;
      --fm-primary-dark: ${themeColor}dd;
      --fm-font: ${themeFontFamily};
    }
    .fmsv * { font-family: var(--fm-font); box-sizing: border-box; }
    .fmsv .fm-card {
      background: var(--card, #ffffff); color: var(--card-foreground, #0f172a);
      border: 1px solid var(--border, #e2e8f0); border-radius: 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,.07); padding: 20px;
    }
    .fmsv .fm-section-title {
      font-size: 13px; font-weight: 700; color: var(--fm-primary);
      text-transform: uppercase; letter-spacing: .06em; margin-bottom: 12px;
      padding-bottom: 6px; border-bottom: 2px solid var(--fm-primary-light);
    }
    .fmsv .fm-badge { display: inline-block; padding: 3px 10px; border-radius: 999px; font-size: 11px; font-weight: 700; }
    .fmsv .fm-avatar-row { display: grid; grid-template-columns: repeat(8, minmax(0, 1fr)); gap: 4px; align-items: end; justify-items: center; padding: 12px 0; width: 100%; }
    .fmsv .fm-avatar-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; min-width: 0; }
    .fmsv .fm-avatar-img { width: 100%; height: auto; max-height: 138px; object-fit: contain; display: block; }
    .fmsv .fm-avatar-active { filter: drop-shadow(0 0 8px var(--fm-primary)); }
    .fmsv .fm-avatar-active .fm-avatar-img { transform: scale(1.08); transform-origin: bottom center; }
    @media (max-width: 480px) { .fmsv .fm-avatar-row { gap: 2px; } .fmsv .fm-avatar-img { max-height: 96px; } }
    .fmsv .fm-tooltip { position: relative; display: inline-flex; align-items: center; }
    .fmsv .fm-tooltip-box {
      position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
      background: #1e293b; color: #fff; padding: 8px 12px; border-radius: 8px;
      font-size: 12px; width: 220px; text-align: center; z-index: 999;
      pointer-events: none; line-height: 1.4;
    }
    .fmsv .fm-coach-footer {
      background: var(--fm-primary); color: #fff; border-radius: 16px;
      padding: 20px; display: flex; align-items: center; gap: 16px; margin-top: 24px;
    }
    .fmsv .fm-btn-primary {
      background: var(--fm-primary); color: #fff; border: none; border-radius: 10px;
      padding: 12px 24px; font-weight: 600; cursor: pointer;
    }
    .fmsv .fm-btn-outline {
      background: transparent; color: var(--fm-primary); border: 2px solid var(--fm-primary);
      border-radius: 10px; padding: 10px 22px; font-weight: 600; cursor: pointer;
    }
  `;

  const isPublic = mode === "public";

  return (
    <div className="fmsv" style={{ background: "#050505", minHeight: isPublic ? undefined : "100vh", fontFamily: themeFontFamily }}>
      <style>{css}</style>

      {/* Header */}
      <div style={{ background: "var(--fm-primary)", padding: "24px 24px 32px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
          {onBack && (
            <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <ChevronLeft size={22} color="#ffffffaa" />
            </button>
          )}
          <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
            Resultado da Avaliação
          </div>
          {onShare && (
            <button
              onClick={onShare}
              disabled={!!sharingResult || !a?.id}
              title="Compartilhar resultado com o aluno"
              style={{
                marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: 6,
                background: "#ffffff22", border: "1px solid #ffffff33", borderRadius: 999,
                padding: "6px 12px", color: "#fff", fontSize: 12, fontWeight: 700,
                cursor: sharingResult || !a?.id ? "not-allowed" : "pointer",
                opacity: sharingResult || !a?.id ? 0.6 : 1,
              }}
            >
              <Share2 size={14} />
              {sharingResult ? "Gerando..." : "Compartilhar"}
            </button>
          )}
        </div>
        <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
          <div style={{ width: 52, height: 52, borderRadius: 50, background: "#ffffff22", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <User size={26} color="#fff" />
          </div>
          <div>
            <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{client.name}</div>
            <div style={{ fontSize: 13, color: "#ffffff99" }}>
              {client.gender === "male" ? "Masculino" : "Feminino"} · {a.age} anos · {a.height}cm ·{" "}
              {new Date(a.date || Date.now()).toLocaleDateString("pt-BR")}
            </div>
          </div>
        </div>
      </div>

      <div style={{ padding: "0 16px 24px", marginTop: -16 }}>
        {/* Resumo */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Resumo</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
              <thead>
                <tr style={{ color: "var(--muted-foreground, #64748b)", textAlign: "left" }}>
                  <th style={{ padding: "6px 4px", fontWeight: 700 }}>Indicador</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Primeira</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>{N >= 3 ? "Anterior" : "Última"}</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "Tempo de acompanhamento", first: dateLabel(firstA.date), latest: N >= 3 ? `${dateLabel(previousA.date)} · ${followLabel}` : followLabel },
                  { l: "Peso", first: metric(firstA.weight, " kg"), latest: diff(previousA.weight, firstA.weight, " kg") },
                  { l: "Gordura", first: metric(firstA.bodyFat, " %"), latest: diff(previousA.bodyFat, firstA.bodyFat, " %") },
                  { l: "Músculo Esquelético", first: metric(firstA.skeletalMuscle, " %"), latest: diff(previousA.skeletalMuscle, firstA.skeletalMuscle, " %") },
                  { l: "Massa Muscular", first: metric(firstA.muscleMass && firstA.weight ? Number(((firstA.weight * firstA.muscleMass) / 100).toFixed(1)) : undefined, " kg"), latest: diff(previousA.muscleMass && previousA.weight ? Number(((previousA.weight * previousA.muscleMass) / 100).toFixed(1)) : undefined, firstA.muscleMass && firstA.weight ? Number(((firstA.weight * firstA.muscleMass) / 100).toFixed(1)) : undefined, " kg") },
                  { l: "Gordura Visceral", first: metric(firstA.visceralFat, ""), latest: diff(previousA.visceralFat, firstA.visceralFat, "") },
                  { l: "Idade Corporal", first: metric(firstA.bodyAge ? Math.round(firstA.bodyAge) : undefined, " anos"), latest: diff(previousA.bodyAge ? Math.round(previousA.bodyAge) : undefined, firstA.bodyAge ? Math.round(firstA.bodyAge) : undefined, " anos") },
                ].map((r) => (
                  <tr key={r.l} style={{ borderTop: "1px solid #f1f5f9" }}>
                    <td style={{ padding: "8px 4px", fontWeight: 600 }}>{r.l}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}>{r.first}</td>
                    <td style={{ padding: "8px 4px", textAlign: "right", fontWeight: 700 }}>{r.latest}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Avatar Row */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div style={{ fontSize: 12, fontWeight: 700, color: "var(--muted-foreground, #64748b)", marginBottom: 8, textAlign: "center" }}>
            Perfil Corporal
          </div>
          <div className="fm-avatar-row">
            {AvatarLabels.map((label, i) => (
              <AvatarFigure key={i} level={i} active={i === avatarIndex} label={label} gender={client.gender} />
            ))}
          </div>
          <div style={{ textAlign: "center", marginTop: 8 }}>
            <span
              className="fm-badge"
              style={{
                background: evalColor(avatarEntry.index <= 1 ? "normal" : avatarEntry.index <= 3 ? "warning" : "danger"),
                color: "#fff", fontSize: 12,
              }}
            >
              {avatarEntry.label} · IMC {(a.bmi || computedBMI) ? `${(a.bmi || computedBMI).toFixed(1)} kg/m²` : "—"}
              {a.bodyFat ? ` · ${a.bodyFat}% gordura` : ""}
            </span>
          </div>
          {(() => {
            const photos = a.photos || {};
            const items = [
              { key: "front", label: "Frente", src: photos.front },
              { key: "back", label: "Costas", src: photos.back },
              { key: "rightSide", label: "Lateral Direita", src: photos.rightSide },
              { key: "leftSide", label: "Lateral Esquerda", src: photos.leftSide },
            ].filter((p) => !!p.src) as Array<{ key: string; label: string; src: string }>;
            const count = items.length;
            return (
              <>
                <button
                  type="button"
                  onClick={() => { if (count > 0) setPhotosOpen(true); }}
                  disabled={count === 0}
                  style={{
                    marginTop: 12, width: "100%", padding: "10px 14px", borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: count > 0 ? "var(--fm-primary)" : "#f1f5f9",
                    color: count > 0 ? "#fff" : "#64748b",
                    fontWeight: 700, fontSize: 13,
                    cursor: count > 0 ? "pointer" : "not-allowed",
                    display: "flex", alignItems: "center", justifyContent: "center", gap: 6,
                  }}
                >
                  <Camera size={14} />
                  {count > 0 ? `Visualizar fotos (${count})` : "Sem fotos anexadas"}
                </button>
                {photosOpen && count > 0 && (
                  <div
                    onClick={() => setPhotosOpen(false)}
                    style={{
                      position: "fixed", inset: 0, background: "rgba(0,0,0,0.85)",
                      zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center",
                      padding: 20,
                    }}
                  >
                    <div
                      onClick={(e) => e.stopPropagation()}
                      style={{
                        background: "#0f172a", borderRadius: 14, padding: 16,
                        maxWidth: 960, width: "100%", maxHeight: "90vh", overflowY: "auto",
                        position: "relative",
                      }}
                    >
                      <button
                        type="button"
                        onClick={() => setPhotosOpen(false)}
                        style={{
                          position: "absolute", top: 10, right: 10, background: "#ffffff22",
                          border: "none", borderRadius: 999, color: "#fff", width: 32, height: 32,
                          cursor: "pointer", fontSize: 18, lineHeight: 1,
                        }}
                      >×</button>
                      <div style={{ color: "#fff", fontWeight: 800, marginBottom: 12 }}>
                        Fotos da avaliação
                      </div>
                      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 12 }}>
                        {items.map((p) => (
                          <div key={p.key} style={{ background: "#000", borderRadius: 10, overflow: "hidden" }}>
                            <img src={p.src} alt={p.label} style={{ width: "100%", display: "block", maxHeight: 480, objectFit: "contain" }} />
                            <div style={{ padding: "6px 10px", color: "#fff", fontSize: 12, fontWeight: 600, textAlign: "center" }}>
                              {p.label}
                            </div>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                )}
              </>
            );
          })()}
        </div>

        {/* Composição Corporal */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Composição Corporal</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted-foreground, #64748b)", textAlign: "left", fontSize: 11 }}>
                  <th style={{ padding: "6px 4px", fontWeight: 700 }}>Descrição</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Resultado</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Avaliação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "Peso", ref: `Referência: ${refWeight}${weightDelta ? ` · ${weightDelta}` : ""}`, result: a.weight ? `${a.weight} kg` : "—", color: weightEval.c, tag: weightEval.t },
                  { l: "Músculo Esquelético", ref: `Referência: ${refSkeletal}`, result: a.skeletalMuscle ? `${a.skeletalMuscle}% (${skKg} kg)` : "—", color: skEval.c, tag: skEval.t },
                  { l: "Idade Corporal", ref: `Idade real: ${a.age || "—"} anos`, result: bodyAgeYears ? `${bodyAgeYears} anos` : "—", color: bodyAgeEval.c, tag: bodyAgeEval.t },
                ].map((r) => (
                  <tr key={r.l} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                    <td style={{ padding: "10px 4px" }}>
                      <div style={{ fontWeight: 600 }}>{r.l}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-foreground, #64748b)", fontStyle: "italic", marginTop: 2 }}>{r.ref}</div>
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 800 }}>{r.result}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>
                      <span className="fm-badge" style={{ background: r.color, color: "#fff", fontSize: 10.5 }}>{r.tag}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Diagnóstico de Obesidade */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Diagnóstico de Obesidade</div>
          <div style={{ overflowX: "auto" }}>
            <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
              <thead>
                <tr style={{ color: "var(--muted-foreground, #64748b)", textAlign: "left", fontSize: 11 }}>
                  <th style={{ padding: "6px 4px", fontWeight: 700 }}>Descrição</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Resultado</th>
                  <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Avaliação</th>
                </tr>
              </thead>
              <tbody>
                {[
                  { l: "IMC", ref: `Ideal: ${refBMI}`, result: computedBMI ? `${computedBMI} kg/m²` : "—", color: bmiCat.color, tag: bmiCat.label },
                  { l: "Gordura Corporal", ref: `Ideal: ${refBodyFat}${fatDelta ? ` · ${fatDelta}` : ""}`, result: a.bodyFat ? `${a.bodyFat}% (${fatKg} kg)` : "—", color: evalColor(fatCat.eval), tag: `${evalLabel(fatCat.eval)} (${fatCat.label})` },
                  { l: "Gordura Visceral", ref: `Ideal: ${refVisceral}`, result: a.visceralFat ? `${a.visceralFat}` : "—", color: viscCat.color, tag: viscCat.label },
                  { l: "Metabolismo Basal", ref: `Ideal: ${refBasal}`, result: basalKcal ? `${basalKcal} kcal` : "—", color: basalEval.c, tag: basalEval.t },
                  ...(rcq !== null
                    ? [{ l: "Rel. Cintura-Quadril (RCQ)", ref: `Referência: ${refRcq} (baixo risco — WHO 2000)`, result: `${rcq}`, color: rcqCat?.color ?? "#94a3b8", tag: rcqCat?.label ?? "—" }]
                    : []),
                ].map((r) => (
                  <tr key={r.l} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                    <td style={{ padding: "10px 4px" }}>
                      <div style={{ fontWeight: 600 }}>{r.l}</div>
                      <div style={{ fontSize: 10.5, color: "var(--muted-foreground, #64748b)", fontStyle: "italic", marginTop: 2 }}>{r.ref}</div>
                    </td>
                    <td style={{ padding: "10px 4px", textAlign: "right", fontWeight: 800 }}>{r.result}</td>
                    <td style={{ padding: "10px 4px", textAlign: "right" }}>
                      <span className="fm-badge" style={{ background: r.color, color: "#fff", fontSize: 10.5 }}>{r.tag}</span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>

        {/* Outros Indicadores */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Outros Indicadores</div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {[
              { icon: <Droplets size={18} color="#60a5fa" />, label: "Água Corporal", tooltip: "bodyWater", value: `${a.bodyWater}%`, ref: `Ideal: ${refWater}`, bg: "#eff6ff" },
              { icon: <Bone size={18} color="#a78bfa" />, label: "Massa Óssea", tooltip: "boneMass", value: `${a.boneMass}%`, ref: `Ideal: ${refBone}`, bg: "#f5f3ff" },
            ].map((item) => (
              <div key={item.label} style={{ background: item.bg, borderRadius: 12, padding: "14px", textAlign: "center" }}>
                {item.icon}
                <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 4 }}>
                  {item.label} <Tooltip id={item.tooltip} />
                </div>
                <div style={{ fontSize: 20, fontWeight: 800, color: "#0f172a" }}>{item.value}</div>
                <div style={{ fontSize: 10, color: "#64748b", fontStyle: "italic", marginTop: 2 }}>{item.ref}</div>
              </div>
            ))}
          </div>
        </div>

        {/* Cardiovascular */}
        {(a.systolicBP || a.heartRate) && (
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Dados Cardiovasculares</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
              {a.systolicBP && (
                <div style={{ textAlign: "center", background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                  <Heart size={16} color="#ef4444" />
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>PA Sistólica</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{a.systolicBP}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>mmHg</div>
                </div>
              )}
              {a.diastolicBP && (
                <div style={{ textAlign: "center", background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                  <Heart size={16} color="#f87171" />
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>PA Diastólica</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{a.diastolicBP}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>mmHg</div>
                </div>
              )}
              {a.heartRate && (
                <div style={{ textAlign: "center", background: "#fff7ed", borderRadius: 10, padding: 12 }}>
                  <Activity size={16} color="#fb923c" />
                  <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Freq. Cardíaca</div>
                  <div style={{ fontSize: 18, fontWeight: 800 }}>{a.heartRate}</div>
                  <div style={{ fontSize: 10, color: "#64748b" }}>bpm</div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Histórico — Peso */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Histórico — Peso Corporal</div>
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={histWeight}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
              <RechartsTooltip />
              <Line type="monotone" dataKey="peso" stroke={themeColor} strokeWidth={2.5} dot={{ fill: themeColor, r: 4 }} />
            </LineChart>
          </ResponsiveContainer>
        </div>

        {/* Composição Atual */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Composição Corporal — Atual</div>
          <div style={{ display: "flex", alignItems: "center" }}>
            <ResponsiveContainer width="50%" height={150}>
              <PieChart>
                <Pie data={pieData} cx="50%" cy="50%" innerRadius={40} outerRadius={65} dataKey="value">
                  {pieData.map((entry, i) => <Cell key={i} fill={entry.fill} />)}
                </Pie>
              </PieChart>
            </ResponsiveContainer>
            <div style={{ flex: 1 }}>
              {pieData.map((d, i) => (
                <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                  <span style={{ width: 12, height: 12, borderRadius: 3, background: d.fill, display: "inline-block" }} />
                  <div>
                    <div style={{ fontSize: 12, fontWeight: 600, color: "#0f172a" }}>{d.name}</div>
                    <div style={{ fontSize: 16, fontWeight: 800, color: "#0f172a" }}>{d.value}%</div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Gordura vs Músculo */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">% Gordura vs Músculo — Evolução</div>
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={histGordura}>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} />
              <YAxis tick={{ fontSize: 11 }} />
              <RechartsTooltip />
              <Legend wrapperStyle={{ fontSize: 11 }} />
              <Bar dataKey="gordura" name="% Gordura" fill="#fca5a5" radius={[4, 4, 0, 0]} />
              <Bar dataKey="musculo" name="% Músculo" fill={themeColor} radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>

        {/* Idade Corporal */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Idade Corporal</div>
          <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "8px 0" }}>
            <div style={{ textAlign: "center", flex: 1, background: "#f0fdf4", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Referência</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: "#0f172a" }}>{a.age}</div>
              <div style={{ fontSize: 12, color: "#64748b" }}>anos</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", color: "#64748b", fontSize: 20 }}>→</div>
            <div style={{ textAlign: "center", flex: 1, background: ageBodyDiff <= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 12, padding: 16 }}>
              <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Idade Corporal</div>
              <div style={{ fontSize: 36, fontWeight: 900, color: ageBodyDiff <= 0 ? "#16a34a" : ageBodyDiff <= 3 ? "#facc15" : "#ef4444" }}>
                {bodyAgeYears || "—"}
              </div>
              <div style={{ fontSize: 12, color: ageBodyDiff <= 0 ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
                {ageBodyDiff === 0 ? "Igual" : ageBodyDiff > 0 ? `+${ageBodyDiff} anos` : `${Math.abs(ageBodyDiff)} anos abaixo 🎉`}
              </div>
            </div>
          </div>
        </div>

        {/* Circunferências */}
        {a.circumferences && Object.values(a.circumferences).some(Boolean) && (
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Circunferências Registradas (cm)</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 6, fontSize: 12 }}>
              {[
                ["Cintura", a.circumferences?.waist],
                ["Abdômen", a.circumferences?.abdomen],
                ["Quadril", a.circumferences?.hip],
                ["Tórax", a.circumferences?.chest],
                ["Braço Esq.", a.circumferences?.leftArm],
                ["Braço Dir.", a.circumferences?.rightArm],
                ["Antebraço Esq.", a.circumferences?.leftForearm],
                ["Antebraço Dir.", a.circumferences?.rightForearm],
                ["Coxa Esq.", a.circumferences?.leftThigh],
                ["Coxa Dir.", a.circumferences?.rightThigh],
                ["Panturrilha Esq.", a.circumferences?.leftCalf],
                ["Panturrilha Dir.", a.circumferences?.rightCalf],
              ].filter(([, v]) => v != null).map(([label, value]) => (
                <div key={label as string} style={{ display: "flex", justifyContent: "space-between", padding: "5px 0", borderBottom: "1px solid #e2e8f0" }}>
                  <span style={{ color: "#64748b" }}>{label}</span>
                  <strong>{value} cm</strong>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Fontes Clínicas */}
        <div className="fm-card" style={{ marginBottom: 12 }}>
          <div className="fm-section-title">Fontes de Referência</div>
          <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>{CLINICAL_SOURCES}</div>
        </div>

        {/* Anotações */}
        {a.clientNotes && (
          <div className="fm-card" style={{ marginBottom: 12, borderLeft: "4px solid var(--fm-primary)" }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fm-primary)", marginBottom: 6 }}>
              📋 Anotações do Profissional
            </div>
            <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.6 }}>{a.clientNotes}</div>
          </div>
        )}

        {/* Rodapé do Coach */}
        <div className="fm-coach-footer">
          {coach.logo && (
            <img src={coach.logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
          )}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontWeight: 800, fontSize: 16 }}>{coach.name}</div>
            {coach.specialty && <div style={{ fontSize: 12, opacity: 0.8 }}>{coach.specialty}</div>}
            {coach.email && <div style={{ fontSize: 12, opacity: 0.7 }}>{coach.email}</div>}
            {(coach.whatsapp || coach.instagram || coach.tiktok || coach.website) && (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginTop: 6, fontSize: 11 }}>
                {coach.whatsapp && (
                  <a
                    href={`https://wa.me/${(coach.whatsapp.replace(/\D/g, "").length <= 11 ? "55" : "") + coach.whatsapp.replace(/\D/g, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", opacity: 0.9, textDecoration: "none", background: "#ffffff22", padding: "3px 8px", borderRadius: 6 }}
                  >
                    📱 WhatsApp
                  </a>
                )}
                {coach.instagram && (
                  <a
                    href={`https://instagram.com/${coach.instagram.replace(/^@/, "").replace(/^https?:\/\/(www\.)?instagram\.com\//, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", opacity: 0.9, textDecoration: "none", background: "#ffffff22", padding: "3px 8px", borderRadius: 6 }}
                  >
                    📷 Instagram
                  </a>
                )}
                {coach.tiktok && (
                  <a
                    href={`https://tiktok.com/@${coach.tiktok.replace(/^@/, "").replace(/^https?:\/\/(www\.)?tiktok\.com\/@?/, "")}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", opacity: 0.9, textDecoration: "none", background: "#ffffff22", padding: "3px 8px", borderRadius: 6 }}
                  >
                    🎵 TikTok
                  </a>
                )}
                {coach.website && (
                  <a
                    href={coach.website.startsWith("http") ? coach.website : `https://${coach.website}`}
                    target="_blank"
                    rel="noreferrer"
                    style={{ color: "inherit", opacity: 0.9, textDecoration: "none", background: "#ffffff22", padding: "3px 8px", borderRadius: 6 }}
                  >
                    🌐 Site
                  </a>
                )}
              </div>
            )}
          </div>
          <div style={{ marginLeft: "auto", background: "#ffffff22", borderRadius: 10, padding: "8px 14px", fontSize: 12, textAlign: "center" }}>
            <div style={{ fontWeight: 700 }}>FitMind Shape</div>
            <div style={{ opacity: 0.7 }}>Avaliação corporal</div>
          </div>
        </div>


        {/* Botões de ação (apenas no modo coach) */}
        {!isPublic && (
          <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
            {onNewAssessment && (
              <button className="fm-btn-outline" style={{ flex: 1, minWidth: 140 }} onClick={onNewAssessment}>
                + Nova Avaliação
              </button>
            )}
            {onCompare && (
              <button
                className="fm-btn-outline"
                style={{ flex: 1, minWidth: 140 }}
                onClick={onCompare}
                disabled={!canCompare}
                title={!canCompare ? "Nenhuma avaliação registrada" : "Comparar / editar / excluir avaliações"}
              >
                Comparar avaliações
              </button>
            )}
            {onPrint && (
              <button className="fm-btn-primary" style={{ flex: 1, minWidth: 140 }} onClick={onPrint}>
                Gerar Relatório
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

export default FitMindShapeResultView;
