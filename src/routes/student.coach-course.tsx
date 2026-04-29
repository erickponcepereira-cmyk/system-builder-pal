import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { CheckCircle2, ChevronLeft, Clock, GraduationCap, Loader2, Send, ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { CoachSelector, type CoachOption } from "@/components/auth/CoachSelector";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/coach-course")({ component: CoachCoursePage });

type ModuleRow = { id: string; title: string; description: string | null; video_url: string | null; duration_minutes: number | null; sort_order: number | null; is_required: boolean | null };
type ProgressRow = { module_id: string; completed_at: string | null };
type ApplicationRow = { id: string; status: string; motivation: string; created_at: string | null; admin_notes: string | null };

function CoachCoursePage() {
  const [studentId, setStudentId] = useState<string | null>(null);
  const [modules, setModules] = useState<ModuleRow[]>([]);
  const [progress, setProgress] = useState<ProgressRow[]>([]);
  const [application, setApplication] = useState<ApplicationRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [motivation, setMotivation] = useState("");
  const [experience, setExperience] = useState("");
  const [phone, setPhone] = useState("");
  const [city, setCity] = useState("");
  const [selectedCoach, setSelectedCoach] = useState<CoachOption | null>(null);
  const completedIds = useMemo(() => new Set(progress.map((row) => row.module_id)), [progress]);
  const requiredTotal = modules.filter((m) => m.is_required !== false).length;
  const requiredDone = modules.filter((m) => m.is_required !== false && completedIds.has(m.id)).length;
  const percentage = requiredTotal ? Math.round((requiredDone / requiredTotal) * 100) : 0;

  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = userData.user ? await supabase.from("profiles").select("id,city,phone").eq("user_id", userData.user.id).maybeSingle() : { data: null };
    if (profile?.city) setCity(profile.city);
    if (profile?.phone) setPhone(profile.phone);
    const { data: student } = profile?.id ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle() : { data: null };
    if (student?.id) setStudentId(student.id);
    const [moduleRes, progressRes, appRes] = await Promise.all([
      supabase.from("coach_course_modules" as never).select("id,title,description,video_url,duration_minutes,sort_order,is_required" as never).eq("is_active" as never, true as never).order("sort_order" as never),
      student?.id ? supabase.from("coach_course_progress" as never).select("module_id,completed_at" as never).eq("student_id" as never, student.id as never) : Promise.resolve({ data: [] }),
      student?.id ? supabase.from("coach_applications" as never).select("id,status,motivation,created_at,admin_notes" as never).eq("student_id" as never, student.id as never).order("created_at" as never, { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
    ]);
    setModules((moduleRes.data as unknown as ModuleRow[]) || []);
    setProgress((progressRes.data as unknown as ProgressRow[]) || []);
    setApplication((appRes.data as unknown as ApplicationRow) || null);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const completeModule = async (moduleId: string) => {
    const { error } = await supabase.rpc("mark_coach_course_module_complete" as never, { _module_id: moduleId } as never);
    if (error) toast.error(error.message);
    else { toast.success("Módulo concluído"); await load(); }
  };

  const submitApplication = async () => {
    if (!studentId) return toast.error("Aluno não encontrado");
    if (percentage < 100) return toast.error("Conclua todos os módulos obrigatórios");
    if (!selectedCoach) return toast.error("Selecione o coach da rede onde você vai entrar");
    if (motivation.trim().length < 20) return toast.error("Explique sua motivação com mais detalhes");
    const { error } = await supabase.rpc("submit_coach_application" as never, { _motivation: motivation, _experience: experience || null, _city: city || null, _phone: phone || null, _selected_upline_coach_id: selectedCoach.id } as never);
    if (error) toast.error(error.message);
    else { toast.success("Solicitação enviada para análise"); await load(); }
  };

  return <div className="flex flex-col gap-4 p-4 pb-6">
    <header className="flex items-center gap-3 pt-2"><Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5"><ChevronLeft className="h-5 w-5 text-white" /></Link><div><p className="text-xs text-white/40 uppercase tracking-wider">Formação</p><h1 className="text-2xl font-bold text-white">Quero ser Coach</h1></div></header>
    <section className="rounded-3xl border border-primary/20 bg-primary/10 p-5"><div className="mb-4 flex items-start gap-3"><div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary text-primary-foreground"><GraduationCap className="h-6 w-6" /></div><div><h2 className="text-base font-bold text-white">Trilha oficial FitMind Club</h2><p className="mt-1 text-xs leading-relaxed text-white/60">Conclua os módulos obrigatórios, envie sua solicitação e aguarde a aprovação administrativa.</p></div></div><Progress value={percentage} className="h-2 bg-white/10" /><div className="mt-2 flex justify-between text-[11px] text-white/50"><span>{requiredDone}/{requiredTotal} módulos</span><span>{percentage}% concluído</span></div></section>
    {loading ? <div className="rounded-2xl p-10 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />Carregando curso...</div> : <>
      <section className="space-y-3">{modules.map((module, index) => { const done = completedIds.has(module.id); return <article key={module.id} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="flex items-start gap-3"><div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-xl ${done ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/50"}`}>{done ? <CheckCircle2 className="h-5 w-5" /> : index + 1}</div><div className="min-w-0 flex-1"><h2 className="text-sm font-bold text-white">{module.title}</h2><p className="mt-1 text-xs leading-relaxed text-white/55">{module.description}</p><div className="mt-3 flex flex-wrap items-center gap-2 text-[10px] text-white/40"><span className="inline-flex items-center gap-1"><Clock className="h-3 w-3" /> {module.duration_minutes || 10} min</span>{module.is_required !== false && <span className="rounded-full bg-primary/15 px-2 py-0.5 font-bold text-primary">obrigatório</span>}</div></div></div><div className="mt-3 grid grid-cols-2 gap-2"><a href={module.video_url || "#"} target="_blank" rel="noreferrer" className="rounded-xl bg-white/5 px-3 py-2 text-center text-xs font-bold text-white">Assistir aula</a><Button onClick={() => completeModule(module.id)} disabled={done} size="sm" className="rounded-xl">{done ? "Concluído" : "Marcar concluído"}</Button></div></article>; })}</section>
      <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="mb-3 flex items-center gap-2"><ShieldCheck className="h-5 w-5 text-primary" /><h2 className="font-bold text-white">Solicitação para Coach</h2></div>{application ? <div className="rounded-xl bg-white/5 p-3"><p className="text-sm font-bold text-white">Status: <span className="text-primary">{application.status}</span></p><p className="mt-1 text-xs text-white/50">Enviada em {application.created_at ? new Date(application.created_at).toLocaleDateString("pt-BR") : "—"}</p>{application.admin_notes && <p className="mt-2 text-xs text-white/65">{application.admin_notes}</p>}</div> : <div className="space-y-3"><CoachSelector value={selectedCoach} onChange={setSelectedCoach} label="Coach da rede onde vou entrar *" /><textarea value={motivation} onChange={(e) => setMotivation(e.target.value)} placeholder="Por que você quer se tornar Coach FitMind Club?" rows={4} className="field-control" /><textarea value={experience} onChange={(e) => setExperience(e.target.value)} placeholder="Conte sua experiência com treinos, vendas ou acompanhamento de pessoas" rows={3} className="field-control" /><div className="grid grid-cols-2 gap-2"><input value={city} onChange={(e) => setCity(e.target.value)} placeholder="Cidade" className="field-control" /><input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="WhatsApp" className="field-control" /></div><Button onClick={submitApplication} disabled={percentage < 100} className="w-full gap-2"><Send className="h-4 w-4" /> Enviar solicitação</Button></div>}</section>
    </>}
  </div>;
}
