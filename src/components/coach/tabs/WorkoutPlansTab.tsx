import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ArrowLeft, Plus, Trash2, Dumbbell, Save, Search, TrendingUp, Calendar as CalendarIcon, Flame, Trophy } from "lucide-react";
import {
  listWorkoutPlans,
  saveWorkoutPlan,
  deleteWorkoutPlan,
  getWorkoutHistory,
} from "@/lib/workouts.functions";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip } from "recharts";

type Student = { id: string; profile_id: string | null; name: string; user_id: string | null };

type Exercise = {
  id?: string;
  order_index: number;
  exercise_name: string;
  sets: number;
  reps: string;
  load_kg: number | null;
  rest_seconds: number;
  equipment_config: string;
  media_url: string;
  notes: string;
  is_cardio: boolean;
  cardio_duration_min: number | null;
  cardio_pace: string;
  cardio_speed: number | null;
  cardio_elevation: number | null;
};

type Plan = {
  id?: string;
  student_id: string;
  name: string;
  day_of_week: number | null;
  notes: string;
  exercises: Exercise[];
};

const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
const emptyExercise = (i: number): Exercise => ({
  order_index: i, exercise_name: "", sets: 3, reps: "10", load_kg: null, rest_seconds: 60,
  equipment_config: "", media_url: "", notes: "", is_cardio: false,
  cardio_duration_min: null, cardio_pace: "", cardio_speed: null, cardio_elevation: null,
});

