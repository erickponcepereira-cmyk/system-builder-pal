import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Apple, Camera, Droplet, GlassWater, ImagePlus, Loader2, Plus, Sparkles, Target, TrendingDown, Trophy, Upload, Pencil, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getStudentHealthData, saveStudentHealthGoals, type StudentHealthData } from "@/lib/student-health.functions";

export const Route = createFileRoute("/student/evolution")({ component: StudentEvolution });

type Student = { id: string; current_weight: number | null; goal_weight: number | null };
type EvolutionPhoto = { id: string; photo_url: string; photo_date: string; week_number: number | null; caption: string | null };
type MealAnalysis = { calories?: number; protein_g?: number; carbs_g?: number; fat_g?: number; summary?: string; coach_tip?: string };
type FoodLog = { id: string; log_date: string; meal_type: string | null; photo_url: string | null; description: string | null; ai_analysis: MealAnalysis | null };
type SignedPhoto = EvolutionPhoto & { signedUrl?: string | null };
type SignedFood = FoodLog & { signedUrl?: string | null };

function StudentEvolution() {
  const [student, setStudent] = useState<Student | null>(null);
  const [photos, setPhotos] = useState<SignedPhoto[]>([]);
  const [foods, setFoods] = useState<SignedFood[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState("");
  const [week, setWeek] = useState("1");
  const [mealType, setMealType] = useState("lunch");
  const [mealDescription, setMealDescription] = useState("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);
  const mealInputRef = useRef<HTMLInputElement | null>(null);

  const latestPhoto = photos[0];
  const firstPhoto = photos[photos.length - 1];
  const totalCalories = useMemo(() => foods.reduce((sum, item) => sum + Number(item.ai_analysis?.calories || 0), 0), [foods]);

  const signPhoto = async (bucket: string, path: string) => {
    const { data } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60);
    return data?.signedUrl || null;
  };

  const loadData = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    if (!userData.user) return setLoading(false);
    const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
    const { data: studentData } = profile?.id
      ? await supabase.from("students").select("id,current_weight,goal_weight").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!studentData?.id) return setLoading(false);
    setStudent(studentData as Student);

    const [photoRes, foodRes] = await Promise.all([
      supabase.from("evolution_photos").select("id,photo_url,photo_date,week_number,caption").eq("student_id", studentData.id).order("photo_date", { ascending: false }).limit(24),
      supabase.from("food_logs").select("id,log_date,meal_type,photo_url,description,ai_analysis").eq("student_id", studentData.id).order("created_at", { ascending: false }).limit(20),
    ]);

    const signedPhotos = await Promise.all(((photoRes.data as EvolutionPhoto[]) || []).map(async (photo) => ({ ...photo, signedUrl: await signPhoto("evolution-photos", photo.photo_url) })));
    const signedFoods = await Promise.all(((foodRes.data as FoodLog[]) || []).map(async (food) => ({ ...food, signedUrl: food.photo_url ? await signPhoto("food-photos", food.photo_url) : null })));
    setPhotos(signedPhotos);
    setFoods(signedFoods);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const uploadEvolutionPhoto = async (file: File) => {
    if (!student) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const path = `${userData.user?.id}/${student.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const upload = await supabase.storage.from("evolution-photos").upload(path, file, { contentType: file.type });
    if (upload.error) toast.error(upload.error.message);
    else {
      const { error } = await supabase.from("evolution_photos").insert({ student_id: student.id, photo_url: path, photo_date: new Date().toISOString().slice(0, 10), week_number: Number(week || 1), caption } as never);
      if (error) toast.error(error.message);
      else { toast.success("Foto de evolução salva"); setCaption(""); await loadData(); }
    }
    setSaving(false);
  };

  const uploadFoodPhoto = async (file: File) => {
    if (!student) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");
    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const path = `${userData.user?.id}/${student.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const upload = await supabase.storage.from("food-photos").upload(path, file, { contentType: file.type });
    if (upload.error) {
      toast.error(upload.error.message);
      setSaving(false);
      return;
    }
    const { data, error } = await supabase.from("food_logs").insert({ student_id: student.id, photo_url: path, description: mealDescription, meal_type: mealType, log_date: new Date().toISOString().slice(0, 10) } as never).select("id").single();
    if (error) toast.error(error.message);
    else {
      toast.success("Refeição registrada. Analisando com IA...");
      const { error: fnError } = await supabase.functions.invoke("analyze-meal", { body: { foodLogId: data.id } });
      if (fnError) toast.error(fnError.message);
      else toast.success("Análise concluída");
      setMealDescription("");
      await loadData();
    }
    setSaving(false);
  };

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Transformação</p>
        <h1 className="text-2xl font-bold text-foreground">Evolução e IA</h1>
      </header>

      <HealthGoalsCard totalCaloriesToday={totalCalories} />

      {student && <WaterTrackerCard studentId={student.id} />}

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-foreground">{photos.length}</p><p className="text-[10px] text-muted-foreground">fotos</p></div>
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-primary">{totalCalories || "—"}</p><p className="text-[10px] text-muted-foreground">kcal hoje</p></div>
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-foreground">{student?.goal_weight ? `${student.goal_weight}kg` : "—"}</p><p className="text-[10px] text-muted-foreground">meta peso</p></div>
      </div>


      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-foreground">Fotos de evolução</h2><p className="text-[11px] text-muted-foreground">Antes, depois e acompanhamento semanal</p></div><Camera className="h-5 w-5 text-primary" /></div>
        <div className="grid grid-cols-2 gap-3">
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvolutionPhoto(e.target.files[0])} />
          <input value={week} onChange={(e) => setWeek(e.target.value)} type="number" min="1" className="field-control" placeholder="Semana" />
          <input value={caption} onChange={(e) => setCaption(e.target.value)} className="field-control" placeholder="Legenda" />
          <button disabled={saving} onClick={() => photoInputRef.current?.click()} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"><ImagePlus className="h-4 w-4" /> Enviar foto</button>
        </div>
        {photos.length > 0 && <div className="mt-4 grid grid-cols-2 gap-2">{[firstPhoto, latestPhoto].filter(Boolean).map((photo, index) => <div key={`${photo.id}-${index}`} className="overflow-hidden rounded-xl bg-muted"><img src={photo.signedUrl || ""} alt={index === 0 ? "Primeira foto de evolução" : "Foto mais recente de evolução"} className="aspect-[3/4] w-full object-cover" /><div className="p-2"><p className="text-[10px] font-bold text-foreground">{index === 0 ? "Primeira" : "Atual"}</p><p className="text-[9px] text-muted-foreground">Semana {photo.week_number || "—"}</p></div></div>)}</div>}
      </section>

      <section className="rounded-2xl bg-card p-4 opacity-90">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Diário alimentar com IA</h2>
            <p className="text-[11px] text-muted-foreground">Análise automática de calorias e dicas pela foto da refeição</p>
          </div>
          <Sparkles className="h-5 w-5 text-primary" />
        </div>
        <div className="flex flex-col items-center justify-center gap-2 rounded-xl border border-dashed border-primary/30 bg-primary/5 px-4 py-8 text-center">
          <span className="rounded-full bg-primary px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary-foreground">Em breve</span>
          <p className="max-w-xs text-xs text-muted-foreground">Estamos finalizando essa funcionalidade. Em breve você poderá enviar a foto da refeição e a IA fará a leitura nutricional automaticamente.</p>
        </div>
      </section>
    </div>
  );
}

