// src/routes/student.challenge.tsx
// SUBSTITUI o arquivo existente completamente

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  Trophy, Scale, Calendar, AlertCircle, CheckCircle2,
  Clock, Loader2, Lock, ChevronRight, Coins
} from "lucide-react";
import { HallOfFame } from "@/components/HallOfFame";
import { useServerFn } from "@tanstack/react-start";
import { getMyChallengeTokens, joinChallengeWithToken, type ChallengeTokenSummary, type CurrentTurma } from "@/lib/challenge-tokens.functions";
import { recordTermsAcceptance } from "@/lib/terms-acceptance.functions";
import { TERMS_VERSION } from "@/lib/terms";
import { ChallengeTicketAcceptModal } from "@/components/challenge/ChallengeTicketAcceptModal";


export const Route = createFileRoute("/_authenticated/student/challenge")({
  component: StudentChallengePage,
});

type Enrollment = {
  id: string;
  status: string;
  gender: string;
  initial_date: string | null;
  initial_weight: number | null;
  initial_body_fat: number | null;
  initial_muscle_mass: number | null;
  final_date: string | null;
  final_weight: number | null;
  final_body_fat: number | null;
  final_muscle_mass: number | null;
  result_kg: number | null;
  result_pct: number | null;
  competition_id: string;
  group: {
    group_number: number;
    initial_start_date: string;
    initial_end_date: string;
    final_weigh_in_date: string;
    award_date: string | null;
  };
  competition: { month: number; year: number; prize_amount: number };
};

type HallWinner = { student_id: string; gender: string };





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

