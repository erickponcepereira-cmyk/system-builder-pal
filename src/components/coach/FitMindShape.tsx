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
import {
  LineChart, Line, PieChart, Pie, Cell,
  BarChart, Bar, XAxis, YAxis, CartesianGrid,
  Tooltip as RechartsTooltip, Legend, ResponsiveContainer
} from "recharts";
import {
  User, Users, Plus, ChevronRight, ChevronLeft, Check,
  HelpCircle, Camera, Calendar, Scale, Activity,
  Heart, Droplets, Bone, Brain, Zap, TrendingUp,
  Phone, Mail, Globe, FileText, Tag, Clock,
  AlertCircle, X, Search, Filter, Upload
} from "lucide-react";

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
  // Bioimpedância
  bodyFat: number;          // % gordura corporal
  skeletalMuscle: number;   // kg músculo esquelético
  muscleMass: number;       // kg massa muscular
  visceralFat: number;      // nível 1-20
  basalMetabolism: number;  // kcal
  bodyAge: number;          // anos
  bodyWater: number;        // % água corporal
  boneMass: number;         // kg massa óssea
  // Segmentos
  segmentAnalysis?: {
    leftArm: number; rightArm: number;
    trunk: number;
    leftLeg: number; rightLeg: number;
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
  photos?: { front?: string; rightSide?: string; back?: string; leftSide?: string };
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
  onSaveAssessment?: (assessment: FitMindAssessment, client: FitMindClient) => Promise<void>;
  onCreateClient?: (client: Omit<FitMindClient, "id">) => Promise<FitMindClient>;
  onSearchClients?: (query: string) => Promise<FitMindClient[]>;
  onCreateGoogleCalendarEvent?: (date: string, time: string, clientName: string) => Promise<string>;
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
  { max: 100,  label: "Obesidade III", color: "#b91c1c", avatar: 6 },
];

