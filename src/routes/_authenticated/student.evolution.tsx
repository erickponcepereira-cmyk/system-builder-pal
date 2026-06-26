import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useRef, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Camera, Droplet, GlassWater, ImagePlus, Loader2, Plus, Target, Trophy, Pencil, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getStudentHealthData, saveStudentHealthGoals, type StudentHealthData } from "@/lib/student-health.functions";
import { ProtectedImage } from "@/components/security/ProtectedImage";

export const Route = createFileRoute("/_authenticated/student/evolution")({ component: StudentEvolution });

type Student = { id: string; current_weight: number | null; goal_weight: number | null };
type EvolutionPhoto = { id: string; photo_url: string; photo_date: string; week_number: number | null; caption: string | null };
type SignedPhoto = EvolutionPhoto & { signedUrl?: string | null };

const MAX_PHOTOS = 10;
const MAX_PER_WEEK = 2;

function StudentEvolution() {
  const [student, setStudent] = useState<Student | null>(null);
  const [photos, setPhotos] = useState<SignedPhoto[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [caption, setCaption] = useState("");
  const [week, setWeek] = useState("1");
  const [viewerTag, setViewerTag] = useState<string>("");
  const photoInputRef = useRef<HTMLInputElement | null>(null);

  // Gallery / compare state
  const [galleryOpen, setGalleryOpen] = useState(false);
  const [compareIds, setCompareIds] = useState<string[]>([]);

  const latestPhoto = photos[0];
  const firstPhoto = photos[photos.length - 1];

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

    const { data: photoRes } = await supabase
      .from("evolution_photos")
      .select("id,photo_url,photo_date,week_number,caption")
      .eq("student_id", studentData.id)
      .order("photo_date", { ascending: false })
      .limit(MAX_PHOTOS);
    const signedPhotos = await Promise.all(((photoRes as EvolutionPhoto[]) || []).map(async (photo) => ({ ...photo, signedUrl: await signPhoto("evolution-photos", photo.photo_url) })));
    setPhotos(signedPhotos);
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const uploadEvolutionPhoto = async (file: File) => {
    if (!student) return;
    if (!file.type.startsWith("image/")) return toast.error("Envie uma imagem.");

    const weekNumber = Number(week || 1);
    const sameWeekCount = photos.filter((p) => p.week_number === weekNumber).length;
    if (sameWeekCount >= MAX_PER_WEEK) {
      return toast.error(`Limite de ${MAX_PER_WEEK} fotos por semana atingido.`);
    }
    if (photos.length >= MAX_PHOTOS) {
      return toast.error(`Limite de ${MAX_PHOTOS} fotos atingido. Apague alguma antes de enviar outra.`);
    }

    setSaving(true);
    const { data: userData } = await supabase.auth.getUser();
    const path = `${userData.user?.id}/${student.id}/${crypto.randomUUID()}-${file.name.replace(/[^a-z0-9.]/gi, "-")}`;
    const upload = await supabase.storage.from("evolution-photos").upload(path, file, { contentType: file.type });
    if (upload.error) toast.error(upload.error.message);
    else {
      const { error } = await supabase.from("evolution_photos").insert({ student_id: student.id, photo_url: path, photo_date: new Date().toISOString().slice(0, 10), week_number: weekNumber, caption } as never);
      if (error) toast.error(error.message);
      else { toast.success("Foto de evolução salva"); setCaption(""); await loadData(); }
    }
    setSaving(false);
  };

  const deletePhoto = async (id: string, path: string) => {
    if (!confirm("Apagar essa foto?")) return;
    await supabase.storage.from("evolution-photos").remove([path]);
    await supabase.from("evolution_photos").delete().eq("id", id);
    setCompareIds((prev) => prev.filter((x) => x !== id));
    await loadData();
  };

  const toggleCompare = (id: string) => {
    setCompareIds((prev) => {
      if (prev.includes(id)) return prev.filter((x) => x !== id);
      if (prev.length >= 2) return [prev[1], id];
      return [...prev, id];
    });
  };

  const compareSelection = compareIds
    .map((id) => photos.find((p) => p.id === id))
    .filter(Boolean) as SignedPhoto[];

  if (loading) return <div className="flex min-h-[70vh] items-center justify-center"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Transformação</p>
        <h1 className="text-2xl font-bold text-foreground">Evolução</h1>
      </header>

      <HealthGoalsCard />

      {student && <WaterTrackerCard studentId={student.id} />}


      <section className="rounded-2xl bg-card p-4">
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-foreground">Fotos de evolução</h2>
            <p className="text-[11px] text-muted-foreground">Até {MAX_PHOTOS} fotos, máx {MAX_PER_WEEK}/semana · toque para ver e comparar · recomendado 1080×1440px (3:4)</p>
          </div>
          <Camera className="h-5 w-5 text-primary" />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <input ref={photoInputRef} type="file" accept="image/*" className="hidden" onChange={(e) => e.target.files?.[0] && uploadEvolutionPhoto(e.target.files[0])} />
          <input value={week} onChange={(e) => setWeek(e.target.value)} type="number" min="1" className="field-control" placeholder="Semana" />
          <input value={caption} onChange={(e) => setCaption(e.target.value)} className="field-control" placeholder="Legenda" />
          <button disabled={saving} onClick={() => photoInputRef.current?.click()} className="col-span-2 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60"><ImagePlus className="h-4 w-4" /> Enviar foto</button>
        </div>
        {photos.length > 0 && (
          <button type="button" onClick={() => setGalleryOpen(true)} className="mt-4 grid w-full grid-cols-2 gap-2 text-left">
            {[firstPhoto, latestPhoto].filter(Boolean).map((photo, index) => (
              <div key={`${photo.id}-${index}`} className="overflow-hidden rounded-xl bg-muted">
                <img src={photo.signedUrl || ""} alt={index === 0 ? "Primeira foto" : "Foto mais recente"} className="aspect-[3/4] w-full object-cover" />
                <div className="p-2">
                  <p className="text-[10px] font-bold text-foreground">{index === 0 ? "Primeira" : "Atual"}</p>
                  <p className="text-[9px] text-muted-foreground">Semana {photo.week_number || "—"}</p>
                </div>
              </div>
            ))}
            <p className="col-span-2 text-center text-[11px] font-semibold text-primary">Ver todas as fotos ({photos.length}) →</p>
          </button>
        )}
      </section>

      {galleryOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={() => setGalleryOpen(false)}>
          <div className="flex h-[90vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-white">Minhas fotos ({photos.length})</h3>
                <p className="text-[11px] text-white/50">Selecione 2 fotos para comparar lado a lado</p>
              </div>
              <button onClick={() => setGalleryOpen(false)} className="rounded-full bg-white/10 p-2 text-white/70"><X className="h-4 w-4" /></button>
            </header>

            {compareSelection.length === 2 && (
              <div className="border-b border-white/5 p-3">
                <p className="mb-2 text-[10px] font-bold uppercase tracking-wider text-primary">Comparação</p>
                <div className="grid grid-cols-2 gap-2">
                  {compareSelection.map((p) => (
                    <div key={p.id} className="overflow-hidden rounded-xl bg-muted">
                      <img src={p.signedUrl || ""} alt={p.caption || "Foto"} className="aspect-[3/4] w-full object-cover" />
                      <div className="p-1.5">
                        <p className="text-[10px] font-bold text-white">Semana {p.week_number || "—"}</p>
                        <p className="text-[9px] text-white/50">{p.photo_date}</p>
                      </div>
                    </div>
                  ))}
                </div>
                <button onClick={() => setCompareIds([])} className="mt-2 w-full rounded-lg bg-white/5 py-1.5 text-[11px] text-white/60">Limpar comparação</button>
              </div>
            )}

            <div className="flex-1 overflow-y-auto p-3">
              <div className="grid grid-cols-3 gap-2">
                {photos.map((p) => {
                  const selected = compareIds.includes(p.id);
                  return (
                    <div key={p.id} className="relative">
                      <button
                        onClick={() => toggleCompare(p.id)}
                        className={`block w-full overflow-hidden rounded-lg border-2 transition-all ${selected ? "border-primary" : "border-transparent"}`}
                      >
                        <img src={p.signedUrl || ""} alt={p.caption || "Foto"} className="aspect-[3/4] w-full object-cover" />
                        <div className="bg-card/90 p-1">
                          <p className="text-[9px] font-bold text-white">Sem {p.week_number || "—"}</p>
                          <p className="text-[8px] text-white/50">{p.photo_date.slice(5)}</p>
                        </div>
                      </button>
                      {selected && (
                        <span className="absolute right-1 top-1 flex h-5 w-5 items-center justify-center rounded-full bg-primary text-[10px] font-bold text-primary-foreground">
                          {compareIds.indexOf(p.id) + 1}
                        </span>
                      )}
                      <button
                        onClick={() => deletePhoto(p.id, p.photo_url)}
                        className="absolute left-1 top-1 rounded-full bg-black/60 p-1 text-white/80 hover:text-red-400"
                      >
                        <X className="h-3 w-3" />
                      </button>
                    </div>
                  );
                })}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

function HealthGoalsCard() {
  const fetchHealth = useServerFn(getStudentHealthData);
  const submitGoals = useServerFn(saveStudentHealthGoals);
  const [data, setData] = useState<StudentHealthData | null>(null);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goalWeight, setGoalWeight] = useState<string>("");
  const [currentWeight, setCurrentWeight] = useState<string>("");

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchHealth();
      setData(res);
      setGoalWeight(res.goalWeight != null ? String(res.goalWeight) : "");
      setCurrentWeight(res.currentWeight != null ? String(res.currentWeight) : "");
    } catch (e: any) {
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
          currentWeight: currentWeight ? Number(currentWeight) : null,
        },
      });
      toast.success("Metas atualizadas");
      setEditing(false);
      await load();
    } catch (e: any) {
      toast.error(`Não foi possível salvar: ${e?.message || "erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  };

  if (loading || !data) {
    return <div className="rounded-2xl bg-card p-4 text-xs text-muted-foreground">Carregando metas…</div>;
  }

  const sourceLabel =
    data.lastAssessmentSource === "fitmindshape"
      ? "FitMindShape"
      : data.lastAssessmentSource === "students_table"
      ? "registro manual"
      : null;

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Target className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Peso e meta</h2>
        </div>
        <button
          onClick={() => setEditing((v) => !v)}
          className="rounded-lg bg-white/5 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
          title={editing ? "Cancelar" : "Editar"}
        >
          {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
        </button>
      </div>

      {sourceLabel && data.lastAssessmentSource === "fitmindshape" && (
        <p className="mb-3 text-[11px] text-muted-foreground">
          Peso atual atualizado pela última bioimpedância ({sourceLabel}
          {data.lastAssessmentDate ? ` · ${data.lastAssessmentDate}` : ""}). Você pode editar manualmente, mas será sobrescrito na próxima avaliação.
        </p>
      )}

      {editing ? (
        <div className="grid grid-cols-2 gap-3">
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Peso atual (kg)</span>
            <input type="number" step="0.1" value={currentWeight} onChange={(e) => setCurrentWeight(e.target.value)} className="field-control" placeholder="Ex: 80" />
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-[10px] uppercase tracking-wider text-muted-foreground">Meta de peso (kg)</span>
            <input type="number" step="0.1" value={goalWeight} onChange={(e) => setGoalWeight(e.target.value)} className="field-control" placeholder="Ex: 70" />
          </label>
          <button onClick={save} disabled={saving} className="col-span-2 mt-1 flex items-center justify-center gap-2 rounded-xl bg-primary px-4 py-2.5 text-sm font-bold text-primary-foreground disabled:opacity-60">
            <Save className="h-4 w-4" /> {saving ? "Salvando..." : "Salvar"}
          </button>
        </div>
      ) : (
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
      )}
    </section>
  );
}

type WaterLog = { id: string; amount_ml: number; created_at: string };
type WaterDayTotal = { date: string; total_ml: number };

function WaterTrackerCard({ studentId }: { studentId: string }) {
  const [goalMl, setGoalMl] = useState<number>(2500);
  const [logs, setLogs] = useState<WaterLog[]>([]);
  const [history, setHistory] = useState<WaterDayTotal[]>([]);
  const [streak, setStreak] = useState(0);
  const [loading, setLoading] = useState(true);
  const [adding, setAdding] = useState(false);
  const [customOpen, setCustomOpen] = useState(false);
  const [customAmount, setCustomAmount] = useState("250");
  const [historyOpen, setHistoryOpen] = useState(false);

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
    const sortedHist: WaterDayTotal[] = Object.entries(totals)
      .map(([date, total_ml]) => ({ date, total_ml }))
      .sort((a, b) => (a.date < b.date ? 1 : -1));
    setHistory(sortedHist);
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
    if (!wasReached && totalToday + amount >= goalMl) toast.success("🎉 Meta de água batida! +10 XP");
    else toast.success(`+${amount}ml registrados 💧`);
  };

  const removeLog = async (id: string) => {
    await supabase.from("student_water_logs" as never).delete().eq("id" as never, id as never);
    await load();
  };

  if (loading) return <div className="rounded-2xl bg-card p-4 text-xs text-muted-foreground">Carregando hidratação…</div>;

  return (
    <section className="rounded-2xl bg-card p-4">
      <div className="mb-3 flex items-center justify-between">
        <button onClick={() => setHistoryOpen(true)} className="flex items-center gap-2 text-left hover:opacity-80" title="Ver histórico">
          <Droplet className="h-4 w-4 text-primary" />
          <h2 className="text-sm font-bold text-foreground">Hidratação do dia</h2>
          <span className="text-[10px] text-primary/70 underline">histórico</span>
        </button>
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
        <div className={`h-full transition-all ${goalReached ? "bg-success" : "bg-primary"}`} style={{ width: `${pct}%` }} />
      </div>

      <div className="mb-2 grid grid-cols-4 gap-2">
        {[200, 250, 500, 750].map((ml) => (
          <button key={ml} onClick={() => addWater(ml)} disabled={adding} className="flex flex-col items-center gap-1 rounded-xl bg-primary/10 px-2 py-2 text-primary transition-colors hover:bg-primary/20 disabled:opacity-60">
            <GlassWater className="h-4 w-4" />
            <span className="text-[10px] font-bold">+{ml}ml</span>
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2">
        {customOpen ? (
          <>
            <input type="number" value={customAmount} onChange={(e) => setCustomAmount(e.target.value)} placeholder="ml" className="field-control flex-1" autoFocus />
            <button onClick={() => { addWater(Number(customAmount) || 0); setCustomOpen(false); }} className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">Adicionar</button>
            <button onClick={() => setCustomOpen(false)} className="rounded-xl bg-white/5 p-2 text-white/60"><X className="h-3.5 w-3.5" /></button>
          </>
        ) : (
          <button onClick={() => setCustomOpen(true)} className="flex w-full items-center justify-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-xs font-semibold text-white/70 hover:bg-white/10">
            <Plus className="h-3.5 w-3.5" /> Outra quantidade
          </button>
        )}
      </div>

      {logs.length > 0 && (
        <div className="mt-3 border-t border-white/5 pt-3">
          <p className="mb-2 text-[10px] uppercase tracking-wider text-muted-foreground">Registros de hoje</p>
          <div className="flex flex-wrap gap-1.5">
            {logs.map((l) => (
              <button key={l.id} onClick={() => removeLog(l.id)} title="Remover" className="group flex items-center gap-1 rounded-full bg-white/5 px-2 py-1 text-[11px] text-white/70 hover:bg-red-500/10 hover:text-red-300">
                <Droplet className="h-3 w-3" />
                {l.amount_ml}ml
                <X className="h-2.5 w-2.5 opacity-0 group-hover:opacity-100" />
              </button>
            ))}
          </div>
        </div>
      )}
      {historyOpen && (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/80 p-0 sm:items-center sm:p-4" onClick={() => setHistoryOpen(false)}>
          <div className="flex max-h-[85vh] w-full max-w-md flex-col overflow-hidden rounded-t-3xl bg-card sm:rounded-3xl" onClick={(e) => e.stopPropagation()}>
            <header className="flex items-center justify-between border-b border-white/5 px-4 py-3">
              <div>
                <h3 className="text-sm font-bold text-white">Histórico de hidratação</h3>
                <p className="text-[11px] text-white/50">Últimos 30 dias · meta {(goalMl / 1000).toFixed(1)} L/dia</p>
              </div>
              <button onClick={() => setHistoryOpen(false)} className="rounded-full bg-white/10 p-2 text-white/70"><X className="h-4 w-4" /></button>
            </header>
            <div className="flex-1 overflow-y-auto p-3">
              {history.length === 0 ? (
                <p className="py-6 text-center text-xs text-white/40">Nenhum registro nos últimos 30 dias.</p>
              ) : (
                <ul className="space-y-1.5">
                  {history.map((d) => {
                    const reached = d.total_ml >= goalMl;
                    return (
                      <li key={d.date} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2 text-xs">
                        <span className="text-white/80">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" })}</span>
                        <span className={`font-bold ${reached ? "text-success" : "text-white/70"}`}>
                          {(d.total_ml / 1000).toFixed(2)} L {reached ? "✓" : ""}
                        </span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
