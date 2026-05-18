import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Trash2, Save, Utensils, Dumbbell, ClipboardList, Heart, Target, Droplet, Flame, ExternalLink, FileText, Activity, Library } from "lucide-react";

type Student = {
  id: string;
  profile_id: string;
  name: string;
  email: string;
  current_weight: number | null;
  goal_weight: number | null;
};

type MealSlot = { name: string; time: string; options: [string, string, string] };
type WorkoutItem = { name: string; sets: string; reps: string; rest: string; notes: string };
type Exercise = {
  id: string;
  name: string;
  muscle_group: string | null;
  equipment: string | null;
  difficulty: string | null;
  description: string | null;
  video_url: string | null;
};

type Protocol = {
  id?: string;
  meals_per_day: number;
  meal_plan: MealSlot[];
  shopping_list: string;
  marmita_tips: string;
  restrictions: string[];
  daily_calorie_goal: number | null;
  water_goal_ml: number | null;
  weight_goal: number | null;
  general_notes: string;
  workout_plan: WorkoutItem[];
};

const RESTRICTION_OPTIONS = [
  "Diabetes", "Hipertensão", "Intolerância à lactose", "Intolerância ao glúten",
  "Vegetariano", "Vegano", "Alergia a frutos do mar", "Alergia a amendoim",
  "Colesterol alto", "Hipotireoidismo", "Refluxo", "Gestante",
];

const DEFAULT_MEAL_SLOT = (name = "", time = ""): MealSlot => ({ name, time, options: ["", "", ""] });
const DEFAULT_WORKOUT_ITEM = (name = ""): WorkoutItem => ({ name, sets: "", reps: "", rest: "", notes: "" });

const emptyProtocol = (): Protocol => ({
  meals_per_day: 5,
  meal_plan: [
    DEFAULT_MEAL_SLOT("Café da manhã", "07:00"),
    DEFAULT_MEAL_SLOT("Lanche da manhã", "10:00"),
    DEFAULT_MEAL_SLOT("Almoço", "12:30"),
    DEFAULT_MEAL_SLOT("Lanche da tarde", "16:00"),
    DEFAULT_MEAL_SLOT("Jantar", "19:30"),
  ],
  shopping_list: "",
  marmita_tips: "",
  restrictions: [],
  daily_calorie_goal: null,
  water_goal_ml: 2500,
  weight_goal: null,
  general_notes: "",
  workout_plan: [],
});

