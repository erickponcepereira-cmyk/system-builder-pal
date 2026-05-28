// src/routes/student.challenge.tsx
// SUBSTITUI o arquivo existente completamente

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Trophy, Scale, Calendar, AlertCircle, CheckCircle2,
  Clock, Loader2, Lock, Star, ChevronRight
} from "lucide-react";

export const Route = createFileRoute("/student/challenge")({
  component: StudentChallengePage,
});

type Enrollment = {
  id: string;
  status: string;
  gender: string;
  initial_date: string | null;
  initial_weight: number | null;
  final_date: string | null;
  final_weight: number | null;
  result_kg: number | null;
  result_pct: number | null;
  group: {
    group_number: number;
    initial_start_date: string;
    initial_end_date: string;
    final_weigh_in_date: string;
    award_date: string | null;
  };
  competition: { month: number; year: number; prize_amount: number };
};

type HallEntry = {
  id: string;
  gender: string;
  initial_weight: number;
  final_weight: number;
  result_kg: number;
  result_pct: number;
  prize_amount: number;
  prize_paid: boolean;
  created_at: string;
  student: { profile: { name: string } };
  coach: { profile: { name: string } };
  competition: { month: number; year: number };
};

type Appointment = {
  id: string; type: string; requested_date: string;
  requested_time: string; status: string;
};

const MONTHS = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho",
                 "Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const fmt = (d: string) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR") : "—";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const statusInfo: Record<string, { label: string; color: string; icon: any }> = {
  enrolled:           { label: "Inscrito — Agende sua pesagem inicial",   color: "text-yellow-400", icon: Clock },
  scheduled_initial:  { label: "Pesagem inicial agendada",                 color: "text-blue-400",   icon: Calendar },
  weighed_initial:    { label: "Pesagem inicial realizada ✓",              color: "text-green-400",  icon: CheckCircle2 },
  scheduled_final:    { label: "Pesagem final agendada",                   color: "text-orange-400", icon: Calendar },
  weighed_final:      { label: "Pesagem final realizada — Aguardando resultado", color: "text-primary", icon: Trophy },
};

