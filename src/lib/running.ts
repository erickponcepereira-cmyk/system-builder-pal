// Regras de gamificação e utilitários do módulo de Corrida.

export type RunLevelKey = "branco" | "azul" | "rosa" | "verde" | "preto" | "vermelho";

export interface RunLevel {
  key: RunLevelKey;
  label: string;
  /** Cor de destaque do escudo (hex, independente do tema). */
  color: string;
  /** Faixa de KM acumulados [min, max). */
  minKm: number;
  maxKm: number;
}

export const DISTANCE_LEVELS: RunLevel[] = [
  { key: "branco", label: "Branco", color: "#F5F5F5", minKm: 0, maxKm: 100 },
  { key: "azul", label: "Azul", color: "#2E7BEA", minKm: 100, maxKm: 300 },
  { key: "rosa", label: "Rosa", color: "#EC4899", minKm: 300, maxKm: 500 },
  { key: "verde", label: "Verde", color: "#31A93B", minKm: 500, maxKm: 1000 },
  { key: "preto", label: "Preto", color: "#3F3F46", minKm: 1000, maxKm: 3000 },
  { key: "vermelho", label: "Vermelho", color: "#E11D2E", minKm: 3000, maxKm: 10000 },
];

export interface PaceLevel {
  key: RunLevelKey;
  label: string;
  color: string;
  /** Meta em minutos por km (pace inteiro). */
  target: number;
}

/** Ordenado do mais lento (Branco) para o mais rápido (Vermelho). */
export const PACE_LEVELS: PaceLevel[] = [
  { key: "branco", label: "Branco", color: "#F5F5F5", target: 7 },
  { key: "azul", label: "Azul", color: "#2E7BEA", target: 6 },
  { key: "rosa", label: "Rosa", color: "#EC4899", target: 5 },
  { key: "verde", label: "Verde", color: "#31A93B", target: 4 },
  { key: "preto", label: "Preto", color: "#3F3F46", target: 3 },
  { key: "vermelho", label: "Vermelho", color: "#E11D2E", target: 2 },
];

export interface DistanceProgress {
  level: RunLevel;
  next: RunLevel | null;
  totalKm: number;
  kmToNext: number;
  percent: number;
}

export function getDistanceProgress(totalKm: number): DistanceProgress {
  const km = Math.max(0, totalKm || 0);
  const index = Math.max(
    0,
    DISTANCE_LEVELS.findIndex((l) => km < l.maxKm),
  );
  const level = DISTANCE_LEVELS[index === -1 ? DISTANCE_LEVELS.length - 1 : index];
  const next = DISTANCE_LEVELS[DISTANCE_LEVELS.indexOf(level) + 1] ?? null;
  const span = level.maxKm - level.minKm;
  const percent = span > 0 ? Math.min(100, Math.max(0, ((km - level.minKm) / span) * 100)) : 100;
  return {
    level,
    next,
    totalKm: km,
    kmToNext: Math.max(0, level.maxKm - km),
    percent,
  };
}

/**
 * Nível de pace a partir do melhor pace (em segundos por km).
 * Pace 7:00–7:59 = Branco, 6:00–6:59 = Azul, ... abaixo de 3:00 = Vermelho.
 */
export function getPaceLevel(bestPaceSeconds: number | null | undefined): PaceLevel | null {
  if (!bestPaceSeconds || bestPaceSeconds <= 0) return null;
  const minutes = Math.floor(bestPaceSeconds / 60);
  if (minutes < 3) return PACE_LEVELS[5]!;
  if (minutes < 4) return PACE_LEVELS[4]!;
  if (minutes < 5) return PACE_LEVELS[3]!;
  if (minutes < 6) return PACE_LEVELS[2]!;
  if (minutes < 7) return PACE_LEVELS[1]!;
  return PACE_LEVELS[0]!;
}

/** "4:52" a partir de segundos por km. */
export function formatPace(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** "01:12:30" ou "45:10" a partir de segundos. */
export function formatDuration(seconds: number | null | undefined): string {
  if (!seconds || seconds <= 0) return "—";
  const total = Math.round(seconds);
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  const s = total % 60;
  if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  return `${m}:${String(s).padStart(2, "0")}`;
}

/** Converte "HH:MM:SS", "MM:SS" ou "45" (minutos) em segundos. */
export function parseDuration(input: string): number | null {
  const raw = (input || "").trim();
  if (!raw) return null;
  const parts = raw.split(":").map((p) => p.trim());
  if (parts.some((p) => p === "" || Number.isNaN(Number(p)))) return null;
  const nums = parts.map(Number);
  if (nums.length === 1) return Math.round(nums[0]! * 60);
  if (nums.length === 2) return nums[0]! * 60 + nums[1]!;
  if (nums.length === 3) return nums[0]! * 3600 + nums[1]! * 60 + nums[2]!;
  return null;
}

export function formatKm(km: number | null | undefined): string {
  const value = Number(km || 0);
  return value.toLocaleString("pt-BR", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

export const ACTIVITY_TYPES: { value: string; label: string }[] = [
  { value: "corrida_rua", label: "Corrida de rua" },
  { value: "corrida_esteira", label: "Esteira" },
  { value: "trail", label: "Trail / trilha" },
  { value: "caminhada", label: "Caminhada" },
  { value: "revezamento", label: "Revezamento" },
  { value: "outro", label: "Outro" },
];

export function activityLabel(value: string | null | undefined): string {
  return ACTIVITY_TYPES.find((a) => a.value === value)?.label ?? "Corrida";
}

const MONTHS_PT = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];

/** "2026-04" -> "Abril/2026" */
export function formatMonthLabel(value: string | null | undefined): string {
  if (!value) return "—";
  const [year, month] = value.split("-");
  const idx = Number(month) - 1;
  if (!year || Number.isNaN(idx) || !MONTHS_PT[idx]) return value;
  return `${MONTHS_PT[idx]}/${year}`;
}

/** "2026-04" -> "abr/26" (eixo de gráficos) */
export function formatMonthShort(value: string): string {
  const [year, month] = value.split("-");
  const idx = Number(month) - 1;
  if (!year || !MONTHS_PT[idx]) return value;
  return `${MONTHS_PT[idx]!.slice(0, 3).toLowerCase()}/${year.slice(2)}`;
}