const BODY_FAT_RANGES = {
  male: [
    { max: 6,  label: "Atleta", eval: "excellent" },
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
  { max: 9,  label: "Normal", eval: "normal", color: "#22c55e" },
  { max: 14, label: "Alto", eval: "warning", color: "#fb923c" },
  { max: 30, label: "Muito Alto", eval: "danger", color: "#ef4444" },
];

const TOOLTIPS: Record<string, string> = {
  bmi: "IMC = Peso ÷ Altura². Indica relação entre peso e altura. Valores entre 18,5–24,9 kg/m² são considerados saudáveis.",
  bodyFat: "Percentual de gordura corporal em relação ao peso total. Monitorar ajuda a avaliar riscos cardiovasculares e metabólicos.",
  skeletalMuscle: "Massa dos músculos ligados ao esqueleto, responsáveis pelo movimento. Manter ou aumentar preserva a taxa metabólica e a funcionalidade.",
  visceralFat: "Gordura acumulada ao redor dos órgãos internos. Nível acima de 9 está associado a riscos cardíacos e diabéticos.",
  basalMetabolism: "Calorias que o corpo queima em repouso para manter funções vitais. Auxilia no planejamento nutricional.",
  bodyAge: "Idade metabólica estimada pela composição corporal. Menor que a idade real indica boa saúde metabólica.",
  bodyWater: "Percentual de água no corpo. Hidratação adequada é fundamental para metabolismo, desempenho e recuperação.",
  boneMass: "Estimativa da massa óssea. Manter a saúde óssea previne osteoporose ao longo da vida.",
  muscleMass: "Total de tecido muscular no corpo incluindo músculo esquelético, cardíaco e liso.",
};

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================

const FitMindShape: React.FC<FitMindShapeProps> = ({
  coach,
  clients = [],
  groups = [],
  onSaveAssessment,
  onCreateClient,
  onSearchClients,
  onCreateGoogleCalendarEvent,
  themeColor = "#dc2626",
  themeFontFamily = "'Outfit', 'Inter', sans-serif",
}) => {
  const [screen, setScreen] = useState<"home" | "select-client" | "new-client" | "assessment" | "result">("home");
  const [selectedClient, setSelectedClient] = useState<FitMindClient | null>(null);
  const [assessment, setAssessment] = useState<Partial<FitMindAssessment>>({});
  const [step, setStep] = useState(0);
  const [searchQuery, setSearchQuery] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [activeTooltip, setActiveTooltip] = useState<string | null>(null);
  const [newClientData, setNewClientData] = useState<Partial<FitMindClient>>({
    gender: "female",
    ethnicity: "white",
    language: "pt",
    heightUnit: "cm",
    groups: [],
    name: "",
    birthDate: "",
    whatsapp: "",
    email: "",
    notes: "",
  });

  // ── Cálculo automático do IMC ────────────────────────────
  const computedBMI = useMemo(() => {
    if (!assessment.weight || !assessment.height) return 0;
    const hm = assessment.height / 100;
    return +(assessment.weight / (hm * hm)).toFixed(1);
  }, [assessment.weight, assessment.height]);

  const getBMICategory = (bmi: number) => BMI_RANGES.find(r => bmi <= r.max) ?? BMI_RANGES[BMI_RANGES.length - 1];
  const getBodyFatCategory = (pct: number, gender: string) => {
    const ranges = gender === "male" ? BODY_FAT_RANGES.male : BODY_FAT_RANGES.female;
    return ranges.find(r => pct <= r.max) ?? ranges[ranges.length - 1];
  };
  const getVisceralCategory = (v: number) => VISCERAL_FAT_RANGES.find(r => v <= r.max) ?? VISCERAL_FAT_RANGES[2];

  // ── Histórico mock (substitua pelos dados reais da API) ──
  const historicalData = useMemo(() => {
    const past = selectedClient?.assessments ?? [];
    return past.map(a => ({
      date: new Date(a.date).toLocaleDateString("pt-BR", { month: "short", year: "2-digit" }),
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
    .fm-app { background: #050505; color: #f8fafc; }
    .fm-app * { font-family: var(--fm-font); box-sizing: border-box; }
    .fm-app > div { background: #050505 !important; }
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
      background: #111111;
      color: #f8fafc;
      border: 1px solid #2a2a2a;
      border-radius: 16px;
      box-shadow: 0 2px 16px rgba(0,0,0,.07);
      padding: 20px;
    }
    .fm-input {
      width: 100%;
      border: 1.5px solid #2a2a2a;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      transition: border .2s;
      outline: none;
      background: #050505;
      color: #f8fafc;
    }
    .fm-input:focus { border-color: var(--fm-primary); }
    .fm-label {
      font-size: 12px;
      font-weight: 600;
      color: #a3a3a3;
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
    .fm-tooltip {
      position: relative;
      display: inline-flex;
      align-items: center;
    }
    .fm-tooltip-box {
      position: absolute;
      bottom: 130%;
      left: 50%;
      transform: translateX(-50%);
      background: #1e293b;
      color: #fff;
      padding: 8px 12px;
      border-radius: 8px;
      font-size: 12px;
      width: 220px;
      text-align: center;
      z-index: 999;
      pointer-events: none;
      line-height: 1.4;
    }
    .fm-avatar-row {
      display: flex;
      gap: 8px;
      align-items: flex-end;
      justify-content: center;
      padding: 12px 0;
    }
    .fm-avatar-item {
      display: flex;
      flex-direction: column;
      align-items: center;
      gap: 4px;
    }
    .fm-avatar-active {
      filter: drop-shadow(0 0 8px var(--fm-primary));
      transform: scale(1.12);
    }
    .fm-step-bar {
      display: flex;
      gap: 6px;
      margin-bottom: 20px;
    }
    .fm-step-dot {
      flex: 1;
      height: 4px;
      border-radius: 999px;
      background: #e2e8f0;
      transition: background .3s;
    }
    .fm-step-dot.active { background: var(--fm-primary); }
    @keyframes fm-fade-in {
      from { opacity: 0; transform: translateY(10px); }
      to   { opacity: 1; transform: translateY(0); }
    }
    .fm-animate { animation: fm-fade-in .3s ease; }
    .fm-result-row {
      display: grid;
      grid-template-columns: 1fr auto auto;
      align-items: center;
      padding: 12px 0;
      border-bottom: 1px solid #f1f5f9;
      gap: 12px;
    }
    .fm-result-row:last-child { border-bottom: none; }
    .fm-photo-box {
      border: 2px dashed #cbd5e1;
      border-radius: 12px;
      width: 100%;
      aspect-ratio: 3/4;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      cursor: pointer;
      transition: all .2s;
      background: #f8fafc;
    }
    .fm-photo-box:hover { border-color: var(--fm-primary); background: var(--fm-primary-light); }
    .fm-select {
      width: 100%;
      border: 1.5px solid #2a2a2a;
      border-radius: 10px;
      padding: 10px 14px;
      font-size: 14px;
      background: #050505;
      color: #f8fafc;
      outline: none;
      cursor: pointer;
    }
    .fm-select:focus { border-color: var(--fm-primary); }
    .fm-grid-2 { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; }
    .fm-grid-3 { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 12px; }
    .fm-eval-dot {
      width: 10px; height: 10px;
      border-radius: 50%;
      display: inline-block;
    }
    .fm-coach-footer {
      background: var(--fm-primary);
      color: #fff;
      border-radius: 16px;
      padding: 20px;
      display: flex;
      align-items: center;
      gap: 16px;
      margin-top: 24px;
    }
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
  const AvatarFigure: React.FC<{ level: number; active?: boolean; label: string; gender?: string }> = ({ level, active, label, gender }) => {
    const baseH = 48 + level * 3;
    const bodyW = 18 + level * 4;
    const bodyColor = level === 0 ? "#60a5fa" : level <= 1 ? "#22c55e" : level <= 3 ? "#facc15" : "#ef4444";
    const skinColor = gender === "male" ? "#f5c5a3" : "#f9c9b0";
    return (
      <div className={`fm-avatar-item ${active ? "fm-avatar-active" : ""}`} style={{ opacity: active ? 1 : 0.4 }}>
        <svg width={bodyW + 12} height={baseH + 18} viewBox={`0 0 ${bodyW + 12} ${baseH + 18}`}>
          {/* Cabeça */}
          <ellipse cx={(bodyW + 12) / 2} cy="9" rx="8" ry="9" fill={skinColor} />
          {/* Corpo */}
          <rect x={(bodyW + 12) / 2 - bodyW / 2} y="19" width={bodyW} height={baseH * 0.55} rx={bodyW * 0.18} fill={bodyColor} opacity={0.9} />
          {/* Pernas */}
          <rect x={(bodyW + 12) / 2 - bodyW / 2 + 2} y={19 + baseH * 0.52} width={bodyW / 2 - 3} height={baseH * 0.45} rx="4" fill={bodyColor} opacity={0.75} />
          <rect x={(bodyW + 12) / 2 + 2} y={19 + baseH * 0.52} width={bodyW / 2 - 3} height={baseH * 0.45} rx="4" fill={bodyColor} opacity={0.75} />
        </svg>
        <span style={{ fontSize: 9, color: active ? "var(--fm-primary)" : "#94a3b8", fontWeight: active ? 700 : 400, textAlign: "center", maxWidth: 48 }}>
          {label}
        </span>
      </div>
    );
  };

  const AvatarLabels = ["Abaixo", "Normal", "Acima I", "Acima II", "Acima III", "Alto I", "Alto II"];

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

  const updateNewClient = (key: keyof FitMindClient, value: any) => {
    setNewClientData((current) => ({ ...current, [key]: value }));
  };

  const createNewClient = async () => {
    if (!onCreateClient) return;
    if (!newClientData.name?.trim()) return alert("Informe o nome do aluno");
    const created = await onCreateClient(newClientData as Omit<FitMindClient, "id">);
    setSelectedClient(created);
    setScreen("assessment");
    setStep(0);
  };

  // ────────────────────────────────────────────────────────
  // TELA: HOME
  // ────────────────────────────────────────────────────────
  const HomeScreen = () => (
    <div className="fm-animate" style={{ padding: 24, minHeight: "100vh", background: "linear-gradient(135deg, #f0fdf4 0%, #dcfce7 100%)" }}>
      <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 32 }}>
        {coach.logo ? (
          <img src={coach.logo} alt="Logo" style={{ width: 44, height: 44, borderRadius: 12, objectFit: "cover" }} />
        ) : (
          <div style={{ width: 44, height: 44, borderRadius: 12, background: "var(--fm-primary)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Zap size={22} color="#fff" />
          </div>
        )}
        <div>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b", letterSpacing: "-0.02em" }}>FitMind Shape</div>
          <div style={{ fontSize: 12, color: "#64748b" }}>Olá, {coach.name} 👋</div>
        </div>
      </div>

      <div className="fm-card" style={{ marginBottom: 16, cursor: "pointer", background: "var(--fm-primary)", border: "none" }}
        onClick={() => setScreen("select-client")}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, background: "#ffffff22", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Activity size={24} color="#fff" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#fff", fontWeight: 700, fontSize: 16 }}>Nova Avaliação</div>
            <div style={{ color: "#ffffff99", fontSize: 13 }}>Iniciar avaliação por bioimpedância</div>
          </div>
          <ChevronRight color="#ffffff88" />
        </div>
      </div>

      <div className="fm-card" style={{ cursor: "pointer" }}
        onClick={() => setScreen("select-client")}>
        <div style={{ display: "flex", alignItems: "center", gap: 14 }}>
          <div style={{ width: 48, height: 48, background: "var(--fm-primary-light)", borderRadius: 12, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Users size={24} color="var(--fm-primary)" />
          </div>
          <div style={{ flex: 1 }}>
            <div style={{ color: "#1e293b", fontWeight: 700, fontSize: 16 }}>Meus Alunos</div>
            <div style={{ color: "#64748b", fontSize: 13 }}>{clients.length} alunos cadastrados</div>
          </div>
          <ChevronRight color="#94a3b8" />
        </div>
      </div>

      <div style={{ marginTop: 24, padding: "12px 0" }}>
        <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 12, textTransform: "uppercase", letterSpacing: ".06em" }}>
          Avaliações Recentes
        </div>
        {clients.slice(0, 3).map(c => (
          <div key={c.id} className="fm-card" style={{ marginBottom: 8, padding: "12px 16px", cursor: "pointer" }}
            onClick={() => { setSelectedClient(c); setScreen("result"); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 36, height: 36, borderRadius: 50, background: "var(--fm-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={18} color="var(--fm-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>
                  {c.assessments?.length ?? 0} avaliação(ões) · {c.gender === "male" ? "Masc." : "Fem."}
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
    const filtered = clients.filter(c =>
      c.name.toLowerCase().includes(searchQuery.toLowerCase()) ||
      c.email.toLowerCase().includes(searchQuery.toLowerCase())
    );
    return (
      <div className="fm-animate" style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>Selecionar Aluno</div>
        </div>

        <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
          <div style={{ flex: 1, position: "relative" }}>
            <Search size={16} color="#94a3b8" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
            <input
              className="fm-input"
              style={{ paddingLeft: 36 }}
              placeholder="Buscar aluno..."
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>

        <button className="fm-btn-primary" style={{ width: "100%", marginBottom: 16, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
          onClick={() => setScreen("new-client")}>
          <Plus size={18} /> Adicionar Novo Aluno
        </button>

        <div style={{ fontSize: 12, fontWeight: 700, color: "#94a3b8", marginBottom: 10, textTransform: "uppercase" }}>
          Base de Alunos ({filtered.length})
        </div>

        {filtered.map(c => (
          <div key={c.id} className="fm-card" style={{ marginBottom: 8, padding: "12px 16px", cursor: "pointer", border: selectedClient?.id === c.id ? "2px solid var(--fm-primary)" : "2px solid transparent" }}
            onClick={() => { setSelectedClient(c); setScreen("assessment"); setStep(0); }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <div style={{ width: 40, height: 40, borderRadius: 50, background: "var(--fm-primary-light)", display: "flex", alignItems: "center", justifyContent: "center" }}>
                <User size={20} color="var(--fm-primary)" />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontWeight: 600, fontSize: 14, color: "#1e293b" }}>{c.name}</div>
                <div style={{ fontSize: 12, color: "#94a3b8" }}>{c.email} · {c.groups?.join(", ")}</div>
              </div>
              <ChevronRight size={16} color="#cbd5e1" />
            </div>
          </div>
        ))}

        {filtered.length === 0 && (
          <div style={{ textAlign: "center", padding: "40px 0", color: "#94a3b8" }}>
            <User size={40} color="#e2e8f0" />
            <div style={{ marginTop: 8, fontSize: 14 }}>Nenhum aluno encontrado</div>
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
      <div className="fm-animate" style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 24 }}>
          <button onClick={() => setScreen("select-client")} style={{ background: "none", border: "none", cursor: "pointer" }}>
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div style={{ fontSize: 18, fontWeight: 800, color: "#1e293b" }}>Novo Aluno</div>
        </div>

        <div className="fm-card" style={{ marginBottom: 16 }}>
          <div className="fm-section-title">Dados Pessoais</div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Nome Completo *</label>
            <input className="fm-input" placeholder="Nome do aluno" value={newClientData.name || ""} onChange={e => updateNewClient("name", e.target.value)} />
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Gênero</label>
              <select className="fm-select" value={newClientData.gender || "female"} onChange={e => updateNewClient("gender", e.target.value)}>
                <option value="female">Feminino</option>
                <option value="male">Masculino</option>
                <option value="other">Outro</option>
              </select>
            </div>
            <div>
              <label className="fm-label">Etnia</label>
              <select className="fm-select" value={newClientData.ethnicity || "white"} onChange={e => updateNewClient("ethnicity", e.target.value)}>
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
              <input type="date" className="fm-input" value={newClientData.birthDate || ""} onChange={e => updateNewClient("birthDate", e.target.value)} />
            </div>
            <div>
              <label className="fm-label">Idioma</label>
              <select className="fm-select" value={newClientData.language || "pt"} onChange={e => updateNewClient("language", e.target.value)}>
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
                <input type="number" className="fm-input" placeholder="170" value={newClientData.height || ""} onChange={e => updateNewClient("height", +e.target.value)} style={{ flex: 1 }} />
                <select className="fm-select" style={{ width: 64 }} value={newClientData.heightUnit || "cm"} onChange={e => updateNewClient("heightUnit", e.target.value)}>
                  <option value="cm">cm</option>
                  <option value="ft">ft</option>
                </select>
              </div>
            </div>
            <div>
              <label className="fm-label">WhatsApp</label>
              <input className="fm-input" placeholder="+55 00 00000-0000" value={newClientData.whatsapp || ""} onChange={e => updateNewClient("whatsapp", e.target.value)} />
            </div>
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">E-mail</label>
            <input type="email" className="fm-input" placeholder="email@exemplo.com" value={newClientData.email || ""} onChange={e => updateNewClient("email", e.target.value)} />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label className="fm-label">Grupo(s)</label>
            <select className="fm-select" value={newClientData.groups?.[0] || ""} onChange={e => updateNewClient("groups", e.target.value ? [e.target.value] : [])}>
              <option value="">Sem grupo</option>
              {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
              <option value="__new__">+ Criar novo grupo...</option>
            </select>
          </div>
          <div>
            <label className="fm-label">Anotações</label>
            <textarea className="fm-input" rows={3} placeholder="Observações iniciais..." style={{ resize: "none" }}
              value={newClientData.notes || ""} onChange={e => updateNewClient("notes", e.target.value)} />
          </div>
        </div>

        <button className="fm-btn-primary" style={{ width: "100%" }} onClick={createNewClient}>
          Criar Aluno e Iniciar Avaliação <ChevronRight size={16} style={{ display: "inline", marginLeft: 4 }} />
        </button>
      </div>
    );
  };

  // ────────────────────────────────────────────────────────
  // TELA: AVALIAÇÃO — FORMULÁRIO MULTI-STEP
  // ────────────────────────────────────────────────────────
  const AssessmentScreen = () => {
    const upd = (k: keyof FitMindAssessment, v: any) => setAssessment(a => ({ ...a, [k]: v }));

    const StepDados = () => (
      <div>
        <div className="fm-section-title">Dados Básicos</div>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">Data da Avaliação</label>
            <input type="date" className="fm-input" defaultValue={new Date().toISOString().split("T")[0]}
              onChange={e => upd("date", e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Método</label>
            <select className="fm-select" onChange={e => upd("method", e.target.value)} defaultValue="bioimpedance">
              <option value="bioimpedance">Bioimpedância</option>
              <option value="measurements">Medidas (Virtual)</option>
            </select>
          </div>
        </div>
        <div className="fm-grid-3" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">Idade (anos)</label>
            <input type="number" className="fm-input" placeholder="Ex: 30" onChange={e => upd("age", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Altura (cm)</label>
            <input type="number" className="fm-input" placeholder="Ex: 165" onChange={e => upd("height", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Peso (kg)</label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 68.5" onChange={e => upd("weight", +e.target.value)} />
          </div>
        </div>
        <div className="fm-card" style={{ background: "var(--fm-primary-light)", border: "none", padding: "12px 16px", display: "flex", alignItems: "center", gap: 10 }}>
          <Scale size={20} color="var(--fm-primary)" />
          <div>
            <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>IMC Calculado <Tooltip id="bmi" /></div>
            <div style={{ fontSize: 22, fontWeight: 800, color: "var(--fm-primary)" }}>
              {computedBMI > 0 ? `${computedBMI} kg/m²` : "—"}
              {computedBMI > 0 && (
                <span className="fm-badge" style={{ marginLeft: 8, fontSize: 11, background: getBMICategory(computedBMI).color, color: "#fff" }}>
                  {getBMICategory(computedBMI).label}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>
    );

    const StepBioimpedancia = () => (
      <div>
        <div className="fm-section-title">Bioimpedância</div>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">Gordura Corporal (%) <Tooltip id="bodyFat" /></label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 28.5" onChange={e => upd("bodyFat", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Músculo Esquelético (kg) <Tooltip id="skeletalMuscle" /></label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 24.3" onChange={e => upd("skeletalMuscle", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Massa Muscular (kg) <Tooltip id="muscleMass" /></label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 42.1" onChange={e => upd("muscleMass", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Gordura Visceral (nível) <Tooltip id="visceralFat" /></label>
            <input type="number" min="1" max="30" className="fm-input" placeholder="Ex: 7" onChange={e => upd("visceralFat", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Metabolismo Basal (kcal) <Tooltip id="basalMetabolism" /></label>
            <input type="number" className="fm-input" placeholder="Ex: 1420" onChange={e => upd("basalMetabolism", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Idade Corporal (anos) <Tooltip id="bodyAge" /></label>
            <input type="number" className="fm-input" placeholder="Ex: 32" onChange={e => upd("bodyAge", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Água Corporal (%) <Tooltip id="bodyWater" /></label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 52.3" onChange={e => upd("bodyWater", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Massa Óssea (kg) <Tooltip id="boneMass" /></label>
            <input type="number" step="0.1" className="fm-input" placeholder="Ex: 2.4" onChange={e => upd("boneMass", +e.target.value)} />
          </div>
        </div>
        <div className="fm-section-title" style={{ marginTop: 16 }}>Análise por Segmento</div>
        <div className="fm-grid-2">
          {[
            ["Braço Esquerdo (%)", "leftArm"],
            ["Braço Direito (%)", "rightArm"],
            ["Tronco (%)", "trunk"],
            ["Perna Esquerda (%)", "leftLeg"],
            ["Perna Direita (%)", "rightLeg"],
          ].map(([label, key]) => (
            <div key={key}>
              <label className="fm-label">{label}</label>
              <input type="number" step="0.1" className="fm-input" placeholder="Ex: 30.5"
                onChange={e => upd("segmentAnalysis", { ...assessment.segmentAnalysis, [key]: +e.target.value })} />
            </div>
          ))}
        </div>
      </div>
    );

    const StepOutros = () => (
      <div>
        <div className="fm-section-title">Pressão Arterial & Outros</div>
        <div className="fm-grid-2" style={{ marginBottom: 12 }}>
          <div>
            <label className="fm-label">PA Sistólica (mmHg)</label>
            <input type="number" className="fm-input" placeholder="Ex: 120" onChange={e => upd("systolicBP", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">PA Diastólica (mmHg)</label>
            <input type="number" className="fm-input" placeholder="Ex: 80" onChange={e => upd("diastolicBP", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Frequência Cardíaca (bpm)</label>
            <input type="number" className="fm-input" placeholder="Ex: 72" onChange={e => upd("heartRate", +e.target.value)} />
          </div>
          <div>
            <label className="fm-label">Glicemia (mg/dL)</label>
            <input type="number" className="fm-input" placeholder="Ex: 95" onChange={e => upd("bloodGlucose", +e.target.value)} />
          </div>
        </div>
        <div className="fm-section-title" style={{ marginTop: 16 }}>Grupo do Aluno</div>
        <select className="fm-select">
          <option value="">Sem grupo (opcional)</option>
          {groups.map(g => <option key={g.id} value={g.id}>{g.name}</option>)}
        </select>
      </div>
    );

    const StepAnotacoes = () => (
      <div>
        <div className="fm-section-title">Anotações</div>
        <div style={{ marginBottom: 16 }}>
          <label className="fm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FileText size={13} color="var(--fm-primary)" /> Para o Aluno
          </label>
          <textarea className="fm-input" rows={5} placeholder="Observações que serão visíveis para o aluno no relatório..."
            style={{ resize: "none" }} onChange={e => upd("clientNotes", e.target.value)} />
        </div>
        <div>
          <label className="fm-label" style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <FileText size={13} color="#ef4444" /> Para o Profissional
            <span style={{ fontSize: 10, background: "#fef2f2", color: "#ef4444", padding: "2px 6px", borderRadius: 4, marginLeft: 4 }}>
              🔒 Não aparece no relatório
            </span>
          </label>
          <textarea className="fm-input" rows={5} placeholder="Anotações internas — apenas você verá..."
            style={{ resize: "none" }} onChange={e => upd("professionalNotes", e.target.value)} />
        </div>
      </div>
    );

    const StepFotos = () => {
      const VIEWS = [
        { key: "front", label: "Frontal", icon: "🧍" },
        { key: "rightSide", label: "Lateral Dir.", icon: "🧍" },
        { key: "back", label: "Posterior", icon: "🧍" },
        { key: "leftSide", label: "Lateral Esq.", icon: "🧍" },
      ];
      return (
        <div>
          <div className="fm-section-title">Fotos</div>
          <div style={{ background: "#f0fdf4", border: "1.5px solid #bbf7d0", borderRadius: 10, padding: "10px 14px", marginBottom: 16, fontSize: 12, color: "#166534" }}>
            💡 Posicione o aluno em roupa íntima, em pé, braços levemente afastados do corpo, olhando para frente.
          </div>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
            {VIEWS.map(v => (
              <div key={v.key}>
                <label className="fm-label" style={{ marginBottom: 6 }}>{v.icon} {v.label}</label>
                <div className="fm-photo-box" onClick={() => alert(`Selecionar foto: ${v.label}`)}>
                  <Camera size={24} color="#94a3b8" />
                  <span style={{ fontSize: 12, color: "#94a3b8", marginTop: 6 }}>Toque para adicionar</span>
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
        <div className="fm-card" style={{ marginBottom: 16, border: "2px solid var(--fm-primary-light)", padding: "16px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
            <Calendar size={20} color="var(--fm-primary)" />
            <span style={{ fontWeight: 600, color: "#1e293b" }}>Agendar no Google Agenda</span>
          </div>
          <div className="fm-grid-2" style={{ marginBottom: 12 }}>
            <div>
              <label className="fm-label">Data</label>
              <input type="date" className="fm-input" onChange={e => upd("nextAssessmentDate", e.target.value)} />
            </div>
            <div>
              <label className="fm-label">Horário</label>
              <input type="time" className="fm-input" onChange={e => upd("nextAssessmentTime", e.target.value)} />
            </div>
          </div>
          <button
            className="fm-btn-outline"
            style={{ width: "100%", display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            onClick={async () => {
              if (onCreateGoogleCalendarEvent && assessment.nextAssessmentDate && assessment.nextAssessmentTime && selectedClient) {
                const link = await onCreateGoogleCalendarEvent(assessment.nextAssessmentDate, assessment.nextAssessmentTime, selectedClient.name);
                window.open(link, "_blank");
              }
            }}>
            <Calendar size={16} /> Criar Evento no Google Agenda
          </button>
        </div>
      </div>
    );

    const stepComponents = [StepDados, StepBioimpedancia, StepOutros, StepAnotacoes, StepFotos, StepAgendamento];
    const StepComponent = stepComponents[step];

    return (
      <div className="fm-animate" style={{ padding: 24, minHeight: "100vh", background: "#f8fafc" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 8 }}>
          <button onClick={() => step > 0 ? setStep(s => s - 1) : setScreen("select-client")}
            style={{ background: "none", border: "none", cursor: "pointer" }}>
            <ChevronLeft size={22} color="#64748b" />
          </button>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>Nova Avaliação</div>
            <div style={{ fontSize: 12, color: "#64748b" }}>{selectedClient?.name} · {STEPS[step]}</div>
          </div>
        </div>

        <div className="fm-step-bar">
          {STEPS.map((_, i) => (
            <div key={i} className={`fm-step-dot ${i <= step ? "active" : ""}`} />
          ))}
        </div>

        <div className="fm-card fm-animate" key={step} style={{ marginBottom: 16 }}>
          <StepComponent />
        </div>

        <div style={{ display: "flex", gap: 10 }}>
          {step < STEPS.length - 1 ? (
            <button className="fm-btn-primary" style={{ flex: 1 }} onClick={() => setStep(s => s + 1)}>
              Próximo <ChevronRight size={16} style={{ display: "inline" }} />
            </button>
          ) : (
            <button className="fm-btn-primary" style={{ flex: 1, background: "#16a34a" }} onClick={handleSave} disabled={isSaving}>
              {isSaving ? "Salvando..." : "✓ Finalizar Avaliação"}
            </button>
          )}
        </div>
        <div style={{ fontSize: 11, color: "#94a3b8", textAlign: "center", marginTop: 8 }}>
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

    const evalColor = (ev: string) => ({ excellent: "#22c55e", good: "#86efac", normal: "#60a5fa", warning: "#fb923c", danger: "#ef4444" }[ev] || "#94a3b8");
    const evalLabel = (ev: string) => ({ excellent: "Excelente", good: "Bom", normal: "Normal", warning: "Atenção", danger: "Risco" }[ev] || ev);

    const leanMass = a.weight - (a.weight * a.bodyFat / 100);
    const fatMass = a.weight * a.bodyFat / 100;
    const pieData = [
      { name: "Massa Magra", value: +leanMass.toFixed(1), fill: "var(--fm-primary)" },
      { name: "Gordura", value: +fatMass.toFixed(1), fill: "#fca5a5" },
    ];

    const histWeight = historicalData.length > 0 ? historicalData : [
      { date: "Jan", peso: +(a.weight * 1.03).toFixed(1) },
      { date: "Fev", peso: +(a.weight * 1.01).toFixed(1) },
      { date: "Hoje", peso: a.weight },
    ];

    const histGordura = historicalData.length > 0 ? historicalData : [
      { date: "Jan", gordura: +(a.bodyFat + 2).toFixed(1), musculo: +(a.skeletalMuscle - 1).toFixed(1) },
      { date: "Fev", gordura: +(a.bodyFat + 1).toFixed(1), musculo: +(a.skeletalMuscle - 0.5).toFixed(1) },
      { date: "Hoje", gordura: a.bodyFat, musculo: a.skeletalMuscle },
    ];

    return (
      <div className="fm-animate" style={{ background: "#f8fafc", minHeight: "100vh" }}>
        {/* Header */}
        <div style={{ background: "var(--fm-primary)", padding: "24px 24px 32px" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 20 }}>
            <button onClick={() => setScreen("home")} style={{ background: "none", border: "none", cursor: "pointer" }}>
              <ChevronLeft size={22} color="#ffffffaa" />
            </button>
            <div style={{ fontSize: 16, fontWeight: 800, color: "#fff" }}>Resultado da Avaliação</div>
          </div>
          <div style={{ display: "flex", gap: 14, alignItems: "center" }}>
            <div style={{ width: 52, height: 52, borderRadius: 50, background: "#ffffff22", display: "flex", alignItems: "center", justifyContent: "center" }}>
              <User size={26} color="#fff" />
            </div>
            <div>
              <div style={{ fontSize: 20, fontWeight: 800, color: "#fff" }}>{client.name}</div>
              <div style={{ fontSize: 13, color: "#ffffff99" }}>
                {client.gender === "male" ? "Masculino" : "Feminino"} · {a.age} anos · {a.height}cm · {new Date(a.date || Date.now()).toLocaleDateString("pt-BR")}
              </div>
            </div>
          </div>
        </div>

        <div style={{ padding: "0 16px 24px", marginTop: -16 }}>
          {/* Avatar Row */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div style={{ fontSize: 12, fontWeight: 700, color: "#64748b", marginBottom: 8, textAlign: "center" }}>Perfil Corporal</div>
            <div className="fm-avatar-row">
              {AvatarLabels.map((label, i) => (
                <AvatarFigure key={i} level={i} active={i === avatarIndex} label={label} gender={client.gender} />
              ))}
            </div>
            <div style={{ textAlign: "center", marginTop: 8 }}>
              <span className="fm-badge" style={{ background: bmiCat.color, color: "#fff", fontSize: 12 }}>
                {bmiCat.label} · IMC {a.bmi || computedBMI}
              </span>
            </div>
          </div>

          {/* Composição Corporal */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Composição Corporal</div>
            {[
              { label: "Peso", tooltip: null, value: `${a.weight} kg`, eval: "normal", evalLabel: "Peso atual" },
              { label: "Músculo Esquelético", tooltip: "skeletalMuscle", value: `${a.skeletalMuscle} kg`, eval: fatCat.eval, evalLabel: evalLabel(fatCat.eval) },
              { label: "Massa Muscular", tooltip: "muscleMass", value: `${a.muscleMass} kg`, eval: "normal", evalLabel: "Total" },
              {
                label: "Idade Corporal",
                tooltip: "bodyAge",
                value: `${a.bodyAge} anos`,
                eval: ageBodyDiff > 5 ? "danger" : ageBodyDiff > 0 ? "warning" : "excellent",
                evalLabel: ageBodyDiff === 0 ? "Igual" : ageBodyDiff > 0 ? `+${ageBodyDiff} anos` : `${ageBodyDiff} anos`,
              },
            ].map(row => (
              <div key={row.label} className="fm-result-row">
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 4 }}>
                    {row.label} {row.tooltip && <Tooltip id={row.tooltip} />}
                  </div>
                </div>
                <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{row.value}</div>
                <span className="fm-badge" style={{ background: evalColor(row.eval) + "22", color: evalColor(row.eval), minWidth: 70, textAlign: "center" }}>
                  <span className="fm-eval-dot" style={{ background: evalColor(row.eval), marginRight: 4 }} />
                  {row.evalLabel}
                </span>
              </div>
            ))}
          </div>

          {/* Diagnóstico de Obesidade */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Diagnóstico de Obesidade</div>
            {[
              { label: "IMC", tooltip: "bmi", value: `${a.bmi || computedBMI} kg/m²`, color: bmiCat.color, evalText: bmiCat.label },
              { label: "Gordura Corporal", tooltip: "bodyFat", value: `${a.bodyFat}%`, color: evalColor(fatCat.eval), evalText: evalLabel(fatCat.eval) + ` (${fatCat.label})` },
              { label: "Gordura Visceral", tooltip: "visceralFat", value: `Nível ${a.visceralFat}`, color: viscCat.color, evalText: viscCat.label },
              { label: "Metabolismo Basal", tooltip: "basalMetabolism", value: `${a.basalMetabolism} kcal`, color: "#60a5fa", evalText: "Referência diária" },
            ].map(row => (
              <div key={row.label} className="fm-result-row">
                <div style={{ fontSize: 14, fontWeight: 600, color: "#1e293b", display: "flex", alignItems: "center", gap: 4 }}>
                  {row.label} <Tooltip id={row.tooltip} />
                </div>
                <div style={{ fontSize: 15, fontWeight: 800, color: "#1e293b" }}>{row.value}</div>
                <span className="fm-badge" style={{ background: row.color + "22", color: row.color, fontSize: 11 }}>{row.evalText}</span>
              </div>
            ))}
          </div>

          {/* Água & Óssea */}
          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Outros Indicadores</div>
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12 }}>
              {[
                { icon: <Droplets size={18} color="#60a5fa" />, label: "Água Corporal", tooltip: "bodyWater", value: `${a.bodyWater}%`, bg: "#eff6ff" },
                { icon: <Bone size={18} color="#a78bfa" />, label: "Massa Óssea", tooltip: "boneMass", value: `${a.boneMass} kg`, bg: "#f5f3ff" },
              ].map(item => (
                <div key={item.label} style={{ background: item.bg, borderRadius: 12, padding: "14px", textAlign: "center" }}>
                  {item.icon}
                  <div style={{ fontSize: 11, color: "#64748b", fontWeight: 600, marginTop: 4 }}>
                    {item.label} <Tooltip id={item.tooltip} />
                  </div>
                  <div style={{ fontSize: 20, fontWeight: 800, color: "#1e293b" }}>{item.value}</div>
                </div>
              ))}
            </div>
          </div>

          {/* PA & Cardio */}
          {(a.systolicBP || a.heartRate) && (
            <div className="fm-card" style={{ marginBottom: 12 }}>
              <div className="fm-section-title">Dados Cardiovasculares</div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10 }}>
                {a.systolicBP && (
                  <div style={{ textAlign: "center", background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                    <Heart size={16} color="#ef4444" />
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>PA Sistólica</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{a.systolicBP}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>mmHg</div>
                  </div>
                )}
                {a.diastolicBP && (
                  <div style={{ textAlign: "center", background: "#fef2f2", borderRadius: 10, padding: 12 }}>
                    <Heart size={16} color="#f87171" />
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>PA Diastólica</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{a.diastolicBP}</div>
                    <div style={{ fontSize: 10, color: "#94a3b8" }}>mmHg</div>
                  </div>
                )}
                {a.heartRate && (
                  <div style={{ textAlign: "center", background: "#fff7ed", borderRadius: 10, padding: 12 }}>
                    <Activity size={16} color="#fb923c" />
                    <div style={{ fontSize: 11, color: "#64748b", marginTop: 4 }}>Freq. Cardíaca</div>
                    <div style={{ fontSize: 18, fontWeight: 800 }}>{a.heartRate}</div>
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
                <Line type="monotone" dataKey="peso" stroke={themeColor} strokeWidth={2.5} dot={{ fill: themeColor, r: 4 }} />
              </LineChart>
            </ResponsiveContainer>
          </div>

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
                      <div style={{ fontSize: 12, fontWeight: 600, color: "#1e293b" }}>{d.name}</div>
                      <div style={{ fontSize: 16, fontWeight: 800, color: "#1e293b" }}>{d.value} kg</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">% Gordura vs Músculo — Evolução</div>
            <ResponsiveContainer width="100%" height={160}>
              <BarChart data={histGordura}>
                <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} />
                <YAxis tick={{ fontSize: 11 }} />
                <RechartsTooltip />
                <Legend wrapperStyle={{ fontSize: 11 }} />
                <Bar dataKey="gordura" name="% Gordura" fill="#fca5a5" radius={[4, 4, 0, 0]} />
                <Bar dataKey="musculo" name="Músculo (kg)" fill={themeColor} radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>

          <div className="fm-card" style={{ marginBottom: 12 }}>
            <div className="fm-section-title">Idade Real vs Idade Corporal</div>
            <div style={{ display: "flex", gap: 12, justifyContent: "center", padding: "8px 0" }}>
              <div style={{ textAlign: "center", flex: 1, background: "#f0fdf4", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Idade Real</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: "#1e293b" }}>{a.age}</div>
                <div style={{ fontSize: 12, color: "#64748b" }}>anos</div>
              </div>
              <div style={{ display: "flex", alignItems: "center", color: "#94a3b8", fontSize: 20 }}>→</div>
              <div style={{ textAlign: "center", flex: 1, background: ageBodyDiff <= 0 ? "#f0fdf4" : "#fef2f2", borderRadius: 12, padding: 16 }}>
                <div style={{ fontSize: 12, color: "#64748b", fontWeight: 600 }}>Idade Corporal</div>
                <div style={{ fontSize: 36, fontWeight: 900, color: ageBodyDiff <= 0 ? "#16a34a" : "#ef4444" }}>{a.bodyAge}</div>
                <div style={{ fontSize: 12, color: ageBodyDiff <= 0 ? "#16a34a" : "#ef4444", fontWeight: 700 }}>
                  {ageBodyDiff === 0 ? "Igual" : ageBodyDiff > 0 ? `+${ageBodyDiff} anos` : `${Math.abs(ageBodyDiff)} anos mais jovem 🎉`}
                </div>
              </div>
            </div>
          </div>

          {/* Anotações para o cliente */}
          {a.clientNotes && (
            <div className="fm-card" style={{ marginBottom: 12, borderLeft: "4px solid var(--fm-primary)" }}>
              <div style={{ fontSize: 12, fontWeight: 700, color: "var(--fm-primary)", marginBottom: 6 }}>📋 Anotações do Profissional</div>
              <div style={{ fontSize: 14, color: "#475569", lineHeight: 1.6 }}>{a.clientNotes}</div>
            </div>
          )}

          {/* Rodapé do Coach */}
          <div className="fm-coach-footer">
            {coach.logo && (
              <img src={coach.logo} alt="Logo" style={{ width: 48, height: 48, borderRadius: 10, objectFit: "cover" }} />
            )}
            <div>
              <div style={{ fontWeight: 800, fontSize: 16 }}>{coach.name}</div>
              {coach.specialty && <div style={{ fontSize: 12, opacity: 0.8 }}>{coach.specialty}</div>}
              {coach.email && <div style={{ fontSize: 12, opacity: 0.7 }}>{coach.email}</div>}
            </div>
            <div style={{ marginLeft: "auto", background: "#ffffff22", borderRadius: 10, padding: "8px 14px", fontSize: 12, textAlign: "center" }}>
              <div style={{ fontWeight: 700 }}>FitMind Shape</div>
              <div style={{ opacity: 0.7 }}>Avaliação corporal</div>
            </div>
          </div>

          <div style={{ marginTop: 20, display: "flex", gap: 10 }}>
            <button className="fm-btn-outline" style={{ flex: 1 }} onClick={() => { setStep(0); setScreen("assessment"); }}>
              Editar Dados
            </button>
            <button className="fm-btn-primary" style={{ flex: 1 }} onClick={() => window.print()}>
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
    <div className="fm-app" style={{ maxWidth: 480, margin: "0 auto", fontFamily: themeFontFamily }}>
      <style>{css}</style>
      {screen === "home" && HomeScreen()}
      {screen === "select-client" && SelectClientScreen()}
      {screen === "new-client" && NewClientScreen()}
      {screen === "assessment" && AssessmentScreen()}
      {screen === "result" && selectedClient && ResultScreen()}
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
    // Retorna o link do Google Calendar
    const dateTime = `${date}T${time}:00`;
    return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=Avaliação+${encodeURIComponent(clientName)}&dates=${dateTime.replace(/[-:]/g, "")}/${dateTime.replace(/[-:]/g, "")}&details=Avaliação+FitMind+Shape`;
  }}
/>
*/