export function ProtocolTab() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [protocol, setProtocol] = useState<Protocol>(emptyProtocol());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"meal" | "workout" | "health" | "library">("meal");
  const [library, setLibrary] = useState<Exercise[]>([]);
  const [libQuery, setLibQuery] = useState("");
  const [newExercise, setNewExercise] = useState<Partial<Exercise>>({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
  const [bioEvalUrl, setBioEvalUrl] = useState<string | null>(null);
  const [anamnesisUrl, setAnamnesisUrl] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: coach } = profile?.id
        ? await supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
        : { data: null };
      if (!coach?.id) return;
      setCoachId(coach.id);

      const { data: studs } = await supabase
        .from("students")
        .select("id, profile_id, current_weight, goal_weight, profiles!students_profile_id_fkey(name,email)")
        .eq("coach_id", coach.id);
      setStudents(((studs as any[]) || []).map((s) => ({
        id: s.id,
        profile_id: s.profile_id,
        name: s.profiles?.name || "Aluno",
        email: s.profiles?.email || "",
        current_weight: s.current_weight,
        goal_weight: s.goal_weight,
      })));

      const { data: lib } = await supabase.from("exercise_library" as never).select("*" as never).order("name" as never);
      setLibrary((lib as any[]) || []);
    })();
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return students;
    return students.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(q));
  }, [students, query]);

  const filteredLib = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((e) => `${e.name} ${e.muscle_group || ""} ${e.equipment || ""}`.toLowerCase().includes(q));
  }, [library, libQuery]);

  const loadProtocol = async (s: Student) => {
    setSelected(s);
    setLoading(true);
    const { data } = await supabase.from("student_protocols" as never).select("*" as never).eq("student_id" as never, s.id as never).maybeSingle();
    if (data) {
      const d = data as any;
      setProtocol({
        id: d.id,
        meals_per_day: d.meals_per_day || 5,
        meal_plan: (d.meal_plan && d.meal_plan.length) ? d.meal_plan : emptyProtocol().meal_plan,
        shopping_list: d.shopping_list || "",
        marmita_tips: d.marmita_tips || "",
        restrictions: d.restrictions || [],
        daily_calorie_goal: d.daily_calorie_goal,
        water_goal_ml: d.water_goal_ml || 2500,
        weight_goal: d.weight_goal ?? s.goal_weight,
        general_notes: d.general_notes || "",
        workout_plan: d.workout_plan || [],
      });
    } else {
      setProtocol({ ...emptyProtocol(), weight_goal: s.goal_weight });
    }

    const { data: bio } = await supabase.from("bioimpedance_evaluations").select("id").eq("student_id", s.id).order("created_at", { ascending: false }).limit(1).maybeSingle();
    setBioEvalUrl(bio ? `/admin/students?student=${s.id}` : null);
    const { data: an } = await supabase.from("anamnesis_forms").select("id").eq("student_id", s.id).limit(1).maybeSingle();
    setAnamnesisUrl(an ? `/admin/students?student=${s.id}` : null);

    setLoading(false);
  };

  const save = async () => {
    if (!selected || !coachId) return;
    setSaving(true);
    const payload: any = {
      student_id: selected.id,
      coach_id: coachId,
      meals_per_day: protocol.meals_per_day,
      meal_plan: protocol.meal_plan,
      shopping_list: protocol.shopping_list.slice(0, 5000),
      marmita_tips: protocol.marmita_tips.slice(0, 5000),
      restrictions: protocol.restrictions,
      daily_calorie_goal: protocol.daily_calorie_goal,
      water_goal_ml: protocol.water_goal_ml,
      weight_goal: protocol.weight_goal,
      general_notes: protocol.general_notes.slice(0, 5000),
      workout_plan: protocol.workout_plan,
    };
    const { error } = await supabase.from("student_protocols" as never).upsert(payload as never, { onConflict: "student_id" } as never);

    if (protocol.weight_goal != null) {
      await supabase.from("students").update({ goal_weight: protocol.weight_goal }).eq("id", selected.id);
    }

    setSaving(false);
    if (error) { console.error(error); toast.error("Erro ao salvar protocolo"); return; }
    toast.success("Protocolo salvo");
  };

  const updateMeal = (idx: number, patch: Partial<MealSlot>) => {
    setProtocol((p) => ({ ...p, meal_plan: p.meal_plan.map((m, i) => i === idx ? { ...m, ...patch } : m) }));
  };
  const updateMealOption = (idx: number, optIdx: 0 | 1 | 2, value: string) => {
    setProtocol((p) => ({
      ...p,
      meal_plan: p.meal_plan.map((m, i) => i === idx ? { ...m, options: m.options.map((o, oi) => oi === optIdx ? value : o) as [string, string, string] } : m),
    }));
  };
  const addMeal = () => setProtocol((p) => ({ ...p, meal_plan: [...p.meal_plan, DEFAULT_MEAL_SLOT(`Refeição ${p.meal_plan.length + 1}`, "")] }));
  const removeMeal = (idx: number) => setProtocol((p) => ({ ...p, meal_plan: p.meal_plan.filter((_, i) => i !== idx) }));

  const addWorkout = (name = "") => setProtocol((p) => ({ ...p, workout_plan: [...p.workout_plan, DEFAULT_WORKOUT_ITEM(name)] }));
  const updateWorkout = (idx: number, patch: Partial<WorkoutItem>) =>
    setProtocol((p) => ({ ...p, workout_plan: p.workout_plan.map((w, i) => i === idx ? { ...w, ...patch } : w) }));
  const removeWorkout = (idx: number) => setProtocol((p) => ({ ...p, workout_plan: p.workout_plan.filter((_, i) => i !== idx) }));

  const toggleRestriction = (r: string) => {
    setProtocol((p) => ({ ...p, restrictions: p.restrictions.includes(r) ? p.restrictions.filter((x) => x !== r) : [...p.restrictions, r] }));
  };

  const saveExercise = async () => {
    if (!coachId || !newExercise.name?.trim()) { toast.error("Informe o nome do exercício"); return; }
    const { data, error } = await supabase.from("exercise_library" as never).insert({
      name: newExercise.name.trim(),
      muscle_group: newExercise.muscle_group || null,
      equipment: newExercise.equipment || null,
      difficulty: newExercise.difficulty || null,
      description: newExercise.description || null,
      video_url: newExercise.video_url || null,
      created_by_coach_id: coachId,
    } as never).select("*" as never).single();
    if (error) { toast.error("Erro ao salvar exercício"); return; }
    setLibrary((cur) => [...cur, data as any].sort((a, b) => a.name.localeCompare(b.name)));
    setNewExercise({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
    toast.success("Exercício adicionado");
  };

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Protocolo do aluno</h1>
        <p className="text-sm text-white/50">Monte o plano alimentar, treino, metas e ficha de saúde</p>
      </div>

      {!selected ? (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
            <Search className="h-4 w-4 text-white/40" />
            <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="Buscar aluno por nome ou e-mail" className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && <p className="py-6 text-center text-sm text-white/40">Nenhum aluno vinculado a você ainda.</p>}
            {filtered.map((s) => (
              <button key={s.id} onClick={() => loadProtocol(s)} className="flex w-full items-center justify-between rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10">
                <div>
                  <p className="text-sm font-semibold text-white">{s.name}</p>
                  <p className="text-xs text-white/40">{s.email}</p>
                </div>
                <span className="text-xs text-primary">Abrir →</span>
              </button>
            ))}
          </div>
        </div>
      ) : (
        <>
          {/* Header do aluno */}
          <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div>
              <button onClick={() => setSelected(null)} className="mb-1 text-xs text-white/40 hover:text-white">← Trocar aluno</button>
              <p className="text-base font-bold text-white">{selected.name}</p>
              <p className="text-xs text-white/40">{selected.email}</p>
            </div>
            <button onClick={save} disabled={saving} className="flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
              <Save className="h-4 w-4" />
              {saving ? "Salvando..." : "Salvar protocolo"}
            </button>
          </div>

          {/* Atalhos rápidos */}
          <div className="mb-4 grid grid-cols-2 gap-2 sm:grid-cols-4">
            <ShortcutLink icon={FileText} label="Anamnese" to={anamnesisUrl} fallback="Sem registro" />
            <ShortcutLink icon={Activity} label="Bioimpedância" to={bioEvalUrl} fallback="Sem registro" />
            <InfoChip icon={Target} label="Peso atual" value={selected.current_weight ? `${selected.current_weight} kg` : "—"} />
            <InfoChip icon={Heart} label="Restrições" value={protocol.restrictions.length ? `${protocol.restrictions.length}` : "Nenhuma"} />
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto">
            <TabBtn active={section === "meal"} onClick={() => setSection("meal")} icon={Utensils} label="Alimentação" />
            <TabBtn active={section === "workout"} onClick={() => setSection("workout")} icon={Dumbbell} label="Treino" />
            <TabBtn active={section === "health"} onClick={() => setSection("health")} icon={Heart} label="Saúde & metas" />
            <TabBtn active={section === "library"} onClick={() => setSection("library")} icon={Library} label="Biblioteca" />
          </div>

          {loading && <p className="text-sm text-white/40">Carregando...</p>}

          {!loading && section === "meal" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">Plano alimentar</h2>
                  <div className="flex items-center gap-2">
                    <label className="text-xs text-white/40">Refeições/dia</label>
                    <input type="number" value={protocol.meals_per_day} onChange={(e) => setProtocol((p) => ({ ...p, meals_per_day: Number(e.target.value) || 0 }))} className="w-16 rounded bg-white/10 px-2 py-1 text-sm text-white" />
                  </div>
                </div>
                <div className="space-y-3">
                  {protocol.meal_plan.map((m, idx) => (
                    <div key={idx} className="rounded-xl bg-white/5 p-3">
                      <div className="mb-2 grid grid-cols-[1fr_100px_auto] gap-2">
                        <input value={m.name} onChange={(e) => updateMeal(idx, { name: e.target.value })} placeholder="Nome (Café, Almoço...)" className="rounded bg-white/10 px-2 py-1.5 text-sm text-white" />
                        <input type="time" value={m.time} onChange={(e) => updateMeal(idx, { time: e.target.value })} className="rounded bg-white/10 px-2 py-1.5 text-sm text-white" />
                        <button onClick={() => removeMeal(idx)} className="rounded bg-red-500/10 px-2 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="space-y-1.5">
                        {[0, 1, 2].map((i) => (
                          <input key={i} value={m.options[i as 0]} onChange={(e) => updateMealOption(idx, i as 0, e.target.value)} placeholder={`Opção ${i + 1}`} className="w-full rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={addMeal} className="mt-3 flex items-center gap-1 rounded-lg bg-white/5 px-3 py-2 text-xs text-white/70 hover:bg-white/10">
                  <Plus className="h-3 w-3" /> Adicionar refeição
                </button>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-2 text-sm font-bold text-white">Lista de compras</h2>
                <textarea value={protocol.shopping_list} onChange={(e) => setProtocol((p) => ({ ...p, shopping_list: e.target.value }))} rows={6} placeholder="Itens para a semana..." className="w-full rounded bg-white/5 p-3 text-sm text-white outline-none" />
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-2 text-sm font-bold text-white">Dicas para marmitas</h2>
                <textarea value={protocol.marmita_tips} onChange={(e) => setProtocol((p) => ({ ...p, marmita_tips: e.target.value }))} rows={4} placeholder="Sugestões de preparo, conservação..." className="w-full rounded bg-white/5 p-3 text-sm text-white outline-none" />
              </div>
            </div>
          )}

          {!loading && section === "workout" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="mb-3 flex items-center justify-between">
                  <h2 className="text-sm font-bold text-white">Treino prescrito</h2>
                  <button onClick={() => addWorkout()} className="flex items-center gap-1 rounded bg-primary px-2 py-1 text-xs font-semibold text-primary-foreground"><Plus className="h-3 w-3" /> Exercício</button>
                </div>
                <div className="space-y-2">
                  {protocol.workout_plan.length === 0 && <p className="text-xs text-white/40">Nenhum exercício. Use a aba “Biblioteca” para selecionar.</p>}
                  {protocol.workout_plan.map((w, idx) => (
                    <div key={idx} className="rounded-xl bg-white/5 p-3">
                      <div className="mb-2 grid grid-cols-[1fr_auto] gap-2">
                        <input value={w.name} onChange={(e) => updateWorkout(idx, { name: e.target.value })} placeholder="Exercício" className="rounded bg-white/10 px-2 py-1.5 text-sm text-white" />
                        <button onClick={() => removeWorkout(idx)} className="rounded bg-red-500/10 px-2 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input value={w.sets} onChange={(e) => updateWorkout(idx, { sets: e.target.value })} placeholder="Séries" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                        <input value={w.reps} onChange={(e) => updateWorkout(idx, { reps: e.target.value })} placeholder="Reps" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                        <input value={w.rest} onChange={(e) => updateWorkout(idx, { rest: e.target.value })} placeholder="Descanso" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                      </div>
                      <input value={w.notes} onChange={(e) => updateWorkout(idx, { notes: e.target.value })} placeholder="Observações" className="mt-2 w-full rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <Search className="h-4 w-4 text-white/40" />
                  <input value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Buscar na biblioteca para adicionar" className="w-full bg-transparent text-sm text-white outline-none" />
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {filteredLib.map((e) => (
                    <button key={e.id} onClick={() => addWorkout(e.name)} className="flex w-full items-center justify-between rounded bg-white/5 p-2 text-left text-xs hover:bg-white/10">
                      <span className="text-white">{e.name}</span>
                      <span className="text-white/40">{e.muscle_group} · {e.equipment}</span>
                    </button>
                  ))}
                  {filteredLib.length === 0 && <p className="py-4 text-center text-xs text-white/40">Nenhum exercício na biblioteca. Cadastre na aba Biblioteca.</p>}
                </div>
              </div>
            </div>
          )}

          {!loading && section === "health" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-3 text-sm font-bold text-white">Restrições alimentares e condições</h2>
                <div className="flex flex-wrap gap-2">
                  {RESTRICTION_OPTIONS.map((r) => {
                    const active = protocol.restrictions.includes(r);
                    return (
                      <button key={r} onClick={() => toggleRestriction(r)} className={`rounded-full px-3 py-1.5 text-xs ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
                        {r}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-3 text-sm font-bold text-white">Metas</h2>
                <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
                  <Field icon={Flame} label="Calorias / dia" suffix="kcal" value={protocol.daily_calorie_goal ?? ""} onChange={(v) => setProtocol((p) => ({ ...p, daily_calorie_goal: v === "" ? null : Number(v) }))} />
                  <Field icon={Droplet} label="Água / dia" suffix="ml" value={protocol.water_goal_ml ?? ""} onChange={(v) => setProtocol((p) => ({ ...p, water_goal_ml: v === "" ? null : Number(v) }))} />
                  <Field icon={Target} label="Meta de peso" suffix="kg" value={protocol.weight_goal ?? ""} onChange={(v) => setProtocol((p) => ({ ...p, weight_goal: v === "" ? null : Number(v) }))} step="0.1" />
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-2 text-sm font-bold text-white">Observações gerais</h2>
                <textarea value={protocol.general_notes} onChange={(e) => setProtocol((p) => ({ ...p, general_notes: e.target.value }))} rows={4} className="w-full rounded bg-white/5 p-3 text-sm text-white outline-none" />
              </div>
            </div>
          )}

          {!loading && section === "library" && (
            <div className="space-y-4">
              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-3 text-sm font-bold text-white">Adicionar exercício à biblioteca</h2>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={newExercise.name || ""} onChange={(e) => setNewExercise((x) => ({ ...x, name: e.target.value }))} placeholder="Nome *" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.muscle_group || ""} onChange={(e) => setNewExercise((x) => ({ ...x, muscle_group: e.target.value }))} placeholder="Grupo muscular" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.equipment || ""} onChange={(e) => setNewExercise((x) => ({ ...x, equipment: e.target.value }))} placeholder="Equipamento" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.difficulty || ""} onChange={(e) => setNewExercise((x) => ({ ...x, difficulty: e.target.value }))} placeholder="Dificuldade (iniciante/intermediário/avançado)" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.video_url || ""} onChange={(e) => setNewExercise((x) => ({ ...x, video_url: e.target.value }))} placeholder="URL de vídeo" className="rounded bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2" />
                  <textarea value={newExercise.description || ""} onChange={(e) => setNewExercise((x) => ({ ...x, description: e.target.value }))} placeholder="Descrição / execução" rows={2} className="rounded bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2" />
                </div>
                <button onClick={saveExercise} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">Cadastrar exercício</button>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-3 text-sm font-bold text-white">Exercícios cadastrados ({library.length})</h2>
                <div className="max-h-96 space-y-1 overflow-y-auto">
                  {library.map((e) => (
                    <div key={e.id} className="rounded bg-white/5 p-2 text-xs">
                      <p className="font-semibold text-white">{e.name}</p>
                      <p className="text-white/40">{[e.muscle_group, e.equipment, e.difficulty].filter(Boolean).join(" · ")}</p>
                      {e.video_url && <a href={e.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-3 w-3" /> Vídeo</a>}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: any; label: string }) {
  return (
    <button onClick={onClick} className={`flex items-center gap-1.5 whitespace-nowrap rounded-lg px-3 py-2 text-xs font-semibold transition-colors ${active ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/70 hover:bg-white/10"}`}>
      <Icon className="h-3.5 w-3.5" />
      {label}
    </button>
  );
}

function Field({ icon: Icon, label, suffix, value, onChange, step }: { icon: any; label: string; suffix: string; value: any; onChange: (v: string) => void; step?: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <div className="flex items-baseline gap-1">
        <input type="number" step={step} value={value} onChange={(e) => onChange(e.target.value)} className="w-full bg-transparent text-lg font-bold text-white outline-none" />
        <span className="text-xs text-white/40">{suffix}</span>
      </div>
    </div>
  );
}

function InfoChip({ icon: Icon, label, value }: { icon: any; label: string; value: string }) {
  return (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </div>
  );
}

function ShortcutLink({ icon: Icon, label, to, fallback }: { icon: any; label: string; to: string | null; fallback: string }) {
  const content = (
    <div className="rounded-xl bg-white/5 p-3">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white">{to ? "Abrir" : fallback}</p>
    </div>
  );
  return to ? <a href={to} className="block hover:opacity-80">{content}</a> : <div className="opacity-60">{content}</div>;
}

export default ProtocolTab;
