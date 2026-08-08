import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Activity,
  CalendarDays,
  ChevronDown,
  Gauge,
  Loader2,
  MapPin,
  Medal,
  Pencil,
  Plus,
  Rocket,
  Timer,
  Trash2,
  TrendingUp,
  Trophy,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { useBranding } from "@/components/theme-provider";
import {
  DISTANCE_LEVELS,
  PACE_LEVELS,
  activityLabel,
  formatDuration,
  formatKm,
  formatMonthLabel,
  formatPace,
  getDistanceProgress,
  getPaceLevel,
} from "@/lib/running";
import { formatDateOnlyBR } from "@/lib/date-only";
import { RunLogModal } from "@/components/student/running/RunLogModal";
import { RunCharts } from "@/components/student/running/RunCharts";
import type { RunLog, RunStats } from "@/components/student/running/types";

interface Props {
  profileId: string;
}

export function RunningTab({ profileId }: Props) {
  const { theme } = useBranding();
  const [runs, setRuns] = useState<RunLog[]>([]);
  const [stats, setStats] = useState<RunStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<RunLog | null>(null);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showAll, setShowAll] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [{ data: logs }, { data: statsData }] = await Promise.all([
      supabase
        .from("run_logs")
        .select("*")
        .eq("profile_id", profileId)
        .order("run_date", { ascending: false }),
      supabase.rpc("run_stats" as never, { _profile_id: profileId } as never),
    ]);
    setRuns((logs as unknown as RunLog[]) || []);
    setStats((statsData as unknown as RunStats) || null);
    setLoading(false);
  }, [profileId]);

  useEffect(() => { load(); }, [load]);

  const totalKm = Number(stats?.total_km || 0);
  const progress = useMemo(() => getDistanceProgress(totalKm), [totalKm]);
  const paceLevel = getPaceLevel(stats?.best_pace ?? null);

  const removeRun = async (run: RunLog) => {
    if (!confirm("Excluir este registro de corrida?")) return;
    const { error } = await supabase.from("run_logs").delete().eq("id", run.id);
    if (error) return toast.error(error.message);
    toast.success("Registro excluído");
    load();
  };

  if (loading) {
    return (
      <div className="flex min-h-[40vh] items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const visibleRuns = showAll ? runs : runs.slice(0, 5);

  return (
    <div className="space-y-4">
      {/* Indicadores */}
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
        <StatCard icon={Timer} label="Melhor pace" value={formatPace(stats?.best_pace)} suffix="/km" hint="Ritmo mais rápido" />
        <StatCard icon={TrendingUp} label="KM corridos no mês" value={formatKm(stats?.km_month)} suffix="km" hint="Neste mês" />
        <StatCard
          icon={CalendarDays}
          label="Mês com maior KM"
          value={formatKm(stats?.best_month_km)}
          suffix="km"
          hint={formatMonthLabel(stats?.best_month)}
        />
        <StatCard icon={Activity} label="Pace médio" value={formatPace(stats?.avg_pace)} suffix="/km" hint="Média geral" />
        <StatCard icon={Medal} label="Corridas participadas" value={String(stats?.races ?? 0)} hint="Provas concluídas" />
        <StatCard icon={Gauge} label="Dias corridos" value={String(stats?.days_month ?? 0)} hint="Neste mês" />
      </div>

      {/* Registrar */}
      <button
        onClick={() => { setEditing(null); setModalOpen(true); }}
        className="flex w-full items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-4 text-sm font-bold text-primary-foreground shadow-lg"
      >
        <Plus className="h-5 w-5" /> Registrar corrida
      </button>

      {/* Nível de distância */}
      <section className="rounded-2xl bg-card p-4">
        <div className="flex items-center gap-4">
          <ProgressRing percent={progress.percent} color={progress.level.color} />
          <div className="min-w-0 flex-1">
            <p className="text-[11px] text-muted-foreground">Você está no nível</p>
            <p className="text-lg font-bold" style={{ color: progress.level.color }}>
              {DISTANCE_LEVELS.indexOf(progress.level) + 1} • {progress.level.label}
            </p>
            <p className="text-[11px] text-muted-foreground">
              {progress.next
                ? `Faltam ${formatKm(progress.kmToNext)} km para o nível ${progress.next.label}`
                : "Nível máximo alcançado"}
            </p>
            <div className="mt-2 flex items-center gap-2">
              <div className="h-2 flex-1 overflow-hidden rounded-full bg-muted">
                <div className="h-full rounded-full" style={{ width: `${progress.percent}%`, background: progress.level.color }} />
              </div>
              <span className="shrink-0 text-[11px] font-semibold text-muted-foreground">
                {formatKm(progress.totalKm)} / {progress.level.maxKm} km
              </span>
            </div>
          </div>
        </div>

        <p className="mt-4 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          <Trophy className="h-3.5 w-3.5" /> Níveis de corrida (KM)
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {DISTANCE_LEVELS.map((level) => {
            const reached = totalKm >= level.minKm;
            const current = level.key === progress.level.key;
            return (
              <LevelShield
                key={level.key}
                color={level.color}
                label={level.label}
                caption={`${level.minKm} – ${level.maxKm} km`}
                reached={reached}
                current={current}
              />
            );
          })}
        </div>
      </section>

      {/* Nível de pace */}
      <section className="rounded-2xl bg-card p-4">
        <p className="flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
          <Gauge className="h-3.5 w-3.5" /> Níveis de pace (meta)
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {paceLevel
            ? <>Seu nível de pace é <span className="font-bold" style={{ color: paceLevel.color }}>{paceLevel.label}</span> — classificação independente da distância.</>
            : "Registre uma corrida para descobrir seu nível de pace."}
        </p>
        <div className="mt-2 grid grid-cols-3 gap-2 sm:grid-cols-6">
          {PACE_LEVELS.map((level) => {
            const reached = paceLevel ? PACE_LEVELS.indexOf(level) <= PACE_LEVELS.indexOf(paceLevel) : false;
            return (
              <LevelShield
                key={level.key}
                color={level.color}
                label={level.label}
                caption={`Pace ${level.target}`}
                reached={reached}
                current={paceLevel?.key === level.key}
                icon="pace"
              />
            );
          })}
        </div>
      </section>

      {/* Histórico */}
      <section className="rounded-2xl bg-card p-4">
        <h3 className="mb-3 text-sm font-bold text-foreground">Histórico de corridas</h3>
        {runs.length === 0 ? (
          <p className="py-6 text-center text-xs text-muted-foreground">
            Nenhuma corrida registrada ainda. Toque em “Registrar corrida” para começar.
          </p>
        ) : (
          <div className="space-y-2">
            {visibleRuns.map((run) => {
              const open = expandedId === run.id;
              return (
                <div key={run.id} className="rounded-xl bg-white/[0.03]">
                  <button
                    onClick={() => setExpandedId(open ? null : run.id)}
                    className="flex w-full items-center gap-3 px-3 py-3 text-left"
                  >
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-foreground">
                        {run.is_race ? (run.race_name || "Prova") : activityLabel(run.activity_type)}
                        {run.is_race && <span className="ml-2 rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold uppercase text-primary">Prova</span>}
                      </p>
                      <p className="text-[11px] text-muted-foreground">
                        {formatDateOnlyBR(run.run_date)} · {formatKm(run.distance_km)} km · {formatDuration(run.duration_seconds)} · {formatPace(run.pace_seconds)}/km
                      </p>
                    </div>
                    <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
                  </button>
                  {open && (
                    <div className="space-y-2 border-t border-white/5 px-3 py-3">
                      <div className="grid grid-cols-2 gap-2 text-[11px] text-muted-foreground">
                        <p>Tipo: <span className="text-foreground">{activityLabel(run.activity_type)}</span></p>
                        <p>{run.is_race ? "Prova / evento" : "Treino"}</p>
                        {run.location && (
                          <p className="col-span-2 flex items-center gap-1"><MapPin className="h-3 w-3" /> {run.location}</p>
                        )}
                        {run.notes && <p className="col-span-2">{run.notes}</p>}
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => { setEditing(run); setModalOpen(true); }}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-white/5 py-2 text-[11px] font-semibold text-foreground"
                        >
                          <Pencil className="h-3 w-3" /> Editar
                        </button>
                        <button
                          onClick={() => removeRun(run)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-destructive/10 py-2 text-[11px] font-semibold text-destructive"
                        >
                          <Trash2 className="h-3 w-3" /> Excluir
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              );
            })}
            {runs.length > 5 && (
              <button onClick={() => setShowAll((v) => !v)} className="w-full rounded-lg bg-white/5 py-2 text-[11px] font-semibold text-primary">
                {showAll ? "Mostrar menos" : `Ver todas (${runs.length})`}
              </button>
            )}
          </div>
        )}
      </section>

      {/* Gráficos */}
      <RunCharts runs={runs} />

      {/* Integração futura */}
      <div className="flex items-start gap-3 rounded-2xl border border-primary/25 bg-primary/5 p-4">
        <Rocket className="mt-0.5 h-5 w-5 shrink-0 text-primary" />
        <div>
          <p className="text-sm font-bold text-foreground">Integração automática em desenvolvimento</p>
          <p className="text-[11px] text-muted-foreground">
            Por enquanto, registre suas corridas manualmente. Em breve, seus treinos poderão ser
            sincronizados automaticamente com o {theme.shortName} e serviços compatíveis.
          </p>
        </div>
      </div>

      {modalOpen && (
        <RunLogModal
          profileId={profileId}
          run={editing}
          onClose={() => setModalOpen(false)}
          onSaved={() => { setModalOpen(false); load(); }}
        />
      )}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
  suffix,
  hint,
}: {
  icon: React.ComponentType<{ className?: string }>;
  label: string;
  value: string;
  suffix?: string;
  hint?: string;
}) {
  return (
    <div className="rounded-2xl bg-card p-3">
      <Icon className="h-5 w-5 text-primary" />
      <p className="mt-2 text-[11px] leading-tight text-muted-foreground">{label}</p>
      <p className="text-xl font-bold text-foreground">
        {value}
        {suffix && <span className="ml-1 text-xs font-semibold text-muted-foreground">{suffix}</span>}
      </p>
      {hint && <p className="text-[10px] text-muted-foreground">{hint}</p>}
    </div>
  );
}

function ProgressRing({ percent, color }: { percent: number; color: string }) {
  const radius = 30;
  const circumference = 2 * Math.PI * radius;
  const offset = circumference - (Math.min(100, percent) / 100) * circumference;
  return (
    <div className="relative h-[76px] w-[76px] shrink-0">
      <svg viewBox="0 0 76 76" className="h-full w-full -rotate-90">
        <circle cx="38" cy="38" r={radius} fill="none" stroke="var(--muted)" strokeWidth="6" />
        <circle
          cx="38"
          cy="38"
          r={radius}
          fill="none"
          stroke={color}
          strokeWidth="6"
          strokeLinecap="round"
          strokeDasharray={circumference}
          strokeDashoffset={offset}
        />
      </svg>
      <span className="absolute inset-0 flex items-center justify-center text-xs font-bold text-foreground">
        {Math.round(percent)}%
      </span>
    </div>
  );
}

function LevelShield({
  color,
  label,
  caption,
  reached,
  current,
  icon = "run",
}: {
  color: string;
  label: string;
  caption: string;
  reached: boolean;
  current: boolean;
  icon?: "run" | "pace";
}) {
  const Icon = icon === "pace" ? Timer : Activity;
  return (
    <div
      className={`rounded-xl border p-2 text-center transition-all ${current ? "border-primary bg-primary/10" : "border-white/5 bg-white/[0.02]"} ${reached ? "" : "opacity-35 grayscale"}`}
    >
      <div
        className="mx-auto flex h-10 w-9 items-center justify-center"
        style={{
          background: color,
          clipPath: "polygon(50% 0%, 100% 15%, 100% 65%, 50% 100%, 0% 65%, 0% 15%)",
        }}
      >
        <Icon className="h-4 w-4" style={{ color: color === "#F5F5F5" ? "#111" : "#fff" }} />
      </div>
      <p className="mt-1 text-[9px] font-bold uppercase" style={{ color }}>{label}</p>
      <p className="text-[8px] leading-tight text-muted-foreground">{caption}</p>
    </div>
  );
}
