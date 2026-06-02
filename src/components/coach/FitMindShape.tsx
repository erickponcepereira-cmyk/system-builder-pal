// ============================================================
// FITMIND SHAPE — Script para colar no Lovable
// Cole este conteúdo como prompt no Lovable OU use o código
// diretamente como componente React/TypeScript
// ============================================================
//
// INSTRUÇÕES PARA O LOVABLE:
// 1. Crie um novo projeto no Lovable
// 2. Cole este arquivo completo no editor
// 3. O sistema já está preparado para integração via props/callbacks
//
// DEPENDÊNCIAS NECESSÁRIAS (já disponíveis no Lovable):
// - react, react-dom
// - recharts
// - lucide-react
// - tailwindcss + shadcn/ui
// - date-fns
// ============================================================

import React, { useState, useCallback, useMemo, useEffect, useRef } from "react";
import AssessmentComparison from "./AssessmentComparison";
import FitMindShapeResultView from "./FitMindShapeResultView";
import { useServerFn } from "@tanstack/react-start";
import { createAssessmentShare } from "@/lib/assessment-share.functions";

import {
  LineChart,
  Line,
  PieChart,
  Pie,
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import {
  User,
  Users,
  Plus,
  ChevronRight,
  ChevronLeft,
  Check,
  HelpCircle,
  Camera,
  Calendar,
  Scale,
  Activity,
  Heart,
  Droplets,
  Bone,
  Brain,
  Zap,
  TrendingUp,
  Phone,
  Mail,
  Globe,
  FileText,
  Tag,
  Clock,
  AlertCircle,
  X,
  Search,
  Filter,
  Upload,
  Download,
  Edit3,
  Share2,
  Eye,
  EyeOff,
} from "lucide-react";
import {
  calculateBodyComposition,
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
  type MeasurementInput,
} from "@/lib/body-composition-calculator";
import poseFrente from "@/assets/photo-pose-frente.png";
import poseCostas from "@/assets/photo-pose-costas.png";
import poseLateralDir from "@/assets/photo-pose-lateral-direita.png";
import poseLateralEsq from "@/assets/photo-pose-lateral-esquerda.png";
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

const BODY_AVATAR_IMAGES = [
  bodyAbaixo,
  bodyNormal,
  bodyAcima1,
  bodyAcima2,
  bodyAcima3,
  bodyAlto1,
  bodyAlto2,
  bodyAlto3,
];

const BODY_AVATAR_IMAGES_FEMALE = [
  bodyFAbaixo,
  bodyFNormal,
  bodyFAcima1,
  bodyFAcima2,
  bodyFAcima3,
  bodyFAlto1,
  bodyFAlto2,
  bodyFAlto3,
];

function isFemaleGender(gender?: string) {
  if (!gender) return false;
  const g = gender.toLowerCase().trim();
  return g === "f" || g === "feminino" || g === "female" || g === "mulher";
}

// ============================================================
// TIPOS E INTERFACES
// ============================================================

export interface FitMindClient {
  id: string;
  name: string;
  gender: "male" | "female" | "other";
  ethnicity: "white" | "black" | "asian" | "hispanic" | "indigenous" | "other";
  height: number; // cm
  heightUnit: "cm" | "ft";
  birthDate: string;
  language: "pt" | "en" | "es";
  whatsapp: string;
  email: string;
  notes: string;
  groups: string[];
  avatar?: string;
  assessments?: FitMindAssessment[];
}

export interface FitMindAssessment {
  id: string;
  clientId: string;
  date: string;
  method: "bioimpedance" | "measurements" | "both";
  // Dados básicos
  age: number;
  height: number;
  weight: number;
  bmi: number;
  // Fórmula de bioimpedância usada
  bioFormula?: "harris_benedict" | "cunningham" | "tem_haaf" | "mifflin_st_jeor";
  // Bioimpedância
  bodyFat: number; // % gordura corporal
  skeletalMuscle: number; // % músculo esquelético
  muscleMass: number; // % massa muscular
  visceralFat: number; // % gordura visceral
  basalMetabolism: number; // % referência Harris-Benedict
  bodyAge: number; // % idade corporal sobre idade real
  bodyWater: number; // % água corporal
  boneMass: number; // % massa óssea
  // Segmentos (massa/gordura)
  segmentAnalysis?: {
    leftArm: number;
    rightArm: number;
    trunk: number;
    leftLeg: number;
    rightLeg: number;
  };
  // Circunferências (cm)
  circumferences?: {
    leftForearm?: number;
    rightForearm?: number;
    chest?: number;
    waist?: number;
    abdomen?: number;
    hip?: number;
    leftArm?: number;
    rightArm?: number;
    leftThigh?: number;
    rightThigh?: number;
    leftCalf?: number;
    rightCalf?: number;
  };
  // Diâmetros ósseos (cm)
  boneDiameters?: {
    wrist?: number;
    elbow?: number;
    ankle?: number;
    knee?: number;
    humerus?: number;
    femur?: number;
  };
  // Método de aferição usado
  measurementMethod?: "fita_metrica" | "paquimetro" | "adipometro" | "bioimpedancia" | "dexa" | "ultrassom";
  // Outros dados
  systolicBP?: number;
  diastolicBP?: number;
  heartRate?: number;
  bloodGlucose?: number;
  // Anotações
  clientNotes?: string;
  professionalNotes?: string;
  // Fotos
  photos?: {
    front?: string;
    rightSide?: string;
    back?: string;
    leftSide?: string;
  };
  // Próxima avaliação
  nextAssessmentDate?: string;
  nextAssessmentTime?: string;
  groupId?: string;
}

export interface FitMindCoach {
  id: string;
  name: string;
  email: string;
  phone?: string;
  specialty?: string;
  logo?: string;
  primaryColor?: string;
  whatsapp?: string;
  instagram?: string;
  tiktok?: string;
  website?: string;
}

// ============================================================
// PROPS DE INTEGRAÇÃO COM SISTEMA EXTERNO
// ============================================================

export interface FitMindShapeProps {
  // Dados do coach logado
  coach: FitMindCoach;
  // Clientes existentes do sistema externo
  clients?: FitMindClient[];
  // Grupos disponíveis
  groups?: { id: string; name: string; color?: string }[];
  // Callbacks para integração bidirecional
  onSaveAssessment?: (
    assessment: FitMindAssessment,
    client: FitMindClient,
  ) => Promise<void>;
  onDeleteAssessment?: (
    assessmentId: string,
    reason: string,
    client: FitMindClient,
  ) => Promise<void>;
  onEditAssessment?: (
    assessment: FitMindAssessment,
    client: FitMindClient,
  ) => Promise<void>;
  onCreateClient?: (
    client: Omit<FitMindClient, "id">,
  ) => Promise<FitMindClient>;
  onUpdateClient?: (
    client: FitMindClient,
  ) => Promise<FitMindClient | void>;
  onSearchClients?: (query: string) => Promise<FitMindClient[]>;
  onCreateGoogleCalendarEvent?: (
    date: string,
    time: string,
    clientName: string,
    eventName?: string,
  ) => Promise<{ ok: boolean; htmlLink?: string | null } | void>;
  // Identidade visual herdada do sistema pai
  themeColor?: string; // hex, ex: "#1a7a4a"
  themeFontFamily?: string;
  // Pré-seleção de cliente (usado quando vindo do Desafio)
  initialClientId?: string;
}

// ============================================================
// CONSTANTES DE REFERÊNCIA CLÍNICA
// ============================================================

// ── 8 níveis de IMC alinhados com os 8 avatares (body-abaixo…body-alto-3) ──
const BMI_RANGES = [
  { max: 18.5, label: "Abaixo do peso", color: "#60a5fa", avatar: 0 },
  { max: 24.9, label: "Saudável",       color: "#22c55e", avatar: 1 },
  { max: 27.4, label: "Acima 1",        color: "#a3e635", avatar: 2 },
  { max: 29.9, label: "Acima 2",        color: "#facc15", avatar: 3 },
  { max: 34.9, label: "Acima 3",        color: "#fb923c", avatar: 4 },
  { max: 39.9, label: "Alto 1",         color: "#f87171", avatar: 5 },
  { max: 44.9, label: "Alto 2",         color: "#ef4444", avatar: 6 },
  { max: 100,  label: "Alto 3",         color: "#b91c1c", avatar: 7 },
];

// ── RCQ (WHO 2000) ────────────────────────────────────────────────────────────
const RCQ_RISK = {
  male:   { low: 0.90, mod: 0.95 },
  female: { low: 0.80, mod: 0.85 },
};
function classifyRCQ(rcq: number, gender: string) {
  const limits = gender === "male" ? RCQ_RISK.male : RCQ_RISK.female;
  if (rcq < limits.low)  return { label: "Baixo risco",     color: "#22c55e", eval: "normal" };
  if (rcq <= limits.mod) return { label: "Risco moderado",  color: "#facc15", eval: "warning" };
  return                        { label: "Alto risco",       color: "#ef4444", eval: "danger" };
}

// Faixas de % gordura corporal agora vêm de getBodyFatCategoryACSM (ACSM/FineShape)

// Gordura visceral agora vem de getVisceralFatCategory (Tanita/FineShape)

const TOOLTIPS: Record<string, string> = {
  bmi: "IMC = Peso ÷ Altura². Classificação baseada nas diretrizes NIH/OMS para IMC. Fonte: (8).",
  bodyFat:
    "Percentual de gordura corporal em relação ao peso total. Fonte: (2) Omron Healthcare e (9) Omron Healthcare/Tanita.",
  skeletalMuscle:
    "Percentual de músculo esquelético em relação ao corpo. Fonte: (2) Omron Healthcare e (9) Omron Healthcare/Tanita.",
  visceralFat:
    "Percentual estimado de gordura visceral. Fonte: (2) Omron Healthcare e (9) Omron Healthcare/Tanita.",
  basalMetabolism:
    "Valor absoluto do metabolismo basal em kcal/dia (gasto calórico em repouso). Fonte: (10).",
  bodyAge:
    "Percentual da idade corporal em relação à idade real. Fonte: (2) Omron Healthcare.",
  bodyWater:
    "Percentual de água corporal. Fonte: (2) Omron Healthcare e (9) Omron Healthcare/Tanita.",
  boneMass:
    "Percentual estimado de massa óssea. Fonte: (9) Omron Healthcare/Tanita.",
  muscleMass:
    "Percentual total de tecido muscular no corpo. Fonte: (9) Omron Healthcare/Tanita.",
};

const CLINICAL_SOURCES =
  "Fontes: (1) OMS - Organização Mundial da Saúde; (2) Omron Healthcare; (8) diretrizes NIH/OMS para IMC; (9) Omron Healthcare e Tanita; (10) Harris-Benedict revisado (Roza & Shizgal, 1984); (11) Lee RC et al. (2000) — músculo esquelético por antropometria; (12) Weltman A et al. (1988) — % gordura por circunferências; (13) WHO (2000) — Relação Cintura-Quadril.";

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const FitMindShape: React.FC<FitMindShapeProps> = ({
  coach,
  clients = [],
  groups = [],
  onSaveAssessment,
  onDeleteAssessment,
  onEditAssessment,
  onCreateClient,
  onUpdateClient,
  onSearchClients,
  onCreateGoogleCalendarEvent,
  themeColor = "#dc2626",
  themeFontFamily = "'Outfit', 'Inter', sans-serif",
  initialClientId,
}) => {
  const [screen, setScreen] = useState<
    "home" | "select-client" | "new-client" | "edit-client" | "assessment" | "result" | "compare"
  >("home");
  // "new" = forçar abrir nova avaliação; "browse" = abrir resultado existente se houver
  const [entryIntent, setEntryIntent] = useState<"new" | "browse">("browse");
  const [selectedClient, setSelectedClient] = useState<FitMindClient | null>(
    null,
  );
  const [assessment, setAssessment] = useState<Partial<FitMindAssessment>>({});
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [groupFilter, setGroupFilter] = useState<string>("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [bioUnits, setBioUnits] = useState<Record<string, "%" | "kg" | "cm" | "num">>({});
  const [calcWarnings, setCalcWarnings] = useState<string[]>([]);
  const [calcDone, setCalcDone] = useState(false);
  const setBioUnit = (key: string, unit: "%" | "kg" | "cm" | "num") =>
    setBioUnits((prev) => ({ ...prev, [key]: unit }));
  const [newClientData, setNewClientData] = useState<Partial<FitMindClient>>({
    gender: "female",
    ethnicity: "white",
    language: "pt",
    heightUnit: "cm",
    groups: [],
    name: "",
    birthDate: "",
    whatsapp: "+55 ",
    email: "",
    notes: "",
  });
  const [isCreatingNewGroup, setIsCreatingNewGroup] = useState(false);
  const [newGroupName, setNewGroupName] = useState("");
  const [editingClientData, setEditingClientData] = useState<FitMindClient | null>(null);

  const availableGroups = useMemo(() => {
    const byId = new Map<string, { id: string; name: string; color?: string }>();
    const addGroup = (id?: string, name?: string, color?: string) => {
      const key = (id || name || "").trim();
      if (!key || byId.has(key)) return;
      byId.set(key, { id: key, name: (name || key).trim(), color });
    };

    groups.forEach((group) => addGroup(group.id, group.name, group.color));
    clients.forEach((client) => (client.groups || []).forEach((group) => addGroup(group)));
    (selectedClient?.groups || []).forEach((group) => addGroup(group));
    (newClientData.groups || []).forEach((group) => addGroup(group));
    (editingClientData?.groups || []).forEach((group) => addGroup(group));
    addGroup(assessment.groupId);

    return Array.from(byId.values()).sort((a, b) => a.name.localeCompare(b.name, "pt-BR"));
  }, [groups, clients, selectedClient?.groups, newClientData.groups, editingClientData?.groups, assessment.groupId]);

  // ── Pré-seleção via initialClientId (ex.: vindo do Desafio) ──
  const autoSelectedRef = useRef<string | null>(null);
  useEffect(() => {
    if (!initialClientId) return;
    if (autoSelectedRef.current === initialClientId) return;
    const c = clients.find((x) => x.id === initialClientId);
    if (!c) return;
    autoSelectedRef.current = initialClientId;
    setSelectedClient(c);
    setAssessment({ height: c.height || undefined });
    setStep(0);
    setScreen("assessment");
  }, [initialClientId, clients]);


  // ── Cálculo automático do IMC ────────────────────────────
  const computedBMI = useMemo(() => {
    if (!assessment.weight || !assessment.height) return 0;
    const hm = assessment.height / 100;
    return +(assessment.weight / (hm * hm)).toFixed(1);
  }, [assessment.weight, assessment.height]);

  // ── Pré-preenche dados de "Próxima Avaliação" ao entrar no step Agendamento ──
  useEffect(() => {
    if (screen !== "assessment") return;
    if (step !== 5) return; // index do step "Agendamento" em STEPS
    setAssessment((prev) => {
      const next: Partial<FitMindAssessment> = { ...prev };
      let changed = false;
      if (!next.nextAssessmentDate) {
        const d = new Date();
        d.setDate(d.getDate() + 30);
        next.nextAssessmentDate = d.toISOString().slice(0, 10);
        changed = true;
      }
      if (!next.nextAssessmentTime) {
        next.nextAssessmentTime = "09:00";
        changed = true;
      }
      if (!(next as any).nextAssessmentTitle) {
        (next as any).nextAssessmentTitle = `Avaliação — ${selectedClient?.name ?? "Aluno"}`;
        changed = true;
      }
      return changed ? next : prev;
    });
  }, [screen, step, selectedClient]);

  // Auto-cálculo em tempo real quando método inclui medidas
  useEffect(() => {
    if (assessment.method !== "measurements" && assessment.method !== "both") return;
    if (!selectedClient || !assessment.weight || !assessment.height || !assessment.age) return;
    const circs = assessment.circumferences || {};
    const hasAny = Object.values(circs).some((v) => v != null && (v as number) > 0);
    if (!hasAny) return;
    const input: MeasurementInput = {
      weight: assessment.weight,
      height: assessment.height,
      age: assessment.age,
      gender: selectedClient.gender === "other" ? "female" : selectedClient.gender,
      ethnicity: (selectedClient.ethnicity as MeasurementInput["ethnicity"]) ?? "white",
      waist: circs.waist,
      abdomen: circs.abdomen,
      hip: circs.hip,
      leftArm: circs.leftArm,
      rightArm: circs.rightArm,
      leftForearm: circs.leftForearm,
      rightForearm: circs.rightForearm,
      leftThigh: circs.leftThigh,
      rightThigh: circs.rightThigh,
      leftCalf: circs.leftCalf,
      rightCalf: circs.rightCalf,
    };
    const r = calculateBodyComposition(input);
    setAssessment((prev) => ({
      ...prev,
      bodyFat: r.bodyFat,
      skeletalMuscle: r.skeletalMuscle,
      muscleMass: r.muscleMass,
      basalMetabolism: r.basalMetabolism,
      bodyAge: r.bodyAge,
      bodyWater: r.bodyWater,
      boneMass: r.boneMass,
    }));
    setCalcWarnings(r.warnings);
    setCalcDone(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    assessment.method,
    assessment.weight,
    assessment.height,
    assessment.age,
    assessment.circumferences,
    selectedClient?.gender,
    selectedClient?.ethnicity,
  ]);


  const getBMICategory = (bmi: number) =>
    BMI_RANGES.find((r) => bmi <= r.max) ?? BMI_RANGES[BMI_RANGES.length - 1];
  const getBodyFatCategory = (pct: number, gender: string, age = 30) => {
    const g = gender === "male" ? "male" : "female";
    return getBodyFatCategoryACSM(pct || 0, g, age);
  };
  const getVisceralCategory = (v: number) => getVisceralFatCategory(v || 0);
  const formatPercent = (value?: number) =>
    Number.isFinite(value) ? `${value}%` : "—";

  // ── Histórico mock (substitua pelos dados reais da API) ──
  const historicalData = useMemo(() => {
    const past = (selectedClient?.assessments ?? [])
      .filter((a) => a?.date)
      .slice()
      .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
    return past.map((a) => ({
      date: new Date(a.date).toLocaleDateString("pt-BR", {
        day: "2-digit",
        month: "short",
        year: "2-digit",
      }),
      peso: a.weight,
      gordura: a.bodyFat,
      musculo: a.skeletalMuscle,
      idadeCorp: a.bodyAge,
    }));
  }, [selectedClient]);

  // ── Salvar avaliação ─────────────────────────────────────
  const handleSave = useCallback(async () => {
    if (!selectedClient || !onSaveAssessment) return;
    setIsSaving(true);
    try {
      const assessmentDate = (() => {
        if (assessment.date) {
          const d = new Date(
            assessment.date.length === 10
              ? assessment.date + "T12:00:00"
              : assessment.date
          );
          return isNaN(d.getTime()) ? new Date().toISOString() : d.toISOString();
        }
        return new Date().toISOString();
      })();
      const full: FitMindAssessment = {
        ...(assessment as FitMindAssessment),
        id: Date.now().toString(),
        clientId: selectedClient.id,
        date: assessmentDate,
        bmi: computedBMI,
      };
      await onSaveAssessment(full, selectedClient);
      setAssessment(full);
      setScreen("result");
    } catch (err: any) {
      console.error("Erro ao salvar avaliação:", err);
      const msg = err?.message || err?.error_description || "Erro ao salvar avaliação";
      try {
        // dynamic import to avoid forcing toast in tests
        const { toast } = await import("sonner");
        toast.error(msg);
      } catch {}
      // Stay on the assessment screen — do NOT throw, otherwise the route's
      // error boundary will reset the whole flow.
    } finally {
      setIsSaving(false);
    }
  }, [selectedClient, assessment, computedBMI, onSaveAssessment]);

  // ────────────────────────────────────────────────────────
  // ESTILOS BASE (herda themeColor do sistema pai)
  // ────────────────────────────────────────────────────────
  const css = `
    :root {
      --fm-primary: ${themeColor};
      --fm-primary-light: ${themeColor}22;
      --fm-primary-dark: ${themeColor}dd;
      --fm-font: ${themeFontFamily};
    }
    .fm-app { background: hsl(var(--background) / 0); color: hsl(var(--foreground)); }
    .fm-app * { font-family: var(--fm-font); box-sizing: border-box; }
    .fm-btn-primary {
      background: var(--fm-primary);
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 12px 24px;
      font-weight: 600;
      cursor: pointer;
      transition: opacity .2s;
    }
    .fm-btn-primary:hover { opacity: .88; }
    .fm-btn-outline {
      background: transparent;
      color: var(--fm-primary);
      border: 2px solid var(--fm-primary);
      border-radius: 10px;
      padding: 10px 22px;
      font-weight: 600;
      cursor: pointer;
      transition: all .2s;
    }
    .fm-btn-outline:hover { background: var(--fm-primary-light); }
    .fm-card {
      background: var(--card);
      color: var(--card-foreground);
      border: 1px solid var(--border);
      border-radius: 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,.07);
      padding: 20px;
    }
    .fm-input {
      width: 100%;
      border: 1.5px solid var(--border);
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      transition: border .2s;
      outline: none;
      background: var(--background);
      color: var(--foreground);
      color-scheme: dark;
    }
    .fm-input::-webkit-calendar-picker-indicator,
    .fm-input::-webkit-clear-button { filter: invert(0.85); cursor: pointer; }
    .fm-input::-webkit-datetime-edit,
    .fm-input::-webkit-datetime-edit-fields-wrapper,
    .fm-input::-webkit-datetime-edit-text,
    .fm-input::-webkit-datetime-edit-month-field,
    .fm-input::-webkit-datetime-edit-day-field,
    .fm-input::-webkit-datetime-edit-year-field,
    .fm-input::-webkit-datetime-edit-hour-field,
    .fm-input::-webkit-datetime-edit-minute-field { color: var(--foreground); }
    .fm-input:focus { border-color: var(--fm-primary); }
    .fm-label {
      font-size: 12px;
      font-weight: 600;
      color: var(--muted-foreground);
      margin-bottom: 4px;
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .fm-badge {
      display: inline-block;
      padding: 3px 10px;
      border-radius: 999px;
      font-size: 11px;
      font-weight: 700;
    }
    .fm-section-title {
      font-size: 13px;
      font-weight: 700;
      color: var(--fm-primary);
      text-transform: uppercase;
      letter-spacing: .06em;
      margin-bottom: 12px;
      padding-bottom: 6px;
      border-bottom: 2px solid var(--fm-primary-light);
    }
    .fm-tooltip { position: relative; display: inline-flex; align-items: center; }
    .fm-tooltip-box {
      position: absolute; bottom: 130%; left: 50%; transform: translateX(-50%);
      background: var(--popover, #1e293b); color: var(--popover-foreground, #fff);
      padding: 8px 12px; border-radius: 8px; font-size: 12px; width: 220px;
      text-align: center; z-index: 999; pointer-events: none; line-height: 1.4;
    }
    .fm-avatar-row { display: grid; grid-template-columns: repeat(7, minmax(0, 1fr)); gap: 4px; align-items: end; justify-items: center; padding: 12px 0; width: 100%; }
    .fm-avatar-item { display: flex; flex-direction: column; align-items: center; gap: 4px; width: 100%; min-width: 0; }
    .fm-avatar-img { width: 100%; height: auto; max-height: 138px; object-fit: contain; display: block; }
    .fm-avatar-active { filter: drop-shadow(0 0 8px var(--fm-primary)); }
    .fm-avatar-active .fm-avatar-img { transform: scale(1.08); transform-origin: bottom center; }
    @media (max-width: 480px) { .fm-avatar-row { gap: 2px; } .fm-avatar-img { max-height: 96px; } }
    .fm-step-bar { display: flex; gap: 6px; margin-bottom: 20px; }
    .fm-step-dot { flex: 1; height: 4px; border-radius: 999px; background: var(--muted); transition: background .3s; }
    .fm-step-dot.active { background: var(--fm-primary); }
    @keyframes fm-fade-in { from { opacity: 0; transform: translateY(10px); } to { opacity: 1; transform: translateY(0); } }
    .fm-animate { animation: fm-fade-in .3s ease; }
    /* Result screen — theme-aware via tokens */
    .fm-result-screen { color: var(--foreground); }
    .fm-result-screen .fm-card {
      background: var(--card); color: var(--card-foreground);
      border-color: var(--border); box-shadow: 0 2px 16px rgba(0,0,0,.25);
    }
    .fm-result-screen .fm-section-title { color: var(--foreground); }
    .fm-result-screen table, .fm-result-screen th, .fm-result-screen td { color: var(--foreground); }
    .fm-result-row {
      display: grid; grid-template-columns: 1fr auto auto;
      align-items: center; padding: 12px 0;
      border-bottom: 1px solid var(--border); gap: 12px;
    }
    .fm-result-row:last-child { border-bottom: none; }
    .fm-photo-box {
      border: 2px dashed var(--border); border-radius: 12px;
      width: 100%; aspect-ratio: 3/4;
      display: flex; flex-direction: column; align-items: center; justify-content: center;
      cursor: pointer; transition: all .2s; background: var(--muted);
    }
    .fm-photo-box:hover { border-color: var(--fm-primary); background: var(--fm-primary-light); }
    .fm-select {
      width: 100%; border: 1.5px solid var(--border); border-radius: 10px;
      padding: 10px 14px; font-size: 14px;
      background: var(--background); color: var(--foreground);
      outline: none; cursor: pointer;
    }
    .fm-select:focus { border-color: var(--fm-primary); }
    .fm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .fm-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .fm-eval-dot { width: 10px; height: 10px; border-radius: 50%; display: inline-block; }
    .fm-coach-footer {
      background: var(--fm-primary); color: var(--primary-foreground); border-radius: 16px;
      padding: 20px; display: flex; align-items: center; gap: 16px; margin-top: 24px;
    }
    /* App container — uses theme tokens; no per-style hex overrides needed */
    .fm-app.fm-dark, .fm-app.fm-dark > .fm-animate {
      background: var(--background);
      color: var(--foreground);
    }
    .fm-app.fm-dark .fm-card {
      background: var(--card); color: var(--card-foreground);
      border-color: var(--border); box-shadow: 0 2px 16px rgba(0,0,0,0.25);
    }
    .fm-app.fm-dark .fm-input,
    .fm-app.fm-dark .fm-select {
      background: var(--input, var(--background));
      color: var(--foreground);
      border-color: var(--border);
    }
    .fm-app.fm-dark .fm-input::placeholder { color: var(--muted-foreground); }
    .fm-app.fm-dark .fm-label { color: var(--muted-foreground); }
    .fm-app.fm-dark .fm-photo-box {
      background: var(--muted); border-color: var(--border); color: var(--foreground);
    }
    .fm-app.fm-dark .fm-step-dot { background: var(--muted); }

  `;

  // ────────────────────────────────────────────────────────
  // TOOLTIP COMPONENT
  // ────────────────────────────────────────────────────────
  const Tooltip: React.FC<{ id: string }> = ({ id }) => (
    <span className="fm-tooltip" style={{ marginLeft: 4 }}>
      <HelpCircle
        size={13}
        color="var(--muted-foreground)"
        style={{ cursor: "pointer" }}
        onMouseEnter={() => setActiveTooltip(id)}
        onMouseLeave={() => setActiveTooltip(null)}
      />
      {activeTooltip === id && (
        <span className="fm-tooltip-box">{TOOLTIPS[id]}</span>
      )}
    </span>
  );

  // ────────────────────────────────────────────────────────
  // AVATAR SYSTEM (SVG bodies com gordura crescente)
  // ────────────────────────────────────────────────────────
  const AvatarFigure: React.FC<{
    level: number;
    active?: boolean;
    label: string;
    gender?: string;
  }> = ({ level, active, label, gender }) => {
    const images = isFemaleGender(gender) ? BODY_AVATAR_IMAGES_FEMALE : BODY_AVATAR_IMAGES;
    return (
      <div
        className={`fm-avatar-item ${active ? "fm-avatar-active" : ""}`}
        style={{ opacity: active ? 1 : 0.35 }}
      >
        <img
          className="fm-avatar-img"
          src={images[level] ?? images[1]}
          alt={label}
          style={{
            filter: active ? "none" : "grayscale(0.4)",
          }}
        />
        <span
          style={{
            fontSize: 9,
            color: active ? "var(--fm-primary)" : "var(--muted-foreground)",
            fontWeight: active ? 700 : 400,
            textAlign: "center",
            maxWidth: "100%",
            whiteSpace: "nowrap",
          }}
        >
          {label}
        </span>
      </div>
    );
  };

  // Usa os 8 labels sincronizados com as 8 imagens de avatar
  const AvatarLabels = AVATAR_LABELS_8;

  // ────────────────────────────────────────────────────────
  // AVALIAÇÃO — STEPS LABELS
  // ────────────────────────────────────────────────────────
  const STEPS = [
    "Dados Básicos",
    "Composição Corporal",
    "Anotações",
    "Fotos",
    "Agendamento",
  ];

  const updateNewClient = (key: keyof FitMindClient, value: unknown) => {
    setNewClientData((current) => ({ ...current, [key]: value }));
  };

  const chooseNewClientGroup = (groupName: string) => {
    const name = groupName.trim();
    if (!name) return;
    updateNewClient("groups", [name]);
    setNewGroupName("");
    setIsCreatingNewGroup(false);
  };

  const persistSelectedClientGroup = useCallback(
    async (groupId?: string) => {
      const group = groupId?.trim();
      if (!group || !selectedClient) return;
      const currentGroups = selectedClient.groups || [];
      if (currentGroups[0] === group) return;
      const updatedClient = { ...selectedClient, groups: [group, ...currentGroups.filter((item) => item !== group)] };
      setSelectedClient(updatedClient);
      if (onUpdateClient) {
        try {
          await onUpdateClient(updatedClient);
        } catch (error) {
          console.error("Erro ao salvar grupo do aluno:", error);
        }
      }
    },
    [onUpdateClient, selectedClient],
  );

  // ─── Exportação CSV de alunos + avaliações ────────────────
  const csvEscape = (v: unknown): string => {
    const s = v === null || v === undefined ? "" : String(v);
    if (/[",;\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
    return s;
  };

  const downloadCSV = (filename: string, rows: (string | number | null | undefined)[][]) => {
    const csv = rows.map((r) => r.map(csvEscape).join(";")).join("\r\n");
    // BOM para Excel reconhecer UTF-8
    const blob = new Blob(["\uFEFF" + csv], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const exportClientsCSV = () => {
    const stamp = new Date().toISOString().slice(0, 10);
    const clientHeader = [
      "id", "nome", "email", "whatsapp", "gênero", "etnia", "idioma",
      "data_nascimento", "altura_cm", "grupos", "anotações", "qtd_avaliações",
    ];
    const assessmentHeader = [
      "aluno_id", "aluno_nome", "avaliação_id", "data", "peso_kg", "altura_cm",
      "imc", "gordura_%", "músculo_esquelético_%", "água_%", "massa_muscular_%",
      "massa_óssea_%", "idade_corporal", "metabolismo_basal", "pressão_sistólica",
      "pressão_diastólica", "frequência_cardíaca", "método_aferição",
      "anotações_cliente", "anotações_profissional",
    ];

    const clientRows: (string | number | null | undefined)[][] = [clientHeader];
    const assessmentRows: (string | number | null | undefined)[][] = [assessmentHeader];

    clients.forEach((c) => {
      clientRows.push([
        c.id, c.name, c.email, c.whatsapp, c.gender, c.ethnicity, c.language,
        c.birthDate, c.height, (c.groups || []).join("|"), c.notes,
        c.assessments?.length ?? 0,
      ]);
      (c.assessments || []).forEach((a) => {
        assessmentRows.push([
          c.id, c.name, a.id, a.date, a.weight, a.height, a.bmi,
          a.bodyFat, a.skeletalMuscle, a.bodyWater, a.muscleMass, a.boneMass,
          a.bodyAge, a.basalMetabolism, a.systolicBP, a.diastolicBP, a.heartRate,
          a.measurementMethod, a.clientNotes, a.professionalNotes,
        ]);
      });
    });

    downloadCSV(`fitmind-alunos-${stamp}.csv`, clientRows);
    downloadCSV(`fitmind-avaliacoes-${stamp}.csv`, assessmentRows);
  };

  const formatBrazilWhatsapp = (value: string) => {
    const digits = value.replace(/\D/g, "").replace(/^55/, "").slice(0, 11);
    const ddd = digits.slice(0, 2);
    const firstPart =
      digits.length > 10 ? digits.slice(2, 7) : digits.slice(2, 6);
    const secondPart =
      digits.length > 10 ? digits.slice(7, 11) : digits.slice(6, 10);
    if (!ddd) return "+55 ";
    if (ddd.length < 2) return `+55 (${ddd}`;
    if (!firstPart) return `+55 (${ddd}) `;
    return `+55 (${ddd}) ${firstPart}${secondPart ? `-${secondPart}` : ""}`;
  };

  const createNewClient = async () => {
    if (!onCreateClient) return;
    if (!newClientData.name?.trim()) return alert("Informe o nome do aluno");
    if (!newClientData.groups || newClientData.groups.length === 0) return alert("Selecione ou crie um grupo para o aluno");
    setIsSaving(true);
    try {
      const created = await onCreateClient({
        ...newClientData,
        name: newClientData.name.trim(),
        whatsapp: formatBrazilWhatsapp(newClientData.whatsapp || ""),
      } as Omit<FitMindClient, "id">);
      setSelectedClient(created);
      setAssessment({ height: created.height || undefined });
      setScreen("assessment");
      setStep(0);
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível criar o aluno",
      );
    } finally {
      setIsSaving(false);
    }
  };

  const updateEditingClient = (key: keyof FitMindClient, value: unknown) => {
    setEditingClientData((current) => (current ? { ...current, [key]: value } : current));
  };

  const saveEditedClient = async () => {
    if (!editingClientData || !onUpdateClient) return;
    if (!editingClientData.name?.trim()) return alert("Informe o nome do aluno");
    setIsSaving(true);
    try {
      const updated = await onUpdateClient({
        ...editingClientData,
        name: editingClientData.name.trim(),
        whatsapp: formatBrazilWhatsapp(editingClientData.whatsapp || ""),
      });
      const merged = (updated as FitMindClient) || editingClientData;
      if (selectedClient?.id === merged.id) setSelectedClient(merged);
      setEditingClientData(null);
      setScreen("select-client");
    } catch (error) {
      alert(
        error instanceof Error
          ? error.message
          : "Não foi possível atualizar o aluno",
      );
    } finally {
      setIsSaving(false);
    }
  };

  // ────────────────────────────────────────────────────────
  // TELA: HOME
  // ────────────────────────────────────────────────────────
  const HomeScreen = () => (
    <div
      className="fm-animate"
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "var(--background)",
        color: "var(--card)",
      }}
    >
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 12,
          marginBottom: 32,
        }}
      >
        {coach.logo ? (
          <img
            src={coach.logo}
            alt="Logo"
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              objectFit: "cover",
            }}
          />
        ) : (
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 12,
              background: "var(--fm-primary)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Zap size={22} color="var(--card)" />
          </div>
        )}
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "var(--foreground)",
              letterSpacing: "-0.02em",
            }}
          >
            FitMind Shape
          </div>
          <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
            Olá, {coach.name} 👋
          </div>
        </div>
      </div>

      <div
        className="fm-card"
        style={{
          marginBottom: 16,
          cursor: "pointer",
          background: "var(--fm-primary)",
          border: "none",
        }}
        onClick={() => { setEntryIntent("new"); setScreen("select-client"); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "#ffffff22",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Activity size={24} color="var(--card)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--card)", fontWeight: 700, fontSize: 16 }}>
              Nova Avaliação
            </div>
            <div style={{ color: "#ffffff99", fontSize: 13 }}>
              Iniciar avaliação por bioimpedância
            </div>
          </div>
          <ChevronRight color="#ffffff88" />
        </div>
      </div>

      <div
        className="fm-card"
        style={{ cursor: "pointer" }}
        onClick={() => { setEntryIntent("browse"); setScreen("select-client"); }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div
            style={{
              width: 48,
              height: 48,
              background: "var(--fm-primary-light)",
              borderRadius: 12,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <Users size={24} color="var(--fm-primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "var(--foreground)", fontWeight: 700, fontSize: 16 }}>
              Meus Alunos
            </div>
            <div style={{ color: "var(--muted-foreground)", fontSize: 13 }}>
              {clients.length} alunos cadastrados
            </div>
          </div>
          <ChevronRight color="var(--muted-foreground)" />
        </div>
      </div>

      <div style={{ marginTop: 24, padding: "12px 0" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--muted-foreground)",
            marginBottom: 12,
            textTransform: "uppercase",
            letterSpacing: ".06em",
          }}
        >
          Avaliações Recentes
        </div>
        {clients.slice(0, 3).map((c) => (
          <div
            key={c.id}
            className="fm-card"
            style={{ marginBottom: 8, padding: "12px 16px", cursor: "pointer" }}
            onClick={() => {
              setSelectedClient(c);
              const sorted = (c.assessments ?? [])
                .filter((it) => it?.date)
                .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
              if (sorted.length > 0) {
                setAssessment(sorted[sorted.length - 1]);
                setScreen("result");
              } else {
                setAssessment({ height: c.height || undefined });
                setStep(0);
                setScreen("assessment");
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 36,
                  height: 36,
                  borderRadius: 50,
                  background: "var(--fm-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <User size={18} color="var(--fm-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {c.assessments?.length ?? 0} avaliação(ões) ·{" "}
                  {c.gender === "male" ? "Masc." : "Fem."}
                </div>
              </div>
              <ChevronRight size={16} color="var(--border)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );

  // ────────────────────────────────────────────────────────
  // TELA: SELEÇÃO DE ALUNO
  // ────────────────────────────────────────────────────────
  const SelectClientScreen = () => {
    const filtered = clients.filter(
      (c) => {
        const matchesText =
          c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
          c.email.toLowerCase().includes(searchQuery.toLowerCase());
        if (!matchesText) return false;
        if (!groupFilter) return true;
        return (c.groups || []).includes(groupFilter);
      },
    );
    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "var(--muted)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setScreen("home")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={22} color="var(--muted-foreground)" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>
            Selecionar Aluno
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={16}
              color="var(--muted-foreground)"
              style={{
                position: "absolute",
                left: 12,
                top: "50%",
                transform: "translateY(-50%)",
              }}
            />
            <input
              className="fm-input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar aluno..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
            />
          </div>
          <select
            className="fm-input"
            style={{ width: 160 }}
            value={groupFilter}
            onChange={(e) => setGroupFilter(e.target.value)}
            title="Filtrar por grupo"
          >
            <option value="">Todos os grupos</option>
            {availableGroups.map((g) => (
              <option key={g.id} value={g.id}>{g.name}</option>
            ))}
          </select>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <button
            className="fm-btn-primary"
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onClick={() => setScreen("new-client")}
          >
            <Plus size={18} /> Adicionar Novo Aluno
          </button>
          <button
            onClick={exportClientsCSV}
            title="Exportar alunos e avaliações (CSV)"
            style={{
              padding: "0 14px",
              background: "var(--card)",
              color: "var(--foreground)",
              border: "1px solid var(--border)",
              borderRadius: 8,
              cursor: "pointer",
              display: "flex",
              alignItems: "center",
              gap: 6,
              fontWeight: 600,
            }}
          >
            <Download size={16} /> CSV
          </button>
        </div>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "var(--muted-foreground)",
            marginBottom: 10,
            textTransform: "uppercase",
          }}
        >
          Base de Alunos ({filtered.length})
        </div>

        {filtered.map((c) => (
          <div
            key={c.id}
            className="fm-card"
            style={{
              marginBottom: 8,
              padding: "12px 16px",
              cursor: "pointer",
              border:
                selectedClient?.id === c.id
                  ? "2px solid var(--fm-primary)"
                  : "2px solid transparent",
            }}
            onClick={() => {
              setSelectedClient(c);
              if (entryIntent === "new") {
                setAssessment({ height: c.height || undefined });
                setStep(0);
                setScreen("assessment");
                return;
              }
              const sorted = (c.assessments ?? [])
                .filter((it) => it?.date)
                .sort((x, y) => new Date(x.date).getTime() - new Date(y.date).getTime());
              if (sorted.length > 0) {
                setAssessment(sorted[sorted.length - 1]);
                setScreen("result");
              } else {
                setAssessment({ height: c.height || undefined });
                setStep(0);
                setScreen("assessment");
              }
            }}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div
                style={{
                  width: 40,
                  height: 40,
                  borderRadius: 50,
                  background: "var(--fm-primary-light)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                }}
              >
                <User size={20} color="var(--fm-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div
                  style={{ fontWeight: 600, fontSize: 14, color: "var(--foreground)" }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
                  {c.email} · {c.groups?.join(", ")}
                </div>
              </div>
              {c.whatsapp && (
                <a
                  href={`https://wa.me/${(c.whatsapp.replace(/\D/g, "").length <= 11 ? "55" : "") + c.whatsapp.replace(/\D/g, "")}?text=${encodeURIComponent(`Olá ${c.name.split(" ")[0]}!`)}`}
                  target="_blank"
                  rel="noreferrer"
                  onClick={(e) => e.stopPropagation()}
                  title="Abrir conversa no WhatsApp"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "rgba(34,197,94,0.15)",
                    color: "#16a34a",
                    textDecoration: "none",
                    marginRight: 6,
                  }}
                >
                  <Phone size={14} />
                </a>
              )}
              {onUpdateClient && (
                <button
                  onClick={(e) => {
                    e.stopPropagation();
                    setEditingClientData(c);
                    setScreen("edit-client");
                  }}
                  title="Editar dados do aluno"
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    justifyContent: "center",
                    width: 28,
                    height: 28,
                    borderRadius: 8,
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    cursor: "pointer",
                    marginRight: 6,
                  }}
                >
                  <Edit3 size={14} />
                </button>
              )}
              <ChevronRight size={16} color="var(--border)" />

            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div
            style={{ textAlign: "center", padding: "40px 0", color: "var(--muted-foreground)" }}
          >
            <User size={40} color="var(--border)" />
            <div style={{ marginTop: 8, fontSize: 14 }}>
              Nenhum aluno encontrado
            </div>
          </div>
        )}
      </div>
    );
  };

  // ────────────────────────────────────────────────────────
  // TELA: NOVO ALUNO
  // ────────────────────────────────────────────────────────
  const NewClientScreen = () => {
    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "var(--muted)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 24,
          }}
        >
          <button
            onClick={() => setScreen("select-client")}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={22} color="var(--muted-foreground)" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>
            Novo Aluno
          </div>
        </div>

        <div className="fm-card" style={{ marginBottom: 16 }}>
          <div className="fm-section-title">Dados Pessoais</div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Nome Completo *</label>
            <input
              className="fm-input"
              placeholder="Nome do aluno"
              value={newClientData.name || ""}
              onChange={(e) => updateNewClient("name", e.target.value)}
            />
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Gênero</label>
              <select
                className="fm-select"
                value={newClientData.gender || "female"}
                onChange={(e) => updateNewClient("gender", e.target.value)}
              >
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="fm-label">Etnia</label>
              <select
                className="fm-select"
                value={newClientData.ethnicity || "white"}
                onChange={(e) => updateNewClient("ethnicity", e.target.value)}
              >
                <option value="white">Branca</option>
                <option value="black">Preta</option>
                <option value="asian">Asiática</option>
                <option value="hispanic">Parda</option>
                <option value="indigenous">Indígena</option>
                <option value="other">Outra</option>
              </select>
            </div>
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Data de Nascimento</label>
              <input
                type="date"
                className="fm-input"
                value={newClientData.birthDate || ""}
                onChange={(e) => updateNewClient("birthDate", e.target.value)}
              />
            </div>
            <div>
              <label className="fm-label">Idioma</label>
              <select
                className="fm-select"
                value={newClientData.language || "pt"}
                onChange={(e) => updateNewClient("language", e.target.value)}
              >
                <option value="pt">Português</option>
                <option value="en">English</option>
                <option value="es">Español</option>
              </select>
            </div>
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Altura</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  className="fm-input"
                  placeholder="170"
                  value={newClientData.height || ""}
                  onChange={(e) => updateNewClient("height", +e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className="fm-select"
                  style={{ width: 64 }}
                  value={newClientData.heightUnit || "cm"}
                  onChange={(e) =>
                    updateNewClient("heightUnit", e.target.value)
                  }
                >
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </select>
              </div>
            </div>
            <div>
              <label className="fm-label">WhatsApp</label>
              <input
                className="fm-input"
                inputMode="numeric"
                placeholder="+55 (00) 00000-0000"
                value={newClientData.whatsapp || "+55 "}
                onChange={(e) =>
                  updateNewClient(
                    "whatsapp",
                    formatBrazilWhatsapp(e.target.value),
                  )
                }
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">E-mail</label>
            <input
              type="email"
              className="fm-input"
              placeholder="email@exemplo.com"
              value={newClientData.email || ""}
              onChange={(e) => updateNewClient("email", e.target.value)}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Grupo(s) *</label>
            {!isCreatingNewGroup ? (
              <select
                className="fm-select"
                value={newClientData.groups?.[0] || ""}
                onChange={(e) => {
                  const v = e.target.value;
                  if (v === "__new__") {
                    setIsCreatingNewGroup(true);
                    setNewGroupName("");
                  } else {
                    updateNewClient("groups", v ? [v] : []);
                  }
                }}
              >
                <option value="">Selecione um grupo *</option>
                {availableGroups.map((g) => (
                  <option key={g.id} value={g.id}>{g.name}</option>
                ))}
                <option value="__new__">+ Criar novo grupo...</option>
              </select>
            ) : (
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  className="fm-input"
                  autoFocus
                  placeholder="Nome do novo grupo"
                  value={newGroupName}
                  onChange={(e) => setNewGroupName(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" && newGroupName.trim()) {
                      chooseNewClientGroup(newGroupName);
                    } else if (e.key === "Escape") {
                      setIsCreatingNewGroup(false);
                      setNewGroupName("");
                    }
                  }}
                  style={{ flex: 1 }}
                />
                <button
                  type="button"
                  className="fm-btn-primary"
                  style={{ padding: "0 14px" }}
                  onClick={() => {
                    chooseNewClientGroup(newGroupName);
                  }}
                >
                  OK
                </button>
                <button
                  type="button"
                  style={{
                    padding: "0 14px",
                    background: "var(--muted)",
                    color: "var(--foreground)",
                    border: "1px solid var(--border)",
                    borderRadius: 8,
                    cursor: "pointer",
                  }}
                  onClick={() => {
                    setIsCreatingNewGroup(false);
                    setNewGroupName("");
                  }}
                >
                  Cancelar
                </button>
              </div>
            )}
          </div>
          <div>
            <label className="fm-label">Anotações</label>
            <textarea
              className="fm-input"
              rows={3}
              placeholder="Observações iniciais..."
              style={{ resize: "none" }}
              value={newClientData.notes || ""}
              onChange={(e) => updateNewClient("notes", e.target.value)}
            />
          </div>
        </div>

        <button
          className="fm-btn-primary"
          style={{ width: "100%" }}
          onClick={createNewClient}
          disabled={isSaving}
        >
          {isSaving ? "Criando aluno..." : "Criar Aluno e Iniciar Avaliação"}{" "}
          <ChevronRight
            size={16}
            style={{ display: "inline", marginLeft: 4 }}
          />
        </button>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────
  // TELA: EDITAR DADOS DO ALUNO
  // ────────────────────────────────────────────────────────
  const EditClientScreen = () => {
    if (!editingClientData) return null;
    const c = editingClientData;
    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "var(--muted)" }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button
            onClick={() => { setEditingClientData(null); setScreen("select-client"); }}
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={22} color="var(--muted-foreground)" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "var(--foreground)" }}>
            Editar Aluno
          </div>
        </div>

        <div className="fm-card" style={{ marginBottom: 16 }}>
          <div className="fm-section-title">Dados Pessoais</div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Nome completo *</label>
            <input
              className="fm-input"
              value={c.name || ""}
              onChange={(e) => updateEditingClient("name", e.target.value)}
            />
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Gênero</label>
              <select
                className="fm-select"
                value={c.gender || "female"}
                onChange={(e) => updateEditingClient("gender", e.target.value)}
              >
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
              </select>
            </div>
            <div>
              <label className="fm-label">Etnia</label>
              <select
                className="fm-select"
                value={c.ethnicity || "white"}
                onChange={(e) => updateEditingClient("ethnicity", e.target.value)}
              >
                <option value="white">Branca</option>
                <option value="black">Negra</option>
                <option value="brown">Parda</option>
                <option value="asian">Amarela</option>
                <option value="indigenous">Indígena</option>
              </select>
            </div>
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Data de nascimento</label>
              <input
                type="date"
                className="fm-input"
                value={c.birthDate || ""}
                onChange={(e) => updateEditingClient("birthDate", e.target.value)}
              />
            </div>
            <div>
              <label className="fm-label">Altura</label>
              <div style={{ display: "flex", gap: 6 }}>
                <input
                  type="number"
                  className="fm-input"
                  value={c.height || ""}
                  onChange={(e) => updateEditingClient("height", +e.target.value)}
                  style={{ flex: 1 }}
                />
                <select
                  className="fm-select"
                  style={{ width: 64 }}
                  value={c.heightUnit || "cm"}
                  onChange={(e) => updateEditingClient("heightUnit", e.target.value)}
                >
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </select>
              </div>
            </div>
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">WhatsApp</label>
              <input
                className="fm-input"
                inputMode="numeric"
                value={c.whatsapp || "+55 "}
                onChange={(e) => updateEditingClient("whatsapp", formatBrazilWhatsapp(e.target.value))}
              />
            </div>
            <div>
              <label className="fm-label">E-mail</label>
              <input
                type="email"
                className="fm-input"
                value={c.email || ""}
                onChange={(e) => updateEditingClient("email", e.target.value)}
              />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Grupo</label>
            <select
              className="fm-select"
              value={c.groups?.[0] || ""}
              onChange={(e) => updateEditingClient("groups", e.target.value ? [e.target.value] : [])}
            >
              <option value="">Sem grupo</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label className="fm-label">Anotações</label>
            <textarea
              className="fm-input"
              rows={3}
              style={{ resize: "none" }}
              value={c.notes || ""}
              onChange={(e) => updateEditingClient("notes", e.target.value)}
            />
          </div>
        </div>

        <button
          className="fm-btn-primary"
          style={{ width: "100%" }}
          onClick={saveEditedClient}
          disabled={isSaving}
        >
          {isSaving ? "Salvando..." : "Salvar Alterações"}
        </button>
      </div>
    );
  };


  // ────────────────────────────────────────────────────────
  // TELA: AVALIAÇÃO — FORMULÁRIO MULTI-STEP
  // ────────────────────────────────────────────────────────
  const AssessmentScreen = () => {
    const upd = (k: keyof FitMindAssessment, v: unknown) =>
      setAssessment((a) => ({ ...a, [k]: v }));

    const chooseAssessmentGroup = (groupName: string) => {
      const name = groupName.trim();
      if (!name) return;
      upd("groupId" as keyof FitMindAssessment, name);
      void persistSelectedClientGroup(name);
      setNewGroupName("");
      setIsCreatingNewGroup(false);
    };

    const StepDados = () => {
      const autoAge = (() => {
        if (!selectedClient?.birthDate) return null;
        const b = new Date(selectedClient.birthDate);
        if (isNaN(b.getTime())) return null;
        const refDate = assessment.date
          ? new Date(assessment.date.length === 10 ? assessment.date + "T12:00:00" : assessment.date)
          : new Date();
        const ref = isNaN(refDate.getTime()) ? new Date() : refDate;
        let a = ref.getFullYear() - b.getFullYear();
        const m = ref.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && ref.getDate() < b.getDate())) a--;
        return a;
      })();
      const ageLocked = autoAge !== null;
      // Auto-set quando aluno cadastrado
      if (ageLocked && assessment.age !== autoAge) {
        // setAssessment via upd em microtask
        setTimeout(() => upd("age", autoAge!), 0);
      }
      return (
      <div>
        <div className="fm-section-title">Dados Básicos</div>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">Data da Avaliação</label>
            <input
              type="date"
              className="fm-input"
              value={assessment.date ?? new Date().toISOString().split("T")[0]}
              onChange={(e) => upd("date", e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Método</label>
            <select
              className="fm-select"
              value={assessment.method || "bioimpedance"}
              onChange={(e) => {
                const method = e.target.value as "bioimpedance" | "measurements" | "both";
                upd("method", method);
              }}
            >
              <option value="bioimpedance">Bioimpedância</option>
              <option value="measurements">Medidas (fita métrica)</option>
              <option value="both">Ambos</option>
            </select>
          </div>
        </div>
        <div style={{ marginBottom: 12 }}>
          <label className="fm-label">Tipo de Bioimpedância (fórmula)</label>
          <select
            className="fm-select"
            value={assessment.bioFormula || "harris_benedict"}
            onChange={(e) => upd("bioFormula", e.target.value)}
          >
            <option value="harris_benedict">Harris Benedict (mais comum)</option>
            <option value="cunningham">Cunningham</option>
            <option value="tem_haaf">Tem Haaf</option>
            <option value="mifflin_st_jeor">Mifflin St Jeor</option>
          </select>
        </div>
        <div className="fm-grid-3" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">
              Idade (anos) {ageLocked && <span style={{ fontSize: 10, color: "var(--muted-foreground)" }}>· auto</span>}
            </label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 30"
              value={ageLocked ? autoAge! : (assessment.age ?? "")}
              readOnly={ageLocked}
              onChange={(e) => upd("age", +e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Altura (cm)</label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 165"
              defaultValue={assessment.height || ""}
              onChange={(e) => upd("height", +e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Peso (kg)</label>
            <input
              type="number"
              step="0.1"
              className="fm-input"
              placeholder="Ex: 68.5"
              onChange={(e) => upd("weight", +e.target.value)}
            />
          </div>
        </div>
        <div
          className="fm-card"
          style={{
            background: "var(--fm-primary-light)",
            border: "none",
            padding: "12px 16px",
            display: "flex",
            alignItems: "center",
            gap: 10,
            marginBottom: 12,
          }}
        >
          <Scale size={20} color="var(--fm-primary)" />
          <div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)", fontWeight: 600 }}>
              IMC Calculado <Tooltip id="bmi" />
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "var(--fm-primary)",
              }}
            >
              {computedBMI > 0 ? `${computedBMI} kg/m²` : "—"}
              {computedBMI > 0 && (
                <span
                  className="fm-badge"
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    background: getBMICategory(computedBMI).color,
                    color: "var(--card)",
                  }}
                >
                  {getBMICategory(computedBMI).label}
                </span>
              )}
            </div>
          </div>
        </div>

        {/* Grupo do aluno (editável durante a avaliação) */}
        <div style={{ marginBottom: 12 }}>
          <label className="fm-label">Grupo do aluno</label>
          {!isCreatingNewGroup ? (
            <select
              className="fm-select"
              value={assessment.groupId ?? selectedClient?.groups?.[0] ?? ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new__") {
                  setIsCreatingNewGroup(true);
                  setNewGroupName("");
                } else {
                  upd("groupId" as keyof FitMindAssessment, v || undefined);
                  void persistSelectedClientGroup(v || undefined);
                }
              }}
            >
              <option value="">Sem grupo</option>
              {availableGroups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              <option value="__new__">+ Criar novo grupo...</option>
            </select>
          ) : (
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="fm-input"
                autoFocus
                placeholder="Nome do novo grupo"
                value={newGroupName}
                onChange={(e) => setNewGroupName(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && newGroupName.trim()) {
                    chooseAssessmentGroup(newGroupName);
                  } else if (e.key === "Escape") {
                    setIsCreatingNewGroup(false);
                    setNewGroupName("");
                  }
                }}
                style={{ flex: 1 }}
              />
              <button
                type="button"
                className="fm-btn-primary"
                style={{ padding: "0 14px" }}
                onClick={() => {
                  chooseAssessmentGroup(newGroupName);
                }}
              >
                OK
              </button>
              <button
                type="button"
                style={{
                  padding: "0 14px",
                  background: "var(--muted)",
                  color: "var(--foreground)",
                  border: "1px solid var(--border)",
                  borderRadius: 8,
                  cursor: "pointer",
                }}
                onClick={() => {
                  setIsCreatingNewGroup(false);
                  setNewGroupName("");
                }}
              >
                Cancelar
              </button>
            </div>
          )}
        </div>
      </div>
      );
    };

    const UnitChips = ({ fieldKey, options, defaultUnit }: { fieldKey: string; options: Array<"%" | "kg" | "cm" | "num">; defaultUnit: "%" | "kg" | "cm" | "num" }) => {
      const current = bioUnits[fieldKey] || defaultUnit;
      const labelOf = (u: "%" | "kg" | "cm" | "num") => (u === "num" ? "número" : u);
      return (
        <span style={{ display: "inline-flex", gap: 4, marginLeft: 6 }}>
          {options.map((u) => (
            <button
              key={u}
              type="button"
              onClick={(e) => { e.preventDefault(); setBioUnit(fieldKey, u); }}
              style={{
                fontSize: 10,
                padding: "2px 6px",
                borderRadius: 6,
                border: "1px solid",
                borderColor: current === u ? "var(--fm-primary)" : "var(--border)",
                background: current === u ? "var(--fm-primary)" : "transparent",
                color: current === u ? "var(--card)" : "var(--muted-foreground)",
                cursor: "pointer",
                fontWeight: 700,
              }}
            >
              {labelOf(u)}
            </button>
          ))}
        </span>
      );
    };

    const bioFields: Array<{ key: keyof FitMindAssessment; label: string; tip: string; placeholder: string; defaultUnit: "%" | "kg" | "cm" | "num"; units: Array<"%" | "kg" | "cm" | "num"> }> = [
      { key: "bodyFat", label: "Gordura Corporal", tip: "bodyFat", placeholder: "Ex: 28.5", defaultUnit: "%", units: ["%", "kg", "num"] },
      { key: "skeletalMuscle", label: "Músculo Esquelético", tip: "skeletalMuscle", placeholder: "Ex: 32.4", defaultUnit: "%", units: ["%", "kg", "num"] },
      { key: "muscleMass", label: "Massa Muscular", tip: "muscleMass", placeholder: "Ex: 41.8", defaultUnit: "%", units: ["%", "kg", "num"] },
      { key: "visceralFat", label: "Gordura Visceral", tip: "visceralFat", placeholder: "Ex: 7.0", defaultUnit: "num", units: ["%", "num"] },
      { key: "basalMetabolism", label: "Metabolismo Basal", tip: "basalMetabolism", placeholder: "Ex: 1500", defaultUnit: "num", units: ["num", "%"] },
      { key: "bodyAge", label: "Idade Corporal", tip: "bodyAge", placeholder: "Ex: 32", defaultUnit: "num", units: ["num"] },
      { key: "bodyWater", label: "Água Corporal", tip: "bodyWater", placeholder: "Ex: 52.3", defaultUnit: "%", units: ["%", "kg", "num"] },
      { key: "boneMass", label: "Massa Óssea", tip: "boneMass", placeholder: "Ex: 4.2", defaultUnit: "%", units: ["%", "kg", "num"] },
    ];

    // Estado de cálculo agora vive no componente pai (regras de hooks)


    const handleCalculateFromMeasurements = () => {
      if (!selectedClient || !assessment.weight || !assessment.height || !assessment.age) {
        alert("Preencha Peso, Altura e Idade antes de calcular.");
        return;
      }
      const input: MeasurementInput = {
        weight: assessment.weight,
        height: assessment.height,
        age: assessment.age,
        gender: selectedClient.gender === "other" ? "female" : selectedClient.gender,
        ethnicity: (selectedClient.ethnicity as MeasurementInput["ethnicity"]) ?? "white",
        waist: assessment.circumferences?.waist,
        abdomen: assessment.circumferences?.abdomen,
        hip: assessment.circumferences?.hip,
        leftArm: assessment.circumferences?.leftArm,
        rightArm: assessment.circumferences?.rightArm,
        leftForearm: assessment.circumferences?.leftForearm,
        rightForearm: assessment.circumferences?.rightForearm,
        leftThigh: assessment.circumferences?.leftThigh,
        rightThigh: assessment.circumferences?.rightThigh,
        leftCalf: assessment.circumferences?.leftCalf,
        rightCalf: assessment.circumferences?.rightCalf,
      };
      const r = calculateBodyComposition(input);
      setAssessment((prev) => ({
        ...prev,
        bodyFat: r.bodyFat,
        skeletalMuscle: r.skeletalMuscle,
        muscleMass: r.muscleMass,
        basalMetabolism: r.basalMetabolism,
        bodyAge: r.bodyAge,
        bodyWater: r.bodyWater,
        boneMass: r.boneMass,
        visceralFat: prev.visceralFat || 0, // não calculável sem BIA
      }));
      setCalcWarnings(r.warnings);
      setCalcDone(true);
    };

    const StepMedidas = () => {
      const showMeasurements =
        assessment.method === "measurements" || assessment.method === "both";
      const showBioimpedance =
        !assessment.method ||
        assessment.method === "bioimpedance" ||
        assessment.method === "both";
      return (
      <>
      {showMeasurements && (
      <div>

        <div className="fm-section-title">Circunferências por Medição (cm)</div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 14 }}>
          Informe as medidas com a fita métrica. Após preencher, clique em{" "}
          <strong>Calcular Composição Corporal</strong> para gerar automaticamente
          gordura, músculo, metabolismo e demais indicadores.
        </p>

        {/* Circunferências */}
        <div className="fm-grid-2">
          {(
            [
              ["Cintura (cm)", "waist"],
              ["Abdômen (cm)", "abdomen"],
              ["Quadril (cm)", "hip"],
              ["Tórax (cm)", "chest"],
              ["Braço Esq. (cm)", "leftArm"],
              ["Braço Dir. (cm)", "rightArm"],
              ["Antebraço Esq. (cm)", "leftForearm"],
              ["Antebraço Dir. (cm)", "rightForearm"],
              ["Coxa Esq. (cm)", "leftThigh"],
              ["Coxa Dir. (cm)", "rightThigh"],
              ["Panturrilha Esq. (cm)", "leftCalf"],
              ["Panturrilha Dir. (cm)", "rightCalf"],
            ] as const
          ).map(([label, key]) => (
            <div key={`circ_${key}`}>
              <label className="fm-label">{label}</label>
              <input
                type="number"
                step="0.1"
                className="fm-input"
                placeholder="Ex: 80.5"
                value={(assessment.circumferences as any)?.[key] ?? ""}
                onChange={(e) =>
                  upd("circumferences" as keyof FitMindAssessment, {
                    ...(assessment.circumferences || {}),
                    [key]: e.target.value === "" ? undefined : +e.target.value,
                  })
                }
              />
            </div>
          ))}
        </div>

        {/* Botão de cálculo */}
        <button
          className="fm-btn-primary"
          style={{ width: "100%", marginTop: 20, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          type="button"
          onClick={handleCalculateFromMeasurements}
        >
          <Activity size={16} />
          {calcDone ? "Recalcular Composição Corporal" : "Calcular Composição Corporal"}
        </button>

        {/* Avisos de precisão */}
        {calcWarnings.length > 0 && (
          <div style={{ marginTop: 12, padding: "10px 14px", background: "var(--fm-primary-light)", borderRadius: 10, fontSize: 12, color: "var(--foreground)" }}>
            <strong>⚠️ Atenção:</strong>
            <ul style={{ margin: "4px 0 0 0", paddingLeft: 16 }}>
              {calcWarnings.map((w, i) => <li key={i}>{w}</li>)}
            </ul>
          </div>
        )}

        {/* Preview dos valores calculados */}
        {calcDone && (
          <div style={{ marginTop: 16, padding: "14px", background: "rgba(34,197,94,0.08)", border: "1.5px solid #22c55e33", borderRadius: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#16a34a", marginBottom: 10 }}>
              ✓ Valores calculados automaticamente
            </div>
            <div className="fm-grid-2" style={{ gap: 8 }}>
              {[
                ["% Gordura", assessment.bodyFat, "%"],
                ["% Músculo Esq.", assessment.skeletalMuscle, "%"],
                ["% Massa Muscular", assessment.muscleMass, "%"],
                ["Metabolismo Basal", assessment.basalMetabolism, "kcal"],
                ["% Água Corporal", assessment.bodyWater, "%"],
                ["% Massa Óssea", assessment.boneMass, "%"],
                ["Idade Corporal", assessment.bodyAge, "anos"],
                ...((() => {
                  const w = assessment.circumferences?.waist ?? assessment.circumferences?.abdomen;
                  const h = assessment.circumferences?.hip;
                  if (!w || !h || h === 0) return [] as Array<[string, any, string]>;
                  const rcqVal = +(w / h).toFixed(2);
                  const limits = selectedClient?.gender === "male"
                    ? { low: 0.90, mod: 0.95 }
                    : { low: 0.80, mod: 0.85 };
                  const rcqLabel = rcqVal < limits.low
                    ? "Baixo risco"
                    : rcqVal <= limits.mod
                      ? "Risco moderado"
                      : "Alto risco";
                  return [["RCQ (cintura/quadril)", `${rcqVal} — ${rcqLabel}`, ""]] as Array<[string, any, string]>;
                })()),
              ].map(([label, value, unit]) => (
                <div key={label as string} style={{ fontSize: 12 }}>
                  <span style={{ color: "var(--muted-foreground)" }}>{label}:</span>{" "}
                  <strong>{value != null && Number.isFinite(+value!) ? `${value} ${unit}` : "—"}</strong>
                </div>
              ))}
            </div>
            <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginTop: 10, marginBottom: 0 }}>
              💡 A Gordura Visceral não pode ser calculada sem bioimpedância — deixe em branco ou insira manualmente se disponível.
            </p>
          </div>
        )}

        {/* Gordura Visceral manual (opcional) */}
        <div style={{ marginTop: 16 }}>
          <label className="fm-label">Gordura Visceral (opcional — inserir manualmente se disponível)</label>
          <input
            type="number"
            step="0.5"
            className="fm-input"
            placeholder="Ex: 8 (somente se disponível)"
            value={assessment.visceralFat || ""}
            onChange={(e) => upd("visceralFat", e.target.value ? +e.target.value : 0)}
          />
        </div>

      </div>

      )}

      {showBioimpedance && (
      <div style={{ marginTop: showMeasurements ? 20 : 0 }}>
        <div className="fm-section-title">Bioimpedância</div>
        <p style={{ fontSize: 11, color: "var(--muted-foreground)", marginBottom: 10 }}>
          Selecione a unidade do valor que você está digitando para cada campo. O Metabolismo Basal deve ser
          preenchido em <strong>número</strong> (kcal/dia) — esse valor será usado direto como gasto calórico em repouso.
        </p>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          {bioFields.map((f) => {
            const unit = bioUnits[f.key as string] || f.defaultUnit;
            return (
              <div key={f.key as string}>
                <label className="fm-label">
                  {f.label} ({unit === "num" ? "número" : unit}) <Tooltip id={f.tip} />
                  <UnitChips fieldKey={f.key as string} options={f.units} defaultUnit={f.defaultUnit} />
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="fm-input"
                  placeholder={f.placeholder}
                  onChange={(e) => upd(f.key, +e.target.value)}
                />
              </div>
            );
          })}
        </div>
      </div>
      )}
      </>
      );
    };





    const StepAnotacoes = () => (
      <div>
        <div className="fm-section-title">Anotações</div>
        <div style={{ marginBottom: 16 }}>
          <label
            className="fm-label"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <FileText size={13} color="var(--fm-primary)" /> Para o Aluno
          </label>
          <textarea
            className="fm-input"
            rows={5}
            placeholder="Observações que serão visíveis para o aluno no relatório..."
            style={{ resize: "none" }}
            onChange={(e) => upd("clientNotes", e.target.value)}
          />
        </div>
        <div>
          <label
            className="fm-label"
            style={{ display: "flex", alignItems: "center", gap: 4 }}
          >
            <FileText size={13} color="#ef4444" /> Para o Profissional
            <span
              style={{
                fontSize: 10,
                background: "#fef2f2",
                color: "#ef4444",
                padding: "2px 6px",
                borderRadius: 4,
                marginLeft: 4,
              }}
            >
              🔒 Não aparece no relatório
            </span>
          </label>
          <textarea
            className="fm-input"
            rows={5}
            placeholder="Anotações internas — apenas você verá..."
            style={{ resize: "none" }}
            onChange={(e) => upd("professionalNotes", e.target.value)}
          />
        </div>
      </div>
    );

    const StepFotos = () => {
      const VIEWS = [
        { key: "front" as const, label: "1. De Frente", guide: poseFrente },
        { key: "back" as const, label: "2. De Costas", guide: poseCostas },
        { key: "rightSide" as const, label: "3. Lateral Direita", guide: poseLateralDir },
        { key: "leftSide" as const, label: "4. Lateral Esquerda", guide: poseLateralEsq },
      ];
      const photosObj = (assessment.photos || {}) as Record<string, string | undefined>;
      const handlePhotoFile = (key: "front" | "back" | "rightSide" | "leftSide", file: File | null) => {
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
          const dataUrl = String(reader.result || "");
          upd("photos" as keyof FitMindAssessment, {
            ...(assessment.photos || {}),
            [key]: dataUrl,
          } as any);
        };
        reader.readAsDataURL(file);
      };
      return (
        <div>
          <div className="fm-section-title">Fotos</div>
          <div
            style={{
              background: "hsl(var(--accent) / 0.4)",
              border: "1.5px solid hsl(var(--border))",
              borderRadius: 10,
              padding: "10px 14px",
              marginBottom: 16,
              fontSize: 12,
              color: "hsl(var(--foreground))",
            }}
          >
            💡 Posicione o aluno em roupa íntima, em pé, braços levemente
            afastados do corpo, olhando para frente. Toque em cada cartão para
            tirar/escolher a foto correspondente.
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {VIEWS.map((v) => {
              const photo = photosObj[v.key];
              const inputId = `fm-photo-${v.key}`;
              return (
                <div key={v.key}>
                  <label className="fm-label" style={{ marginBottom: 6 }}>
                    {v.label}
                  </label>
                  <label
                    htmlFor={inputId}
                    className="fm-photo-box"
                    style={{
                      position: "relative",
                      overflow: "hidden",
                      padding: 0,
                      display: "block",
                      cursor: "pointer",
                    }}
                  >
                    <img
                      src={photo || v.guide}
                      alt={`${v.label}`}
                      style={{
                        width: "100%",
                        height: "100%",
                        objectFit: "cover",
                        opacity: photo ? 1 : 0.85,
                      }}
                    />
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "flex-end",
                        padding: 10,
                        background:
                          "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 50%)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 6,
                          color: "var(--card)",
                          fontSize: 11,
                          fontWeight: 600,
                        }}
                      >
                        <Camera size={14} />{" "}
                        {photo ? "Trocar foto" : "Toque para adicionar"}
                      </div>
                    </div>
                    <input
                      id={inputId}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      style={{ display: "none" }}
                      onChange={(e) =>
                        handlePhotoFile(v.key, e.target.files?.[0] || null)
                      }
                    />
                  </label>
                  {photo && (
                    <button
                      type="button"
                      onClick={() =>
                        upd("photos" as keyof FitMindAssessment, {
                          ...(assessment.photos || {}),
                          [v.key]: undefined,
                        } as any)
                      }
                      style={{
                        marginTop: 6,
                        fontSize: 11,
                        background: "transparent",
                        border: "1px solid var(--border)",
                        color: "var(--muted-foreground)",
                        borderRadius: 6,
                        padding: "4px 8px",
                        cursor: "pointer",
                        width: "100%",
                      }}
                    >
                      Remover
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      );
    };

    const StepAgendamento = () => (
      <div>
        <div className="fm-section-title">Próxima Avaliação</div>
        <div
          className="fm-card"
          style={{
            marginBottom: 16,
            border: "2px solid var(--fm-primary-light)",
            padding: "16px",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              marginBottom: 16,
            }}
          >
            <Calendar size={20} color="var(--fm-primary)" />
            <span style={{ fontWeight: 600, color: "var(--foreground)" }}>
              Agendar no Google Agenda
            </span>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Nome do evento</label>
            <input
              type="text"
              className="fm-input"
              placeholder={`Avaliação — ${selectedClient?.name ?? "Aluno"}`}
              value={(assessment as any).nextAssessmentTitle ?? ""}
              onChange={(e) => upd("nextAssessmentTitle" as any, e.target.value)}
            />
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Data</label>
              <input
                type="date"
                className="fm-input"
                value={assessment.nextAssessmentDate ?? ""}
                onChange={(e) => upd("nextAssessmentDate", e.target.value)}
              />
            </div>
            <div>
              <label className="fm-label">Horário</label>
              <input
                type="time"
                className="fm-input"
                value={assessment.nextAssessmentTime ?? ""}
                onChange={(e) => upd("nextAssessmentTime", e.target.value)}
              />
            </div>
          </div>
          <button
            className="fm-btn-outline"
            style={{
              width: "100%",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: 8,
            }}
            onClick={async () => {
              if (
                onCreateGoogleCalendarEvent &&
                assessment.nextAssessmentDate &&
                assessment.nextAssessmentTime &&
                selectedClient
              ) {
                const customTitle = ((assessment as any).nextAssessmentTitle as string | undefined)?.trim();
                try {
                  const result: any = await onCreateGoogleCalendarEvent(
                    assessment.nextAssessmentDate,
                    assessment.nextAssessmentTime,
                    selectedClient.name,
                    customTitle || undefined,
                  );
                  const ok = result?.ok !== false;
                  const { toast } = await import("sonner");
                  if (ok) {
                    toast.success("Evento criado com sucesso!");
                    await handleSave();
                  } else {
                    toast.error(result?.error || "Não foi possível criar o evento");
                  }
                } catch (err: any) {
                  const { toast } = await import("sonner");
                  toast.error(err?.message || "Erro ao criar evento");
                }
              }
            }}
          >
            <Calendar size={16} /> Criar Evento no Google Agenda
          </button>
        </div>
      </div>
    );

    // Usa StepMedidas quando o método é por medição, StepBioimpedância para BIA
    const isMeasurements = assessment.method === "measurements";
    const stepComponents = [
      StepDados,
      StepMedidas,
      StepAnotacoes,
      StepFotos,
      StepAgendamento,
    ];
    const StepComponent = stepComponents[step];

    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "var(--muted)" }}
      >
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            marginBottom: 8,
          }}
        >
          <button
            onClick={() =>
              step > 0 ? setStep((s) => s - 1) : setScreen("select-client")
            }
            style={{ background: "none", border: "none", cursor: "pointer" }}
          >
            <ChevronLeft size={22} color="var(--muted-foreground)" />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "var(--foreground)" }}>
              Nova Avaliação
            </div>
            <div style={{ fontSize: 12, color: "var(--muted-foreground)" }}>
              {selectedClient?.name} · {STEPS[step]}
              {step === 1 && (
                <span style={{ marginLeft: 6, fontSize: 10, padding: "2px 6px", borderRadius: 4,
                  background: assessment.method === "measurements" ? "#f0fdf4" : "#eff6ff",
                  color: assessment.method === "measurements" ? "#16a34a" : "#2563eb",
                  fontWeight: 700 }}>
                  {assessment.method === "measurements" ? "📏 Fita métrica" : "⚡ Bioimpedância"}
                </span>
              )}
            </div>
          </div>
        </div>

        <div className="fm-step-bar">
          {STEPS.map((_, i) => (
            <div
              key={i}
              className={`fm-step-dot ${i <= step ? "active" : ""}`}
            />
          ))}
        </div>

        <div
          className="fm-card fm-animate"
          key={step}
          style={{ marginBottom: 16 }}
        >
          {StepComponent()}
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {step < STEPS.length - 1 ? (
            <button
              className="fm-btn-primary"
              style={{ flex: 1 }}
              onClick={() => setStep((s) => s + 1)}
            >
              Próximo <ChevronRight size={16} style={{ display: "inline" }} />
            </button>
          ) : (
            <button
              className="fm-btn-primary"
              style={{ flex: 1, background: "#16a34a" }}
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving ? "Salvando..." : "✓ Finalizar Avaliação"}
            </button>
          )}
        </div>
        <div
          style={{
            fontSize: 11,
            color: "var(--muted-foreground)",
            textAlign: "center",
            marginTop: 8,
          }}
        >
          Passo {step + 1} de {STEPS.length}
        </div>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────
  // TELA: RESULTADO
  // ────────────────────────────────────────────────────────
  const createShareFn = useServerFn(createAssessmentShare);
  const [sharingResult, setSharingResult] = useState(false);

  const handleShareResult = async (client: FitMindClient, a: FitMindAssessment) => {
    if (!a?.id) {
      const { toast } = await import("sonner");
      toast.error("Salve a avaliação antes de compartilhar.");
      return;
    }
    setSharingResult(true);
    try {
      const { token } = await createShareFn({ data: { assessmentId: a.id, clientName: client.name } });
      const url = `${window.location.origin}/resultado/${token}`;
      const { toast } = await import("sonner");
      if (navigator.share) {
        try {
          await navigator.share({ title: `Resultado — ${client.name}`, url });
          toast.success("Link compartilhado");
        } catch {
          /* user cancelled */
        }
      } else {
        await navigator.clipboard.writeText(url);
        toast.success("Link copiado: " + url);
      }
    } catch (e: any) {
      const { toast } = await import("sonner");
      toast.error(e?.message || "Não foi possível gerar o link");
    } finally {
      setSharingResult(false);
    }
  };

  const ResultScreen = () => {
    const client = selectedClient!;
    const a = assessment as FitMindAssessment;
    return (
      <FitMindShapeResultView
        mode="coach"
        client={client}
        assessment={a}
        allAssessments={selectedClient?.assessments ?? []}
        coach={{
          name: coach.name,
          logo: coach.logo,
          specialty: coach.specialty,
          email: coach.email,
          whatsapp: coach.whatsapp || coach.phone,
          instagram: coach.instagram,
          tiktok: coach.tiktok,
          website: coach.website,
        }}
        themeColor={themeColor}
        themeFontFamily={themeFontFamily}
        onBack={() => setScreen("home")}
        onShare={() => handleShareResult(client, a)}
        sharingResult={sharingResult}
        onNewAssessment={() => {
          setAssessment({ height: selectedClient?.height || undefined });
          setStep(0);
          setScreen("assessment");
        }}
        onCompare={() => setScreen("compare")}
        canCompare={(selectedClient?.assessments?.length ?? 0) >= 1}
        onPrint={() => window.print()}
      />
    );
  };

  // ────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ────────────────────────────────────────────────────────
  return (
    <div
      className="fm-app fm-dark"
      style={{ maxWidth: 480, margin: "0 auto", fontFamily: themeFontFamily, background: "var(--background)", minHeight: "100vh" }}
    >
      <style>{css}</style>
      {screen === "home" && HomeScreen()}
      {screen === "select-client" && SelectClientScreen()}
      {screen === "new-client" && NewClientScreen()}
      {screen === "edit-client" && EditClientScreen()}
      {screen === "assessment" && AssessmentScreen()}
      {screen === "result" && selectedClient && ResultScreen()}
      {screen === "compare" && selectedClient && (
        <AssessmentComparison
          client={selectedClient}
          themeColor={themeColor}
          onBack={() => setScreen("result")}
          onDelete={
            onDeleteAssessment
              ? async (id, reason) => {
                  await onDeleteAssessment(id, reason, selectedClient);
                  const remaining = (selectedClient.assessments || []).filter((item) => item.id !== id);
                  setSelectedClient({ ...selectedClient, assessments: remaining });
                  setAssessment((current) => {
                    if (current.id !== id) return current;
                    return remaining.slice().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())[0] || {};
                  });
                }
              : undefined
          }
          onEdit={
            onEditAssessment
              ? async (updated) => {
                  await onEditAssessment(updated, selectedClient);
                  const updatedList = (selectedClient.assessments || []).map((item) =>
                    item.id === updated.id ? updated : item,
                  );
                  setSelectedClient({ ...selectedClient, assessments: updatedList });
                  setAssessment((current) => (current.id === updated.id ? updated : current));
                }
              : undefined
          }
        />
      )}
    </div>
  );
};