function mealLabel(type: string | null) {
  if (type === "breakfast") return "Café da manhã";
  if (type === "lunch") return "Almoço";
  if (type === "dinner") return "Jantar";
  if (type === "snack") return "Lanche";
  return "Refeição";
}

function HealthGoalsCard({ totalCaloriesToday }: { totalCaloriesToday: number }) {
  const fetchHealth = useServerFn(getStudentHealthData);
  const submitGoals = useServerFn(saveStudentHealthGoals);
  const [data, setData] = useState<StudentHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goalWeight, setGoalWeight] = useState<string>("");
  const [dailyCalories, setDailyCalories] = useState<string>("");
  const [activityFactor, setActivityFactor] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchHealth();
      setData(res);
      setGoalWeight(res.goalWeight != null ? String(res.goalWeight) : "");
      setDailyCalories(
        res.dailyCaloriesGoal != null
          ? String(res.dailyCaloriesGoal)
          : res.suggestedDailyCalories != null
          ? String(res.suggestedDailyCalories)
          : "",
      );
      setActivityFactor(String(res.activityFactor || 1.4));
    } catch (e: any) {
      // Silent — student may not have a student row yet
      console.error("[HealthGoalsCard] load", e);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const save = async () => {
    setSaving(true);
    try {
      await submitGoals({
        data: {
          goalWeight: goalWeight ? Number(goalWeight) : null,
          dailyCaloriesGoal: dailyCalories ? Number(dailyCalories) : null,
          activityFactor: activityFactor ? Number(activityFactor) : null,
        },
      });
      toast.success("Metas de saúde atualizadas");
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(`Não foi possível salvar: ${e?.message || "erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return (
      <div className="rounded-2xl bg-card p-4 text-xs text-muted-foreground">Carregando metas…</div>
    );
  }

  const calorieTarget = data.dailyCaloriesGoal ?? data.suggestedDailyCalories ?? 0;
  const calorieProgress = calorieTarget ? Math.min((totalCaloriesToday / calorieTarget) * 100, 100) : 0;
  const sourceLabel =
    data.lastAssessmentSource === "fitmindshape"
      ? "FitMindShape"
      : data.lastAssessmentSource === "students_table"
      ? "Bioimpedância registrada"
      : null;

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Metas de saúde</h2>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-lg bg-white/5 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          title={editing ? "Cancelar" : "Editar"}
        >
          {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      {sourceLabel && data.bmr && (
        <p className="mb-3 text-[11px] text-muted-foreground">
          Calorias sugeridas com base em <span className="text-foreground">{Math.round(data.bmr)} kcal</span> (metabolismo basal) × <span className="text-foreground">{data.activityFactor.toFixed(2)}</span> (fator de atividade) — fonte: {sourceLabel}
        </p>
      )}

      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Meta de peso (kg)</span>
            <input
              type="number"
              step="0.1"
              value={goalWeight}
              onChange={(e) => setGoalWeight(e.target.value)}
              className="field-control"
              placeholder="Ex: 70"
            />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Calorias/dia (kcal)</span>
            <input
              type="number"
              step="50"
              value={dailyCalories}
              onChange={(e) => setDailyCalories(e.target.value)}
              className="field-control"
              placeholder={data.suggestedDailyCalories ? String(data.suggestedDailyCalories) : "Ex: 2000"}
            />
          </label>
          <label className="col-span-2 flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">
              Fator de atividade ({activityFactor})
            </span>
            <input
              type="range"
              min="1.2"
              max="2"
              step="0.05"
              value={activityFactor}
              onChange={(e) => setActivityFactor(e.target.value)}
              className="w-full"
            />
            <span className="text-[10px] text-muted-foreground">
              1.2 sedentário · 1.4 leve · 1.55 moderado · 1.75 ativo · 1.9 muito ativo
            </span>
          </label>
          <button
            onClick={save}
            disabled={saving}
            className="col-span-2 mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60"
          >
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar metas"}
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          <div className="grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-muted/30 p-2">
              <p className="text-[10px] text-muted-foreground">Peso atual</p>
              <p className="text-base font-bold text-foreground">{data.currentWeight != null ? `${data.currentWeight} kg` : "—"}</p>
            </div>
            <div className="rounded-xl bg-muted/30 p-2">
              <p className="text-[10px] text-muted-foreground">Meta</p>
              <p className="text-base font-bold text-primary">{data.goalWeight != null ? `${data.goalWeight} kg` : "—"}</p>
            </div>
            <div className="rounded-xl bg-muted/30 p-2">
              <p className="text-[10px] text-muted-foreground">Diff.</p>
              <p className="text-base font-bold text-foreground">
                {data.currentWeight != null && data.goalWeight != null
                  ? `${(data.currentWeight - data.goalWeight).toFixed(1)} kg`
                  : "—"}
              </p>
            </div>
          </div>

          <div>
            <div className="mb-1 flex items-center justify-between text-xs">
              <span className="text-muted-foreground">Calorias hoje</span>
              <span className="font-bold text-foreground">
                {totalCaloriesToday} / {calorieTarget || "—"} kcal
              </span>
            </div>
            <div className="h-2 overflow-hidden rounded-full" style={{ backgroundColor: "#252525" }}>
              <div
                className={`h-full transition-all ${calorieProgress >= 100 ? "bg-success" : "bg-primary"}`}
                style={{ width: `${calorieProgress}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

type WaterLog = { id: string; amount_ml: number; created_at: string };

function WaterTrackerCard({ studentId }: { studentId: string }) {
  const [goalMl, setGoalMl] = useState<number>(2500);
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("250");

  const today = new Date().toISOString().slice(0, 10);
  const totalToday = useMemo(() => logs.reduce((s, l) => s + l.amount_ml, 0), [logs]);
  const pct = Math.min((totalToday / Math.max(goalMl, 1)) * 100, 100);
  const remaining = Math.max(goalMl - totalToday, 0);
  const goalReached = totalToday >= goalMl;

  const load = async () => {
    setLoading(true);
    const { data: st } = await supabase.from("students").select("water_goal_ml").eq("id", studentId).maybeSingle();
    setGoalMl(Number((st as any)?.water_goal_ml) || 2500);
    const { data: todayLogs } = await supabase
      .from("student_water_logs" as never)
      .select("id, amount_ml, created_at" as never)
      .eq("student_id" as never, studentId as never)
      .eq("log_date" as never, today as never)
      .order("created_at" as never, { ascending: false });
    setLogs(((todayLogs as any[]) || []) as WaterLog[]);

    // streak: count consecutive days (up to 30) where goal was met
    const since = new Date(); since.setDate(since.getDate() - 30);
    const { data: hist } = await supabase
      .from("student_water_logs" as never)
      .select("log_date, amount_ml" as never)
      .eq("student_id" as never, studentId as never)
      .gte("log_date" as never, since.toISOString().slice(0, 10) as never);
    const totals: Record<string, number> = {};
    ((hist as any[]) || []).forEach((r) => { totals[r.log_date] = (totals[r.log_date] || 0) + r.amount_ml; });
    const goal = Number((st as any)?.water_goal_ml) || 2500;
    let s = 0;
    for (let i = 0; i < 30; i++) {
      const d = new Date(); d.setDate(d.getDate() - i);
      const key = d.toISOString().slice(0, 10);
      if ((totals[key] || 0) >= goal) s++;
      else if (i > 0) break;
    }
    setStreak(s);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [studentId]);

  const addWater = async (amount: number) => {
    if (!amount || amount <= 0) return;
    setAdding(true);
    const { error } = await supabase
      .from("student_water_logs" as never)
      .insert({ student_id: studentId, amount_ml: amount, log_date: today } as never);
    setAdding(false);
    if (error) return toast.error(error.message);
    const wasReached = goalReached;
    await load();
    if (!wasReached && totalToday + amount >= goalMl) {
      toast.success("🎉 Meta de água batida! +10 XP");
    } else {
      toast.success(`+${amount}ml registrados 💧`);
    }
  };

  const removeLog = async (id: string) => {
    await supabase.from("student_water_logs" as never).delete().eq("id" as never, id as never);
    await load();
  };

  if (loading) return <div className="rounded-2xl bg-card p-4 text-xs text-muted-foreground">Carregando hidratação…</div>;

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Droplet className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Hidratação do dia</h2>
        </div>
        <div className="flex items-center gap-1 rounded-full bg-primary/15 px-2 py-0.5">
          <Trophy className="h-3 w-3 text-primary" />
          <span className="text-[10px] font-bold text-primary">{streak} dia{streak === 1 ? "" : "s"} seguidos</span>
        </div>
      </div>

      <div className="mb-3 flex items-end justify-between">
        <p className="text-xs text-muted-foreground">
          <span className="text-2xl font-bold text-foreground">{(totalToday / 1000).toFixed(2)}</span>
          <span className="ml-1">/ {(goalMl / 1000).toFixed(1)} L</span>
        </p>
        <p className="text-[11px] font-semibold text-primary">
          {goalReached ? "Meta batida! 🎉" : `Faltam ${(remaining / 1000).toFixed(2)} L`}
        </p>
      </div>

      <div className="mb-3 h-3 overflow-hidden rounded-full" style={{ backgroundColor: "#252525" }}>
        <div
          className={`h-full transition-all ${goalReached ? "bg-success" : "bg-primary"}`}
          style={{ width: `${pct}%` }}
        />
      </div>

      <div className="mb-2 grid grid-cols-4 gap-2">
        {[200, 250, 500, 750].map((ml) => (
          <button
            key={ml}
            onClick={() => addWater(ml)}
            disabled={adding}
            className="flex flex-col items-center gap-1 rounded-xl bg-primary/10 px-2 py-2 text-primary transition-colors hover:bg-primary/20 disabled:opacity-60"
          >
            <GlassWater className="h-4 w-4" />
            <span className="text-[10px] font-bold">+{ml}ml</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {customOpen ? (
          <>
            <input
              type="number"
              value={customAmount}
              onChange={(e) => setCustomAmount(e.target.value)}
              placeholder="ml"
              className="field-control flex-1"
              autoFocus
            />
            <button
              onClick={() => { addWater(Number(customAmount) || 0); setCustomOpen(false); }}
              className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
            >
              Adicionar
            </button>
            <button onClick={() => setCustomOpen(false)} className="rounded-xl bg-white/5 p-2 text-white/60"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button
            onClick={() => setCustomOpen(true)}
            className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10"
          >
            <Plus className="h-3.5 w-3.5" /> Outra quantidade
          </button>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Registros de hoje</p>
          <div className="flex flex-wrap gap-1.5">
            {logs.map((l) => (
              <button
                key={l.id}
                onClick={() => removeLog(l.id)}
                title="Remover"
                className="group flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-red-500/10 hover:text-red-300"
              >
                <Droplet className="h-3 w-3" />
                {l.amount_ml}ml
                <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
    </section>
  );
}

