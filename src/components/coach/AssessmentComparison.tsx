// ============================================================
// FITMIND SHAPE — Comparativo livre entre avaliações
// Permite escolher N avaliações e comparar lado a lado:
// tabela completa, deltas, gráficos e resumo do que melhorou
// e do que precisa melhorar. Não substitui o fluxo atual.
// ============================================================

import React, { useMemo, useState } from "react";
import {
  LineChart,
  Line,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip as RechartsTooltip,
  Legend,
  ResponsiveContainer,
} from "recharts";
import { ChevronLeft, TrendingDown, TrendingUp, Minus, CheckSquare, Square, Printer, Trash2, Pencil, X } from "lucide-react";
import type { FitMindAssessment, FitMindClient, FitMindChallengeCandidate } from "./FitMindShape";

interface Props {
  client: FitMindClient;
  themeColor?: string;
  onBack: () => void;
  onDelete?: (assessmentId: string, reason: string) => Promise<void>;
  onEdit?: (assessment: FitMindAssessment) => Promise<void>;
  challengeCandidates?: FitMindChallengeCandidate[];
}

type MetricKey =
  | "weight"
  | "bmi"
  | "bodyFat"
  | "skeletalMuscle"
  | "muscleMass"
  | "visceralFat"
  | "bodyAge"
  | "bodyWater"
  | "boneMass"
  | "basalMetabolism"
  | "systolicBP"
  | "diastolicBP"
  | "heartRate"
  | "bloodGlucose";

interface MetricDef {
  key: MetricKey;
  label: string;
  unit: string;
  // "down" = menor é melhor; "up" = maior é melhor; "neutral" = sem julgamento
  better: "down" | "up" | "neutral";
}

const METRICS: MetricDef[] = [
  { key: "weight", label: "Peso", unit: "kg", better: "neutral" },
  { key: "bmi", label: "IMC", unit: "", better: "neutral" },
  { key: "bodyFat", label: "Gordura corporal", unit: "%", better: "down" },
  { key: "skeletalMuscle", label: "Músculo esquelético", unit: "%", better: "up" },
  { key: "muscleMass", label: "Massa muscular", unit: "%", better: "up" },
  { key: "visceralFat", label: "Gordura visceral", unit: "", better: "down" },
  { key: "bodyAge", label: "Idade corporal", unit: "anos", better: "down" },
  { key: "bodyWater", label: "Água corporal", unit: "%", better: "up" },
  { key: "boneMass", label: "Massa óssea", unit: "%", better: "up" },
  { key: "basalMetabolism", label: "Metabolismo basal", unit: "kcal", better: "neutral" },
  { key: "systolicBP", label: "PA sistólica", unit: "mmHg", better: "neutral" },
  { key: "diastolicBP", label: "PA diastólica", unit: "mmHg", better: "neutral" },
  { key: "heartRate", label: "Freq. cardíaca", unit: "bpm", better: "neutral" },
  { key: "bloodGlucose", label: "Glicemia", unit: "mg/dL", better: "neutral" },
];

const fmtDate = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "2-digit" });
const fmtDateShort = (iso: string) =>
  new Date(iso).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit" });

const fmtNum = (v?: number, unit = "") => {
  if (v == null || !Number.isFinite(v)) return "—";
  return `${+v.toFixed(1)}${unit ? ` ${unit}` : ""}`;
};

