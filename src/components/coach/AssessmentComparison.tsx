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
import { ChevronLeft, TrendingDown, TrendingUp, Minus, CheckSquare, Square, Printer, Trash2 } from "lucide-react";
import type { FitMindAssessment, FitMindClient } from "./FitMindShape";

interface Props {
  client: FitMindClient;
  themeColor?: string;
  onBack: () => void;
  onDelete?: (assessmentId: string, reason: string) => Promise<void>;
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

const AssessmentComparison: React.FC<Props> = ({ client, themeColor = "#dc2626", onBack, onDelete }) => {
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

      {all.length < 2 ? (
        <div style={{ background: "#1A1A1A", padding: 24, borderRadius: 12, textAlign: "center", color: "#ffffff" }}>
          É necessário ter pelo menos 2 avaliações para comparar. Este aluno tem {all.length}.
        </div>
      ) : (
        <>
          {/* Seleção de avaliações */}
          <div style={{ background: "#1A1A1A", borderRadius: 12, padding: 14, marginBottom: 16, boxShadow: "0 1px 2px rgba(0,0,0,0.04)" }}>
            <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 10 }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b" }}>
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
                <div style={{ background: "white", borderRadius: 12, padding: 12, border: "1px solid #fee2e2" }}>
                  <div style={{ fontSize: 11, color: "#dc2626", fontWeight: 700, marginBottom: 6, textTransform: "uppercase" }}>
                    Precisam melhorar
                  </div>
                  {summary.worsened.length === 0 ? (
                    <div style={{ fontSize: 12, color: "#94a3b8" }}>Nenhum indicador.</div>
                  ) : (
                    summary.worsened.map((it) => (
                      <div key={it.label} style={{ fontSize: 12, color: "#1e293b", display: "flex", justifyContent: "space-between", padding: "2px 0" }}>
                        <span>{it.label}</span>
                        <span style={{ fontWeight: 700, color: "#dc2626" }}>{it.text}</span>
                      </div>
                    ))
                  )}
                </div>
              </div>

              {/* Gráficos */}
              <div style={{ background: "white", borderRadius: 12, padding: 14, marginBottom: 16 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "#1e293b", marginBottom: 8 }}>Evolução</div>
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
              <div style={{ background: "white", borderRadius: 12, padding: 0, overflowX: "auto" }}>
                <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12 }}>
                  <thead>
                    <tr style={{ background: "#f1f5f9" }}>
                      <th style={th}>Indicador</th>
                      {picked.map((a, i) => (
                        <th key={a.id} style={th}>
                          {fmtDateShort(a.date)}
                          {i === 0 && <div style={{ fontSize: 9, color: "#64748b" }}>base</div>}
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
    </div>
  );
};

const th: React.CSSProperties = {
  padding: "10px 8px",
  textAlign: "left",
  fontSize: 11,
  color: "#475569",
  fontWeight: 700,
  textTransform: "uppercase",
  whiteSpace: "nowrap",
};
const td: React.CSSProperties = {
  padding: "8px",
  color: "#1e293b",
  verticalAlign: "top",
  whiteSpace: "nowrap",
};
const miniBtn: React.CSSProperties = {
  fontSize: 11,
  padding: "4px 8px",
  border: "1px solid #e2e8f0",
  background: "white",
  borderRadius: 6,
  cursor: "pointer",
  color: "#1e293b",
};

export default AssessmentComparison;
