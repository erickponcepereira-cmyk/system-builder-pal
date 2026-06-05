import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ArrowLeft, Play, Pause, Check, Clock, Dumbbell, Flame, Trophy, Calendar as CalendarIcon, TrendingUp, History, Award, ChevronRight, X, Plus, Target, Sparkles } from "lucide-react";
import { listWorkoutPlans, startWorkoutSession, logSet, logCardio, finishWorkoutSession, getWorkoutHistory, getLastExerciseLogs, updateExerciseUserConfig, listPersonalChallenges, createPersonalChallenge, deletePersonalChallenge } from "@/lib/workouts.functions";
import { toast } from "sonner";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

export const Route = createFileRoute("/student/workout")({
  head: () => ({ meta: [{ title: "Meu Treino — FitMind Club" }] }),
  component: WorkoutPage,
});

type Plan = {
  id: string;
  name: string;
  letter?: string | null;
  day_of_week: number | null;
  notes: string | null;
  workout_exercises: Array<{
    id: string;
    order_index: number;
    exercise_name: string;
    sets: number;
    reps: string | null;
    load_kg: number | null;
    rest_seconds: number;
    rest_seconds_max: number | null;
    equipment_config: string | null;
    equipment_config_user: string | null;
    media_url: string | null;
    notes: string | null;
    is_cardio: boolean;
    cardio_duration_min: number | null;
    cardio_pace: string | null;
    cardio_speed: number | null;
    cardio_elevation: number | null;
  }>;
};

type LastLog = { load_kg: number | null; equipment_config: string | null; completed_at: string };
type PersonalChallenge = { id: string; title: string; target_days: number; started_at: string; completed_at: string | null; status: string };

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const LETTER_COLORS: Record<string, string> = {
  A: "from-primary to-orange-500",
  B: "from-blue-500 to-cyan-400",
  C: "from-emerald-500 to-teal-400",
  D: "from-purple-500 to-pink-500",
  E: "from-yellow-500 to-amber-400",
};
function letterGradient(letter?: string | null) {
  return LETTER_COLORS[(letter || "").toUpperCase()] || "from-white/20 to-white/10";
}
function nextLetter(plans: Plan[], currentLetter?: string | null): Plan | null {
  if (plans.length === 0) return null;
  const lettered = plans.filter((p) => p.letter).sort((a, b) => (a.letter || "").localeCompare(b.letter || ""));
  if (lettered.length === 0) return plans[0];
  if (!currentLetter) return lettered[0];
  const idx = lettered.findIndex((p) => (p.letter || "").toUpperCase() === currentLetter.toUpperCase());
  if (idx < 0) return lettered[0];
  return lettered[(idx + 1) % lettered.length];
}

