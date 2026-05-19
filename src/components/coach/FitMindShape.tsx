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

import React, { useState, useCallback, useMemo } from "react";
import AssessmentComparison from "./AssessmentComparison";
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
} from "lucide-react";
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
  method: "bioimpedance" | "measurements";
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
  // Segmentos
  segmentAnalysis?: {
    leftArm: number;
    rightArm: number;
    trunk: number;
    leftLeg: number;
    rightLeg: number;
  };
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
}

// ============================================================
// CONSTANTES DE REFERÊNCIA CLÍNICA
// ============================================================

const BMI_RANGES = [
  { max: 18.5, label: "Abaixo do peso", color: "#60a5fa", avatar: 0 },
  { max: 24.9, label: "Normal", color: "#22c55e", avatar: 1 },
  { max: 27.5, label: "Acima do peso I", color: "#facc15", avatar: 2 },
  { max: 29.9, label: "Acima do peso II", color: "#fb923c", avatar: 3 },
  { max: 34.9, label: "Obesidade I", color: "#f87171", avatar: 4 },
  { max: 39.9, label: "Obesidade II", color: "#ef4444", avatar: 5 },
  { max: 100, label: "Obesidade III", color: "#b91c1c", avatar: 6 },
];

const BODY_FAT_RANGES = {
  male: [
    { max: 6, label: "Atleta", eval: "excellent" },
    { max: 13, label: "Fitness", eval: "good" },
    { max: 17, label: "Aceitável", eval: "normal" },
    { max: 25, label: "Acima", eval: "warning" },
    { max: 100, label: "Obeso", eval: "danger" },
  ],
  female: [
    { max: 14, label: "Atleta", eval: "excellent" },
    { max: 20, label: "Fitness", eval: "good" },
    { max: 24, label: "Aceitável", eval: "normal" },
    { max: 31, label: "Acima", eval: "warning" },
    { max: 100, label: "Obeso", eval: "danger" },
  ],
};

