import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Trophy, Calendar, Scale, Camera, TrendingDown, Award, CheckCircle2, Circle, Medal, Loader2 } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/challenge")({ component: ChallengePage });

type AttendanceRow = { id: string; log_date: string; activity_type: string | null; attended: boolean | null };
type BioRow = { weight: number | null; body_fat_percentage: number | null; muscle_mass: number | null; evaluation_date: string };
type RankRow = { ranking_position: number | null; total_revenue: number | null; total_students: number | null };
const attendanceDays = Array.from({ length: 30 }, (_, index) => index + 1);

function ChallengePage() {
  const [attendance, setAttendance] = useState<AttendanceRow[]>([]);
  const [bio, setBio] = useState<BioRow[]>([]);
  const [ranking, setRanking] = useState<RankRow | null>(null);
  const [loading, setLoading] = useState(true);
  const [checking, setChecking] = useState(false);
  const load = async () => {
    setLoading(true);
    const { data: userData } = await supabase.auth.getUser();
    const { data: profile } = userData.user ? await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle() : { data: null };
    const { data: student } = profile?.id ? await supabase.from("students").select("id,coach_id").eq("profile_id", profile.id).maybeSingle() : { data: null };
    if (student?.id) {
      const [logs, evals, rank] = await Promise.all([
        supabase.from("attendance_logs").select("id,log_date,activity_type,attended").eq("student_id", student.id).gte("log_date", new Date(Date.now() - 29 * 86400000).toISOString().slice(0, 10)).order("log_date"),
        supabase.from("bioimpedance_evaluations").select("weight,body_fat_percentage,muscle_mass,evaluation_date").eq("student_id", student.id).order("evaluation_date", { ascending: true }),
        student.coach_id ? supabase.from("monthly_rankings").select("ranking_position,total_revenue,total_students").eq("coach_id", student.coach_id).order("reference_month", { ascending: false }).limit(1).maybeSingle() : Promise.resolve({ data: null }),
      ]);
      setAttendance((logs.data as AttendanceRow[]) || []);
      setBio((evals.data as BioRow[]) || []);
      setRanking((rank.data as RankRow) || null);
    }
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const today = new Date().toISOString().slice(0, 10);
  const checkedToday = attendance.some((row) => row.log_date === today && row.attended);
  const attendedDays = new Set(attendance.filter((row) => row.attended).map((row) => row.log_date)).size;
  const percentage = Math.min(100, Math.round((attendedDays / 30) * 100));
  const initial = bio[0];
  const latest = bio[bio.length - 1];
  const weightDiff = initial?.weight && latest?.weight ? latest.weight - initial.weight : null;
  const performance = percentage >= 85 ? "A+" : percentage >= 70 ? "A" : percentage >= 50 ? "B" : "C";
  const dateMap = useMemo(() => {
    const map = new Map<number, boolean>();
    attendanceDays.forEach((day) => {
      const d = new Date();
      d.setDate(d.getDate() - (30 - day));
      map.set(day, attendance.some((row) => row.log_date === d.toISOString().slice(0, 10) && row.attended));
    });
    return map;
  }, [attendance]);

  const checkIn = async () => {
    setChecking(true);
    const { error } = await supabase.rpc("student_check_in" as never, { _activity_type: "challenge", _notes: "Check-in feito pelo aluno" } as never);
    if (error) toast.error(error.message);
    else { toast.success("Presença registrada hoje!"); await load(); }
    setChecking(false);
  };

  return <div className="flex flex-col gap-4 p-4 pb-6">
    <header className="pt-2"><p className="text-xs text-white/40 uppercase tracking-wider">Meu Desafio</p><h1 className="text-2xl font-bold text-white">30 Dias Premium</h1></header>
    <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">{["Visão Geral", "Aulas", "Evolução", "Frequência", "Premiação"].map((t, i) => <button key={t} className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${i === 0 ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:text-white"}`}>{t}</button>)}</div>
    {loading ? <div className="rounded-2xl p-8 text-center text-white/50" style={{ backgroundColor: "#1A1A1A" }}><Loader2 className="mx-auto mb-2 h-5 w-5 animate-spin text-primary" />Carregando desafio...</div> : <>
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}><div className="flex items-center justify-between mb-2"><span className="text-xs text-white/50">Progresso geral</span><span className="text-sm font-bold text-primary">{percentage}%</span></div><Progress value={percentage} className="h-2 bg-white/5" /><div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-white/5"><div><p className="text-lg font-bold text-white">{attendedDays}</p><p className="text-[10px] text-white/40">Dias feitos</p></div><div><p className="text-lg font-bold text-white">{Math.max(0, 30 - attendedDays)}</p><p className="text-[10px] text-white/40">Restantes</p></div><div><p className="text-lg font-bold text-primary">{performance}</p><p className="text-[10px] text-white/40">Performance</p></div></div></div>
      <button onClick={checkIn} disabled={checking || checkedToday} className="flex items-center justify-center gap-2 rounded-2xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-60">{checking ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}{checkedToday ? "Check-in de hoje feito" : "Registrar presença de hoje"}</button>
      <div className="grid grid-cols-2 gap-3"><div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="flex items-center justify-between mb-2"><Scale className="h-4 w-4 text-primary" /><TrendingDown className="h-4 w-4 text-emerald-400" /></div><p className="text-xl font-bold text-white">{latest?.weight ? `${latest.weight} kg` : "—"}</p><p className="text-[10px] text-white/40 mt-0.5">{weightDiff === null ? "sem comparativo" : `${weightDiff > 0 ? "+" : ""}${weightDiff.toFixed(1)} kg desde o início`}</p></div><div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="flex items-center justify-between mb-2"><Trophy className="h-4 w-4 text-primary" /><Award className="h-4 w-4 text-amber-400" /></div><p className="text-xl font-bold text-white">{ranking?.ranking_position ? `${ranking.ranking_position}º` : "—"}</p><p className="text-[10px] text-white/40 mt-0.5">ranking do coach</p></div></div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="mb-3 flex items-center justify-between"><div><h2 className="text-sm font-bold text-white">Frequência</h2><p className="text-[11px] text-white/40">{attendedDays}/30 check-ins ({percentage}%)</p></div><span className="rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary">{percentage}%</span></div><div className="grid grid-cols-10 gap-1.5">{attendanceDays.map((day) => { const attended = dateMap.get(day); return <div key={day} className={`flex aspect-square items-center justify-center rounded-full text-[9px] ${attended ? "bg-primary text-primary-foreground" : "border border-white/10 text-white/40"}`}>{attended ? <CheckCircle2 className="h-3 w-3" /> : <Circle className="h-3 w-3" />}</div>; })}</div></div>
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}><div className="mb-4 flex items-center justify-between"><div><h2 className="text-sm font-bold text-white">Ranking por categoria</h2><p className="text-[11px] text-white/40">Baseado nas avaliações e presença reais</p></div><Medal className="h-5 w-5 text-primary" /></div><div className="grid grid-cols-3 gap-2 text-center"><Metric label="Gordura" value={latest?.body_fat_percentage ? `${latest.body_fat_percentage}%` : "—"} /><Metric label="Músculo" value={latest?.muscle_mass ? `${latest.muscle_mass} kg` : "—"} /><Metric label="Presença" value={`${percentage}%`} /></div></div>
    </>}
    <div><h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Próximas atividades</h2><div className="space-y-2">{[{ icon: Calendar, title: "Aula do desafio", to: "/student/group" }, { icon: Scale, title: "Pesagem semanal", to: "/student/health" }, { icon: Camera, title: "Foto de evolução", to: "/student/evolution" }].map((it) => <a key={it.title} href={it.to} className="flex items-center gap-3 rounded-2xl p-3" style={{ backgroundColor: "#1A1A1A" }}><div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15"><it.icon className="h-4 w-4 text-primary" /></div><div className="flex-1"><p className="text-sm font-medium text-white">{it.title}</p><p className="text-[11px] text-white/40">Acessar agora</p></div></a>)}</div></div>
  </div>;
}

function Metric({ label, value }: { label: string; value: string }) {
  return <div className="rounded-xl bg-white/5 p-3"><p className="text-sm font-bold text-white">{value}</p><p className="text-[10px] text-white/40">{label}</p></div>;
}