function WorkoutPage() {
  const navigate = useNavigate();
  const [view, setView] = useState<"home" | "active" | "history">("home");
  const [plans, setPlans] = useState<Plan[]>([]);
  const [activePlan, setActivePlan] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);
  const [lastCompletedPlan, setLastCompletedPlan] = useState<Plan | null>(null);
  const [recentSessions, setRecentSessions] = useState<Array<{ started_at: string; completion_pct: number; plan_id: string }>>([]);
  const [challenges, setChallenges] = useState<PersonalChallenge[]>([]);
  const [newChallengeOpen, setNewChallengeOpen] = useState(false);

  const listFn = useServerFn(listWorkoutPlans);
  const histFn = useServerFn(getWorkoutHistory);
  const listChallengesFn = useServerFn(listPersonalChallenges);

  const reload = async () => {
    setLoading(true);
    try {
      const [data, hist, ch] = await Promise.all([
        listFn({ data: {} }) as Promise<Plan[]>,
        histFn({ data: {} }) as Promise<any>,
        listChallengesFn() as Promise<{ challenges: PersonalChallenge[] }>,
      ]);
      data.forEach((p) => p.workout_exercises?.sort((a, b) => a.order_index - b.order_index));
      setPlans(data);
      const completed = (hist.sessions || []).filter((s: any) => s.ended_at);
      setRecentSessions(completed.map((s: any) => ({ started_at: s.started_at, completion_pct: s.completion_pct, plan_id: s.plan_id })));
      const last = completed[0];
      if (last) {
        const p = data.find((p) => p.id === last.plan_id) || null;
        setLastCompletedPlan(p);
      }
      setChallenges(ch.challenges || []);
    } catch (e) {
      toast.error("Erro ao carregar treinos");
    }
    setLoading(false);
  };

  useEffect(() => { reload(); }, []);

  if (view === "active" && activePlan) {
    return <ActiveSession key={activePlan.id} plan={activePlan} plans={plans} onExit={() => { setActivePlan(null); setView("home"); reload(); }} onStartNext={(p) => { setActivePlan(p); }} />;
  }
  if (view === "history") {
    return <HistoryView onBack={() => setView("home")} />;
  }

  const next = nextLetter(plans, lastCompletedPlan?.letter);
  // Days a workout was completed (for mini-calendar)
  const completedDays = new Set(recentSessions.map((s) => new Date(s.started_at).toISOString().slice(0, 10)));
  // Current streak
  const streak = (() => {
    let s = 0; const d = new Date();
    for (;;) { const k = d.toISOString().slice(0, 10); if (completedDays.has(k)) { s++; d.setDate(d.getDate() - 1); } else break; }
    return s;
  })();

  return (
    <div className="space-y-4 p-4 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={() => navigate({ to: "/student" })} className="rounded-full bg-white/5 p-2 text-white/70">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <div className="flex-1">
          <h1 className="text-lg font-bold text-white">Meu Treino</h1>
          <p className="text-[11px] text-white/45">Treine, evolua, conquiste 🏆</p>
        </div>
        <button onClick={() => setView("history")} className="flex items-center gap-1 rounded-full bg-primary/15 px-3 py-1.5 text-[11px] font-bold text-primary">
          <History className="h-3.5 w-3.5" /> Histórico
        </button>
      </header>

      {/* Próximo treino destaque */}
      {next && (
        <div className="relative overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-primary/5 to-transparent p-4">
          <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80">Próximo treino</p>
          <div className="mt-2 flex items-center gap-3">
            <div className={`flex h-14 w-14 shrink-0 items-center justify-center rounded-2xl bg-gradient-to-br ${letterGradient(next.letter)} text-2xl font-black text-white shadow-lg`}>
              {next.letter || "·"}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-base font-bold text-white">{next.name}</p>
              <p className="text-[11px] text-white/55">{next.workout_exercises.length} exercícios</p>
            </div>
            <button
              onClick={() => { setActivePlan(next); setView("active"); }}
              className="rounded-full bg-primary px-5 py-2.5 text-sm font-bold text-primary-foreground shadow-md shadow-primary/30 hover:brightness-110"
            >
              <Play className="inline h-4 w-4 -mt-0.5 mr-1" /> Iniciar
            </button>
          </div>
        </div>
      )}

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="h-4 w-4" />} label="Constância" value={`${streak}d`} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Treinos" value={String(recentSessions.length)} />
        <Stat icon={<Target className="h-4 w-4" />} label="Desafios" value={String(challenges.filter((c) => c.status === "active").length)} />
      </div>

      {/* Personal challenges card */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
        <div className="mb-3 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Target className="h-4 w-4 text-primary" />
            <p className="text-xs font-bold uppercase tracking-wider text-white/70">Meu Desafio Pessoal</p>
          </div>
          <button onClick={() => setNewChallengeOpen(true)} className="rounded-full bg-primary/20 px-2.5 py-1 text-[11px] font-bold text-primary">
            <Plus className="inline h-3 w-3 -mt-0.5" /> Novo
          </button>
        </div>
        {challenges.length === 0 ? (
          <p className="rounded-xl border border-dashed border-white/10 py-4 text-center text-[11px] text-white/45">
            Defina quantos dias seguidos você vai treinar — para você mesmo se cobrar.
          </p>
        ) : (
          <div className="space-y-2">
            {challenges.map((c) => {
              const pct = Math.min(100, Math.round((streak / c.target_days) * 100));
              const done = c.status === "completed";
              return (
                <div key={c.id} className={`rounded-xl border p-3 ${done ? "border-emerald-500/30 bg-emerald-500/5" : "border-white/10 bg-white/[0.04]"}`}>
                  <div className="flex items-center justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-semibold text-white">{c.title}</p>
                      <p className="text-[11px] text-white/55">
                        {done ? "✅ Concluído!" : `${Math.min(streak, c.target_days)}/${c.target_days} dias seguidos`}
                      </p>
                    </div>
                    <button onClick={async () => { if (confirm(`Excluir desafio "${c.title}"?`)) { await (await import("@/lib/workouts.functions")).deletePersonalChallenge({ data: { id: c.id } } as any); reload(); } }} className="rounded p-1 text-white/40 hover:text-red-400">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                  <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/10">
                    <div className={`h-full transition-all ${done ? "bg-emerald-500" : "bg-gradient-to-r from-primary to-orange-500"}`} style={{ width: `${pct}%` }} />
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Mini-calendar */}
      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-white/60">
          <CalendarIcon className="h-3.5 w-3.5 text-primary" /> Mês atual
        </p>
        <CalendarView sessions={recentSessions} />
      </div>

      {loading ? (
        <p className="py-12 text-center text-sm text-white/50">Carregando...</p>
      ) : plans.length === 0 ? (
        <div className="rounded-2xl border border-white/10 bg-white/5 p-6 text-center">
          <Dumbbell className="mx-auto h-10 w-10 text-white/30" />
          <p className="mt-3 text-sm font-semibold text-white">Nenhum treino configurado</p>
          <p className="mt-1 text-[11px] text-white/50">
            Peça ao seu coach para configurar um plano de treino para você.
          </p>
        </div>
      ) : (
        <div className="space-y-3">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Todos os treinos da semana</p>
          {plans.map((p) => {
            const isNext = next && p.id === next.id;
            return (
              <div key={p.id} className={`rounded-2xl border p-4 ${isNext ? "border-primary/40 bg-primary/[0.06]" : "border-white/10 bg-white/5"}`}>
                <div className="flex items-center gap-3">
                  <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${letterGradient(p.letter)} text-xl font-black text-white shadow-md`}>
                    {p.letter || "·"}
                  </div>
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-sm font-bold text-white">{p.name}</p>
                    <p className="mt-0.5 text-[11px] text-white/45">
                      {p.day_of_week !== null ? `${DAYS[p.day_of_week]} · ` : ""}
                      {p.workout_exercises.length} exercícios
                    </p>
                  </div>
                  <button
                    onClick={() => { setActivePlan(p); setView("active"); }}
                    className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-2 text-xs font-bold text-white hover:bg-white/15"
                  >
                    <Play className="h-3.5 w-3.5" /> Iniciar
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      <Link to="/student" className="block text-center text-[11px] text-white/40 underline">Voltar para início</Link>

      {newChallengeOpen && (
        <NewChallengeModal
          onClose={() => setNewChallengeOpen(false)}
          onCreated={() => { setNewChallengeOpen(false); reload(); }}
        />
      )}
    </div>
  );
}

function NewChallengeModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const createFn = useServerFn(createPersonalChallenge);
  const [title, setTitle] = useState("");
  const [days, setDays] = useState(30);
  const [saving, setSaving] = useState(false);
  const submit = async () => {
    if (!title.trim()) return toast.error("Dê um nome para seu desafio");
    if (days < 1 || days > 365) return toast.error("Entre 1 e 365 dias");
    setSaving(true);
    try {
      await createFn({ data: { title: title.trim(), target_days: days } });
      toast.success("Desafio criado! Bora?");
      onCreated();
    } catch (e: any) {
      toast.error(e.message || "Erro ao criar desafio");
    }
    setSaving(false);
  };
  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 p-4 sm:items-center" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F0F0F] p-5" onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center gap-2">
          <Target className="h-5 w-5 text-primary" />
          <h2 className="text-base font-bold text-white">Novo desafio pessoal</h2>
        </div>
        <p className="mb-3 text-[11px] text-white/55">Defina seu compromisso de constância e siga em frente. A cada treino concluído você avança.</p>
        <label className="text-[11px] text-white/60">Nome do desafio</label>
        <input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Ex: 30 dias sem falta" className="mt-1 mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white outline-none" />
        <label className="text-[11px] text-white/60">Meta de dias seguidos: <span className="font-bold text-primary">{days}</span></label>
        <input type="range" min={1} max={365} value={days} onChange={(e) => setDays(Number(e.target.value))} className="mt-1 w-full accent-primary" />
        <div className="mt-2 flex justify-between text-[10px] text-white/40">
          <span>1d</span><span>30d</span><span>90d</span><span>180d</span><span>365d</span>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg bg-white/10 px-4 py-2 text-sm text-white">Cancelar</button>
          <button onClick={submit} disabled={saving} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{saving ? "Criando..." : "Criar desafio"}</button>
        </div>
      </div>
    </div>
  );
}

/* ------------------------- ACTIVE SESSION ------------------------- */
function ActiveSession({ plan, plans, onExit, onStartNext }: { plan: Plan; plans?: Plan[]; onExit: () => void; onStartNext?: (p: Plan) => void }) {
  const startFn = useServerFn(startWorkoutSession);
  const logSetFn = useServerFn(logSet);
  const logCardioFn = useServerFn(logCardio);
  const finishFn = useServerFn(finishWorkoutSession);
  const lastLogsFn = useServerFn(getLastExerciseLogs);
  const saveConfigFn = useServerFn(updateExerciseUserConfig);

  const [sessionId, setSessionId] = useState<string | null>(null);
  const [globalSec, setGlobalSec] = useState(0);
  const [running, setRunning] = useState(true);
  const [completedSets, setCompletedSets] = useState<Record<string, number>>({});
  const [loads, setLoads] = useState<Record<string, number>>({});
  const [reps, setReps] = useState<Record<string, number>>({});
  const [equipment, setEquipment] = useState<Record<string, string>>({});
  const [lastLogs, setLastLogs] = useState<Record<string, LastLog>>({});

  // Rest count-UP timer: tracks elapsed since the active exercise's last completed set.
  const [restElapsed, setRestElapsed] = useState<number | null>(null);
  const [restRange, setRestRange] = useState<{ min: number; max: number }>({ min: 60, max: 60 });
  const [restExerciseName, setRestExerciseName] = useState<string>("");

  const [summary, setSummary] = useState<{ total: number; achievements: Array<{ code: string; title: string; icon: string | null }>; durationSec: number; streak: number } | null>(null);
  const [achievementReveal, setAchievementReveal] = useState<{ code: string; title: string; icon: string | null } | null>(null);

  // cardio state
  const [cardio, setCardio] = useState<Record<string, { duration: string; pace: string; speed: string; elevation: string; distance: string; done: boolean }>>({});

  // Initialize state from plan (saved configs + previous logs)
  useEffect(() => {
    const initEq: Record<string, string> = {};
    plan.workout_exercises.forEach((e) => {
      if (e.equipment_config_user) initEq[e.id] = e.equipment_config_user;
      else if (e.equipment_config) initEq[e.id] = e.equipment_config;
    });
    setEquipment(initEq);
    (async () => {
      try {
        const ids = plan.workout_exercises.map((e) => e.id);
        const r = (await lastLogsFn({ data: { exercise_ids: ids } })) as { last: Record<string, LastLog> };
        setLastLogs(r.last || {});
        // pre-fill load with last used (if not prescribed)
        setLoads((prev) => {
          const next = { ...prev };
          plan.workout_exercises.forEach((e) => {
            if (next[e.id] == null && e.load_kg == null && r.last?.[e.id]?.load_kg != null) {
              next[e.id] = Number(r.last[e.id]!.load_kg);
            }
          });
          return next;
        });
      } catch { /* non-fatal */ }
    })();
  }, [plan.id]);

  useEffect(() => {
    (async () => {
      const r = (await startFn({ data: { plan_id: plan.id } })) as { id: string };
      setSessionId(r.id);
    })();
  }, [plan.id, startFn]);

  // Global timer
  useEffect(() => {
    if (!running) return;
    const t = setInterval(() => setGlobalSec((s) => s + 1), 1000);
    return () => clearInterval(t);
  }, [running]);

  // Rest COUNT-UP timer
  useEffect(() => {
    if (restElapsed === null) return;
    const t = setInterval(() => setRestElapsed((e) => (e === null ? null : e + 1)), 1000);
    return () => clearInterval(t);
  }, [restElapsed !== null]);

  const totalUnits = useMemo(() => plan.workout_exercises.reduce((s, e) => s + (e.is_cardio ? 1 : e.sets), 0), [plan]);
  const doneUnits = useMemo(() => {
    let n = 0;
    plan.workout_exercises.forEach((e) => {
      if (e.is_cardio) n += cardio[e.id]?.done ? 1 : 0;
      else n += Math.min(completedSets[e.id] || 0, e.sets);
    });
    return n;
  }, [plan, completedSets, cardio]);
  const completionPct = totalUnits ? Math.round((doneUnits / totalUnits) * 100) : 0;

  const fmt = (s: number) => {
    const a = Math.max(0, s);
    const m = Math.floor(a / 60);
    const ss = a % 60;
    return `${String(m).padStart(2, "0")}:${String(ss).padStart(2, "0")}`;
  };

  // Rest zone derived from min/max range
  const restZone: "normal" | "target" | "over" = (() => {
    if (restElapsed === null) return "normal";
    if (restElapsed < restRange.min) return "normal";
    if (restElapsed < restRange.max) return "target";
    return "over";
  })();

  const skipRest = () => { setRestElapsed(null); };

  const completeSet = async (ex: Plan["workout_exercises"][number]) => {
    if (!sessionId) return;
    const setNumber = (completedSets[ex.id] || 0) + 1;
    const load = loads[ex.id] ?? ex.load_kg ?? 0;
    const repsDone = reps[ex.id] ?? (parseInt(ex.reps || "0", 10) || 0);
    const eqConfig = equipment[ex.id] || null;
    try {
      await logSetFn({
        data: {
          session_id: sessionId,
          exercise_id: ex.id,
          set_number: setNumber,
          reps_done: repsDone,
          load_kg: load,
          rest_seconds_actual: null,
          rest_exceeded: false,
          equipment_config: eqConfig,
        },
      });
      setCompletedSets((c) => ({ ...c, [ex.id]: setNumber }));
      if (setNumber < ex.sets) {
        const max = ex.rest_seconds_max ?? ex.rest_seconds;
        const min = Math.min(ex.rest_seconds, max);
        setRestRange({ min, max });
        setRestExerciseName(ex.exercise_name);
        setRestElapsed(0);
      }
    } catch (e) {
      toast.error("Erro ao registrar série");
    }
  };

  const completeExercise = async (ex: Plan["workout_exercises"][number]) => {
    if (!sessionId) return;
    const already = completedSets[ex.id] || 0;
    if (already >= ex.sets) return;
    const load = loads[ex.id] ?? ex.load_kg ?? 0;
    const repsDone = reps[ex.id] ?? (parseInt(ex.reps || "0", 10) || 0);
    const eqConfig = equipment[ex.id] || null;
    try {
      for (let n = already + 1; n <= ex.sets; n++) {
        await logSetFn({
          data: {
            session_id: sessionId,
            exercise_id: ex.id,
            set_number: n,
            reps_done: repsDone,
            load_kg: load,
            rest_seconds_actual: null,
            rest_exceeded: false,
            equipment_config: eqConfig,
          },
        });
      }
      setCompletedSets((c) => ({ ...c, [ex.id]: ex.sets }));
      setRestElapsed(null);
      toast.success(`${ex.exercise_name} concluído!`);
    } catch {
      toast.error("Erro ao concluir exercício");
    }
  };

  const saveEquipment = async (ex: Plan["workout_exercises"][number], value: string) => {
    setEquipment((m) => ({ ...m, [ex.id]: value }));
    try { await saveConfigFn({ data: { exercise_id: ex.id, equipment_config_user: value || null } }); } catch { /* ignore */ }
  };

  const completeCardio = async (ex: Plan["workout_exercises"][number]) => {
    if (!sessionId) return;
    const c = cardio[ex.id] || { duration: "", pace: "", speed: "", elevation: "", distance: "", done: false };
    try {
      await logCardioFn({
        data: {
          session_id: sessionId,
          exercise_id: ex.id,
          duration_min: c.duration ? Number(c.duration) : null,
          distance_km: c.distance ? Number(c.distance) : null,
          pace: c.pace || null,
          speed: c.speed ? Number(c.speed) : null,
          elevation: c.elevation ? Number(c.elevation) : null,
          calories: null,
        },
      });
      setCardio((m) => ({ ...m, [ex.id]: { ...c, done: true } }));
    } catch {
      toast.error("Erro ao registrar cardio");
    }
  };

  const finish = async () => {
    if (!sessionId) return;
    try {
      const r = (await finishFn({
        data: { session_id: sessionId, total_seconds: globalSec, completion_pct: completionPct, notes: null },
      })) as { xp: number; totalSessions: number; streak: number; newAchievements: Array<{ code: string; title: string; icon: string | null }> };
      setSummary({ total: r.totalSessions, achievements: r.newAchievements || [], durationSec: globalSec, streak: r.streak || 0 });
      setRunning(false);
      if ((r.newAchievements || []).length > 0) {
        setAchievementReveal(r.newAchievements[0]);
      }
    } catch {
      toast.error("Erro ao finalizar");
    }
  };

  if (summary) {
    const next = nextLetter(plans || [], plan.letter);
    const showNext = next && next.id !== plan.id;
    return (
      <div className="relative space-y-5 p-5 text-center">
        {achievementReveal && (
          <AchievementReveal achievement={achievementReveal} onClose={() => setAchievementReveal(null)} />
        )}
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-4xl shadow-xl shadow-primary/40 animate-scale-in">
          🏆
        </div>
        <h2 className="text-2xl font-extrabold text-white">Treino concluído!</h2>
        <p className="text-sm text-white/60">Você completou {completionPct}% do treino</p>

        <div className="grid grid-cols-3 gap-3">
          <Stat icon={<Flame className="h-4 w-4" />} label="Constância" value={`${summary.streak}d`} />
          <Stat icon={<Clock className="h-4 w-4" />} label="Tempo" value={fmt(summary.durationSec)} />
          <Stat icon={<Trophy className="h-4 w-4" />} label="Treinos" value={String(summary.total)} />
        </div>

        {summary.achievements.length > 0 && (
          <div className="rounded-2xl border border-primary/30 bg-primary/10 p-4 animate-fade-in">
            <p className="text-xs font-bold uppercase tracking-wider text-primary">Novas Conquistas!</p>
            <div className="mt-2 flex flex-wrap justify-center gap-2">
              {summary.achievements.map((a) => (
                <button key={a.code} onClick={() => setAchievementReveal(a)} className="flex items-center gap-1.5 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15">
                  <span>{a.icon || "🏆"}</span> {a.title}
                </button>
              ))}
            </div>
          </div>
        )}

        {showNext && onStartNext && (
          <div className="rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 to-transparent p-4 text-left">
            <p className="text-[10px] uppercase tracking-widest font-bold text-primary/80">Próximo treino</p>
            <div className="mt-2 flex items-center gap-3">
              <div className={`flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br ${letterGradient(next!.letter)} text-xl font-black text-white`}>
                {next!.letter || "·"}
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-bold text-white">{next!.name}</p>
                <p className="text-[11px] text-white/55">{next!.workout_exercises.length} exercícios</p>
              </div>
              <button onClick={() => onStartNext(next!)} className="rounded-full bg-primary px-4 py-2 text-xs font-bold text-primary-foreground">
                <Play className="inline h-3.5 w-3.5 -mt-0.5 mr-1" /> Iniciar
              </button>
            </div>
          </div>
        )}

        <button onClick={onExit} className="w-full rounded-full bg-white/10 py-3 text-sm font-bold text-white">
          Voltar para meus treinos
        </button>
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4 pb-32">
      <header className="flex items-center gap-3">
        <button onClick={onExit} className="rounded-full bg-white/5 p-2 text-white/70">
          <X className="h-4 w-4" />
        </button>
        <div className="flex-1 min-w-0">
          <p className="truncate text-sm font-bold text-white">{plan.name}</p>
          <p className="text-[11px] text-white/45">{completionPct}% · {doneUnits}/{totalUnits} concluídos</p>
        </div>
        <button onClick={() => setRunning((r) => !r)} className="rounded-full bg-white/5 p-2 text-white/70">
          {running ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </button>
        <div className="rounded-full bg-primary/15 px-3 py-1.5 font-mono text-xs font-bold text-primary tabular-nums">
          {fmt(globalSec)}
        </div>
      </header>

      <div className="h-1.5 w-full overflow-hidden rounded-full bg-white/5">
        <div className="h-full bg-gradient-to-r from-primary to-orange-500 transition-all" style={{ width: `${completionPct}%` }} />
      </div>

      {/* Rest count-up timer banner — white < min, yellow in target, red over max */}
      {restElapsed !== null && (
        <div
          className={`sticky top-0 z-10 flex items-center justify-between rounded-2xl border p-3 ${
            restZone === "over"
              ? "animate-pulse border-red-500 bg-red-500/25"
              : restZone === "target"
                ? "border-yellow-400/50 bg-yellow-400/15"
                : "border-white/20 bg-white/10"
          }`}
        >
          <div className="flex items-center gap-2">
            <Clock className={`h-5 w-5 ${restZone === "over" ? "text-red-400" : restZone === "target" ? "text-yellow-300" : "text-white"}`} />
            <div>
              <p className="text-[10px] uppercase font-bold tracking-wider text-white/60">
                Descanso {restExerciseName ? `· ${restExerciseName}` : ""} ({restRange.min === restRange.max ? `${restRange.min}s` : `${restRange.min}–${restRange.max}s`})
              </p>
              <p className={`font-mono text-lg font-bold tabular-nums ${restZone === "over" ? "text-red-300" : restZone === "target" ? "text-yellow-200" : "text-white"}`}>
                {fmt(restElapsed)}
              </p>
            </div>
          </div>
          <button onClick={skipRest} className="rounded-full bg-white/10 px-3 py-1.5 text-[11px] font-bold text-white">
            Pular
          </button>
        </div>
      )}

      {plan.workout_exercises.map((ex) => (
        <ExerciseCard
          key={ex.id}
          ex={ex}
          done={completedSets[ex.id] || 0}
          load={loads[ex.id] ?? ex.load_kg ?? 0}
          reps={reps[ex.id] ?? (parseInt(ex.reps || "0", 10) || 0)}
          cardio={cardio[ex.id]}
          equipment={equipment[ex.id] ?? ""}
          lastLog={lastLogs[ex.id]}
          onChangeLoad={(v) => setLoads((m) => ({ ...m, [ex.id]: v }))}
          onChangeReps={(v) => setReps((m) => ({ ...m, [ex.id]: v }))}
          onChangeEquipment={(v) => saveEquipment(ex, v)}
          onChangeCardio={(patch) =>
            setCardio((m) => {
              const prev = m[ex.id] ?? { duration: "", pace: "", speed: "", elevation: "", distance: "", done: false };
              return { ...m, [ex.id]: { ...prev, ...patch } };
            })
          }
          onCompleteSet={() => completeSet(ex)}
          onCompleteCardio={() => completeCardio(ex)}
          onCompleteExercise={() => completeExercise(ex)}
        />
      ))}

      <button
        onClick={finish}
        className="fixed bottom-24 left-1/2 z-30 -translate-x-1/2 rounded-full bg-gradient-to-r from-primary to-orange-500 px-8 py-3 text-sm font-bold text-white shadow-xl shadow-primary/30"
      >
        Finalizar Treino
      </button>
    </div>
  );
}

function AchievementReveal({ achievement, onClose }: { achievement: { code: string; title: string; icon: string | null }; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/85 p-6 animate-fade-in" onClick={onClose}>
      <div className="relative" onClick={(e) => e.stopPropagation()}>
        {/* burst rays */}
        <div className="absolute inset-0 -m-20 animate-pulse opacity-60" aria-hidden>
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-primary/40 via-orange-500/30 to-yellow-400/20 blur-3xl" />
        </div>
        {/* sparkles */}
        {Array.from({ length: 12 }).map((_, i) => (
          <Sparkles
            key={i}
            className="absolute h-5 w-5 text-yellow-300 animate-ping"
            style={{
              top: `${50 + 45 * Math.sin((i / 12) * Math.PI * 2)}%`,
              left: `${50 + 45 * Math.cos((i / 12) * Math.PI * 2)}%`,
              animationDelay: `${i * 90}ms`,
              animationDuration: "1.6s",
            }}
          />
        ))}
        <div className="relative flex flex-col items-center gap-4 rounded-3xl border border-primary/40 bg-gradient-to-br from-[#1a1a1a] to-[#0a0a0a] p-8 text-center shadow-[0_0_60px_rgba(255,120,40,0.35)] animate-scale-in">
          <p className="text-[10px] uppercase tracking-[0.3em] font-bold text-primary/80">Conquista desbloqueada</p>
          <div className="flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-primary to-orange-500 text-5xl shadow-lg shadow-primary/40">
            {achievement.icon || "🏆"}
          </div>
          <h3 className="text-2xl font-extrabold text-white">{achievement.title}</h3>
          <button onClick={onClose} className="rounded-full bg-primary px-6 py-2.5 text-sm font-bold text-primary-foreground">
            Incrível!
          </button>
        </div>
      </div>
    </div>
  );
}

function Stat({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <div className="mx-auto flex h-8 w-8 items-center justify-center rounded-full bg-primary/15 text-primary">{icon}</div>
      <p className="mt-1.5 text-[10px] uppercase text-white/40">{label}</p>
      <p className="text-sm font-bold text-white">{value}</p>
    </div>
  );
}

function ExerciseCard({
  ex,
  done,
  load,
  reps,
  cardio,
  equipment,
  lastLog,
  onChangeLoad,
  onChangeReps,
  onChangeEquipment,
  onChangeCardio,
  onCompleteSet,
  onCompleteCardio,
  onCompleteExercise,
}: {
  ex: Plan["workout_exercises"][number];
  done: number;
  load: number;
  reps: number;
  cardio?: { duration: string; pace: string; speed: string; elevation: string; distance: string; done: boolean };
  equipment: string;
  lastLog?: LastLog;
  onChangeLoad: (v: number) => void;
  onChangeReps: (v: number) => void;
  onChangeEquipment: (v: string) => void;
  onChangeCardio: (p: Partial<{ duration: string; pace: string; speed: string; elevation: string; distance: string }>) => void;
  onCompleteSet: () => void;
  onCompleteCardio: () => void;
  onCompleteExercise: () => void;
}) {
  const isComplete = ex.is_cardio ? cardio?.done : done >= ex.sets;
  const restLabel = ex.rest_seconds_max && ex.rest_seconds_max !== ex.rest_seconds
    ? `${ex.rest_seconds}–${ex.rest_seconds_max}s`
    : `${ex.rest_seconds}s`;
  return (
    <div className={`rounded-2xl border p-3 ${isComplete ? "border-primary/30 bg-primary/5" : "border-white/10 bg-white/5"}`}>
      <div className="flex items-start gap-3">
        {ex.media_url ? (
          <img src={ex.media_url} alt="" className="h-14 w-14 rounded-xl object-cover" />
        ) : (
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/5">
            <Dumbbell className="h-5 w-5 text-white/40" />
          </div>
        )}
        <div className="flex-1 min-w-0">
          <p className="text-sm font-bold text-white">{ex.exercise_name}</p>
          {ex.is_cardio ? (
            <p className="text-[11px] text-white/45">
              Cardio {ex.cardio_duration_min ? `· ${ex.cardio_duration_min}min` : ""}
              {ex.cardio_pace ? ` · pace ${ex.cardio_pace}` : ""}
            </p>
          ) : (
            <p className="text-[11px] text-white/45">
              {ex.sets} séries · {ex.reps || "—"} reps · {restLabel} descanso
            </p>
          )}
          {ex.equipment_config && <p className="mt-0.5 text-[10px] text-white/40">⚙ Sugerido: {ex.equipment_config}</p>}
          {lastLog && (lastLog.load_kg != null || lastLog.equipment_config) && (
            <p className="mt-0.5 text-[10px] text-primary/80">
              📌 Última vez: {lastLog.load_kg != null ? `${lastLog.load_kg}kg` : "—"}
              {lastLog.equipment_config ? ` · ${lastLog.equipment_config}` : ""}
            </p>
          )}
          {ex.notes && <p className="mt-0.5 text-[10px] italic text-white/40">{ex.notes}</p>}
        </div>
        {isComplete && <Check className="h-5 w-5 shrink-0 text-primary" />}
      </div>

      {!ex.is_cardio && (
        <input
          value={equipment}
          onChange={(e) => onChangeEquipment(e.target.value)}
          placeholder="Configuração do aparelho (ex: Pino 4 · Banco 2)"
          className="mt-2 w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs text-white outline-none placeholder:text-white/30"
        />
      )}

      {!ex.is_cardio && (
        <>
          <div className="mt-3 flex items-center gap-2">
            <NumInput label="Carga (kg)" value={load} onChange={onChangeLoad} step={2.5} />
            <NumInput label="Reps" value={reps} onChange={onChangeReps} step={1} />
          </div>
          <div className="mt-2 flex items-center gap-2">
            <div className="flex flex-1 gap-1">
              {Array.from({ length: ex.sets }).map((_, i) => (
                <div
                  key={i}
                  className={`h-1.5 flex-1 rounded-full ${i < done ? "bg-primary" : "bg-white/10"}`}
                />
              ))}
            </div>
            <button
              disabled={done >= ex.sets}
              onClick={onCompleteSet}
              className="rounded-full bg-primary px-3 py-1.5 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
            >
              + Série {done + 1}
            </button>
          </div>
          {done < ex.sets && (
            <button
              onClick={onCompleteExercise}
              className="mt-2 w-full rounded-full border border-primary/40 bg-primary/10 px-3 py-1.5 text-[11px] font-bold text-primary hover:bg-primary/20"
            >
              <Check className="inline h-3 w-3 -mt-0.5 mr-1" /> Marcar exercício como concluído
            </button>
          )}
        </>
      )}


      {ex.is_cardio && !cardio?.done && (
        <div className="mt-3 grid grid-cols-2 gap-2">
          <TextField label="Duração (min)" value={cardio?.duration ?? ""} onChange={(v) => onChangeCardio({ duration: v })} />
          <TextField label="Distância (km)" value={cardio?.distance ?? ""} onChange={(v) => onChangeCardio({ distance: v })} />
          <TextField label="Pace" value={cardio?.pace ?? ""} onChange={(v) => onChangeCardio({ pace: v })} placeholder="5:30" />
          <TextField label="Velocidade" value={cardio?.speed ?? ""} onChange={(v) => onChangeCardio({ speed: v })} />
          <TextField label="Elevação" value={cardio?.elevation ?? ""} onChange={(v) => onChangeCardio({ elevation: v })} />
          <button onClick={onCompleteCardio} className="rounded-xl bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground">
            Concluir cardio
          </button>
        </div>
      )}
    </div>
  );
}

function NumInput({ label, value, onChange, step }: { label: string; value: number; onChange: (v: number) => void; step: number }) {
  return (
    <div className="flex-1">
      <p className="mb-1 text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <div className="flex items-center gap-1 rounded-xl bg-white/5 p-1">
        <button onClick={() => onChange(Math.max(0, value - step))} className="h-7 w-7 rounded-lg bg-white/10 text-sm font-bold text-white">−</button>
        <input
          type="number"
          value={value || ""}
          onChange={(e) => onChange(Number(e.target.value) || 0)}
          className="w-full bg-transparent text-center text-sm font-bold text-white outline-none"
        />
        <button onClick={() => onChange(value + step)} className="h-7 w-7 rounded-lg bg-white/10 text-sm font-bold text-white">+</button>
      </div>
    </div>
  );
}

function TextField({ label, value, onChange, placeholder }: { label: string; value: string; onChange: (v: string) => void; placeholder?: string }) {
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="w-full rounded-xl bg-white/5 px-2 py-1.5 text-sm text-white outline-none placeholder:text-white/30"
      />
    </div>
  );
}

/* ------------------------- HISTORY VIEW ------------------------- */
function HistoryView({ onBack }: { onBack: () => void }) {
  const histFn = useServerFn(getWorkoutHistory);
  const [data, setData] = useState<{
    sessions: Array<{ id: string; started_at: string; ended_at: string | null; total_seconds: number | null; completion_pct: number; xp_earned: number; workout_plans: { name: string } | { name: string }[] }>;
    logs: Array<{ exercise_id: string; load_kg: number | null; completed_at: string; workout_exercises: { exercise_name: string } | { exercise_name: string }[] }>;
    achievements: Array<{ id: string; title: string; icon: string | null; earned_at: string }>;
  } | null>(null);
  const [tab, setTab] = useState<"calendar" | "evolution" | "achievements">("calendar");

  useEffect(() => {
    (async () => {
      const r = await histFn({ data: {} });
      setData(r as never);
    })();
  }, []);

  const completed = data?.sessions.filter((s) => s.ended_at) || [];
  const totalDays = completed.length;
  const firstStart = completed.length ? new Date(completed[completed.length - 1].started_at) : null;
  const daysSinceStart = firstStart ? Math.floor((Date.now() - firstStart.getTime()) / 86400000) + 1 : 0;

  const streak = useMemo(() => {
    const dates = new Set(completed.map((s) => new Date(s.started_at).toISOString().slice(0, 10)));
    let s = 0;
    const d = new Date();
    for (;;) {
      const key = d.toISOString().slice(0, 10);
      if (dates.has(key)) { s++; d.setDate(d.getDate() - 1); } else break;
    }
    return s;
  }, [completed]);

  // Group logs by exercise for load evolution
  const loadByExercise = useMemo(() => {
    if (!data) return {};
    const map: Record<string, Array<{ date: string; load: number }>> = {};
    data.logs.forEach((l) => {
      const name = (Array.isArray(l.workout_exercises) ? l.workout_exercises[0]?.exercise_name : l.workout_exercises?.exercise_name) || "Exercício";
      if (l.load_kg == null) return;
      const date = new Date(l.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      (map[name] ||= []).push({ date, load: Number(l.load_kg) });
    });
    return map;
  }, [data]);

  return (
    <div className="space-y-4 p-4 pb-8">
      <header className="flex items-center gap-3">
        <button onClick={onBack} className="rounded-full bg-white/5 p-2 text-white/70">
          <ArrowLeft className="h-4 w-4" />
        </button>
        <h1 className="text-lg font-bold text-white">Acompanhamento</h1>
      </header>

      <div className="grid grid-cols-3 gap-2">
        <Stat icon={<Flame className="h-4 w-4" />} label="Streak" value={`${streak}d`} />
        <Stat icon={<Trophy className="h-4 w-4" />} label="Treinos" value={String(totalDays)} />
        <Stat icon={<CalendarIcon className="h-4 w-4" />} label="Dias ativo" value={String(daysSinceStart)} />
      </div>

      <div className="flex gap-2 rounded-full bg-white/5 p-1">
        {(["calendar", "evolution", "achievements"] as const).map((t) => (
          <button
            key={t}
            onClick={() => setTab(t)}
            className={`flex-1 rounded-full px-3 py-2 text-[11px] font-bold ${tab === t ? "bg-primary text-primary-foreground" : "text-white/60"}`}
          >
            {t === "calendar" ? "Calendário" : t === "evolution" ? "Evolução" : "Conquistas"}
          </button>
        ))}
      </div>

      {tab === "calendar" && <CalendarView sessions={completed} />}

      {tab === "evolution" && (
        <div className="space-y-4">
          {Object.keys(loadByExercise).length === 0 ? (
            <p className="py-8 text-center text-xs text-white/40">Sem dados de carga ainda.</p>
          ) : (
            Object.entries(loadByExercise).slice(0, 6).map(([name, points]) => (
              <div key={name} className="rounded-2xl border border-white/10 bg-white/5 p-3">
                <p className="text-xs font-bold text-white">{name}</p>
                <div className="h-32">
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={points}>
                      <XAxis dataKey="date" stroke="#666" fontSize={9} />
                      <YAxis stroke="#666" fontSize={9} />
                      <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", fontSize: 11 }} />
                      <Line type="monotone" dataKey="load" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 3 }} />
                    </LineChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {tab === "achievements" && (
        <div className="grid grid-cols-2 gap-2">
          {data?.achievements.length === 0 && <p className="col-span-2 py-8 text-center text-xs text-white/40">Sem conquistas ainda.</p>}
          {data?.achievements.map((a) => (
            <div key={a.id} className="rounded-2xl border border-primary/20 bg-gradient-to-br from-primary/15 to-transparent p-3 text-center">
              <p className="text-2xl">{a.icon || "🏆"}</p>
              <p className="mt-1 text-xs font-bold text-white">{a.title}</p>
              <p className="text-[9px] text-white/40">{new Date(a.earned_at).toLocaleDateString("pt-BR")}</p>
            </div>
          ))}
        </div>
      )}

      <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-xs font-bold text-white">Sessões recentes</p>
        {completed.slice(0, 10).map((s) => {
          const planName = Array.isArray(s.workout_plans) ? s.workout_plans[0]?.name : s.workout_plans?.name;
          return (
            <div key={s.id} className="flex items-center justify-between border-t border-white/5 py-2 text-[11px] first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate text-white">{planName || "Treino"}</p>
                <p className="text-white/40">{new Date(s.started_at).toLocaleString("pt-BR")}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{s.completion_pct}%</p>
                <p className="text-white/40">{s.total_seconds ? `${Math.floor((s.total_seconds||0)/60)}min` : ""}</p>
              </div>
            </div>
          );
        })}
        {completed.length === 0 && <p className="py-2 text-center text-[11px] text-white/40">Nenhuma sessão concluída.</p>}
      </div>
    </div>
  );
}

function CalendarView({ sessions }: { sessions: Array<{ started_at: string; completion_pct: number }> }) {
  const now = new Date();
  const year = now.getFullYear();
  const month = now.getMonth();
  const firstDay = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();

  const byDay: Record<number, number> = {};
  sessions.forEach((s) => {
    const d = new Date(s.started_at);
    if (d.getFullYear() === year && d.getMonth() === month) {
      byDay[d.getDate()] = Math.max(byDay[d.getDate()] || 0, s.completion_pct);
    }
  });

  const cells: Array<number | null> = [];
  for (let i = 0; i < firstDay; i++) cells.push(null);
  for (let i = 1; i <= daysInMonth; i++) cells.push(i);

  return (
    <div className="rounded-2xl border border-white/10 bg-white/5 p-3">
      <p className="mb-2 text-center text-xs font-bold text-white">
        {now.toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
      </p>
      <div className="grid grid-cols-7 gap-1 text-center text-[9px] text-white/40">
        {DAYS.map((d) => <div key={d}>{d}</div>)}
      </div>
      <div className="mt-1 grid grid-cols-7 gap-1">
        {cells.map((d, i) => {
          const pct = d ? byDay[d] : undefined;
          return (
            <div
              key={i}
              className={`aspect-square rounded-lg text-[10px] font-bold flex items-center justify-center ${
                pct !== undefined
                  ? pct >= 100 ? "bg-primary text-primary-foreground" : "bg-primary/40 text-white"
                  : d ? "bg-white/5 text-white/50" : ""
              }`}
            >
              {d || ""}
            </div>
          );
        })}
      </div>
      <p className="mt-2 text-center text-[9px] text-white/40">Verde escuro = treino 100% concluído</p>
    </div>
  );
}
