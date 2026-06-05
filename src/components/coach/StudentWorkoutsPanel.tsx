import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Dumbbell, Flame, Trophy, Calendar as CalendarIcon, TrendingUp, ArrowUpRight, BarChart3 } from "lucide-react";
import { getWorkoutHistory } from "@/lib/workouts.functions";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

interface Props {
  studentUserId: string;
}

type Mode = "exercise" | "workout";

export default function StudentWorkoutsPanel({ studentUserId }: Props) {
  const histFn = useServerFn(getWorkoutHistory);
  const [data, setData] = useState<any>(null);
  const [mode, setMode] = useState<Mode>("exercise");

  useEffect(() => {
    if (!studentUserId) return;
    setData(null);
    histFn({ data: { studentId: studentUserId } }).then(setData).catch(() => setData({ sessions: [], logs: [], achievements: [] }));
  }, [studentUserId, histFn]);

  const stats = useMemo(() => {
    if (!data) return null;
    const completed = (data.sessions || []).filter((s: any) => s.ended_at);
    return {
      sessions: completed,
      achievements: data.achievements || [],
      lastDate: completed[0]?.started_at || null,
    };
  }, [data]);

  // Build per-exercise time series + first/last load for ranking
  const exerciseSeries = useMemo(() => {
    if (!data) return [] as Array<{ name: string; points: Array<{ date: string; load: number }>; first: number; last: number; gain: number; gainPct: number }>;
    const groups: Record<string, Array<{ date: string; load: number; t: number }>> = {};
    (data.logs || []).forEach((l: any) => {
      const name = (Array.isArray(l.workout_exercises) ? l.workout_exercises[0]?.exercise_name : l.workout_exercises?.exercise_name) || "Exercício";
      if (l.load_kg == null) return;
      const t = new Date(l.completed_at).getTime();
      const date = new Date(l.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      (groups[name] ||= []).push({ date, load: Number(l.load_kg), t });
    });
    return Object.entries(groups).map(([name, arr]) => {
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0].load;
      const last = arr[arr.length - 1].load;
      const gain = last - first;
      const gainPct = first > 0 ? (gain / first) * 100 : 0;
      return { name, points: arr.map(({ date, load }) => ({ date, load })), first, last, gain, gainPct };
    });
  }, [data]);

  // Per workout (plan) average load per session
  const workoutSeries = useMemo(() => {
    if (!data) return [] as Array<{ name: string; points: Array<{ date: string; load: number }>; first: number; last: number; gain: number; gainPct: number }>;
    const sessions = (data.sessions || []).filter((s: any) => s.ended_at);
    const logsBySession: Record<string, number[]> = {};
    (data.logs || []).forEach((l: any) => {
      if (l.load_kg == null || !l.session_id) return;
      (logsBySession[l.session_id] ||= []).push(Number(l.load_kg));
    });
    const groups: Record<string, Array<{ date: string; load: number; t: number }>> = {};
    sessions.forEach((s: any) => {
      const loads = logsBySession[s.id];
      if (!loads || !loads.length) return;
      const avg = loads.reduce((a, b) => a + b, 0) / loads.length;
      const plan = Array.isArray(s.workout_plans) ? s.workout_plans[0] : s.workout_plans;
      const letter = plan?.letter ? ` ${plan.letter}` : "";
      const name = (plan?.name || "Treino") + (letter ? ` (${plan.letter})` : "");
      const t = new Date(s.started_at).getTime();
      const date = new Date(s.started_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
      (groups[name] ||= []).push({ date, load: Math.round(avg * 10) / 10, t });
    });
    return Object.entries(groups).map(([name, arr]) => {
      arr.sort((a, b) => a.t - b.t);
      const first = arr[0].load;
      const last = arr[arr.length - 1].load;
      const gain = last - first;
      const gainPct = first > 0 ? (gain / first) * 100 : 0;
      return { name, points: arr.map(({ date, load }) => ({ date, load })), first, last, gain, gainPct };
    });
  }, [data]);

  const series = mode === "exercise" ? exerciseSeries : workoutSeries;
  const ranking = useMemo(
    () => [...series].filter((s) => s.points.length >= 2 && s.gain > 0).sort((a, b) => b.gain - a.gain).slice(0, 10),
    [series],
  );

  if (!data) return <p className="py-10 text-center text-xs text-white/40">Carregando...</p>;
  if (!stats || stats.sessions.length === 0) {
    return (
      <div className="rounded-xl border border-dashed border-white/10 p-8 text-center">
        <Dumbbell className="mx-auto h-8 w-8 text-white/30" />
        <p className="mt-2 text-sm text-white/60">Este aluno ainda não concluiu treinos.</p>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2">
        <StatBox icon={<Flame className="h-4 w-4" />} label="Treinos" value={String(stats.sessions.length)} />
        <StatBox icon={<Trophy className="h-4 w-4" />} label="Conquistas" value={String(stats.achievements.length)} />
        <StatBox icon={<CalendarIcon className="h-4 w-4" />} label="Último" value={stats.lastDate ? new Date(stats.lastDate).toLocaleDateString("pt-BR") : "—"} />
      </div>

      <div className="flex gap-1 rounded-full bg-white/5 p-1">
        <button
          onClick={() => setMode("exercise")}
          className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${mode === "exercise" ? "bg-primary text-primary-foreground" : "text-white/60"}`}
        >Por exercício</button>
        <button
          onClick={() => setMode("workout")}
          className={`flex-1 rounded-full px-3 py-1.5 text-[11px] font-bold ${mode === "workout" ? "bg-primary text-primary-foreground" : "text-white/60"}`}
        >Por treino completo</button>
      </div>

      {/* Ranking */}
      <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
        <div className="mb-2 flex items-center gap-2">
          <TrendingUp className="h-4 w-4 text-primary" />
          <p className="text-xs font-bold uppercase tracking-wide text-primary">Maiores evoluções de carga {mode === "exercise" ? "(exercícios)" : "(treinos)"}</p>
        </div>
        {ranking.length === 0 ? (
          <p className="py-3 text-center text-[11px] text-white/40">Sem ganhos registrados ainda.</p>
        ) : (
          <div className="space-y-1.5">
            {ranking.map((r, i) => (
              <div key={r.name} className="flex items-center justify-between gap-2 rounded-lg bg-white/5 px-2.5 py-1.5">
                <div className="flex min-w-0 items-center gap-2">
                  <span className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[10px] font-black text-primary">{i + 1}</span>
                  <p className="truncate text-xs text-white">{r.name}</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 text-[11px] font-bold text-emerald-400">
                  <ArrowUpRight className="h-3 w-3" />+{r.gain.toFixed(1)}kg
                  <span className="text-white/40">({r.gainPct.toFixed(0)}%)</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Charts */}
      <div className="space-y-2">
        <div className="flex items-center gap-2">
          <BarChart3 className="h-3.5 w-3.5 text-white/50" />
          <p className="text-[10px] uppercase tracking-wide text-white/50">Evolução de carga {mode === "exercise" ? "por exercício" : "média por treino"}</p>
        </div>
        {series.length === 0 ? (
          <p className="py-4 text-center text-[11px] text-white/40">Sem dados de carga.</p>
        ) : (
          series.slice(0, 8).map((s) => (
            <div key={s.name} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <p className="truncate text-xs font-bold">{s.name}</p>
                <p className={`text-[10px] font-bold ${s.gain >= 0 ? "text-emerald-400" : "text-red-400"}`}>
                  {s.first}kg → {s.last}kg {s.gain >= 0 ? "+" : ""}{s.gain.toFixed(1)}
                </p>
              </div>
              <div className="h-24">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={s.points}>
                    <XAxis dataKey="date" stroke="#666" fontSize={9} />
                    <YAxis stroke="#666" fontSize={9} />
                    <Tooltip contentStyle={{ background: "#1a1a1a", border: "none", fontSize: 11 }} />
                    <Line type="monotone" dataKey="load" stroke="hsl(var(--primary))" strokeWidth={2} dot={{ r: 2 }} />
                  </LineChart>
                </ResponsiveContainer>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2 text-center">
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">{icon}</div>
      <p className="mt-1 text-[9px] uppercase text-white/40">{label}</p>
      <p className="text-xs font-bold">{value}</p>
    </div>
  );
}