const VISCERAL_FAT_RANGES = [
  { max: 9, label: "Normal", eval: "normal", color: "#22c55e" },
  { max: 14, label: "Alto", eval: "warning", color: "#fb923c" },
  { max: 30, label: "Muito Alto", eval: "danger", color: "#ef4444" },
];

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
  "Fontes: (1) OMS - Organização Mundial da Saúde; (2) Omron Healthcare; (8) diretrizes NIH/OMS para IMC; (9) Omron Healthcare e Tanita; (10) Método Harris-Benedict.";

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
  onSearchClients,
  onCreateGoogleCalendarEvent,
  themeColor = "#dc2626",
  themeFontFamily = "'Outfit', 'Inter', sans-serif",
}) => {
  const [screen, setScreen] = useState<
    "home" | "select-client" | "new-client" | "assessment" | "result" | "compare"
  >("home");
  // "new" = forçar abrir nova avaliação; "browse" = abrir resultado existente se houver
  const [entryIntent, setEntryIntent] = useState<"new" | "browse">("browse");
  const [selectedClient, setSelectedClient] = useState<FitMindClient | null>(
    null,
  );
  const [assessment, setAssessment] = useState<Partial<FitMindAssessment>>({});
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [bioUnits, setBioUnits] = useState<Record<string, "%" | "kg" | "cm" | "num">>({});
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

  // ── Cálculo automático do IMC ────────────────────────────
  const computedBMI = useMemo(() => {
    if (!assessment.weight || !assessment.height) return 0;
    const hm = assessment.height / 100;
    return +(assessment.weight / (hm * hm)).toFixed(1);
  }, [assessment.weight, assessment.height]);

  const bmiPercent = useMemo(() => {
    if (!computedBMI) return 0;
    return +((computedBMI / 24.9) * 100).toFixed(1);
  }, [computedBMI]);

  const getBMICategory = (bmi: number) =>
    BMI_RANGES.find((r) => bmi <= r.max) ?? BMI_RANGES[BMI_RANGES.length - 1];
  const getBodyFatCategory = (pct: number, gender: string) => {
    const ranges =
      gender === "male" ? BODY_FAT_RANGES.male : BODY_FAT_RANGES.female;
    return ranges.find((r) => pct <= r.max) ?? ranges[ranges.length - 1];
  };
  const getVisceralCategory = (v: number) =>
    VISCERAL_FAT_RANGES.find((r) => v <= r.max) ?? VISCERAL_FAT_RANGES[2];
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
      const full: FitMindAssessment = {
        ...(assessment as FitMindAssessment),
        id: Date.now().toString(),
        clientId: selectedClient.id,
        date: new Date().toISOString(),
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
    }
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
    /* Dark theme overrides for result screen */
    .fm-result-screen { color: #ffffff; }
    .fm-result-screen .fm-card { background: #0f172a; color: #ffffff; border-color: #1e293b; box-shadow: 0 2px 16px rgba(0,0,0,.5); }
    .fm-result-screen .fm-section-title { color: #ffffff !important; }
    .fm-result-screen table, .fm-result-screen th, .fm-result-screen td { color: #ffffff !important; }
    .fm-result-screen [style*="color: #1e293b"], .fm-result-screen [style*="color:#1e293b"] { color: #ffffff !important; }
    .fm-result-screen [style*="color: #64748b"], .fm-result-screen [style*="color:#64748b"] { color: #e2e8f0 !important; }
    .fm-result-screen [style*="color: #94a3b8"], .fm-result-screen [style*="color:#94a3b8"] { color: #cbd5e1 !important; }
    .fm-result-screen [style*="background: #f0fdf4"] { background: rgba(34,197,94,0.12) !important; }
    .fm-result-screen [style*="background: #fef2f2"] { background: rgba(239,68,68,0.12) !important; }
    .fm-result-screen [style*="background: #f8fafc"] { background: #1e293b !important; }
    .fm-result-screen [style*="background: #ffffff"], .fm-result-screen [style*="background:#ffffff"], .fm-result-screen [style*="background: #fff"] { background: #1e293b !important; }
    .fm-result-screen [style*="background: #eff6ff"] { background: rgba(96,165,250,0.12) !important; }
    .fm-result-screen [style*="background: #f5f3ff"] { background: rgba(167,139,250,0.12) !important; }
    .fm-result-screen [style*="border-top: 1px solid #f1f5f9"] { border-top-color: #1e293b !important; }
    .fm-result-screen [style*="border: 1px solid #e2e8f0"] { border-color: #334155 !important; }
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
      background: var(--fm-primary); color: #fff; border-radius: 16px;
      padding: 20px; display: flex; align-items: center; gap: 16px; margin-top: 24px;
    }
    /* === Dark mode global do FitMindShape === */
    .fm-app.fm-dark, .fm-app.fm-dark > .fm-animate { background: #0A0A0A !important; color: #ffffff; }
    .fm-app.fm-dark [style*="background: #f8fafc"], .fm-app.fm-dark [style*="background:#f8fafc"] { background: #0A0A0A !important; }
    .fm-app.fm-dark [style*="background: #ffffff"], .fm-app.fm-dark [style*="background:#ffffff"], .fm-app.fm-dark [style*="background: #fff"], .fm-app.fm-dark [style*="background:#fff"], .fm-app.fm-dark [style*="background: white"], .fm-app.fm-dark [style*="background:white"] { background: #1A1A1A !important; }
    .fm-app.fm-dark [style*="background: #f1f5f9"], .fm-app.fm-dark [style*="background:#f1f5f9"] { background: #1f2937 !important; }
    .fm-app.fm-dark [style*="background: #f5f5f5"], .fm-app.fm-dark [style*="background:#f5f5f5"] { background: #1f2937 !important; }
    .fm-app.fm-dark [style*="color: #1e293b"], .fm-app.fm-dark [style*="color:#1e293b"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #0f172a"], .fm-app.fm-dark [style*="color:#0f172a"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #334155"], .fm-app.fm-dark [style*="color:#334155"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #64748b"], .fm-app.fm-dark [style*="color:#64748b"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #94a3b8"], .fm-app.fm-dark [style*="color:#94a3b8"] { color: #ffffff !important; }
    .fm-app.fm-dark .fm-card { background: #1A1A1A; color: #ffffff; border-color: rgba(255,255,255,0.08); box-shadow: 0 2px 16px rgba(0,0,0,0.4); }
    .fm-app.fm-dark .fm-input, .fm-app.fm-dark .fm-select { background: #0F0F0F; color: #ffffff; border-color: rgba(255,255,255,0.1); }
    .fm-app.fm-dark .fm-input::placeholder { color: rgba(255,255,255,0.72); }
    .fm-app.fm-dark .fm-label { color: #ffffff; }
    .fm-app.fm-dark .fm-photo-box { background: #0F0F0F; border-color: rgba(255,255,255,0.15); color: #ffffff; }
    .fm-app.fm-dark .fm-step-dot { background: rgba(255,255,255,0.1); }
    .fm-app.fm-dark [style*="color: #1e293b"], .fm-app.fm-dark [style*="color:#1e293b"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #64748b"], .fm-app.fm-dark [style*="color:#64748b"] { color: #ffffff !important; }
    .fm-app.fm-dark [style*="color: #94a3b8"], .fm-app.fm-dark [style*="color:#94a3b8"] { color: #ffffff !important; }
  `;

  // ────────────────────────────────────────────────────────
  // TOOLTIP COMPONENT
  // ────────────────────────────────────────────────────────
  const Tooltip: React.FC<{ id: string }> = ({ id }) => (
    <span className="fm-tooltip" style={{ marginLeft: 4 }}>
      <HelpCircle
        size={13}
        color="#94a3b8"
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
  }> = ({ level, active, label }) => {
    return (
      <div
        className={`fm-avatar-item ${active ? "fm-avatar-active" : ""}`}
        style={{ opacity: active ? 1 : 0.35 }}
      >
        <img
          className="fm-avatar-img"
          src={BODY_AVATAR_IMAGES[level] ?? BODY_AVATAR_IMAGES[1]}
          alt={label}
          style={{
            filter: active ? "none" : "grayscale(0.4)",
          }}
        />
        <span
          style={{
            fontSize: 9,
            color: active ? "var(--fm-primary)" : "#94a3b8",
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

  const AvatarLabels = [
    "Abaixo",
    "Normal",
    "Acima 1",
    "Acima 2",
    "Acima 3",
    "Alto 1",
    "Alto 2",
  ];

  // ────────────────────────────────────────────────────────
  // AVALIAÇÃO — STEPS LABELS
  // ────────────────────────────────────────────────────────
  const STEPS = [
    "Dados Básicos",
    "Bioimpedância",
    "Outros Dados",
    "Anotações",
    "Fotos",
    "Agendamento",
  ];

  const updateNewClient = (key: keyof FitMindClient, value: unknown) => {
    setNewClientData((current) => ({ ...current, [key]: value }));
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

  // ────────────────────────────────────────────────────────
  // TELA: HOME
  // ────────────────────────────────────────────────────────
  const HomeScreen = () => (
    <div
      className="fm-animate"
      style={{
        padding: 24,
        minHeight: "100vh",
        background: "#0A0A0A",
        color: "#ffffff",
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
            <Zap size={22} color="#fff" />
          </div>
        )}
        <div>
          <div
            style={{
              fontSize: 18,
              fontWeight: 800,
              color: "#1e293b",
              letterSpacing: "-0.02em",
            }}
          >
            FitMind Shape
          </div>
          <div style={{ fontSize: 12, color: "#64748b" }}>
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
            <Activity size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>
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
            <div style={{ color: "#1e293b", fontWeight: 700, fontSize: 16 }}>
              Meus Alunos
            </div>
            <div style={{ color: "#64748b", fontSize: 13 }}>
              {clients.length} alunos cadastrados
            </div>
          </div>
          <ChevronRight color="#94a3b8" />
        </div>
      </div>

      <div style={{ marginTop: 24, padding: "12px 0" }}>
        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#94a3b8",
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
                  style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {c.assessments?.length ?? 0} avaliação(ões) ·{" "}
                  {c.gender === "male" ? "Masc." : "Fem."}
                </div>
              </div>
              <ChevronRight size={16} color="#cbd5e1" />
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
      (c) =>
        c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
        c.email.toLowerCase().includes(searchQuery.toLowerCase()),
    );
    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}
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
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>
            Selecionar Aluno
          </div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search
              size={16}
              color="#94a3b8"
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
        </div>

        <button
          className="fm-btn-primary"
          style={{
            width: "100%",
            marginBottom: 16,
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            gap: 8,
          }}
          onClick={() => setScreen("new-client")}
        >
          <Plus size={18} /> Adicionar Novo Aluno
        </button>

        <div
          style={{
            fontSize: 12,
            fontWeight: 700,
            color: "#94a3b8",
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
                  style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}
                >
                  {c.name}
                </div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {c.email} · {c.groups?.join(", ")}
                </div>
              </div>
              <ChevronRight size={16} color="#cbd5e1" />
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div
            style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}
          >
            <User size={40} color="#e2e8f0" />
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
        style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}
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
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>
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
            <select
              className="fm-select"
              value={newClientData.groups?.[0] || ""}
              onChange={(e) => {
                const v = e.target.value;
                if (v === "__new__") {
                  const name = window.prompt("Nome do novo grupo:");
                  if (name?.trim()) updateNewClient("groups", [name.trim()]);
                } else {
                  updateNewClient("groups", v ? [v] : []);
                }
              }}
            >
              <option value="">Selecione um grupo *</option>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>{g.name}</option>
              ))}
              <option value="__new__">+ Criar novo grupo...</option>
            </select>
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
  // TELA: AVALIAÇÃO — FORMULÁRIO MULTI-STEP
  // ────────────────────────────────────────────────────────
  const AssessmentScreen = () => {
    const upd = (k: keyof FitMindAssessment, v: unknown) =>
      setAssessment((a) => ({ ...a, [k]: v }));

    const StepDados = () => {
      const autoAge = (() => {
        if (!selectedClient?.birthDate) return null;
        const b = new Date(selectedClient.birthDate);
        if (isNaN(b.getTime())) return null;
        const now = new Date();
        let a = now.getFullYear() - b.getFullYear();
        const m = now.getMonth() - b.getMonth();
        if (m < 0 || (m === 0 && now.getDate() < b.getDate())) a--;
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
              defaultValue={new Date().toISOString().split("T")[0]}
              onChange={(e) => upd("date", e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Método</label>
            <select
              className="fm-select"
              onChange={(e) => upd("method", e.target.value)}
              defaultValue="bioimpedance"
            >
              <option value="bioimpedance">Bioimpedância</option>
              <option value="measurements">Medidas (Virtual)</option>
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
          }}
        >
          <Scale size={20} color="var(--fm-primary)" />
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>
              IMC Calculado <Tooltip id="bmi" />
            </div>
            <div
              style={{
                fontSize: 22,
                fontWeight: 800,
                color: "var(--fm-primary)",
              }}
            >
              {computedBMI > 0 ? `${bmiPercent}%` : "—"}
              {computedBMI > 0 && (
                <span
                  className="fm-badge"
                  style={{
                    marginLeft: 8,
                    fontSize: 11,
                    background: getBMICategory(computedBMI).color,
                    color: "#fff",
                  }}
                >
                  {getBMICategory(computedBMI).label}
                </span>
              )}
            </div>
          </div>
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
                borderColor: current === u ? "var(--fm-primary)" : "#cbd5e1",
                background: current === u ? "var(--fm-primary)" : "transparent",
                color: current === u ? "#fff" : "#64748b",
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

    const StepBioimpedancia = () => (
      <div>
        <div className="fm-section-title">Bioimpedância</div>
        <p style={{ fontSize: 11, color: "#64748b", marginBottom: 10 }}>
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
        <div className="fm-section-title" style={{ marginTop: 16 }}>
          Análise por Segmento
        </div>
        <div className="fm-grid-2">
          {(
            [
              ["Braço Esquerdo", "leftArm"],
              ["Braço Direito", "rightArm"],
              ["Tronco", "trunk"],
              ["Perna Esquerda", "leftLeg"],
              ["Perna Direita", "rightLeg"],
            ] as const
          ).map(([label, key]) => {
            const fieldKey = `seg_${key}`;
            const unit = bioUnits[fieldKey] || "%";
            return (
              <div key={key}>
                <label className="fm-label">
                  {label} ({unit === "num" ? "número" : unit})
                  <UnitChips fieldKey={fieldKey} options={["%", "kg", "num"]} defaultUnit="%" />
                </label>
                <input
                  type="number"
                  step="0.1"
                  className="fm-input"
                  placeholder="Ex: 30.5"
                  onChange={(e) =>
                    upd("segmentAnalysis", {
                      ...assessment.segmentAnalysis,
                      [key]: +e.target.value,
                    })
                  }
                />
              </div>
            );
          })}
        </div>
      </div>
    );

    const StepOutros = () => (
      <div>
        <div className="fm-section-title">Pressão Arterial & Outros</div>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">PA Sistólica (mmHg)</label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 120"
              onChange={(e) => upd("systolicBP", +e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">PA Diastólica (mmHg)</label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 80"
              onChange={(e) => upd("diastolicBP", +e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Frequência Cardíaca (bpm)</label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 72"
              onChange={(e) => upd("heartRate", +e.target.value)}
            />
          </div>
          <div>
            <label className="fm-label">Glicemia (mg/dL)</label>
            <input
              type="number"
              className="fm-input"
              placeholder="Ex: 95"
              onChange={(e) => upd("bloodGlucose", +e.target.value)}
            />
          </div>
        </div>
        <div className="fm-section-title" style={{ marginTop: 16 }}>
          Grupo do Aluno
        </div>
        <select className="fm-select">
          <option value="">Sem grupo (opcional)</option>
          {groups.map((g) => (
            <option key={g.id} value={g.id}>
              {g.name}
            </option>
          ))}
        </select>
      </div>
    );

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
        { key: "front", label: "1. De Frente", guide: poseFrente },
        { key: "back", label: "2. De Costas", guide: poseCostas },
        { key: "rightSide", label: "3. Lateral Direita", guide: poseLateralDir },
        { key: "leftSide", label: "4. Lateral Esquerda", guide: poseLateralEsq },
      ];
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
            afastados do corpo, olhando para frente. Siga o guia de cada ângulo abaixo.
          </div>
          <div
            style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}
          >
            {VIEWS.map((v) => (
              <div key={v.key}>
                <label className="fm-label" style={{ marginBottom: 6 }}>
                  {v.label}
                </label>
                <div
                  className="fm-photo-box"
                  onClick={() => alert(`Selecionar foto: ${v.label}`)}
                  style={{ position: "relative", overflow: "hidden", padding: 0 }}
                >
                  <img
                    src={v.guide}
                    alt={`Guia de pose: ${v.label}`}
                    style={{ width: "100%", height: "100%", objectFit: "cover", opacity: 0.85 }}
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
                      background: "linear-gradient(to top, rgba(0,0,0,0.7) 0%, rgba(0,0,0,0) 50%)",
                    }}
                  >
                    <div style={{ display: "flex", alignItems: "center", gap: 6, color: "#fff", fontSize: 11, fontWeight: 600 }}>
                      <Camera size={14} /> Toque para adicionar
                    </div>
                  </div>
                </div>
              </div>
            ))}
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
            <span style={{ fontWeight: 600, color: "#1e293b" }}>
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

    const stepComponents = [
      StepDados,
      StepBioimpedancia,
      StepOutros,
      StepAnotacoes,
      StepFotos,
      StepAgendamento,
    ];
    const StepComponent = stepComponents[step];

    return (
      <div
        className="fm-animate"
        style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}
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
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>
              Nova Avaliação
            </div>
            <div style={{ fontSize: 12, color: "#64748b" }}>
              {selectedClient?.name} · {STEPS[step]}
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
            color: "#94a3b8",
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
  const ResultScreen = () => {
    const client = selectedClient!;
    const a = assessment as FitMindAssessment;
    const bmiCat = getBMICategory(a.bmi || computedBMI);
    const avatarIndex = bmiCat.avatar;
    const fatCat = getBodyFatCategory(a.bodyFat, client.gender);
    const viscCat = getVisceralCategory(a.visceralFat);
    const ageBodyDiff = a.bodyAge && a.age ? a.bodyAge - a.age : 0;

    const evalColor = (ev: string) =>
      ({
        excellent: "#16a34a",
        good: "#16a34a",
        normal: "#16a34a",
        warning: "#eab308",
        danger: "#dc2626",
      })[ev] || "#eab308";
    const evalLabel = (ev: string) =>
      ({
        excellent: "Excelente",
        good: "Bom",
        normal: "Normal",
        warning: "Atenção",
        danger: "Risco",
      })[ev] || ev;

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

    // ── Resumo / referências clínicas ─────────────────────
    const allAssessments = (() => {
      const existing = selectedClient?.assessments ?? [];
      const merged = a?.id && existing.some((item) => item.id === a.id) ? existing : (a?.date ? [...existing, a] : existing);
      return merged
        .filter((item) => item?.date)
        .sort((left, right) => new Date(left.date).getTime() - new Date(right.date).getTime());
    })();
    const N = allAssessments.length;
    const firstA = allAssessments[0] ?? a;
    // "Última" column shows the PREVIOUS assessment when 3+ exist;
    // when only 1 or 2 exist, it shows the most recent (which is the current).
    const previousA = N >= 3 ? allAssessments[N - 2] : (allAssessments[N - 1] ?? a);
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
    const dateLabel = (value?: string) => value ? new Date(value).toLocaleDateString("pt-BR") : "—";

    // Referências clínicas
    const heightM = (a.height || 0) / 100;
    const idealWeightMin = heightM ? +(18.5 * heightM * heightM).toFixed(1) : 0;
    const idealWeightMax = heightM ? +(24.9 * heightM * heightM).toFixed(1) : 0;
    const refWeight = heightM ? `${idealWeightMin}–${idealWeightMax} kg` : "—";
    const refSkeletal = client.gender === "male" ? "33–39%" : "24–30%";
    const refBMI = "18,5–24,9 kg/m²";
    const refBodyFat = client.gender === "male" ? "10–17%" : "18–24%";
    const refVisceral = "1–9";
    const harrisBenedict = (() => {
      if (!a.weight || !a.height || !a.age) return 0;
      return Math.round(
        client.gender === "male"
          ? 88.36 + 13.4 * a.weight + 4.8 * a.height - 5.7 * a.age
          : 447.6 + 9.2 * a.weight + 3.1 * a.height - 4.3 * a.age,
      );
    })();
    // Metabolismo basal preenchido em kcal direto (numeral). Usa Harris-Benedict só como referência.
    const basalKcal = a.basalMetabolism && a.basalMetabolism > 0
      ? Math.round(a.basalMetabolism)
      : harrisBenedict;
    const refBasal = harrisBenedict ? `${Math.round(harrisBenedict * 0.95)}–${Math.round(harrisBenedict * 1.05)} kcal` : "—";

    // Peso ideal eval
    const weightEval = (() => {
      if (!a.weight || !idealWeightMax) return { c: "#94a3b8", t: "—" };
      if (a.weight < idealWeightMin) return { c: "#facc15", t: "Abaixo" };
      if (a.weight <= idealWeightMax) return { c: "#22c55e", t: "Normal" };
      const over = a.weight - idealWeightMax;
      if (over < 5) return { c: "#facc15", t: "Acima" };
      if (over < 12) return { c: "#fb923c", t: "Muito acima" };
      return { c: "#dc2626", t: "Risco alto" };
    })();
    // Músculo esquelético eval
    const skMin = client.gender === "male" ? 33 : 24;
    const skMax = client.gender === "male" ? 39 : 30;
    const skEval = (() => {
      if (!a.skeletalMuscle) return { c: "#94a3b8", t: "—" };
      if (a.skeletalMuscle < skMin - 3) return { c: "#dc2626", t: "Muito baixo" };
      if (a.skeletalMuscle < skMin) return { c: "#facc15", t: "Abaixo" };
      if (a.skeletalMuscle <= skMax) return { c: "#22c55e", t: "Normal" };
      return { c: "#22c55e", t: "Acima (atleta)" };
    })();
    const skKg = a.skeletalMuscle && a.weight ? +((a.skeletalMuscle / 100) * a.weight).toFixed(1) : 0;
    // Idade corporal: comparar com idade real
    const bodyAgeYears = a.bodyAge ? Math.round(a.bodyAge) : 0;
    const bodyAgeDelta = bodyAgeYears - (a.age || 0);
    const bodyAgeEval = (() => {
      if (!bodyAgeYears) return { c: "#94a3b8", t: "—" };
      if (bodyAgeDelta <= 0) return { c: "#22c55e", t: bodyAgeDelta === 0 ? "Igual à idade real" : `${bodyAgeDelta} anos (excelente)` };
      if (bodyAgeDelta <= 3) return { c: "#facc15", t: `+${bodyAgeDelta} anos` };
      if (bodyAgeDelta <= 7) return { c: "#fb923c", t: `+${bodyAgeDelta} anos` };
      return { c: "#dc2626", t: `+${bodyAgeDelta} anos` };
    })();
    // Gordura corporal kg
    const fatKg = a.bodyFat && a.weight ? +((a.bodyFat / 100) * a.weight).toFixed(1) : 0;
    // Visceral eval reuse viscCat

    // Quantos kg para chegar ao peso recomendado
    const weightDelta = (() => {
      if (!a.weight || !idealWeightMax) return null as null | string;
      if (a.weight < idealWeightMin) return `Faltam ${(+(idealWeightMin - a.weight).toFixed(1))} kg para o mínimo recomendado`;
      if (a.weight <= idealWeightMax) return "Dentro do recomendado";
      return `Precisa perder ${(+(a.weight - idealWeightMax).toFixed(1))} kg para entrar no recomendado`;
    })();

    // Quantos kg de gordura para chegar ao recomendado
    const fatDelta = (() => {
      if (!a.bodyFat || !a.weight) return null as null | string;
      const idealMaxPct = client.gender === "male" ? 17 : 24;
      const idealMinPct = client.gender === "male" ? 10 : 18;
      if (a.bodyFat < idealMinPct) return `Faltam ${(+((idealMinPct - a.bodyFat) * a.weight / 100).toFixed(1))} kg de gordura para o mínimo`;
      if (a.bodyFat <= idealMaxPct) return "Dentro do recomendado";
      const kgToLose = +((a.bodyFat - idealMaxPct) * a.weight / 100).toFixed(1);
      return `Precisa perder ${kgToLose} kg de gordura para entrar no recomendado`;
    })();

    // Metabolismo eval
    const basalEval = (() => {
      if (!basalKcal || !harrisBenedict) return { c: "#94a3b8", t: "—" };
      const ratio = basalKcal / harrisBenedict;
      if (ratio < 0.9) return { c: "#fb923c", t: "Baixo" };
      if (ratio <= 1.1) return { c: "#22c55e", t: "Normal" };
      return { c: "#facc15", t: "Acima" };
    })();

    const histGordura = histWeight;

    return (
      <div
        className="fm-animate fm-result-screen"
        style={{ background: "#050505", minHeight: "100vh" }}
      >
        {/* Header */}
        <div
          style={{ background: "var(--fm-primary)", padding: "24px 24px 32px" }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 12,
              marginBottom: 20,
            }}
          >
            <button
              onClick={() => setScreen("home")}
              style={{ background: "none", border: "none", cursor: "pointer" }}
            >
              <ChevronLeft size={22} color="#ffffffaa" />
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>
              Resultado da Avaliação
            </div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div
              style={{
                width: 52,
                height: 52,
                borderRadius: 50,
                background: "#ffffff22",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
              }}
            >
              <User size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>
                {client.name}
              </div>
              <div style={{ fontSize: 13, color: "#ffffff99" }}>
                {client.gender === "male" ? "Masculino" : "Feminino"} · {a.age}{" "}
                anos · {a.height}cm ·{" "}
                {new Date(a.date || Date.now()).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 16px 24px", marginTop: -16 }}>
          {/* Resumo Indicador */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Resumo</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left" }}>
                    <th style={{ padding: "6px 4px", fontWeight: 700 }}>Indicador</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Primeira</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>
                      {N >= 3 ? "Anterior" : "Última"}
                    </th>
                  </tr>
                </thead>
                <tbody style={{ color: "#1e293b" }}>
                  {[
                    { l: "Tempo de acompanhamento", first: dateLabel(firstA.date), latest: N >= 3 ? `${dateLabel(previousA.date)} · ${followLabel}` : followLabel },
                    { l: "Peso", first: metric(firstA.weight, " kg"), latest: diff(previousA.weight, firstA.weight, " kg") },
                    { l: "Gordura", first: metric(firstA.bodyFat, " %"), latest: diff(previousA.bodyFat, firstA.bodyFat, " %") },
                    { l: "Músculo Esquelético", first: metric(firstA.skeletalMuscle, " %"), latest: diff(previousA.skeletalMuscle, firstA.skeletalMuscle, " %") },
                    { l: "Massa Muscular", first: metric(firstA.muscleMass, " kg"), latest: diff(previousA.muscleMass, firstA.muscleMass, " kg") },
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
            <div
              style={{
                fontSize: 12,
                fontWeight: 700,
                color: "#64748b",
                marginBottom: 8,
                textAlign: "center",
              }}
            >
              Perfil Corporal
            </div>
            <div className="fm-avatar-row">
              {AvatarLabels.map((label, i) => (
                <AvatarFigure
                  key={i}
                  level={i}
                  active={i === avatarIndex}
                  label={label}
                  gender={client.gender}
                />
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span
                className="fm-badge"
                style={{
                  background: evalColor(
                    bmiCat.avatar <= 1
                      ? "normal"
                      : bmiCat.avatar <= 3
                        ? "warning"
                        : "danger",
                  ),
                  color: "#fff",
                  fontSize: 12,
                }}
              >
                {bmiCat.label} · IMC {formatPercent(bmiPercent)}
              </span>
            </div>
            {(() => {
              const photos = a.photos || {};
              const count = [photos.front, photos.back, photos.leftSide, photos.rightSide].filter(Boolean).length;
              return (
                <button
                  type="button"
                  onClick={() => {
                    if (count === 0) {
                      alert("Nenhuma foto anexada nesta avaliação.");
                      return;
                    }
                    const list = [
                      photos.front && "Frente",
                      photos.back && "Costas",
                      photos.rightSide && "Lateral Direita",
                      photos.leftSide && "Lateral Esquerda",
                    ].filter(Boolean).join(", ");
                    alert(`Fotos disponíveis: ${list}`);
                  }}
                  style={{
                    marginTop: 12,
                    width: "100%",
                    padding: "10px 14px",
                    borderRadius: 10,
                    border: "1px solid #e2e8f0",
                    background: count > 0 ? "var(--fm-primary)" : "#f1f5f9",
                    color: count > 0 ? "#fff" : "#94a3b8",
                    fontWeight: 700,
                    fontSize: 13,
                    cursor: count > 0 ? "pointer" : "not-allowed",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    gap: 6,
                  }}
                >
                  <Camera size={14} />
                  {count > 0 ? `Visualizar fotos (${count})` : "Sem fotos anexadas"}
                </button>
              );
            })()}
          </div>

          {/* Composição Corporal */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Composição Corporal</div>
            <div style={{ overflowX: "auto" }}>
              <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
                <thead>
                  <tr style={{ color: "#64748b", textAlign: "left", fontSize: 11 }}>
                    <th style={{ padding: "6px 4px", fontWeight: 700 }}>Descrição</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Resultado</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Avaliação</th>
                  </tr>
                </thead>
                <tbody style={{ color: "#1e293b" }}>
                  {[
                    {
                      l: "Peso",
                      ref: `Referência: ${refWeight}${weightDelta ? ` · ${weightDelta}` : ""}`,
                      result: a.weight ? `${a.weight} kg` : "—",
                      color: weightEval.c,
                      tag: weightEval.t,
                    },
                    {
                      l: "Músculo Esquelético",
                      ref: `Referência: ${refSkeletal}`,
                      result: a.skeletalMuscle ? `${a.skeletalMuscle}% (${skKg} kg)` : "—",
                      color: skEval.c,
                      tag: skEval.t,
                    },
                    {
                      l: "Idade Corporal",
                      ref: `Idade real: ${a.age || "—"} anos`,
                      result: bodyAgeYears ? `${bodyAgeYears} anos` : "—",
                      color: bodyAgeEval.c,
                      tag: bodyAgeEval.t,
                    },
                  ].map((r) => (
                    <tr key={r.l} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                      <td style={{ padding: "10px 4px" }}>
                        <div style={{ fontWeight: 600 }}>{r.l}</div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>{r.ref}</div>
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
                  <tr style={{ color: "#64748b", textAlign: "left", fontSize: 11 }}>
                    <th style={{ padding: "6px 4px", fontWeight: 700 }}>Descrição</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Resultado</th>
                    <th style={{ padding: "6px 4px", fontWeight: 700, textAlign: "right" }}>Avaliação</th>
                  </tr>
                </thead>
                <tbody style={{ color: "#1e293b" }}>
                  {[
                    {
                      l: "IMC",
                      ref: `Ideal: ${refBMI}`,
                      result: computedBMI ? `${computedBMI} kg/m²` : "—",
                      color: bmiCat.color,
                      tag: bmiCat.label,
                    },
                    {
                      l: "Gordura Corporal",
                      ref: `Ideal: ${refBodyFat}${fatDelta ? ` · ${fatDelta}` : ""}`,
                      result: a.bodyFat ? `${a.bodyFat}% (${fatKg} kg)` : "—",
                      color: evalColor(fatCat.eval),
                      tag: `${evalLabel(fatCat.eval)} (${fatCat.label})`,
                    },
                    {
                      l: "Gordura Visceral",
                      ref: `Ideal: ${refVisceral}`,
                      result: a.visceralFat ? `${a.visceralFat}` : "—",
                      color: viscCat.color,
                      tag: viscCat.label,
                    },
                    {
                      l: "Metabolismo Basal",
                      ref: `Ideal: ${refBasal}`,
                      result: basalKcal ? `${basalKcal} kcal` : "—",
                      color: basalEval.c,
                      tag: basalEval.t,
                    },
                  ].map((r) => (
                    <tr key={r.l} style={{ borderTop: "1px solid #f1f5f9", verticalAlign: "top" }}>
                      <td style={{ padding: "10px 4px" }}>
                        <div style={{ fontWeight: 600 }}>{r.l}</div>
                        <div style={{ fontSize: 10.5, color: "#94a3b8", fontStyle: "italic", marginTop: 2 }}>{r.ref}</div>
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

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Outros Indicadores</div>
            <div
              style={{
                display: "grid",
                gridTemplateColumns: "1fr 1fr",
                gap: 12,
              }}
            >
              {[
                {
                  icon: <Droplets size={18} color="#60a5fa" />,
                  label: "Água Corporal",
                  tooltip: "bodyWater",
                  value: `${a.bodyWater}%`,
                  bg: "#eff6ff",
                },
                {
                  icon: <Bone size={18} color="#a78bfa" />,
                  label: "Massa Óssea",
                  tooltip: "boneMass",
                  value: `${a.boneMass}%`,
                  bg: "#f5f3ff",
                },
              ].map((item) => (
                <div
                  key={item.label}
                  style={{
                    background: item.bg,
                    borderRadius: 12,
                    padding: "14px",
                    textAlign: "center",
                  }}
                >
                  {item.icon}
                  <div
                    style={{
                      fontSize: 11,
                      color: "#64748b",
                      fontWeight: 600,
                      marginTop: 4,
                    }}
                  >
                    {item.label} <Tooltip id={item.tooltip} />
                  </div>
                  <div
                    style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}
                  >
                    {item.value}
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* PA & Cardio */}
          {(a.systolicBP || a.heartRate) && (
            <div className="fm-card" style={{ marginBottom: 12 }}>
              <div className="fm-section-title">Dados Cardiovasculares</div>
              <div
                style={{
                  display: "grid",
                  gridTemplateColumns: "1fr 1fr 1fr",
                  gap: 10,
                }}
              >
                {a.systolicBP && (
                  <div
                    style={{
                      textAlign: "center",
                      background: "#fef2f2",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <Heart size={16} color="#ef4444" />
                    <div
                      style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}
                    >
                      PA Sistólica
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {a.systolicBP}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>mmHg</div>
                  </div>
                )}
                {a.diastolicBP && (
                  <div
                    style={{
                      textAlign: "center",
                      background: "#fef2f2",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <Heart size={16} color="#f87171" />
                    <div
                      style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}
                    >
                      PA Diastólica
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {a.diastolicBP}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>mmHg</div>
                  </div>
                )}
                {a.heartRate && (
                  <div
                    style={{
                      textAlign: "center",
                      background: "#fff7ed",
                      borderRadius: 10,
                      padding: 12,
                    }}
                  >
                    <Activity size={16} color="#fb923c" />
                    <div
                      style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}
                    >
                      Freq. Cardíaca
                    </div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>
                      {a.heartRate}
                    </div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>bpm</div>
                  </div>
                )}
              </div>
            </div>
          )}

          {/* Histórico — Gráficos */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Histórico — Peso Corporal</div>
            <ResponsiveContainer width="100%" height={160}>
              <LineChart data={histWeight}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} domain={["auto", "auto"]} />
                <RechartsTooltip />
                <Line
                  type="monotone"
                  dataKey="peso"
                  stroke={themeColor}
                  strokeWidth={2.5}
                  dot={{ fill: themeColor, r: 4 }}
                />
              </LineChart>
            </ResponsiveContainer>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Composição Corporal — Atual</div>
            <div style={{ display: "flex", alignItems: "center" }}>
              <ResponsiveContainer width="50%" height={150}>
                <PieChart>
                  <Pie
                    data={pieData}
                    cx="50%"
                    cy="50%"
                    innerRadius={40}
                    outerRadius={65}
                    dataKey="value"
                  >
                    {pieData.map((entry, i) => (
                      <Cell key={i} fill={entry.fill} />
                    ))}
                  </Pie>
                </PieChart>
              </ResponsiveContainer>
              <div style={{ flex: 1 }}>
                {pieData.map((d, i) => (
                  <div
                    key={i}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      marginBottom: 8,
                    }}
                  >
                    <span
                      style={{
                        width: 12,
                        height: 12,
                        borderRadius: 3,
                        background: d.fill,
                        display: "inline-block",
                      }}
                    />
                    <div>
                      <div
                        style={{
                          fontSize: 12,
                          fontWeight: 600,
                          color: "#1e293b",
                        }}
                      >
                        {d.name}
                      </div>
                      <div
                        style={{
                          fontSize: 16,
                          fontWeight: 800,
                          color: "#1e293b",
                        }}
                      >
                        {d.value}%
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">
              % Gordura vs Músculo — Evolução
            </div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={histGordura}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar
                  dataKey="gordura"
                  name="% Gordura"
                  fill="#fca5a5"
                  radius={[4, 4, 0, 0]}
                />
                <Bar
                  dataKey="musculo"
                  name="% Músculo"
                  fill={themeColor}
                  radius={[4, 4, 0, 0]}
                />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Idade Corporal</div>
            <div
              style={{
                display: "flex",
                gap: 12,
                justifyContent: "center",
                padding: "8px 0",
              }}
            >
              <div
                style={{
                  textAlign: "center",
                  flex: 1,
                  background: "#f0fdf4",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}
                >
                  Referência
                </div>
                <div
                  style={{ fontSize: 36, fontWeight: 900, color: "#1e293b" }}
                >
                  {a.age}
                </div>
                <div style={{ fontSize: 12, color: "#64748b" }}>anos</div>
              </div>
              <div
                style={{
                  display: "flex",
                  alignItems: "center",
                  color: "#94a3b8",
                  fontSize: 20,
                }}
              >
                →
              </div>
              <div
                style={{
                  textAlign: "center",
                  flex: 1,
                  background: ageBodyDiff <= 0 ? "#f0fdf4" : "#fef2f2",
                  borderRadius: 12,
                  padding: 16,
                }}
              >
                <div
                  style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}
                >
                  Idade Corporal
                </div>
                <div
                  style={{
                    fontSize: 36,
                    fontWeight: 900,
                    color: ageBodyDiff <= 0 ? "#16a34a" : ageBodyDiff <= 3 ? "#facc15" : "#ef4444",
                  }}
                >
                  {bodyAgeYears || "—"}
                </div>
                <div
                  style={{
                    fontSize: 12,
                    color: ageBodyDiff <= 0 ? "#16a34a" : "#ef4444",
                    fontWeight: 700,
                  }}
                >
                  {ageBodyDiff === 0
                    ? "Igual"
                    : ageBodyDiff > 0
                      ? `+${ageBodyDiff} anos`
                      : `${Math.abs(ageBodyDiff)} anos abaixo 🎉`}
                </div>
              </div>
            </div>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Fontes de Referência</div>
            <div style={{ fontSize: 12, color: "#64748b", lineHeight: 1.6 }}>
              {CLINICAL_SOURCES}
            </div>
          </div>

          {/* Anotações para o cliente */}
          {a.clientNotes && (
            <div
              className="fm-card"
              style={{
                marginBottom: 12,
                borderLeft: "4px solid var(--fm-primary)",
              }}
            >
              <div
                style={{
                  fontSize: 12,
                  fontWeight: 700,
                  color: "var(--fm-primary)",
                  marginBottom: 6,
                }}
              >
                📋 Anotações do Profissional
              </div>
              <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.6 }}>
                {a.clientNotes}
              </div>
            </div>
          )}

          {/* Rodapé do Coach */}
          <div className="fm-coach-footer">
            {coach.logo && (
              <img
                src={coach.logo}
                alt="Logo"
                style={{
                  width: 48,
                  height: 48,
                  borderRadius: 10,
                  objectFit: "cover",
                }}
              />
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{coach.name}</div>
              {coach.specialty && (
                <div style={{ fontSize: 12, opacity: 0.8 }}>
                  {coach.specialty}
                </div>
              )}
              {coach.email && (
                <div style={{ fontSize: 12, opacity: 0.7 }}>{coach.email}</div>
              )}
            </div>
            <div
              style={{
                marginLeft: "auto",
                background: "#ffffff22",
                borderRadius: 10,
                padding: "8px 14px",
                fontSize: 12,
                textAlign: "center",
              }}
            >
              <div style={{ fontWeight: 700 }}>FitMind Shape</div>
              <div style={{ opacity: 0.7 }}>Avaliação corporal</div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 10, flexWrap: "wrap" }}>
            <button
              className="fm-btn-outline"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => {
                setAssessment({ height: selectedClient?.height || undefined });
                setStep(0);
                setScreen("assessment");
              }}
            >
              + Nova Avaliação
            </button>
            <button
              className="fm-btn-outline"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => setScreen("compare")}
              disabled={(selectedClient?.assessments?.length ?? 0) < 2}
              title={(selectedClient?.assessments?.length ?? 0) < 2 ? "É necessário ter pelo menos 2 avaliações" : "Comparar avaliações"}
            >
              Comparar avaliações
            </button>
            <button
              className="fm-btn-primary"
              style={{ flex: 1, minWidth: 140 }}
              onClick={() => window.print()}
            >
              Gerar Relatório
            </button>
          </div>
        </div>
      </div>
    );
  };
  // ────────────────────────────────────────────────────────
  // RENDER PRINCIPAL
  // ────────────────────────────────────────────────────────
  return (
    <div
      className="fm-app fm-dark"
      style={{ maxWidth: 480, margin: "0 auto", fontFamily: themeFontFamily, background: "#0A0A0A", minHeight: "100vh" }}
    >
      <style>{css}</style>
      {screen === "home" && HomeScreen()}
      {screen === "select-client" && SelectClientScreen()}
      {screen === "new-client" && NewClientScreen()}
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
