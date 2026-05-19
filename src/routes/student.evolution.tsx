import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Apple, Camera, ImagePlus, Loader2, Sparkles, Target, TrendingDown, Upload, Pencil, X, Save } from "lucide-react";
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

      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-foreground">{photos.length}</p><p className="text-[10px] text-muted-foreground">fotos</p></div>
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-primary">{totalCalories || "—"}</p><p className="text-[10px] text-muted-foreground">kcal hoje</p></div>
        <div className="rounded-2xl bg-card p-3 text-center"><p className="text-lg font-bold text-foreground">{student?.goal_weight ? `${student.goal_weight}kg` : "—"}</p><p className="text-[10px] text-muted-foreground">meta</p></div>
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