export default FitMindShape;

// ============================================================
// EXEMPLO DE USO NO SISTEMA PAI (Lovable)
// ============================================================
/*
import FitMindShape from "./FitMindShape";

// No componente raiz do seu sistema:
<FitMindShape
  coach={{
    id: "coach-001",
    name: "Dr. Fulano Coach",
    email: "coach@meuapp.com",
    specialty: "Nutrição & Performance",
    logo: "/logo-coach.png",
  }}
  clients={clientesDoSistema}  // array do seu banco de dados
  groups={[
    { id: "g1", name: "Desafio 30 Dias", color: "#22c55e" },
    { id: "g2", name: "Alunos Premium", color: "#6366f1" },
  ]}
  themeColor={sistemaPai.primaryColor}     // herda a cor do sistema pai
  themeFontFamily={sistemaPai.fontFamily}  // herda a fonte do sistema pai
  onSaveAssessment={async (assessment, client) => {
    // Salva no seu banco de dados
    await api.post("/assessments", { assessment, client });
    // Sincroniza com o sistema interligado
    await externalApi.sync({ assessment, client });
  }}
  onCreateClient={async (clientData) => {
    const res = await api.post("/clients", clientData);
    return res.data; // retorna o cliente com ID gerado
  }}
  onSearchClients={async (query) => {
    const res = await api.get("/clients/search", { params: { q: query } });
    return res.data;
  }}
  onCreateGoogleCalendarEvent={async (date, time, clientName) => {
    await api.post("/calendar/events", { date, time, clientName });
    return { ok: true };
  }}
/>
*/
