import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Search, Plus, Trash2, Save, Utensils, Dumbbell, ClipboardList, Heart, Target, Droplet, Flame, ExternalLink, FileText, Activity, Library, BookOpen, Pencil, X, Sparkles, Zap, Award } from "lucide-react";
import { WorkoutTemplatesPanel, GOAL_LABELS, type WorkoutTemplate } from "@/components/workouts/WorkoutTemplatesPanel";
import { WindowMethod } from "@/components/student/WindowMethod";
import StudentDetailsModal from "@/components/coach/StudentDetailsModal";
import { calcWaterGoalMl, describeWaterFormula, calcAgeFromBirthdate } from "@/lib/water-goal";
import { syncProtocolWorkout, enableTemplateForStudent } from "@/lib/workouts.functions";

type Student = {
  id: string;
  profile_id: string | null;
  name: string;
  email: string;
  current_weight: number | null;
  goal_weight: number | null;
  external: boolean; // true = coach_evaluation_clients (cliente externo)
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
  workout_name: string;
  workout_goal: WorkoutTemplate["goal"];
  workout_level: NonNullable<WorkoutTemplate["level"]>;
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
  workout_name: "Treino Prescrito",
  workout_goal: "general",
  workout_level: "iniciante",
});

export function ProtocolTab() {
  const [coachId, setCoachId] = useState<string | null>(null);
  const [students, setStudents] = useState<Student[]>([]);
  const [externals, setExternals] = useState<Student[]>([]);
  const [scope, setScope] = useState<"mine" | "external">("mine");
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<Student | null>(null);
  const [protocol, setProtocol] = useState<Protocol>(emptyProtocol());
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [section, setSection] = useState<"windows" | "meal" | "workout" | "health" | "library" | "templates">("windows");
  const [windowsDate, setWindowsDate] = useState<string>(() => new Date().toISOString().slice(0, 10));

  const [library, setLibrary] = useState<Exercise[]>([]);
  const [libQuery, setLibQuery] = useState("");
  const [newExercise, setNewExercise] = useState<Partial<Exercise>>({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
  const [hasBio, setHasBio] = useState(false);
  const [hasAnamnesis, setHasAnamnesis] = useState(false);
  const [lastBioWeight, setLastBioWeight] = useState<number | null>(null);
  const [studentAge, setStudentAge] = useState<number | null>(null);
  const [editingExercise, setEditingExercise] = useState<Exercise | null>(null);
  const [waterOverride, setWaterOverride] = useState(false);
  const [detailsTab, setDetailsTab] = useState<"avaliacoes" | "anamnese" | null>(null);
  const [templates, setTemplates] = useState<WorkoutTemplate[]>([]);
  const [templatePickerOpen, setTemplatePickerOpen] = useState(false);
  const [saveTemplateOpen, setSaveTemplateOpen] = useState(false);
  const [templateForm, setTemplateForm] = useState({ name: "", description: "", goal: "general" as WorkoutTemplate["goal"], level: "iniciante" as WorkoutTemplate["level"] });
  const [templateGoalFilter, setTemplateGoalFilter] = useState<string>("all");
  const [newExternalOpen, setNewExternalOpen] = useState(false);
  const [newExternal, setNewExternal] = useState({ name: "", email: "", whatsapp: "" });
  const [creatingExternal, setCreatingExternal] = useState(false);

  const [isNutritionist, setIsNutritionist] = useState(false);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      const { data: coach } = profile?.id
        ? await supabase.from("coaches").select("id, specialty_key, is_professional").eq("profile_id", profile.id).maybeSingle()
        : { data: null };
      if (!coach?.id) return;
      setCoachId(coach.id);
      const specKey = (coach as any).specialty_key as string | null;
      const isPro = !!(coach as any).is_professional;
      setIsNutritionist(isPro && !!specKey && /nutricion/i.test(specKey));




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
        external: false,
      })));

      // Paginate to bypass Supabase's default 1000-row limit
      const PAGE_EXT = 1000;
      let fromExt = 0;
      const extAll: any[] = [];
      while (true) {
        const { data: ext } = await supabase
          .from("coach_evaluation_clients" as never)
          .select("id, name, email, whatsapp" as never)
          .eq("coach_id" as never, coach.id as never)
          .order("name" as never)
          .range(fromExt, fromExt + PAGE_EXT - 1);
        const rowsExt = (ext as any[]) || [];
        extAll.push(...rowsExt);
        if (rowsExt.length < PAGE_EXT) break;
        fromExt += PAGE_EXT;
      }
      setExternals(extAll.map((e) => ({
        id: e.id,
        profile_id: null,
        name: e.name,
        email: e.email || e.whatsapp || "",
        current_weight: null,
        goal_weight: null,
        external: true,
      })));

      const { data: lib } = await supabase.from("exercise_library" as never).select("*" as never).order("name" as never);
      setLibrary((lib as any[]) || []);

      const { data: tpl } = await supabase.from("workout_templates" as never).select("*" as never).order("is_global" as never, { ascending: false }).order("name" as never);
      setTemplates((tpl as unknown as WorkoutTemplate[]) || []);
    })();
  }, []);

  const reloadTemplates = async () => {
    const { data: tpl } = await supabase.from("workout_templates" as never).select("*" as never).order("is_global" as never, { ascending: false }).order("name" as never);
    setTemplates((tpl as unknown as WorkoutTemplate[]) || []);
  };

  const enableTplFn = useServerFn(enableTemplateForStudent);

  const applyTemplate = (t: WorkoutTemplate, mode: "replace" | "append") => {
    setProtocol((p) => ({
      ...p,
      workout_plan: mode === "replace" ? [...t.items] : [...p.workout_plan, ...t.items],
      workout_name: mode === "replace" ? t.name : p.workout_name,
      workout_goal: mode === "replace" ? t.goal : p.workout_goal,
      workout_level: mode === "replace" ? (t.level || "iniciante") : p.workout_level,
    }));
    setTemplatePickerOpen(false);
    toast.success(`Treino "${t.name}" aplicado.`);
  };

  const enableTemplateAsDay = async (t: WorkoutTemplate, letter: string) => {
    if (!selected) return toast.error("Selecione um aluno primeiro.");
    if (selected.external) return toast.error("Esta ação só funciona para alunos do app (não externos).");
    try {
      const r = (await enableTplFn({ data: { student_record_id: selected.id, template_id: t.id, letter } })) as { plan_name: string };
      toast.success(`"${r.plan_name}" habilitado para ${selected.name}.`);
    } catch (e: any) {
      toast.error(e.message || "Erro ao habilitar treino");
    }
  };

  const saveAsTemplate = async () => {
    if (!coachId) return;
    if (!templateForm.name.trim()) return toast.error("Informe o nome do treino.");
    const items = protocol.workout_plan.filter((w) => w.name.trim());
    if (items.length === 0) return toast.error("Adicione exercícios antes de salvar.");
    const { error } = await supabase.from("workout_templates" as never).insert({
      name: templateForm.name.trim(),
      description: templateForm.description || null,
      goal: templateForm.goal,
      level: templateForm.level,
      items,
      is_global: false,
      created_by_coach_id: coachId,
    } as never);
    if (error) return toast.error(error.message);
    toast.success("Treino salvo nos seus templates.");
    setSaveTemplateOpen(false);
    setTemplateForm({ name: "", description: "", goal: "general", level: "iniciante" });
    reloadTemplates();
  };

  const filtered = useMemo(() => {
    const base = scope === "mine" ? students : externals;
    const q = query.trim().toLowerCase();
    if (!q) return base;
    return base.filter((s) => `${s.name} ${s.email}`.toLowerCase().includes(q));
  }, [students, externals, scope, query]);

  const filteredLib = useMemo(() => {
    const q = libQuery.trim().toLowerCase();
    if (!q) return library;
    return library.filter((e) => `${e.name} ${e.muscle_group || ""} ${e.equipment || ""}`.toLowerCase().includes(q));
  }, [library, libQuery]);

  const createExternalClient = async () => {
    if (!coachId) return;
    if (!newExternal.name.trim()) { toast.error("Informe o nome"); return; }
    setCreatingExternal(true);
    const { data, error } = await supabase.from("coach_evaluation_clients" as never).insert({
      coach_id: coachId,
      name: newExternal.name.trim().slice(0, 120),
      email: newExternal.email.trim().slice(0, 255) || null,
      whatsapp: newExternal.whatsapp.slice(0, 24) || null,
      gender: "other",
      ethnicity: "other",
      height_unit: "cm",
      language: "pt",
    } as never).select("*" as never).single();
    setCreatingExternal(false);
    if (error || !data) { toast.error(error?.message || "Erro ao criar cliente"); return; }
    const d = data as any;
    const created: Student = {
      id: d.id, profile_id: null, name: d.name,
      email: d.email || d.whatsapp || "", current_weight: null, goal_weight: null, external: true,
    };
    setExternals((curr) => [created, ...curr]);
    setNewExternal({ name: "", email: "", whatsapp: "" });
    setNewExternalOpen(false);
    toast.success("Cliente externo criado");
    loadProtocol(created);
  };

  const loadProtocol = async (s: Student) => {
    setSelected(s);
    setLoading(true);
    const idCol = s.external ? "evaluation_client_id" : "student_id";
    const { data } = await supabase.from("student_protocols" as never).select("*" as never).eq(idCol as never, s.id as never).maybeSingle();
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
        workout_name: d.workout_name || "Treino Prescrito",
        workout_goal: (d.workout_goal as Protocol["workout_goal"]) || "general",
        workout_level: (d.workout_level as Protocol["workout_level"]) || "iniciante",
      });
    } else {
      setProtocol({ ...emptyProtocol(), weight_goal: s.goal_weight });
    }

    let bioWeight: number | null = null;
    let age: number | null = null;
    if (!s.external) {
      const { data: bio } = await supabase
        .from("coach_body_assessments")
        .select("id, weight")
        .eq("student_id", s.id)
        .order("assessment_date", { ascending: false })
        .limit(1)
        .maybeSingle();
      setHasBio(!!bio);
      bioWeight = (bio as any)?.weight ?? null;
      setLastBioWeight(bioWeight);
      const { data: an } = await supabase.from("anamnesis_forms").select("id").eq("student_id", s.id).limit(1).maybeSingle();
      setHasAnamnesis(!!an);
      if (s.profile_id) {
        const { data: p } = await supabase.from("profiles").select("birthdate").eq("id", s.profile_id).maybeSingle();
        age = calcAgeFromBirthdate((p as any)?.birthdate);
      }
    } else {
      setHasBio(false);
      setHasAnamnesis(false);
      setLastBioWeight(null);
      const { data: ec } = await supabase
        .from("coach_evaluation_clients" as never)
        .select("birth_date, current_weight" as never)
        .eq("id" as never, s.id as never)
        .maybeSingle();
      age = calcAgeFromBirthdate((ec as any)?.birth_date);
      bioWeight = (ec as any)?.current_weight ?? null;
      setLastBioWeight(bioWeight);
    }
    setStudentAge(age);

    // Se não há valor salvo, auto-calcula com peso + idade
    const weightForCalc = bioWeight ?? s.current_weight ?? null;
    const auto = calcWaterGoalMl(weightForCalc, age);
    const existingWater = (data as any)?.water_goal_ml;
    if (!existingWater && auto) {
      setProtocol((p) => ({ ...p, water_goal_ml: auto }));
      setWaterOverride(false);
    } else {
      setWaterOverride(!!existingWater && auto != null && existingWater !== auto);
    }

    setLoading(false);
  };

  const syncWorkoutFn = useServerFn(syncProtocolWorkout);

  const save = async () => {
    if (!selected || !coachId) return;
    setSaving(true);
    const payload: any = {
      student_id: selected.external ? null : selected.id,
      evaluation_client_id: selected.external ? selected.id : null,
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
      workout_name: protocol.workout_name || "Treino Prescrito",
      workout_goal: protocol.workout_goal,
      workout_level: protocol.workout_level,
    };
    const onConflict = selected.external ? "evaluation_client_id" : "student_id";
    const { error } = await supabase.from("student_protocols" as never).upsert(payload as never, { onConflict } as never);

    if (!selected.external) {
      const studentPatch: any = {
        food_restrictions: protocol.restrictions,
        water_goal_ml: protocol.water_goal_ml,
      };
      if (protocol.weight_goal != null) studentPatch.goal_weight = protocol.weight_goal;
      await supabase.from("students").update(studentPatch).eq("id", selected.id);

      // Sync prescribed workout into the gamified workout_plans pipeline
      // so it shows in the student's "Meu Treino" home, not only in the protocol view.
      const items = protocol.workout_plan.filter((w) => w.name.trim());
      if (items.length > 0) {
        try {
          await syncWorkoutFn({
            data: {
              student_record_id: selected.id,
              name: protocol.workout_name || "Treino Prescrito",
              items: items.map((w) => ({ name: w.name, sets: w.sets, reps: w.reps, rest: w.rest, notes: w.notes })),
            },
          });
        } catch (e: any) {
          console.warn("sync workout failed", e?.message);
        }
      }
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
    const payload = {
      name: newExercise.name.trim(),
      muscle_group: newExercise.muscle_group || null,
      equipment: newExercise.equipment || null,
      difficulty: newExercise.difficulty || null,
      description: newExercise.description || null,
      video_url: newExercise.video_url || null,
    };
    if (editingExercise) {
      const { data, error } = await supabase.from("exercise_library" as never).update(payload as never).eq("id" as never, editingExercise.id as never).select("*" as never).single();
      if (error) { toast.error("Erro ao atualizar"); return; }
      setLibrary((cur) => cur.map((e) => e.id === editingExercise.id ? (data as any) : e).sort((a, b) => a.name.localeCompare(b.name)));
      setEditingExercise(null);
      setNewExercise({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
      toast.success("Exercício atualizado");
      return;
    }
    const { data, error } = await supabase.from("exercise_library" as never).insert({ ...payload, created_by_coach_id: coachId } as never).select("*" as never).single();
    if (error) { toast.error("Erro ao salvar exercício"); return; }
    setLibrary((cur) => [...cur, data as any].sort((a, b) => a.name.localeCompare(b.name)));
    setNewExercise({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
    toast.success("Exercício adicionado");
  };

  const startEditExercise = (e: Exercise) => {
    setEditingExercise(e);
    setNewExercise({
      name: e.name,
      muscle_group: e.muscle_group || "",
      equipment: e.equipment || "",
      difficulty: e.difficulty || "",
      description: e.description || "",
      video_url: e.video_url || "",
    });
    setSection("library");
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  const cancelEditExercise = () => {
    setEditingExercise(null);
    setNewExercise({ name: "", muscle_group: "", equipment: "", difficulty: "", description: "", video_url: "" });
  };

  const deleteExercise = async (e: Exercise) => {
    if (!confirm(`Excluir "${e.name}"?`)) return;
    const { error } = await supabase.from("exercise_library" as never).delete().eq("id" as never, e.id as never);
    if (error) { toast.error("Erro ao excluir"); return; }
    setLibrary((cur) => cur.filter((x) => x.id !== e.id));
    toast.success("Excluído");
  };


  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Protocolo do aluno</h1>
        <p className="text-sm text-white/50">Monte o plano alimentar, treino, metas e ficha de saúde</p>
      </div>

      {!selected ? (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex gap-1 rounded-lg bg-black/30 p-1">
            <button onClick={() => setScope("mine")} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${scope === "mine" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}>Meus alunos ({students.length})</button>
            <button onClick={() => setScope("external")} className={`flex-1 rounded-md px-3 py-1.5 text-xs font-bold transition-colors ${scope === "external" ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"}`}>Externos ({externals.length})</button>
          </div>
          <div className="mb-3 flex items-center gap-2">
            <div className="flex flex-1 items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
              <Search className="h-4 w-4 text-white/40" />
              <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={scope === "mine" ? "Buscar meu aluno" : "Buscar cliente externo"} className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30" />
            </div>
            <button onClick={() => setNewExternalOpen(true)} className="flex items-center gap-1 rounded-lg bg-primary/15 px-3 py-2 text-xs font-bold text-primary hover:bg-primary/25">
              <Plus className="h-3.5 w-3.5" /> Novo externo
            </button>
          </div>
          <div className="space-y-2">
            {filtered.length === 0 && (
              <p className="py-6 text-center text-sm text-white/40">
                {scope === "mine"
                  ? "Nenhum aluno vinculado a você ainda. Use a aba 'Externos' para criar treinos para pessoas de fora do app."
                  : "Nenhum cliente externo. Clique em 'Novo externo' para começar."}
              </p>
            )}
            {filtered.map((s) => (
              <button key={s.id} onClick={() => loadProtocol(s)} className="flex w-full items-center justify-between rounded-xl bg-white/5 p-3 text-left transition-colors hover:bg-white/10">
                <div>
                  <p className="text-sm font-semibold text-white">
                    {s.name}
                    {s.external && <span className="ml-2 rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">Externo</span>}
                  </p>
                  <p className="text-xs text-white/40">{s.email || "—"}</p>
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
            <ShortcutButton icon={FileText} label="Anamnese" value={hasAnamnesis ? "Ver registro" : "Sem registro"} disabled={selected.external || !hasAnamnesis} onClick={() => setDetailsTab("anamnese")} />
            <ShortcutButton icon={Activity} label="Bioimpedância" value={hasBio ? "Ver avaliações" : "Sem registro"} disabled={selected.external || !hasBio} onClick={() => setDetailsTab("avaliacoes")} />
            <InfoChip icon={Target} label="Peso atual" value={lastBioWeight != null ? `${lastBioWeight} kg` : (selected.current_weight ? `${selected.current_weight} kg` : "—")} />
            <InfoChip icon={Heart} label="Restrições" value={protocol.restrictions.length ? `${protocol.restrictions.length}` : "Nenhuma"} />
          </div>

          {/* Tabs */}
          <div className="mb-4 flex gap-2 overflow-x-auto">
            <TabBtn active={section === "windows"} onClick={() => setSection("windows")} icon={ClipboardList} label="Janelas" />
            <TabBtn active={section === "health"} onClick={() => setSection("health")} icon={Heart} label="Saúde & metas" />
            <TabBtn active={section === "workout"} onClick={() => setSection("workout")} icon={Dumbbell} label="Treino" />
            <TabBtn active={section === "templates"} onClick={() => setSection("templates")} icon={BookOpen} label="Treinos prontos" />
            <TabBtn active={section === "library"} onClick={() => setSection("library")} icon={Library} label="Criar exercícios" />
            {isNutritionist && <TabBtn active={section === "meal"} onClick={() => setSection("meal")} icon={Utensils} label="Alimentação" />}
          </div>


          {loading && <p className="text-sm text-white/40">Carregando...</p>}

          {!loading && section === "windows" && (
            <div className="space-y-4">
              {selected.external ? (
                <div className="rounded-2xl p-4 text-sm text-white/60" style={{ backgroundColor: "#1A1A1A" }}>
                  O Método das Janelas só está disponível para alunos vinculados ao app (não para clientes externos).
                </div>
              ) : (
                <>
                  <div className="rounded-2xl p-4 flex items-center justify-between gap-3 flex-wrap" style={{ backgroundColor: "#1A1A1A" }}>
                    <div>
                      <p className="text-sm font-bold text-white">Registro do dia</p>
                      <p className="text-[11px] text-white/40">Preencha as janelas do aluno. Ele verá no histórico.</p>
                    </div>
                    <div className="flex items-center gap-2">
                      <button onClick={() => setWindowsDate(new Date().toISOString().slice(0, 10))} className="rounded bg-white/10 px-2 py-1.5 text-xs text-white hover:bg-white/15">Hoje</button>
                      <input type="date" value={windowsDate} onChange={(e) => setWindowsDate(e.target.value)} max={new Date().toISOString().slice(0, 10)} className="rounded bg-white/10 px-2 py-1.5 text-xs text-white" />
                    </div>
                  </div>
                  <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                    <WindowMethod studentId={selected.id} date={windowsDate} />
                  </div>
                </>
              )}
            </div>
          )}

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
                          <textarea key={i} value={m.options[i as 0]} onChange={(e) => updateMealOption(idx, i as 0, e.target.value)} placeholder={`Opção ${i + 1} — descreva a refeição completa`} rows={3} className="w-full rounded bg-black/30 px-2 py-2 text-xs text-white outline-none resize-y" />
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
              {/* Header bonito com nome, objetivo e nível */}
              <div className="overflow-hidden rounded-2xl border border-primary/30 bg-gradient-to-br from-primary/15 via-orange-500/5 to-transparent p-4">
                <div className="mb-3 flex items-center gap-2">
                  <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/25">
                    <Dumbbell className="h-5 w-5 text-primary" />
                  </div>
                  <div className="flex-1">
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">Treino prescrito</p>
                    <p className="text-[11px] text-white/55">Vai aparecer no app do aluno em "Meu Treino" 🏆</p>
                  </div>
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-[1.4fr_1fr_1fr]">
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/40">Nome</label>
                    <input value={protocol.workout_name} onChange={(e) => setProtocol((p) => ({ ...p, workout_name: e.target.value }))} placeholder="Ex: Treino A — Peito e Tríceps" className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm font-semibold text-white outline-none" />
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/40 flex items-center gap-1"><Target className="h-3 w-3" /> Para que serve</label>
                    <select value={protocol.workout_goal} onChange={(e) => setProtocol((p) => ({ ...p, workout_goal: e.target.value as Protocol["workout_goal"] }))} className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none">
                      {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="text-[10px] font-bold uppercase text-white/40 flex items-center gap-1"><Zap className="h-3 w-3" /> Nível</label>
                    <select value={protocol.workout_level} onChange={(e) => setProtocol((p) => ({ ...p, workout_level: e.target.value as Protocol["workout_level"] }))} className="mt-1 w-full rounded-lg bg-white/10 px-3 py-2 text-sm text-white outline-none">
                      <option value="iniciante">Iniciante</option>
                      <option value="intermediario">Intermediário</option>
                      <option value="avancado">Avançado</option>
                    </select>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">{GOAL_LABELS[protocol.workout_goal]}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/80 capitalize">{protocol.workout_level}</span>
                  <span className="rounded-full bg-white/10 px-2 py-0.5 text-[10px] text-white/60">{protocol.workout_plan.length} exercício{protocol.workout_plan.length !== 1 ? "s" : ""}</span>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-1.5">
                  <button onClick={() => setTemplatePickerOpen(true)} className="flex items-center gap-1 rounded-full bg-primary/20 px-3 py-1.5 text-xs font-bold text-primary hover:bg-primary/30"><BookOpen className="h-3.5 w-3.5" /> Importar dos treinos prontos</button>
                  <button onClick={() => setSaveTemplateOpen(true)} disabled={protocol.workout_plan.length === 0} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15 disabled:opacity-40"><Save className="h-3.5 w-3.5" /> Salvar como template</button>
                  <button onClick={() => addWorkout()} className="flex items-center gap-1 rounded-full bg-white/10 px-3 py-1.5 text-xs text-white hover:bg-white/15"><Plus className="h-3.5 w-3.5" /> Exercício</button>
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h3 className="mb-3 text-xs font-bold uppercase tracking-wider text-white/60">Exercícios</h3>
                <div className="space-y-2">
                  {protocol.workout_plan.length === 0 && <p className="rounded-xl border border-dashed border-white/10 py-6 text-center text-xs text-white/40">Nenhum exercício ainda. Importe dos treinos prontos ou adicione da biblioteca abaixo.</p>}
                  {protocol.workout_plan.map((w, idx) => (
                    <div key={idx} className="rounded-xl border border-white/5 bg-white/[0.04] p-3">
                      <div className="mb-2 flex items-center gap-2">
                        <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-primary/20 text-[11px] font-bold text-primary">{idx + 1}</span>
                        <input value={w.name} onChange={(e) => updateWorkout(idx, { name: e.target.value })} placeholder="Exercício" className="flex-1 rounded bg-white/10 px-2 py-1.5 text-sm font-semibold text-white outline-none" />
                        <button onClick={() => removeWorkout(idx)} className="rounded bg-red-500/10 px-2 py-1.5 text-red-400 hover:bg-red-500/20"><Trash2 className="h-3.5 w-3.5" /></button>
                      </div>
                      <div className="grid grid-cols-3 gap-2">
                        <input value={w.sets} onChange={(e) => updateWorkout(idx, { sets: e.target.value })} placeholder="Séries" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                        <input value={w.reps} onChange={(e) => updateWorkout(idx, { reps: e.target.value })} placeholder="Reps" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                        <input value={w.rest} onChange={(e) => updateWorkout(idx, { rest: e.target.value })} placeholder="Descanso (seg)" className="rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                      </div>
                      <input value={w.notes} onChange={(e) => updateWorkout(idx, { notes: e.target.value })} placeholder="Observações" className="mt-2 w-full rounded bg-black/30 px-2 py-1.5 text-xs text-white" />
                    </div>
                  ))}
                </div>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h3 className="mb-2 text-xs font-bold uppercase tracking-wider text-white/60">Adicionar da biblioteca</h3>
                <div className="mb-3 flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2">
                  <Search className="h-4 w-4 text-white/40" />
                  <input value={libQuery} onChange={(e) => setLibQuery(e.target.value)} placeholder="Buscar exercício" className="w-full bg-transparent text-sm text-white outline-none" />
                </div>
                <div className="max-h-72 space-y-1 overflow-y-auto">
                  {filteredLib.map((e) => (
                    <button key={e.id} onClick={() => addWorkout(e.name)} className="flex w-full items-center justify-between rounded bg-white/5 p-2 text-left text-xs hover:bg-white/10">
                      <span className="text-white">{e.name}</span>
                      <span className="text-white/40">{e.muscle_group} · {e.equipment}</span>
                    </button>
                  ))}
                  {filteredLib.length === 0 && <p className="py-4 text-center text-xs text-white/40">Nenhum exercício na biblioteca. Cadastre na aba "Criar exercícios".</p>}
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

                {/* Meta de água — automática */}
                <div className="mb-3 rounded-xl border border-primary/20 bg-primary/5 p-3">
                  <div className="mb-2 flex items-center justify-between gap-2">
                    <div className="flex items-center gap-1.5 text-xs font-bold text-primary">
                      <Sparkles className="h-3.5 w-3.5" /> Meta de água (cálculo automático)
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        const auto = calcWaterGoalMl(lastBioWeight ?? selected.current_weight, studentAge);
                        if (auto) setProtocol((p) => ({ ...p, water_goal_ml: auto }));
                        setWaterOverride(false);
                      }}
                      className="rounded bg-white/10 px-2 py-1 text-[10px] text-white hover:bg-white/20"
                    >
                      Recalcular
                    </button>
                  </div>
                  <p className="text-[11px] leading-relaxed text-white/60">
                    {describeWaterFormula(lastBioWeight ?? selected.current_weight, studentAge)}
                  </p>
                  <div className="mt-2 flex items-center gap-2">
                    <Droplet className="h-4 w-4 text-primary" />
                    <input
                      type="number"
                      value={protocol.water_goal_ml ?? ""}
                      onChange={(e) => { setWaterOverride(true); setProtocol((p) => ({ ...p, water_goal_ml: e.target.value === "" ? null : Number(e.target.value) })); }}
                      className="w-28 rounded bg-white/10 px-2 py-1.5 text-sm text-white"
                    />
                    <span className="text-xs text-white/40">ml/dia</span>
                    {waterOverride && <span className="ml-2 rounded bg-yellow-500/15 px-1.5 py-0.5 text-[10px] font-bold text-yellow-400">Manual</span>}
                  </div>
                  {!lastBioWeight && !selected.current_weight && (
                    <p className="mt-1 text-[10px] text-yellow-400">⚠ Sem peso registrado — faça uma bioimpedância ou ajuste manualmente.</p>
                  )}
                </div>

                <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field icon={Target} label="Meta de peso" suffix="kg" value={protocol.weight_goal ?? ""} onChange={(v) => setProtocol((p) => ({ ...p, weight_goal: v === "" ? null : Number(v) }))} step="0.1" />
                </div>
                <p className="mt-2 text-[10px] text-white/40">A meta de calorias é definida apenas no painel do nutricionista.</p>
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
                <div className="mb-3 flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">
                    {editingExercise ? `Editando: ${editingExercise.name}` : "Adicionar exercício à biblioteca"}
                  </h2>
                  {editingExercise && (
                    <button onClick={cancelEditExercise} className="flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-[10px] text-white/70 hover:bg-white/20">
                      <X className="h-3 w-3" /> Cancelar
                    </button>
                  )}
                </div>
                <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                  <input value={newExercise.name || ""} onChange={(e) => setNewExercise((x) => ({ ...x, name: e.target.value }))} placeholder="Nome *" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.muscle_group || ""} onChange={(e) => setNewExercise((x) => ({ ...x, muscle_group: e.target.value }))} placeholder="Grupo muscular" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.equipment || ""} onChange={(e) => setNewExercise((x) => ({ ...x, equipment: e.target.value }))} placeholder="Equipamento" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.difficulty || ""} onChange={(e) => setNewExercise((x) => ({ ...x, difficulty: e.target.value }))} placeholder="Dificuldade (iniciante/intermediário/avançado)" className="rounded bg-white/5 px-3 py-2 text-sm text-white" />
                  <input value={newExercise.video_url || ""} onChange={(e) => setNewExercise((x) => ({ ...x, video_url: e.target.value }))} placeholder="URL de vídeo / GIF / imagem (tamanho recomendado: 800x600px)" className="rounded bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2" />
                  <textarea value={newExercise.description || ""} onChange={(e) => setNewExercise((x) => ({ ...x, description: e.target.value }))} placeholder="Descrição / execução" rows={2} className="rounded bg-white/5 px-3 py-2 text-sm text-white sm:col-span-2" />
                </div>
                <button onClick={saveExercise} className="mt-3 rounded-lg bg-primary px-4 py-2 text-sm font-semibold text-primary-foreground">
                  {editingExercise ? "Salvar alterações" : "Cadastrar exercício"}
                </button>
              </div>

              <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
                <h2 className="mb-3 text-sm font-bold text-white">Exercícios cadastrados ({library.length})</h2>
                <div className="max-h-96 space-y-1.5 overflow-y-auto">
                  {library.map((e) => (
                    <div key={e.id} className="flex items-start justify-between gap-2 rounded bg-white/5 p-2 text-xs">
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-white">{e.name}</p>
                        <p className="text-white/40">{[e.muscle_group, e.equipment, e.difficulty].filter(Boolean).join(" · ")}</p>
                        {e.video_url && <a href={e.video_url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 text-primary"><ExternalLink className="h-3 w-3" /> Mídia</a>}
                      </div>
                      <div className="flex shrink-0 items-center gap-1">
                        <button onClick={() => startEditExercise(e)} className="rounded bg-white/10 p-1.5 text-white/70 hover:bg-primary/20 hover:text-primary" title="Editar">
                          <Pencil className="h-3 w-3" />
                        </button>
                        <button onClick={() => deleteExercise(e)} className="rounded bg-red-500/10 p-1.5 text-red-400 hover:bg-red-500/20" title="Excluir">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                  {library.length === 0 && <p className="py-4 text-center text-white/40">Nenhum exercício cadastrado ainda.</p>}
                </div>
              </div>
            </div>
          )}


          {!loading && section === "templates" && (
            <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <WorkoutTemplatesPanel
                mode="coach"
                coachId={coachId}
                onEnableForStudent={selected && !selected.external ? enableTemplateAsDay : undefined}
                enableStudentName={selected?.name || null}
              />
            </div>
          )}
        </>
      )}

      {detailsTab && selected && !selected.external && (
        <StudentDetailsModal studentId={selected.id} initialTab={detailsTab} onClose={() => setDetailsTab(null)} />
      )}

      {templatePickerOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setTemplatePickerOpen(false)}>
          <div className="w-full max-w-2xl max-h-[90vh] overflow-y-auto rounded-2xl border border-white/10 bg-[#0F0F0F] p-5" onClick={(e) => e.stopPropagation()}>
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-base font-bold text-white">Escolher treino pronto</h3>
              <button onClick={() => setTemplatePickerOpen(false)} className="text-white/60"><Trash2 className="hidden" /><span className="text-xl">×</span></button>
            </div>
            <select value={templateGoalFilter} onChange={(e) => setTemplateGoalFilter(e.target.value)} className="mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white">
              <option value="all">Todos os objetivos</option>
              {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </select>
            <div className="space-y-2">
              {templates.filter((t) => templateGoalFilter === "all" || t.goal === templateGoalFilter).map((t) => (
                <div key={t.id} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="text-sm font-bold text-white">{t.name}</p>
                      <div className="mt-1 flex flex-wrap gap-1.5">
                        <span className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold text-primary">{GOAL_LABELS[t.goal]}</span>
                        {t.level && <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/70">{t.level}</span>}
                        <span className={`rounded px-1.5 py-0.5 text-[10px] ${t.is_global ? "bg-green-500/15 text-green-400" : "bg-blue-500/15 text-blue-400"}`}>{t.is_global ? "Global" : "Meu"}</span>
                        <span className="rounded bg-white/10 px-1.5 py-0.5 text-[10px] text-white/60">{t.items?.length || 0} ex.</span>
                      </div>
                      {t.description && <p className="mt-1 text-xs text-white/50">{t.description}</p>}
                    </div>
                  </div>
                  <div className="mt-2 flex gap-2">
                    <button onClick={() => applyTemplate(t, "replace")} className="flex-1 rounded bg-primary px-2 py-1.5 text-xs font-bold text-primary-foreground">Substituir treino</button>
                    <button onClick={() => applyTemplate(t, "append")} className="flex-1 rounded bg-white/10 px-2 py-1.5 text-xs text-white">Adicionar ao atual</button>
                  </div>
                </div>
              ))}
              {templates.length === 0 && <p className="py-6 text-center text-sm text-white/40">Nenhum treino disponível. Crie um em "Treinos prontos".</p>}
            </div>
          </div>
        </div>
      )}

      {saveTemplateOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setSaveTemplateOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F0F0F] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold text-white">Salvar treino atual como template</h3>
            <p className="mb-3 text-xs text-white/50">Este template ficará disponível só para você reutilizar em outros alunos.</p>
            <div className="space-y-2">
              <input value={templateForm.name} onChange={(e) => setTemplateForm({ ...templateForm, name: e.target.value })} placeholder="Nome do treino *" className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white" />
              <textarea value={templateForm.description} onChange={(e) => setTemplateForm({ ...templateForm, description: e.target.value })} placeholder="Descrição (opcional)" rows={2} className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white" />
              <div className="grid grid-cols-2 gap-2">
                <select value={templateForm.goal} onChange={(e) => setTemplateForm({ ...templateForm, goal: e.target.value as WorkoutTemplate["goal"] })} className="rounded bg-white/5 px-3 py-2 text-sm text-white">
                  {Object.entries(GOAL_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                </select>
                <select value={templateForm.level || ""} onChange={(e) => setTemplateForm({ ...templateForm, level: e.target.value as WorkoutTemplate["level"] })} className="rounded bg-white/5 px-3 py-2 text-sm text-white">
                  <option value="iniciante">Iniciante</option>
                  <option value="intermediario">Intermediário</option>
                  <option value="avancado">Avançado</option>
                </select>
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setSaveTemplateOpen(false)} className="flex-1 rounded bg-white/10 px-3 py-2 text-sm text-white">Cancelar</button>
              <button onClick={saveAsTemplate} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">Salvar</button>
            </div>
          </div>
        </div>
      )}

      {newExternalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !creatingExternal && setNewExternalOpen(false)}>
          <div className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0F0F0F] p-5" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-1 text-base font-bold text-white">Novo cliente externo</h3>
            <p className="mb-3 text-xs text-white/50">Crie um protocolo/treino para alguém de fora do app. O cliente fica disponível também na avaliação.</p>
            <div className="space-y-2">
              <input value={newExternal.name} onChange={(e) => setNewExternal({ ...newExternal, name: e.target.value })} placeholder="Nome *" className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white" />
              <input value={newExternal.email} onChange={(e) => setNewExternal({ ...newExternal, email: e.target.value })} placeholder="E-mail (opcional)" className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white" />
              <input value={newExternal.whatsapp} onChange={(e) => setNewExternal({ ...newExternal, whatsapp: e.target.value })} placeholder="WhatsApp (opcional)" className="w-full rounded bg-white/5 px-3 py-2 text-sm text-white" />
            </div>
            <div className="mt-4 flex gap-2">
              <button disabled={creatingExternal} onClick={() => setNewExternalOpen(false)} className="flex-1 rounded bg-white/10 px-3 py-2 text-sm text-white">Cancelar</button>
              <button disabled={creatingExternal} onClick={createExternalClient} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50">{creatingExternal ? "Criando..." : "Criar e abrir"}</button>
            </div>
          </div>
        </div>
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

function ShortcutButton({ icon: Icon, label, value, disabled, onClick }: { icon: any; label: string; value: string; disabled?: boolean; onClick: () => void }) {
  return (
    <button onClick={onClick} disabled={disabled} className="text-left rounded-xl bg-white/5 p-3 transition hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:bg-white/5">
      <div className="mb-1 flex items-center gap-1.5">
        <Icon className="h-3.5 w-3.5 text-primary" />
        <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      </div>
      <p className="text-sm font-semibold text-white">{value}</p>
    </button>
  );
}

export default ProtocolTab;