function StudentChallengePage() {
  const [loading, setLoading] = useState(true);
  const [hasAccess, setHasAccess] = useState(false);
  const [enrollment, setEnrollment] = useState<Enrollment | null>(null);
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [winners, setWinners] = useState<HallWinner[]>([]);
  const [activeTab, setActiveTab] = useState<"challenge" | "hall">("challenge");

  // Scheduling
  const [scheduleModal, setScheduleModal] = useState<"initial" | "final" | null>(null);
  const [schedDate, setSchedDate] = useState("");
  const [schedTime, setSchedTime] = useState("09:00");
  const [scheduling, setScheduling] = useState(false);

  const [studentId, setStudentId] = useState<string | null>(null);
  const [coachId, setCoachId] = useState<string | null>(null);

  // Tokens de desafio
  const [tokens, setTokens] = useState<ChallengeTokenSummary | null>(null);
  const [confirmTurma, setConfirmTurma] = useState<CurrentTurma | null>(null);
  const [joining, setJoining] = useState(false);
  const fetchTokens = useServerFn(getMyChallengeTokens);
  const doJoin = useServerFn(joinChallengeWithToken);
  const doRecordAcceptance = useServerFn(recordTermsAcceptance);
  const [acceptTicketOpen, setAcceptTicketOpen] = useState(false);




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
      let access = false;
      try {
        const { data: txs } = await supabase
          .from("transactions" as never)
          .select("product_id")
          .eq("student_id" as never, (student as any).id)
          .eq("status" as never, "paid");
        const productIds = ((txs as any[]) || []).map((t: any) => t.product_id).filter(Boolean);
        if (productIds.length > 0) {
          const { data: prods } = await supabase
            .from("products" as never)
            .select("id")
            .in("id" as never, productIds)
            .eq("has_challenge_access" as never, true);
          access = ((prods as any[]) || []).length > 0;
        }
      } catch (e) { console.warn("access check failed", e); }

      // Também verifica se já está inscrito (admin pode inscrever manualmente)
      const { data: enroll, error: enrollErr } = await supabase
        .from("competition_enrollments" as never)
        .select(`
          id, status, gender, initial_date, initial_weight, initial_body_fat, initial_muscle_mass,
          final_date, final_weight, final_body_fat, final_muscle_mass, result_kg, result_pct, competition_id,
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


      if (enrollErr) console.warn("enroll fetch error", enrollErr);
      if (enroll && (enroll as any).group && (enroll as any).competition) {
        access = true;
        setEnrollment(enroll as any);
        // Agendamentos
        try {
          const { data: appts } = await supabase
            .from("competition_appointments" as never)
            .select("id, type, requested_date, requested_time, status")
            .eq("enrollment_id" as never, (enroll as any).id)
            .order("created_at" as never, { ascending: false });
          setAppointments((appts as any[]) || []);
        } catch (e) { console.warn("appts fetch failed", e); setAppointments([]); }
        // Winners do Hall da Fama para esta competição
        try {
          const { data: hof } = await supabase
            .from("competition_hall_of_fame" as never)
            .select("student_id, gender")
            .eq("competition_id" as never, (enroll as any).competition_id);
          setWinners(((hof as any[]) || []) as HallWinner[]);
        } catch (e) { console.warn("hof fetch failed", e); setWinners([]); }
      } else {
        setEnrollment(null);
        setAppointments([]);
        setWinners([]);
      }

      setHasAccess(access);
    } catch (e) {
      console.error("Erro ao carregar desafio:", e);
    } finally {
      setLoading(false);
    }
  };

  const loadTokens = async () => {
    try { setTokens(await fetchTokens()); } catch (e) { console.warn("tokens fetch failed", e); }
  };

  useEffect(() => { load(); loadTokens(); }, []);

  const handleJoin = async () => {
    if (!confirmTurma) return;
    setJoining(true);
    try {
      const res = await doJoin({ data: { competitionId: confirmTurma.competitionId } });
      if (!res.ok) { toast.error(res.error); return; }
      toast.success(`Inscrição confirmada em ${res.turma.competitionLabel} — Turma ${res.turma.groupNumber}!`);
      setConfirmTurma(null);
      await Promise.all([load(), loadTokens()]);
    } catch (e: any) {
      toast.error(e?.message || "Erro ao entrar no desafio");
    } finally {
      setJoining(false);
    }
  };


  const scheduleAppointment = async () => {
    if (!schedDate || !schedTime || !enrollment || !studentId || !coachId) return;
    const type = scheduleModal!;
    // Validação de janela
    if (type === "initial") {
      const start = enrollment.group.initial_start_date;
      const end = enrollment.group.initial_end_date;
      if (schedDate < start || schedDate > end) {
        toast.error(`A pesagem inicial só pode ser agendada entre ${fmt(start)} e ${fmt(end)}.`);
        return;
      }
    }
    if (type === "final") {
      const finalDay = enrollment.group.final_weigh_in_date;
      if (!finalDay) {
        toast.error("Data da pesagem final ainda não definida pelo desafio.");
        return;
      }
      if (schedDate !== finalDay) {
        toast.error(`A pesagem final só pode ser agendada no dia ${fmt(finalDay)}.`);
        return;
      }
    }
    setScheduling(true);
    try {
      const { error: apptErr } = await supabase.from("competition_appointments" as never).insert({
        enrollment_id: enrollment.id,
        student_id: studentId,
        coach_id: coachId,
        type,
        requested_date: schedDate,
        requested_time: schedTime,
        status: "pending",
      } as never);
      if (apptErr) throw apptErr;
      // Atualiza status da inscrição
      const newStatus = type === "initial" ? "scheduled_initial" : "scheduled_final";
      await supabase
        .from("competition_enrollments" as never)
        .update({ status: newStatus } as never)
        .eq("id" as never, enrollment.id);
      // Notifica o coach (best-effort)
      try {
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
      } catch (notifErr) {
        console.warn("Notificação não enviada:", notifErr);
      }
      toast.success("Agendamento solicitado! Aguardando confirmação do coach.");
      setScheduleModal(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao agendar");
    } finally { setScheduling(false); }
  };


  // Calcula dias até a pesagem final
  const daysUntilFinal = enrollment?.group?.final_weigh_in_date
    ? Math.ceil((new Date(enrollment.group.final_weigh_in_date + "T12:00:00").getTime() - Date.now()) / 86400000)
    : null;

  if (loading) {
    return <div className="flex items-center justify-center min-h-[60vh]"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>;
  }

  if (tokens?.blocked) {
    const reasonLabel =
      tokens.blocked.reason === "aluno_profissional" ? "profissional" :
      tokens.blocked.reason === "aluno_coach" ? "coach" : "parceiro";
    return (
      <div className="max-w-lg mx-auto px-4 pb-24 pt-8">
        <div className="rounded-2xl border border-amber-500/40 bg-amber-500/5 p-8 text-center space-y-4">
          <Lock className="h-12 w-12 text-amber-400 mx-auto" />
          <h1 className="text-xl font-bold text-foreground">Desafio indisponível para {reasonLabel}s</h1>
          <p className="text-sm text-muted-foreground">
            O Desafio FitMind é exclusivo para alunos. Como você está cadastrado(a) também como <strong>{reasonLabel}</strong>, não pode participar nem ganhar tickets de desafio por compras.
          </p>
          <p className="text-xs text-muted-foreground">
            Caso entenda que isso é um erro, fale com o administrador.
          </p>
        </div>
      </div>
    );
  }

  // Bioimpedância (pesagem inicial) pendente?
  const initialDone = !!enrollment && ["weighed_initial", "scheduled_final", "weighed_final"].includes(enrollment.status);
  const daysUntilInitialDeadline = enrollment?.group?.initial_end_date
    ? Math.ceil((new Date(enrollment.group.initial_end_date + "T12:00:00").getTime() - Date.now()) / 86400000)
    : null;
  const showInitialDeadlineAlert =
    !!enrollment && !initialDone && daysUntilInitialDeadline !== null && daysUntilInitialDeadline >= 0;


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
          {/* Painel de tickets de desafio */}
          {tokens && (tokens.balance > 0 || tokens.totalEarned > 0) && (
            <div className="rounded-2xl border border-primary/30 bg-primary/5 p-4 space-y-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <Coins className="h-5 w-5 text-primary" />
                  <div>
                    <p className="text-sm font-bold text-foreground">Tickets de Desafio</p>
                    <p className="text-[11px] text-muted-foreground">Cada ticket dá direito a 1 entrada em 1 desafio.</p>
                  </div>
                </div>
                <div className="text-right">
                  <p className="text-2xl font-bold text-primary leading-none">{tokens.balance}</p>
                  <p className="text-[10px] text-muted-foreground">disponíveis</p>
                </div>
              </div>
              {tokens.balance > 0 && tokens.joinableTurmas.length > 0 && (
                <div className="space-y-2">
                  {tokens.joinableTurmas.map((t) => (
                    <button
                      key={t.competitionId}
                      onClick={() => setConfirmTurma(t)}
                      className="w-full rounded-xl bg-primary text-primary-foreground px-4 py-3 text-sm font-bold flex items-center justify-between"
                    >
                      <span>Entrar no desafio — {t.competitionLabel}</span>
                      <ChevronRight className="h-4 w-4" />
                    </button>
                  ))}
                </div>
              )}
              {tokens.balance > 0 && tokens.joinableTurmas.length === 0 && (
                <p className="text-xs text-muted-foreground">
                  Nenhuma turma com janela de pesagem inicial aberta no momento, ou você já está inscrito nas turmas vigentes. Seu ticket fica reservado para a próxima.
                </p>
              )}
            </div>
          )}

          {/* Alerta: bioimpedância pendente */}
          {showInitialDeadlineAlert && (
            <div className="flex items-start gap-2 rounded-xl bg-amber-500/10 border border-amber-500/40 px-3 py-3">
              <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
              <p className="text-xs font-semibold text-amber-300 leading-relaxed">
                ⚠️ Faltam {daysUntilInitialDeadline} dia{daysUntilInitialDeadline !== 1 ? "s" : ""} para o prazo final da sua avaliação (bioimpedância). Caso não realize no prazo indicado não poderá participar do desafio e seu ticket não será reembolsado!
              </p>
            </div>
          )}


          {!hasAccess && !(tokens && tokens.balance > 0) ? (
            /* Sem acesso */
            (<div className="rounded-2xl border border-border bg-card p-8 text-center space-y-3">
              <Lock className="h-12 w-12 text-muted-foreground mx-auto" />
              <p className="font-bold text-foreground">Desafio Indisponível</p>
              <p className="text-sm text-muted-foreground">
                O Desafio FitMind está disponível para alunos com planos específicos.
                Fale com seu coach para participar!
              </p>
            </div>)

          ) : !enrollment ? (
            /* Tem acesso mas não está inscrito */
            (<div className="rounded-2xl border border-primary/30 bg-primary/5 p-6 text-center space-y-3">
              <Trophy className="h-12 w-12 text-primary mx-auto" />
              <p className="font-bold text-foreground">Você tem acesso ao Desafio!</p>
              <p className="text-sm text-muted-foreground">
                {tokens && tokens.balance > 0
                  ? "Use um ticket acima para entrar agora na turma em pesagem inicial."
                  : "Sua inscrição será feita automaticamente na próxima competição ativa, ou peça ao seu coach para te inscrever manualmente."}
              </p>
            </div>)

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
                  const isWinner = !!studentId && winners.some(w => w.student_id === studentId);
                  const hasAnyWinner = winners.length > 0;
                  if (isWinner) {
                    return (
                      <div className="flex items-center gap-2 rounded-lg bg-yellow-500/10 border border-yellow-500/40 px-3 py-2">
                        <Trophy className="h-4 w-4 text-yellow-400" />
                        <span className="text-sm font-bold text-yellow-400">🏆 Você foi consagrado vencedor desta edição!</span>
                      </div>
                    );
                  }
                  if (hasAnyWinner && enrollment.status === "weighed_final") {
                    return (
                      <div className="flex items-center gap-2 rounded-lg bg-muted/30 border border-border px-3 py-2">
                        <Trophy className="h-4 w-4 text-muted-foreground" />
                        <span className="text-sm font-bold text-muted-foreground">
                          Não foi dessa vez. Confira o Hall da Fama para conhecer o vencedor.
                        </span>
                      </div>
                    );
                  }
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

                {/* Datas completas da turma */}
                <div className="grid grid-cols-2 gap-3">
                  <div className="rounded-xl bg-muted/30 p-3">
                    <p className="text-xs text-muted-foreground mb-1">📅 Semana da Pesagem Inicial</p>
                    <p className="text-sm font-bold text-foreground">
                      {fmt(enrollment.group.initial_start_date)} – {fmt(enrollment.group.initial_end_date)}
                    </p>
                  </div>
                  <div className={`rounded-xl p-3 ${daysUntilFinal !== null && daysUntilFinal <= 7 && daysUntilFinal > 0 ? "bg-red-500/10 border border-red-500/30" : "bg-muted/30"}`}>
                    <p className="text-xs text-muted-foreground mb-1">⚖️ Pesagem Final</p>
                    <p className={`text-sm font-bold ${daysUntilFinal !== null && daysUntilFinal <= 7 && daysUntilFinal > 0 ? "text-red-400" : "text-foreground"}`}>
                      {enrollment.final_date ? fmt(enrollment.final_date) : (enrollment.group.final_weigh_in_date ? fmt(enrollment.group.final_weigh_in_date) : "Após pesagem inicial")}
                    </p>
                  </div>
                  <div className="rounded-xl bg-primary/10 border border-primary/30 p-3 col-span-2">
                    <p className="text-xs text-muted-foreground mb-1">🏆 Data da Premiação</p>
                    <p className="text-sm font-bold text-primary">
                      {enrollment.group.award_date ? fmt(enrollment.group.award_date) : "A definir"}
                    </p>
                  </div>
                </div>
                {(enrollment.initial_weight || enrollment.final_weight || enrollment.initial_body_fat || enrollment.final_body_fat || enrollment.initial_muscle_mass || enrollment.final_muscle_mass) && (
                  <div className="pt-2 border-t border-border space-y-2">
                    <div className="grid grid-cols-4 gap-2 text-xs text-center items-center">
                      <div className="text-left text-muted-foreground font-bold">Métrica</div>
                      <div className="text-muted-foreground font-bold">Inicial</div>
                      <div className="text-muted-foreground font-bold">Final</div>
                      <div className="text-muted-foreground font-bold">Variação</div>

                      <div className="text-left text-foreground">Peso</div>
                      <div className="font-bold text-foreground">{enrollment.initial_weight ?? "—"}{enrollment.initial_weight != null ? " kg" : ""}</div>
                      <div className="font-bold text-foreground">{enrollment.final_weight ?? "—"}{enrollment.final_weight != null ? " kg" : ""}</div>
                      <div>
                        {enrollment.result_kg != null ? (
                          <span className={`font-bold ${enrollment.result_kg > 0 ? "text-green-400" : enrollment.result_kg < 0 ? "text-red-400" : "text-muted-foreground"}`}>
                            {enrollment.result_kg > 0 ? "−" : enrollment.result_kg < 0 ? "+" : ""}{Math.abs(enrollment.result_kg)} kg
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>

                      <div className="text-left text-foreground">% Gordura</div>
                      <div className="font-bold text-orange-400">{enrollment.initial_body_fat != null ? `${enrollment.initial_body_fat}%` : "—"}</div>
                      <div className="font-bold text-orange-400">{enrollment.final_body_fat != null ? `${enrollment.final_body_fat}%` : "—"}</div>
                      <div>
                        {enrollment.initial_body_fat != null && enrollment.final_body_fat != null ? (
                          <span className={`font-bold ${enrollment.final_body_fat < enrollment.initial_body_fat ? "text-green-400" : enrollment.final_body_fat > enrollment.initial_body_fat ? "text-red-400" : "text-muted-foreground"}`}>
                            {(enrollment.final_body_fat - enrollment.initial_body_fat).toFixed(1)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>

                      <div className="text-left text-foreground">% Músculo</div>
                      <div className="font-bold text-blue-400">{enrollment.initial_muscle_mass != null ? `${enrollment.initial_muscle_mass}%` : "—"}</div>
                      <div className="font-bold text-blue-400">{enrollment.final_muscle_mass != null ? `${enrollment.final_muscle_mass}%` : "—"}</div>
                      <div>
                        {enrollment.initial_muscle_mass != null && enrollment.final_muscle_mass != null ? (
                          <span className={`font-bold ${enrollment.final_muscle_mass > enrollment.initial_muscle_mass ? "text-green-400" : enrollment.final_muscle_mass < enrollment.initial_muscle_mass ? "text-red-400" : "text-muted-foreground"}`}>
                            {(enrollment.final_muscle_mass - enrollment.initial_muscle_mass).toFixed(1)}%
                          </span>
                        ) : <span className="text-muted-foreground">—</span>}
                      </div>
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
                <button onClick={() => { setSchedDate(enrollment.group.final_weigh_in_date || ""); setScheduleModal("final"); }}
                  className="w-full flex items-center justify-between rounded-2xl bg-orange-500 p-4 text-left">
                  <div>
                    <p className="font-bold text-white">Agendar Pesagem Final</p>
                    <p className="text-xs text-white/70">Dia: {enrollment.group.final_weigh_in_date ? fmt(enrollment.group.final_weigh_in_date) : "—"}</p>
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
      {activeTab === "hall" && <HallOfFame highlightStudentId={studentId || undefined} />}
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
            {scheduleModal === "final" && (
              <p className="text-xs text-muted-foreground rounded-lg bg-orange-500/10 px-3 py-2">
                A pesagem final só pode ser agendada no dia {fmt(enrollment.group.final_weigh_in_date)}.
              </p>
            )}
            <div>
              <label className="text-xs text-muted-foreground">Data</label>
              <input type="date" value={schedDate}
                min={scheduleModal === "initial" ? enrollment.group.initial_start_date : enrollment.group.final_weigh_in_date}
                max={scheduleModal === "initial" ? enrollment.group.initial_end_date : enrollment.group.final_weigh_in_date}
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
      {/* Modal de confirmação de entrada no desafio com moeda */}
      {confirmTurma && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-md rounded-2xl bg-card p-5 border border-border space-y-4">
            <div className="flex items-center gap-2">
              <Coins className="h-5 w-5 text-primary" />
              <p className="text-base font-bold text-foreground">Confirmar entrada no desafio</p>
            </div>
            <p className="text-sm text-foreground">
              Você está entrando na <span className="font-bold text-primary">Turma {confirmTurma.groupNumber}</span> do desafio <span className="font-bold">{confirmTurma.competitionLabel}</span>.
            </p>
            <div className="space-y-2 text-xs">
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-muted-foreground">Janela de pesagem inicial</p>
                <p className="font-bold text-foreground">{fmt(confirmTurma.initialStart)} – {fmt(confirmTurma.initialEnd)}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-muted-foreground">Pesagem final</p>
                <p className="font-bold text-foreground">{confirmTurma.finalWeighIn ? fmt(confirmTurma.finalWeighIn) : "A definir"}</p>
              </div>
              <div className="rounded-lg bg-muted/30 p-3">
                <p className="text-muted-foreground">Data de premiação</p>
                <p className="font-bold text-primary">{confirmTurma.awardDate ? fmt(confirmTurma.awardDate) : "A definir"}</p>
              </div>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Ao confirmar, 1 ticket de desafio será consumido do seu saldo.
            </p>
            <div className="flex gap-3">
              <button onClick={() => setConfirmTurma(null)} disabled={joining}
                className="flex-1 rounded-lg bg-muted py-2 text-sm font-bold text-muted-foreground">Cancelar</button>
              <button onClick={handleJoin} disabled={joining}
                className="flex-1 flex items-center justify-center gap-2 rounded-lg bg-primary py-2 text-sm font-bold text-primary-foreground disabled:opacity-60">
                {joining ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trophy className="h-4 w-4" />}
                Quero entrar
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