const AssessmentComparison: React.FC<Props> = ({ client, themeColor = "#dc2626", onBack, onDelete, onEdit, challengeCandidates = [] }) => {
  const [editing, setEditing] = useState<FitMindAssessment | null>(null);
  const [editForm, setEditForm] = useState<Partial<FitMindAssessment>>({});
  const [savingEdit, setSavingEdit] = useState(false);
  const openEdit = (a: FitMindAssessment) => {
    setEditing(a);
    setEditForm({ ...a });
  };
  const closeEdit = () => { setEditing(null); setEditForm({}); };
  const saveEdit = async () => {
    if (!editing || !onEdit) return;
    setSavingEdit(true);
    try {
      await onEdit({ ...editing, ...editForm } as FitMindAssessment);
      closeEdit();
    } catch (e) { console.error(e); }
    finally { setSavingEdit(false); }
  };
  const numField = (key: keyof FitMindAssessment, label: string, unit = "") => (
    <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1" }}>
      <span>{label}{unit && ` (${unit})`}</span>
      <input
        type="number"
        step="0.1"
        value={(editForm[key] as number | undefined) ?? ""}
        onChange={(e) => setEditForm((f) => ({ ...f, [key]: e.target.value === "" ? undefined : Number(e.target.value) }))}
        style={{ background: "#0F0F0F", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 13 }}
      />
    </label>
  );
  const all = useMemo(
    () =>
      (client.assessments ?? [])
        .filter((a) => a?.date)
        .slice()
        .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime()),
    [client],
  );

  // Pré-seleciona as duas últimas avaliações
  const [selected, setSelected] = useState<string[]>(() => all.slice(0, 2).map((a) => a.id));

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  const selectAll = () => setSelected(all.map((a) => a.id));
  const clear = () => setSelected([]);

  // Ordem cronológica (antiga -> recente) para tabelas e gráficos
  const picked = useMemo(
    () =>
      all
        .filter((a) => selected.includes(a.id))
        .slice()
        .sort((a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()),
    [all, selected],
  );

  const chartData = useMemo(
    () =>
      picked.map((a) => ({
        date: fmtDateShort(a.date),
        peso: a.weight,
        gordura: a.bodyFat,
        musculo: a.skeletalMuscle,
        idadeCorp: a.bodyAge,
      })),
    [picked],
  );

  const deltaFor = (key: MetricKey, curr?: number, base?: number) => {
    if (curr == null || base == null || !Number.isFinite(curr) || !Number.isFinite(base)) return null;
    const d = +(curr - base).toFixed(1);
    if (d === 0) return { value: 0, sign: "0", trend: "flat" as const };
    const def = METRICS.find((m) => m.key === key)!;
    const better =
      def.better === "neutral"
        ? "flat"
        : (def.better === "down" && d < 0) || (def.better === "up" && d > 0)
        ? "good"
        : "bad";
    return { value: d, sign: d > 0 ? `+${d}` : `${d}`, trend: better as "good" | "bad" | "flat" };
  };

  const summary = useMemo(() => {
    if (picked.length < 2) return { improved: [], worsened: [] };
    const first = picked[0];
    const last = picked[picked.length - 1];
    const improved: { label: string; text: string }[] = [];
    const worsened: { label: string; text: string }[] = [];
    METRICS.forEach((m) => {
      const d = deltaFor(m.key, last[m.key] as number, first[m.key] as number);
      if (!d || m.better === "neutral") return;
      const text = `${d.sign}${m.unit ? ` ${m.unit}` : ""}`;
      if (d.trend === "good") improved.push({ label: m.label, text });
      else if (d.trend === "bad") worsened.push({ label: m.label, text });
    });
    return { improved, worsened };
  }, [picked]);

  const trendColor = (t: "good" | "bad" | "flat") =>
    t === "good" ? "#16a34a" : t === "bad" ? "#dc2626" : "#64748b";
  const TrendIcon = ({ t }: { t: "good" | "bad" | "flat" }) =>
    t === "good" ? <TrendingDown size={12} /> : t === "bad" ? <TrendingUp size={12} /> : <Minus size={12} />;

  return (
    <div style={{ padding: 20, minHeight: "100vh", background: "#0A0A0A", color: "#ffffff", fontFamily: "inherit" }}>
      {/* Header */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 16 }}>
        <button onClick={onBack} style={{ background: "none", border: "none", cursor: "pointer" }}>
          <ChevronLeft size={22} color="#64748b" />
        </button>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 16, fontWeight: 800, color: "#ffffff" }}>Comparar avaliações</div>
          <div style={{ fontSize: 12, color: "#ffffff" }}>
            {client.name} · {all.length} avaliação{all.length === 1 ? "" : "s"} no histórico
          </div>
        </div>
        <button
          onClick={() => window.print()}
          title="Imprimir relatório comparativo"
          style={{
            background: "#1A1A1A",
            border: "1px solid #e2e8f0",
            borderRadius: 8,
            padding: "8px 10px",
            cursor: "pointer",
            display: "inline-flex",
            alignItems: "center",
            gap: 6,
            fontSize: 12,
            color: "#ffffff",
          }}
        >
          <Printer size={14} /> Relatório
        </button>
      </div>

      {all.length === 0 ? (
        <div style={{ background: "#1A1A1A", padding: 24, borderRadius: 12, textAlign: "center", color: "#ffffff" }}>
          Nenhuma avaliação registrada ainda para este aluno.
        </div>
      ) : (

        <>
          {/* Seleção de avaliações */}
          <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#ffffff" }}>
                Avaliações ({selected.length} selecionada{selected.length === 1 ? "" : "s"})
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button onClick={selectAll} style={miniBtn}>Todas</button>
                <button onClick={clear} style={miniBtn}>Limpar</button>
              </div>
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 6, maxHeight: 220, overflowY: "auto" }}>
              {all.map((a, idx) => {
                const checked = selected.includes(a.id);
                return (
                  <div
                    key={a.id}
                    style={{
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      padding: "8px 10px",
                      background: checked ? `${themeColor}22` : "#0F0F0F",
                      border: `1px solid ${checked ? themeColor : "rgba(255,255,255,0.14)"}`,
                      borderRadius: 8,
                    }}
                  >
                    <button
                      onClick={() => toggle(a.id)}
                      style={{ display: "flex", alignItems: "center", gap: 10, flex: 1, background: "transparent", border: "none", textAlign: "left", cursor: "pointer", padding: 0 }}
                    >
                      {checked ? <CheckSquare size={16} color={themeColor} /> : <Square size={16} color="#94a3b8" />}
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 13, fontWeight: 600, color: "#ffffff" }}>
                          {fmtDate(a.date)} {idx === 0 && <span style={{ fontSize: 10, color: themeColor, marginLeft: 4 }}>(atual)</span>}
                        </div>
                        <div style={{ fontSize: 11, color: "#ffffff" }}>
                          {fmtNum(a.weight, "kg")} · {fmtNum(a.bodyFat, "% gord.")} · IMC {fmtNum(a.bmi)}
                        </div>
                      </div>
                    </button>
                    {onEdit && (
                      <button
                        title="Editar avaliação"
                        onClick={() => openEdit(a)}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: themeColor, padding: 4 }}
                      >
                        <Pencil size={14} />
                      </button>
                    )}
                    {onDelete && (
                      <button
                        title="Excluir avaliação"
                        onClick={async () => {
                          const reason = window.prompt("Informe o motivo da exclusão (obrigatório):\nEste registro será enviado ao painel admin.");
                          if (!reason || !reason.trim()) return;
                          try {
                            await onDelete(a.id, reason.trim());
                            setSelected((s) => s.filter((x) => x !== a.id));
                          } catch (e) { console.error(e); }
                        }}
                        style={{ background: "transparent", border: "none", cursor: "pointer", color: "#dc2626", padding: 4 }}
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {picked.length < 2 ? (
              <div style={{ background: "#1A1A1A", padding: 18, borderRadius: 12, color: "#ffffff", textAlign: "center" }}>
              Selecione 2 ou mais avaliações para ver o comparativo.
            </div>
          ) : (
            <>
              {/* Resumo evolutivo */}
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, marginBottom: 16 }}>
                <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 12, border: "1px solid #14532d" }}>
                  <div style={{ fontSize: 11, color: "#16a34a", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                    Melhoraram
                  </div>
                  {summary.improved.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#ffffff" }}>Nenhum indicador.</div>
                  ) : (
                    summary.improved.map((it) => (
                      <div key={it.label} style={{ fontSize: 12, color: "#ffffff", display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{it.label}</span>
                        <span style={{ fontWeight: 700, color: "#16a34a" }}>{it.text}</span>
                      </div>
                    ))
                  )}
                </div>
                <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 12, border: "1px solid #7f1d1d" }}>
                  <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                    Precisam melhorar
                  </div>
                  {summary.worsened.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#ffffff" }}>Nenhum indicador.</div>
                  ) : (
                    summary.worsened.map((it) => (
                      <div key={it.label} style={{ fontSize: 12, color: "#ffffff", display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{it.label}</span>
                        <span style={{ fontWeight: 700, color: "#dc2626" }}>{it.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Gráficos */}
              <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#ffffff", marginBottom: 8 }}>Evolução</div>
                <div style={{ width: "100%", height: 220 }}>
                  <ResponsiveContainer>
                    <LineChart data={chartData} margin={{ top: 8, right: 12, left: -10, bottom: 0 }}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" />
                      <XAxis dataKey="date" tick={{ fontSize: 10 }} />
                      <YAxis tick={{ fontSize: 10 }} />
                      <RechartsTooltip />
                      <Legend wrapperStyle={{ fontSize: 11 }} />
                      <Line type="monotone" dataKey="peso" name="Peso (kg)" stroke={themeColor} strokeWidth={2} dot />
                      <Line type="monotone" dataKey="gordura" name="Gordura (%)" stroke="#f97316" strokeWidth={2} dot />
                      <Line type="monotone" dataKey="musculo" name="Músculo (%)" stroke="#16a34a" strokeWidth={2} dot />
                      <Line type="monotone" dataKey="idadeCorp" name="Idade corp." stroke="#6366f1" strokeWidth={2} dot />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>

              {/* Tabela comparativa */}
              <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 0, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#0F0F0F" }}>
                      <th style={th}>Indicador</th>
                      {picked.map((a, i) => (
                        <th key={a.id} style={th}>
                          {fmtDateShort(a.date)}
                          {i === 0 && <div style={{ fontSize: 9, color: "#ffffff" }}>base</div>}
                          {i === picked.length - 1 && picked.length > 1 && <div style={{ fontSize: 9, color: themeColor }}>atual</div>}
                        </th>
                      ))}
                      <th style={th}>Δ total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {METRICS.map((m) => {
                      const base = picked[0][m.key] as number | undefined;
                      const last = picked[picked.length - 1][m.key] as number | undefined;
                      const totalDelta = deltaFor(m.key, last, base);
                      return (
                        <tr key={m.key} style={{ borderTop: "1px solid #f1f5f9" }}>
                          <td style={{ ...td, fontWeight: 600 }}>{m.label}</td>
                          {picked.map((a, i) => {
                            const v = a[m.key] as number | undefined;
                            const prev = i > 0 ? (picked[i - 1][m.key] as number | undefined) : undefined;
                            const d = i > 0 ? deltaFor(m.key, v, prev) : null;
                            return (
                              <td key={a.id} style={td}>
                                <div>{fmtNum(v, m.unit)}</div>
                                {d && (
                                  <div style={{ fontSize: 10, color: trendColor(d.trend), display: "inline-flex", alignItems: "center", gap: 2 }}>
                                    <TrendIcon t={d.trend} />
                                    {d.sign}
                                  </div>
                                )}
                              </td>
                            );
                          })}
                          <td style={td}>
                            {totalDelta ? (
                              <span
                                style={{
                                  fontWeight: 700,
                                  color: trendColor(totalDelta.trend),
                                  display: "inline-flex",
                                  alignItems: "center",
                                  gap: 2,
                                }}
                              >
                                <TrendIcon t={totalDelta.trend} />
                                {totalDelta.sign}
                                {m.unit && ` ${m.unit}`}
                              </span>
                            ) : (
                              "—"
                            )}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </>
          )}
        </>
      )}

      {editing && (
        <div
          onClick={closeEdit}
          style={{ position: "fixed", inset: 0, background: "rgba(0,0,0,0.7)", zIndex: 9999, display: "flex", alignItems: "center", justifyContent: "center", padding: 16 }}
        >
          <div
            onClick={(e) => e.stopPropagation()}
            style={{ background: "#0F0F0F", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 12, padding: 18, width: "100%", maxWidth: 520, maxHeight: "90vh", overflowY: "auto" }}
          >
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 14 }}>
              <div style={{ fontSize: 15, fontWeight: 800, color: "#fff" }}>Editar avaliação · {fmtDate(editing.date)}</div>
              <button onClick={closeEdit} style={{ background: "transparent", border: "none", color: "#94a3b8", cursor: "pointer" }}><X size={18} /></button>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1", marginBottom: 10 }}>
              <span>Data da avaliação</span>
              <input
                type="date"
                value={(editForm.date || "").slice(0, 10)}
                onChange={(e) => setEditForm((f) => ({ ...f, date: e.target.value ? new Date(e.target.value).toISOString() : f.date }))}
                style={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 13 }}
              />
            </label>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10 }}>
              {numField("weight", "Peso", "kg")}
              {numField("height", "Altura", "cm")}
              {numField("bmi", "IMC")}
              {numField("bodyFat", "Gordura corporal", "%")}
              {numField("skeletalMuscle", "Músculo esquelético", "%")}
              {numField("muscleMass", "Massa muscular", "%")}
              {numField("visceralFat", "Gordura visceral")}
              {numField("basalMetabolism", "Metabolismo basal", "kcal")}
              {numField("bodyAge", "Idade corporal", "anos")}
              {numField("bodyWater", "Água corporal", "%")}
              {numField("boneMass", "Massa óssea", "%")}
            </div>

            {/* Fotos da avaliação */}
            <div style={{ marginTop: 14 }}>
              <div style={{ fontSize: 11, color: "#cbd5e1", marginBottom: 6 }}>
                Fotos da avaliação <span style={{ opacity: 0.6 }}>(recomendado 1080×1440px · 3:4)</span>
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8 }}>
                {([
                  { key: "front", label: "Frente" },
                  { key: "back", label: "Costas" },
                  { key: "rightSide", label: "Lat. direita" },
                  { key: "leftSide", label: "Lat. esquerda" },
                ] as const).map((v) => {
                  const photo = (editForm.photos as any)?.[v.key] as string | undefined;
                  const inputId = `edit-photo-${v.key}`;
                  return (
                    <div key={v.key}>
                      <label htmlFor={inputId} style={{ display: "block", cursor: "pointer", aspectRatio: "3 / 4", borderRadius: 8, border: "1px dashed rgba(255,255,255,0.2)", background: "#0A0A0A", overflow: "hidden", position: "relative" }}>
                        {photo ? (
                          <img src={photo} alt={v.label} style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                        ) : (
                          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", height: "100%", color: "#64748b", fontSize: 11, textAlign: "center", padding: 6 }}>
                            {v.label}<br />Toque para anexar
                          </div>
                        )}
                        <input
                          id={inputId}
                          type="file"
                          accept="image/*"
                          style={{ display: "none" }}
                          onChange={(e) => {
                            const file = e.target.files?.[0];
                            if (!file) return;
                            const reader = new FileReader();
                            reader.onload = () => {
                              const dataUrl = String(reader.result || "");
                              setEditForm((f) => ({ ...f, photos: { ...(f.photos || {}), [v.key]: dataUrl } as any }));
                            };
                            reader.readAsDataURL(file);
                          }}
                        />
                      </label>
                      <div style={{ display: "flex", justifyContent: "space-between", marginTop: 4, fontSize: 10, color: "#94a3b8" }}>
                        <span>{v.label}</span>
                        {photo && (
                          <button
                            type="button"
                            onClick={() => setEditForm((f) => ({ ...f, photos: { ...(f.photos || {}), [v.key]: undefined } as any }))}
                            style={{ background: "transparent", border: "none", color: "#dc2626", cursor: "pointer", fontSize: 10 }}
                          >
                            Remover
                          </button>
                        )}
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>

            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1", marginTop: 10 }}>
              <span>Notas do profissional</span>
              <textarea
                rows={3}
                value={editForm.professionalNotes ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, professionalNotes: e.target.value }))}
                style={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 13, resize: "vertical" }}
              />
            </label>
            <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1", marginTop: 10 }}>
              <span>Notas do aluno</span>
              <textarea
                rows={3}
                value={editForm.clientNotes ?? ""}
                onChange={(e) => setEditForm((f) => ({ ...f, clientNotes: e.target.value }))}
                style={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 13, resize: "vertical" }}
              />
            </label>

            {(challengeCandidates.length > 0 || editForm.challengeEnrollmentId) && (
              <label style={{ display: "flex", flexDirection: "column", gap: 4, fontSize: 11, color: "#cbd5e1", marginTop: 12 }}>
                <span style={{ display: "flex", alignItems: "center", gap: 6 }}>
                  🏆 Vincular ao Desafio
                </span>
                <select
                  value={editForm.challengeEnrollmentId && editForm.challengeType
                    ? `${editForm.challengeEnrollmentId}|${editForm.challengeType}`
                    : ""}
                  onChange={(e) => {
                    const v = e.target.value;
                    if (!v) {
                      setEditForm((f) => ({ ...f, challengeEnrollmentId: undefined, challengeType: undefined }));
                    } else {
                      const [eid, type] = v.split("|");
                      setEditForm((f) => ({ ...f, challengeEnrollmentId: eid, challengeType: type as "initial" | "final" }));
                    }
                  }}
                  style={{ background: "#0A0A0A", border: "1px solid rgba(255,255,255,0.14)", borderRadius: 6, padding: "6px 8px", color: "#fff", fontSize: 13 }}
                >
                  <option value="">Não vincular</option>
                  {editForm.challengeEnrollmentId && editForm.challengeType && !challengeCandidates.some(c => c.enrollmentId === editForm.challengeEnrollmentId && c.type === editForm.challengeType) && (
                    <option value={`${editForm.challengeEnrollmentId}|${editForm.challengeType}`}>
                      Vínculo atual · Pesagem {editForm.challengeType === "initial" ? "Inicial" : "Final"}
                    </option>
                  )}
                  {challengeCandidates.map((c) => (
                    <option key={`${c.enrollmentId}-${c.type}`} value={`${c.enrollmentId}|${c.type}`}>
                      {c.compLabel} · Pesagem {c.type === "initial" ? "Inicial" : "Final"}
                    </option>
                  ))}
                </select>
                <span style={{ fontSize: 10, color: "#64748b" }}>
                  Ao salvar, esta avaliação será registrada como pesagem do desafio (peso, % gordura e massa muscular são sincronizados automaticamente).
                </span>
              </label>
            )}

            <div style={{ display: "flex", gap: 10, marginTop: 16 }}>
              <button onClick={closeEdit} style={{ flex: 1, background: "transparent", border: "1px solid rgba(255,255,255,0.2)", color: "#fff", borderRadius: 8, padding: "10px 12px", cursor: "pointer", fontSize: 13 }}>Cancelar</button>
              <button
                onClick={saveEdit}
                disabled={savingEdit}
                style={{ flex: 1, background: themeColor, color: "#fff", border: "none", borderRadius: 8, padding: "10px 12px", cursor: savingEdit ? "wait" : "pointer", fontSize: 13, fontWeight: 700, opacity: savingEdit ? 0.6 : 1 }}
              >
                {savingEdit ? "Salvando…" : "Salvar alterações"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

const th: React.CSSProperties = {
  padding: "10px 8px",
  textAlign: "left",
  fontSize: 11,
  color: "#ffffff",
  fontWeight: 700,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "8px",
  color: "#ffffff",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const miniBtn: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  border: "1px solid rgba(255,255,255,0.14)",
  background: "#0F0F0F",
  borderRadius: 6,
  cursor: "pointer",
  color: "#ffffff",
};

export default AssessmentComparison;