export default function StudentChallengePage() {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [hallOfFame, setHallOfFame] = useState<HallEntry[]>([]);
  const [activeTab, setActiveTab] = useState<"challenge" | "hall">("challenge");
  // Scheduling
  const [scheduleModal, setScheduleModal] = useState<"initial" | "final" | null>(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("09:00");
  const [scheduling, setScheduling] = useState(false);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;

      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
      if (!profile) return;

      const { data: student } = await supabase
        .from("students" as never)
        .select("id, coach_id")
        .eq("profile_id" as never, profile.id)
        .maybeSingle();
      if (!student) return;
      setStudentId((student as any).id);
      setCoachId((student as any).coach_id);

      // Verifica se tem acesso via produto comprado com has_challenge_access
      const { data: txs } = await supabase
        .from("transactions" as never)
        .select("product_id")
        .eq("student_id" as never, (student as any).id)
        .eq("status" as never, "paid");
      const productIds = ((txs as any[]) || []).map((t: any) => t.product_id).filter(Boolean);
      let access = false;
      if (productIds.length > 0) {
        const { data: prods } = await supabase
          .from("products" as never)
          .select("id")
          .in("id" as never, productIds)
          .eq("has_challenge_access" as never, true);
        access = ((prods as any[]) || []).length > 0;
      }

      // Também verifica se já está inscrito (admin pode inscrever manualmente)
      const { data: enroll } = await supabase
        .from("competition_enrollments" as never)
        .select(`
          id, status, gender, initial_date, initial_weight,
          final_date, final_weight, result_kg, result_pct,
          group:group_id (
            group_number, initial_start_date, initial_end_date,
            final_weigh_in_date, award_date
          ),
          competition:competition_id ( month, year, prize_amount )
        `)
        .eq("student_id" as never, (student as any).id)
        .order("enrolled_at" as never, { ascending: false })
        .limit(1)
        .maybeSingle();

      if (enroll) { access = true; setEnrollment(enroll as any); }
      setHasAccess(access);

      // Agendamentos
      if (enroll) {
        const { data: appts } = await supabase
          .from("competition_appointments" as never)
          .select("id, type, requested_date, requested_time, status")
          .eq("enrollment_id" as never, (enroll as any).id)
          .order("created_at" as never, { ascending: false });
        setAppointments((appts as any[]) || []);
      }

      // Hall da Fama (público)
      const { data: hall } = await supabase
        .from("competition_hall_of_fame" as never)
        .select(`
          id, gender, initial_weight, final_weight, result_kg, result_pct,
          prize_amount, prize_paid, created_at,
          student:student_id ( profile:profile_id ( name ) ),
          coach:coach_id ( profile:profile_id ( name ) ),
          competition:competition_id ( month, year )
        `)
        .order("created_at" as never, { ascending: false })
        .limit(20);
      setHallOfFame((hall as any[]) || []);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const scheduleAppointment = async () => {
    if (!schedDate || !schedTime || !enrollment || !studentId || !coachId) return;
    setScheduling(true);
    try {
      const type = scheduleModal!;
      await supabase.from("competition_appointments" as never).insert({
        enrollment_id: enrollment.id,
        student_id: studentId,
        coach_id: coachId,
        type,
        requested_date: schedDate,
        requested_time: schedTime,
        status: "pending",
      } as never);
      // Atualiza status da inscrição
      const newStatus = type === "initial" ? "scheduled_initial" : "scheduled_final";
      await supabase
        .from("competition_enrollments" as never)
        .update({ status: newStatus } as never)
        .eq("id" as never, enrollment.id);
      // Notifica o coach
      const { data: coachProfile } = await supabase
        .from("coaches" as never)
        .select("profile_id")
        .eq("id" as never, coachId)
        .maybeSingle();
      if (coachProfile) {
        const { data: studentProfile } = await supabase
          .from("students" as never)
          .select("profile:profile_id(name)")
          .eq("id" as never, studentId)
          .maybeSingle();
        await supabase.from("notifications" as never).insert({
          profile_id: (coachProfile as any).profile_id,
          type: "competition_appointment_request",
          title: `⚖️ Solicitação de Pesagem ${type === "initial" ? "Inicial" : "Final"}`,
          message: `${(studentProfile as any)?.profile?.name || "Aluno"} quer agendar pesagem ${type === "initial" ? "inicial" : "final"} para ${fmt(schedDate)} às ${schedTime}.`,
          action_url: "/coach",
        } as never);
      }
      toast.success("Agendamento solicitado! Aguardando confirmação do coach.");
      setScheduleModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao agendar");
    } finally { setScheduling(false); }
  };

  // Calcula dias até a pesagem final
  const daysUntilFinal = enrollment?.initial_date
    ? Math.ceil((new Date(enrollment.final_date + "T12:00:00").getTime() - Date.now()) / 86400000)
    : null;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  return (
    <div className="max-w-lg mx-auto px-4 pb-24 space-y-4">
      {/* Tabs */}
      <div className="grid grid-cols-2 gap-2 pt-4">
        {(["challenge","hall"] as const).map(t => (
          <button key={t} onClick={() => setActiveTab(t)}
            className={`rounded-lg py-2 text-sm font-bold ${activeTab === t ? "bg-primary text-primary-foreground" : "bg-muted text-muted-foreground"}`}>
            {t === "challenge" ? "🏋️ Meu Desafio" : "🏆 Hall da Fama"}
          </button>
        ))}
      </div>

      {/* ── TAB: Meu Desafio ── */}
      {activeTab === "challenge" && (
        <>
          {!hasAccess ? (
            /* Sem acesso */
            <div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="font-bold text-foreground">Desafio Indisponível</p>
              <p className="text-sm text-muted-foreground">
                O Desafio FitMind está disponível para alunos com planos específicos.
                Fale com seu coach para participar!
              </p>
            </div>

          ) : !enrollment ? (
            /* Tem acesso mas não está inscrito */
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
              <Trophy className="h-12 w-12 text-primary mx-auto" />
              <p className="font-bold text-foreground">Você tem acesso ao Desafio!</p>
              <p className="text-sm text-muted-foreground">
                Sua inscrição será feita automaticamente na próxima competição ativa,
                ou peça ao seu coach para te inscrever manualmente.
              </p>
            </div>
          ) : (
            <>
              {/* Card principal da competição */}
              <div className="rounded-2xl border border-border bg-card p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-xs text-muted-foreground">Competição</p>
                    <p className="text-lg font-bold text-foreground">
                      {MONTHS[enrollment.competition.month]} {enrollment.competition.year}
                    </p>
                    <p className="text-xs text-muted-foreground">
                      Turma {enrollment.group.group_number}
                    </p>
                  </div>
                  <div className="text-right">
                    <p className="text-xs text-muted-foreground">Prêmio</p>
                    <p className="text-lg font-bold text-primary">{money(enrollment.competition.prize_amount)}</p>
                    <p className="text-xs text-muted-foreground">por gênero</p>
                  </div>
                </div>

                {/* Status */}
                {(() => {
                  const info = statusInfo[enrollment.status] || { label: enrollment.status, color: "text-muted-foreground", icon: Clock };
                  const Icon = info.icon;
                  return (
                    <div className={`flex items-center gap-2 rounded-lg bg-muted/30 px-3 py-2`}>
                      <Icon className={`h-4 w-4 ${info.color}`} />
                      <span className={`text-sm font-bold ${info.color}`}>{info.label}</span>
                    </div>
                  );
                })()}

                {/* Alerta de pesagem final próxima */}
                {daysUntilFinal !== null && daysUntilFinal <= 7 && daysUntilFinal > 0 && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/30 px-3 py-2 animate-pulse">
                    <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-red-400">
                      ⚠️ Pesagem final em {daysUntilFinal} dia{daysUntilFinal !== 1 ? "s" : ""}! Não perca o prazo.
                    </span>
                  </div>
                )}
                {daysUntilFinal !== null && daysUntilFinal <= 0 && enrollment.status !== "weighed_final" && (
                  <div className="flex items-center gap-2 rounded-lg bg-red-500/10 border border-red-500/40 px-3 py-2">
                    <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0" />
                    <span className="text-sm font-bold text-red-400">
                      Prazo da pesagem final esgotado! Fale com seu coach.
                    </span>
                  </div>
                )}

                {/* Datas */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">Janela de Pesagem Inicial</p>
                    <p className="text-sm font-bold text-foreground">
                      {fmt(enrollment.group.initial_start_date)} – {fmt(enrollment.group.initial_end_date)}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 ${daysUntilFinal !== null && daysUntilFinal <= 7 && daysUntilFinal > 0 ? "bg-red-500/10 border border-red-500/30" : "bg-muted/30"}`}>
                    <p className="text-xs text-muted-foreground mb-1">Sua Pesagem Final</p>
                    <p className={`text-sm font-bold ${daysUntilFinal !== null && daysUntilFinal <= 7 && daysUntilFinal > 0 ? "text-red-400" : "text-foreground"}`}>
                      {enrollment.final_date ? fmt(enrollment.final_date) : "Após pesagem inicial"}
                    </p>
                  </div>
                </div>
                {(enrollment.initial_weight || enrollment.final_weight) && (
                  <div className="grid grid-cols-3 gap-3 pt-2 border-t border-border">
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Peso Inicial</p>
                      <p className="text-lg font-bold text-foreground">{enrollment.initial_weight ?? "—"} kg</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Peso Final</p>
                      <p className="text-lg font-bold text-foreground">{enrollment.final_weight ?? "—"} kg</p>
                    </div>
                    <div className="text-center">
                      <p className="text-xs text-muted-foreground">Variação</p>
                      {enrollment.result_kg != null ? (
                        <p className={`text-lg font-bold ${enrollment.result_kg > 0 ? "text-green-400" : enrollment.result_kg < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                          {enrollment.result_kg > 0 ? "−" : enrollment.result_kg < 0 ? "+" : ""}{Math.abs(enrollment.result_kg)} kg
                        </p>
                      ) : <p className="text-lg font-bold text-muted-foreground">—</p>}
                    </div>
                  </div>
                )}


              </div>

              {/* Botão de agendar */}
              {enrollment.status === "enrolled" && (
                <button onClick={() => { setSchedDate(""); setScheduleModal("initial"); }}
                  className="w-full flex items-center justify-between rounded-2xl bg-primary p-4 text-left">
                  <div>
                    <p className="font-bold text-primary-foreground">Agendar Pesagem Inicial</p>
                    <p className="text-xs text-primary-foreground/70">
                      Disponível de {fmt(enrollment.group.initial_start_date)} a {fmt(enrollment.group.initial_end_date)}
                    </p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-primary-foreground" />
                </button>
              )}

              {enrollment.status === "weighed_initial" && (
                <button onClick={() => { setSchedDate(""); setScheduleModal("final"); }}
                  className="w-full flex items-center justify-between rounded-2xl bg-orange-500 p-4 text-left">
                  <div>
                    <p className="font-bold text-white">Agendar Pesagem Final</p>
                    <p className="text-xs text-white/70">Prazo: {enrollment.final_date ? fmt(enrollment.final_date) : "—"}</p>
                  </div>
                  <ChevronRight className="h-5 w-5 text-white" />
                </button>
              )}

              {/* Agendamentos */}
              {appointments.length > 0 && (
                <div className="rounded-2xl border border-border bg-card p-4 space-y-3">
                  <p className="text-sm font-bold text-foreground">Seus Agendamentos</p>
                  {appointments.map(appt => (
                    <div key={appt.id} className="flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                      <div>
                        <p className="text-xs font-bold text-foreground capitalize">
                          Pesagem {appt.type === "initial" ? "Inicial" : "Final"}
                        </p>
                        <p className="text-xs text-muted-foreground">
                          {fmt(appt.requested_date)} às {appt.requested_time.slice(0, 5)}
                        </p>
                      </div>
                      <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                        appt.status === "confirmed" ? "bg-green-500/10 text-green-400" :
                        appt.status === "completed" ? "bg-blue-500/10 text-blue-400" :
                        appt.status === "cancelled" ? "bg-red-500/10 text-red-400" :
                        "bg-yellow-500/10 text-yellow-400"
                      }`}>
                        {appt.status === "pending" ? "Aguardando" :
                         appt.status === "confirmed" ? "Confirmado" :
                         appt.status === "completed" ? "Realizado" : "Cancelado"}
                      </span>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </>
      )}

      {/* ── TAB: Hall da Fama ── */}
      {activeTab === "hall" && (
        <div className="space-y-3">
          <div className="flex items-center gap-2 py-2">
            <Star className="h-5 w-5 text-yellow-400" />
            <h2 className="font-bold text-foreground">Campeões FitMind</h2>
          </div>
          {hallOfFame.length === 0 ? (
            <div className="rounded-2xl border border-border bg-card p-8 text-center">
              <Trophy className="h-10 w-10 text-muted-foreground mx-auto mb-2" />
              <p className="text-muted-foreground text-sm">Nenhum campeão ainda. Seja o primeiro!</p>
            </div>
          ) : hallOfFame.map((entry, i) => (
            <div key={entry.id} className="rounded-2xl border border-border bg-card p-4">
              <div className="flex items-center gap-3">
                <div className={`flex h-10 w-10 items-center justify-center rounded-full font-bold text-lg ${
                  i === 0 ? "bg-yellow-400/20 text-yellow-400" :
                  i === 1 ? "bg-gray-400/20 text-gray-400" :
                  "bg-orange-400/20 text-orange-400"
                }`}>
                  {i === 0 ? "🥇" : i === 1 ? "🥈" : "🥉"}
                </div>
                <div className="flex-1">
                  <p className="font-bold text-foreground">{(entry.student as any)?.profile?.name || "—"}</p>
                  <p className="text-xs text-muted-foreground">
                    Coach: {(entry.coach as any)?.profile?.name || "—"} · {MONTHS[(entry.competition as any)?.month]} {(entry.competition as any)?.year}
                  </p>
                </div>
                <div className="text-right">
                  <p className={`text-lg font-bold ${entry.result_kg > 0 ? "text-green-400" : "text-red-400"}`}>
                    {entry.result_kg > 0 ? "−" : "+"}{Math.abs(entry.result_pct)}%
                  </p>
                  <p className="text-xs text-muted-foreground">
                    {entry.result_kg > 0 ? "−" : "+"}{Math.abs(entry.result_kg)} kg
                  </p>
                </div>

              </div>
              <div className="mt-3 flex items-center justify-between rounded-lg bg-muted/30 px-3 py-2">
                <span className="text-xs text-muted-foreground">
                  {entry.initial_weight} kg → {entry.final_weight} kg
                </span>
                <span className={`text-xs font-bold rounded-full px-2 py-0.5 ${
                  entry.gender === "M" ? "bg-blue-500/20 text-blue-400" : "bg-pink-500/20 text-pink-400"
                }`}>
                  {entry.gender === "M" ? "Masculino" : "Feminino"}
                </span>
                <span className={`text-xs font-bold ${entry.prize_paid ? "text-green-400" : "text-yellow-400"}`}>
                  {money(entry.prize_amount)} {entry.prize_paid ? "✓ Pago" : "Pendente"}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal: Agendar Pesagem */}
      {scheduleModal && enrollment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4 overflow-y-auto">
          <div className="w-full max-w-sm rounded-2xl border border-border bg-card p-6 space-y-4 my-auto max-h-[90vh] overflow-y-auto">
            <div className="flex items-center gap-2">
              <Scale className="h-5 w-5 text-primary" />
              <h3 className="font-bold text-foreground">
                Agendar Pesagem {scheduleModal === "initial" ? "Inicial" : "Final"}
              </h3>
            </div>
            {scheduleModal === "initial" && (
              <p className="text-xs text-muted-foreground rounded-lg bg-muted/30 px-3 py-2">
                Escolha uma data entre {fmt(enrollment.group.initial_start_date)} e {fmt(enrollment.group.initial_end_date)}.
              </p>
            )}
            {scheduleModal === "final" && enrollment.final_date && (
              <p className="text-xs text-muted-foreground rounded-lg bg-orange-500/10 px-3 py-2">
                Sua pesagem final deve ser até {fmt(enrollment.final_date)}.
              </p>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <input type="date" value={schedDate}
                min={scheduleModal === "initial" ? enrollment.group.initial_start_date : undefined}
                max={scheduleModal === "initial" ? enrollment.group.initial_end_date : enrollment.final_date || undefined}
                onChange={e => setSchedDate(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div>
              <label className="text-xs text-muted-foreground">Horário</label>
              <input type="time" value={schedTime} onChange={e => setSchedTime(e.target.value)}
                className="mt-1 w-full rounded-lg bg-muted px-3 py-2 text-sm text-foreground" />
            </div>
            <div className="flex gap-3">
              <button onClick={() => setScheduleModal(null)} className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={scheduleAppointment} disabled={scheduling || !schedDate}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {scheduling ? <Loader2 className="h-4 w-4 animate-spin" /> : <Calendar className="h-4 w-4" />}
                Solicitar
              </button>
            </div>
          </div>
        </div>
      )}

    </div>
  );
}