export function WorkoutPlansTab() {
  const [students, setStudents] = useState<Student[]>([]);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [view, setView] = useState<"plans" | "tracking">("plans");

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile) return;
      const { data: coach } = await supabase
        .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
      if (!coach) return;
      const { data } = await supabase
        .from("students")
        .select("id, profile_id, profiles!students_profile_id_fkey(id, name, user_id)")
        .eq("coach_id", coach.id);
      const list = (data || []).map((s: any) => ({
        id: s.id,
        profile_id: s.profile_id,
        name: s.profiles?.name || "Aluno",
        user_id: s.profiles?.user_id || null,
      }));
      setStudents(list);
    })();
  }, []);

  const filtered = useMemo(
    () => students.filter((s) => s.name.toLowerCase().includes(search.toLowerCase())),
    [students, search],
  );

  if (selected) {
    return (
      <div className="space-y-3 p-4">
        <div className="flex items-center gap-3">
          <button onClick={() => setSelected(null)} className="rounded-full bg-white/5 p-2">
            <ArrowLeft className="h-4 w-4" />
          </button>
          <div className="flex-1">
            <p className="text-sm font-bold">{selected.name}</p>
          </div>
        </div>
        <div className="flex gap-2 rounded-full bg-white/5 p-1">
          <button
            onClick={() => setView("plans")}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-bold ${view === "plans" ? "bg-primary text-primary-foreground" : ""}`}
          >Planos</button>
          <button
            onClick={() => setView("tracking")}
            className={`flex-1 rounded-full px-3 py-2 text-xs font-bold ${view === "tracking" ? "bg-primary text-primary-foreground" : ""}`}
          >Acompanhamento</button>
        </div>
        {view === "plans"
          ? <PlansEditor studentUserId={selected.user_id!} />
          : <TrackingView studentUserId={selected.user_id!} />
        }
      </div>
    );
  }

  return (
    <div className="space-y-3 p-4">
      <h2 className="text-lg font-bold">Treinos dos Alunos</h2>
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar aluno..."
          className="w-full rounded-xl bg-white/5 py-2.5 pl-10 pr-3 text-sm outline-none"
        />
      </div>
      <div className="space-y-2">
        {filtered.map((s) => (
          <button
            key={s.id}
            onClick={() => setSelected(s)}
            disabled={!s.user_id}
            className="flex w-full items-center justify-between rounded-xl border border-white/10 bg-white/5 p-3 text-left disabled:opacity-50"
          >
            <span className="text-sm">{s.name}</span>
            <Dumbbell className="h-4 w-4 text-primary" />
          </button>
        ))}
        {filtered.length === 0 && <p className="py-6 text-center text-xs text-white/40">Nenhum aluno encontrado.</p>}
      </div>
    </div>
  );
}

function PlansEditor({ studentUserId }: { studentUserId: string }) {
  const listFn = useServerFn(listWorkoutPlans);
  const saveFn = useServerFn(saveWorkoutPlan);
  const delFn = useServerFn(deleteWorkoutPlan);

  const [plans, setPlans] = useState<Plan[]>([]);
  const [editing, setEditing] = useState<Plan | null>(null);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await listFn({ data: { studentId: studentUserId } })) as any[];
      setPlans(data.map((p) => ({
        id: p.id,
        student_id: p.student_id,
        name: p.name,
        day_of_week: p.day_of_week,
        notes: p.notes || "",
        exercises: (p.workout_exercises || []).sort((a: any, b: any) => a.order_index - b.order_index).map((e: any) => ({
          id: e.id,
          order_index: e.order_index,
          exercise_name: e.exercise_name,
          sets: e.sets,
          reps: e.reps || "",
          load_kg: e.load_kg,
          rest_seconds: e.rest_seconds,
          equipment_config: e.equipment_config || "",
          media_url: e.media_url || "",
          notes: e.notes || "",
          is_cardio: e.is_cardio,
          cardio_duration_min: e.cardio_duration_min,
          cardio_pace: e.cardio_pace || "",
          cardio_speed: e.cardio_speed,
          cardio_elevation: e.cardio_elevation,
        })),
      })));
    } catch { toast.error("Erro ao carregar planos"); }
    setLoading(false);
  };

  useEffect(() => { reload(); }, [studentUserId]);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) { toast.error("Nome obrigatório"); return; }
    try {
      await saveFn({
        data: {
          id: editing.id,
          student_id: studentUserId,
          name: editing.name,
          day_of_week: editing.day_of_week,
          notes: editing.notes,
          exercises: editing.exercises.map((e, i) => ({
            id: e.id,
            order_index: i,
            exercise_name: e.exercise_name,
            sets: e.sets,
            reps: e.reps || null,
            load_kg: e.load_kg,
            rest_seconds: e.rest_seconds,
            equipment_config: e.equipment_config || null,
            media_url: e.media_url || null,
            notes: e.notes || null,
            is_cardio: e.is_cardio,
            cardio_duration_min: e.cardio_duration_min,
            cardio_pace: e.cardio_pace || null,
            cardio_speed: e.cardio_speed,
            cardio_elevation: e.cardio_elevation,
          })),
        },
      });
      toast.success("Plano salvo!");
      setEditing(null);
      reload();
    } catch (e: any) { toast.error(e.message || "Erro ao salvar"); }
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir plano?")) return;
    await delFn({ data: { id } });
    toast.success("Plano excluído");
    reload();
  };

  if (editing) {
    return (
      <div className="space-y-3">
        <input
          value={editing.name}
          onChange={(e) => setEditing({ ...editing, name: e.target.value })}
          placeholder="Nome do treino (ex: Peito e Tríceps)"
          className="w-full rounded-xl bg-white/5 px-3 py-2 text-sm font-bold outline-none"
        />
        <div className="flex gap-2">
          <select
            value={editing.day_of_week ?? ""}
            onChange={(e) => setEditing({ ...editing, day_of_week: e.target.value ? Number(e.target.value) : null })}
            className="rounded-xl bg-white/5 px-3 py-2 text-xs outline-none"
          >
            <option value="">Sem dia</option>
            {DAYS.map((d, i) => <option key={i} value={i}>{d}</option>)}
          </select>
        </div>
        <textarea
          value={editing.notes}
          onChange={(e) => setEditing({ ...editing, notes: e.target.value })}
          placeholder="Observações"
          rows={2}
          className="w-full rounded-xl bg-white/5 px-3 py-2 text-xs outline-none"
        />

        <div className="space-y-2">
          {editing.exercises.map((ex, i) => (
            <div key={i} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center gap-2">
                <input
                  value={ex.exercise_name}
                  onChange={(e) => {
                    const arr = [...editing.exercises];
                    arr[i] = { ...ex, exercise_name: e.target.value };
                    setEditing({ ...editing, exercises: arr });
                  }}
                  placeholder="Nome do exercício"
                  className="flex-1 rounded-lg bg-white/5 px-2 py-1.5 text-sm outline-none"
                />
                <label className="flex items-center gap-1 text-[10px] text-white/60">
                  <input
                    type="checkbox"
                    checked={ex.is_cardio}
                    onChange={(e) => {
                      const arr = [...editing.exercises];
                      arr[i] = { ...ex, is_cardio: e.target.checked };
                      setEditing({ ...editing, exercises: arr });
                    }}
                  />
                  Cardio
                </label>
                <button
                  onClick={() => setEditing({ ...editing, exercises: editing.exercises.filter((_, j) => j !== i) })}
                  className="text-red-400"
                ><Trash2 className="h-4 w-4" /></button>
              </div>

              {ex.is_cardio ? (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <NumField label="Duração (min)" value={ex.cardio_duration_min} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, cardio_duration_min: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <TextField label="Pace" value={ex.cardio_pace} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, cardio_pace: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <NumField label="Velocidade" value={ex.cardio_speed} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, cardio_speed: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <NumField label="Elevação" value={ex.cardio_elevation} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, cardio_elevation: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                </div>
              ) : (
                <div className="mt-2 grid grid-cols-2 gap-2 text-xs">
                  <NumField label="Séries" value={ex.sets} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, sets: v || 1 }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <TextField label="Reps" value={ex.reps} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, reps: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <NumField label="Carga (kg)" value={ex.load_kg} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, load_kg: v }; setEditing({ ...editing, exercises: arr });
                  }} />
                  <NumField label="Descanso (s)" value={ex.rest_seconds} onChange={(v) => {
                    const arr = [...editing.exercises]; arr[i] = { ...ex, rest_seconds: v || 0 }; setEditing({ ...editing, exercises: arr });
                  }} />
                </div>
              )}
              <div className="mt-2 grid grid-cols-1 gap-2 text-xs">
                <TextField label="Config do aparelho" value={ex.equipment_config} onChange={(v) => {
                  const arr = [...editing.exercises]; arr[i] = { ...ex, equipment_config: v }; setEditing({ ...editing, exercises: arr });
                }} />
                <TextField label="Mídia (GIF/imagem/link)" value={ex.media_url} onChange={(v) => {
                  const arr = [...editing.exercises]; arr[i] = { ...ex, media_url: v }; setEditing({ ...editing, exercises: arr });
                }} />
                <TextField label="Observações" value={ex.notes} onChange={(v) => {
                  const arr = [...editing.exercises]; arr[i] = { ...ex, notes: v }; setEditing({ ...editing, exercises: arr });
                }} />
              </div>
            </div>
          ))}
          <button
            onClick={() => setEditing({ ...editing, exercises: [...editing.exercises, emptyExercise(editing.exercises.length)] })}
            className="flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-white/20 py-3 text-xs text-white/60"
          ><Plus className="h-4 w-4" /> Adicionar exercício</button>
        </div>

        <div className="flex gap-2">
          <button onClick={() => setEditing(null)} className="flex-1 rounded-full bg-white/5 py-2.5 text-xs font-bold">Cancelar</button>
          <button onClick={save} className="flex-1 rounded-full bg-primary py-2.5 text-xs font-bold text-primary-foreground">
            <Save className="mr-1 inline h-3.5 w-3.5" /> Salvar
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {loading ? <p className="py-6 text-center text-xs text-white/40">Carregando...</p> : (
        <>
          {plans.map((p) => (
            <div key={p.id} className="rounded-xl border border-white/10 bg-white/5 p-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm font-bold">{p.name}</p>
                  <p className="text-[11px] text-white/45">
                    {p.day_of_week !== null ? `${DAYS[p.day_of_week]} · ` : ""}{p.exercises.length} exercícios
                  </p>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => setEditing(p)} className="rounded-lg bg-white/10 px-3 py-1.5 text-xs">Editar</button>
                  <button onClick={() => p.id && remove(p.id)} className="rounded-lg bg-red-500/20 px-2 py-1.5 text-red-400"><Trash2 className="h-3.5 w-3.5" /></button>
                </div>
              </div>
            </div>
          ))}
          <button
            onClick={() => setEditing({ student_id: studentUserId, name: "", day_of_week: null, notes: "", exercises: [emptyExercise(0)] })}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary py-3 text-xs font-bold text-primary-foreground"
          ><Plus className="h-4 w-4" /> Novo plano de treino</button>
        </>
      )}
    </div>
  );
}

function TrackingView({ studentUserId }: { studentUserId: string }) {
  const histFn = useServerFn(getWorkoutHistory);
  const [data, setData] = useState<any>(null);

  useEffect(() => {
    (async () => {
      const r = await histFn({ data: { studentId: studentUserId } });
      setData(r);
    })();
  }, [studentUserId]);

  if (!data) return <p className="py-6 text-center text-xs text-white/40">Carregando...</p>;
  const completed = data.sessions.filter((s: any) => s.ended_at);

  const loadByExercise: Record<string, Array<{ date: string; load: number }>> = {};
  data.logs.forEach((l: any) => {
    const name = (Array.isArray(l.workout_exercises) ? l.workout_exercises[0]?.exercise_name : l.workout_exercises?.exercise_name) || "Exercício";
    if (l.load_kg == null) return;
    const date = new Date(l.completed_at).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" });
    (loadByExercise[name] ||= []).push({ date, load: Number(l.load_kg) });
  });

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-3 gap-2 text-center">
        <StatBox icon={<Flame className="h-4 w-4" />} label="Treinos" value={String(completed.length)} />
        <StatBox icon={<Trophy className="h-4 w-4" />} label="Conquistas" value={String(data.achievements.length)} />
        <StatBox icon={<CalendarIcon className="h-4 w-4" />} label="Últ. treino" value={completed[0] ? new Date(completed[0].started_at).toLocaleDateString("pt-BR") : "—"} />
      </div>

      {Object.entries(loadByExercise).slice(0, 5).map(([name, points]) => (
        <div key={name} className="rounded-xl border border-white/10 bg-white/5 p-3">
          <p className="text-xs font-bold">{name}</p>
          <div className="h-28">
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
      ))}

      <div className="rounded-xl border border-white/10 bg-white/5 p-3">
        <p className="mb-2 text-xs font-bold">Sessões recentes</p>
        {completed.slice(0, 10).map((s: any) => {
          const planName = Array.isArray(s.workout_plans) ? s.workout_plans[0]?.name : s.workout_plans?.name;
          return (
            <div key={s.id} className="flex items-center justify-between border-t border-white/5 py-2 text-[11px] first:border-t-0">
              <div className="min-w-0 flex-1">
                <p className="truncate">{planName || "Treino"}</p>
                <p className="text-white/40">{new Date(s.started_at).toLocaleString("pt-BR")}</p>
              </div>
              <div className="text-right">
                <p className="font-bold text-primary">{s.completion_pct}%</p>
              </div>
            </div>
          );
        })}
        {completed.length === 0 && <p className="text-center text-[11px] text-white/40">Nenhuma sessão.</p>}
      </div>
    </div>
  );
}

function StatBox({ icon, label, value }: { icon: React.ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-2">
      <div className="mx-auto flex h-7 w-7 items-center justify-center rounded-full bg-primary/15 text-primary">{icon}</div>
      <p className="mt-1 text-[9px] uppercase text-white/40">{label}</p>
      <p className="text-xs font-bold">{value}</p>
    </div>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number | null) => void }) {
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <input
        type="number"
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value === "" ? null : Number(e.target.value))}
        className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none"
      />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <p className="mb-1 text-[9px] uppercase tracking-wider text-white/40">{label}</p>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg bg-white/5 px-2 py-1.5 text-xs outline-none"
      />
    </div>
  );
}
