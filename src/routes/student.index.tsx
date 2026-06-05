import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Bell, ShieldCheck, Trophy, Coins, Calendar, Users, Dumbbell, ChevronRight, Gift, AlertCircle } from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { Progress } from "@/components/ui/progress";
import { supabase } from "@/integrations/supabase/client";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { StudentReferralModal } from "@/components/student/StudentReferralModal";

export const Route = createFileRoute("/student/")({
  component: StudentHome,
});

type CardData = {
  studentId: string;
  name: string;
  email: string;
  plan: string;
  coachName: string | null;
  avatarUrl: string | null;
  validUntil: string | null;
};

type ChallengeData = {
  enrolled: boolean;
  status: string;
  groupNumber: number;
  initialStart: string;
  initialEnd: string;
  finalWeighIn: string;
  awardDate: string | null;
  competitionLabel: string;
};

const MONTHS = ["", "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho", "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro"];
const fmtDate = (d: string | null) => d ? new Date(d + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "—";

function StudentHome() {
  const [studentName, setStudentName] = useState("Aluno");
  const [card, setCard] = useState<CardData | null>(null);
  const [challenge, setChallenge] = useState<ChallengeData | null>(null);
  const [tokens, setTokens] = useState(0);
  const [challengeBlocked, setChallengeBlocked] = useState(false);
  const [unreadNotifications, setUnreadNotifications] = useState(0);
  const [referralCode, setReferralCode] = useState<string>("");
  const [showReferral, setShowReferral] = useState(false);

  const greeting = (() => {
    const h = new Date().getHours();
    if (h < 12) return "Bom dia";
    if (h < 18) return "Boa tarde";
    return "Boa noite";
  })();

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id,name,email,avatar_url,photo_url")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (!profile) return;
      if (profile.name) setStudentName(profile.name.split(" ")[0]);

      const { data: notificationData } = await supabase
        .from("notifications")
        .select("id")
        .eq("profile_id", profile.id)
        .eq("is_read", false);
      setUnreadNotifications(notificationData?.length || 0);

      // Check if user is also coach/professional/partner (blocked from challenge)
      const [{ data: coachRow }, { data: partnerRow }] = await Promise.all([
        supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("partners").select("id").eq("profile_id", profile.id).maybeSingle(),
      ]);
      if (coachRow || partnerRow) setChallengeBlocked(true);

      const { data: student } = await supabase
        .from("students")
        .select("id, card_valid_until, referral_code, coach:coaches!students_coach_id_fkey(profiles!coaches_profile_id_fkey(name))")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!student) return;
      const s = student as unknown as { id: string; card_valid_until?: string | null; referral_code?: string | null };
      if (s.referral_code) setReferralCode(s.referral_code);

      const { data: activeSub } = await supabase
        .from("subscriptions")
        .select("products(name)")
        .eq("student_id", student.id)
        .eq("status", "active")
        .order("end_date", { ascending: false })
        .limit(1)
        .maybeSingle();

      const coachName = (student as unknown as { coach?: { profiles?: { name?: string } } })?.coach?.profiles?.name ?? null;

      setCard({
        studentId: student.id,
        name: profile.name,
        email: profile.email,
        plan: (activeSub as unknown as { products?: { name?: string } })?.products?.name ?? "FitMind Club",
        coachName,
        avatarUrl: (profile as unknown as { photo_url?: string | null }).photo_url || profile.avatar_url,
        validUntil: (student as unknown as { card_valid_until?: string | null })?.card_valid_until ?? null,
      });

      // Desafio
      const { data: enroll } = await supabase
        .from("competition_enrollments" as never)
        .select(`
          status,
          group:group_id ( group_number, initial_start_date, initial_end_date, final_weigh_in_date, award_date ),
          competition:competition_id ( month, year )
        `)
        .eq("student_id" as never, student.id)
        .order("enrolled_at" as never, { ascending: false })
        .limit(1)
        .maybeSingle();

      const e = enroll as unknown as {
        status: string;
        group: { group_number: number; initial_start_date: string; initial_end_date: string; final_weigh_in_date: string; award_date: string | null } | null;
        competition: { month: number; year: number } | null;
      } | null;

      if (e && e.group && e.competition) {
        setChallenge({
          enrolled: true,
          status: e.status,
          groupNumber: e.group.group_number,
          initialStart: e.group.initial_start_date,
          initialEnd: e.group.initial_end_date,
          finalWeighIn: e.group.final_weigh_in_date,
          awardDate: e.group.award_date,
          competitionLabel: `${MONTHS[e.competition.month]} ${e.competition.year}`,
        });
      }

      // Moedas de desafio
      try {
        const { data: toks } = await supabase
          .from("student_challenge_tokens")
          .select("id")
          .eq("student_id", student.id)
          .is("consumed_at", null);
        setTokens((toks || []).length);
      } catch { /* ignore */ }
    })();
  }, []);

  // Progresso do desafio (% de dias decorridos entre início da pesagem inicial e a pesagem final)
  const challengeProgress = (() => {
    if (!challenge) return null;
    const start = new Date(challenge.initialStart + "T12:00:00").getTime();
    const end = new Date(challenge.finalWeighIn + "T12:00:00").getTime();
    const now = Date.now();
    const total = Math.max(1, Math.round((end - start) / 86400000) + 1);
    const elapsed = Math.max(0, Math.min(total, Math.round((now - start) / 86400000)));
    const remaining = Math.max(0, total - elapsed);
    const pct = Math.round((elapsed / total) * 100);
    return { total, elapsed, remaining, pct };
  })();

  // Alertas: bioimpedância pendente + 3 dias antes da pesagem final
  const initialDone = !!challenge && ["weighed_initial", "scheduled_final", "weighed_final"].includes(challenge.status);
  const daysUntilInitialDeadline = challenge
    ? Math.ceil((new Date(challenge.initialEnd + "T12:00:00").getTime() - Date.now()) / 86400000)
    : null;
  const showInitialDeadlineAlert =
    !challengeBlocked && !!challenge && !initialDone && daysUntilInitialDeadline !== null && daysUntilInitialDeadline >= 0;
  const daysUntilFinalHome = challenge?.finalWeighIn
    ? Math.ceil((new Date(challenge.finalWeighIn + "T12:00:00").getTime() - Date.now()) / 86400000)
    : null;
  const showFinalAlert =
    !challengeBlocked && !!challenge && challenge.status !== "weighed_final" &&
    daysUntilFinalHome !== null && daysUntilFinalHome <= 3 && daysUntilFinalHome >= 0;

  const validUntilDate = card?.validUntil ? new Date(card.validUntil) : null;
  const cardActive = !!(validUntilDate && validUntilDate.getTime() > Date.now());
  const checkinUrl = card ? `${typeof window !== "undefined" ? window.location.origin : ""}/checkin/${card.studentId}` : "";


  return (
    <div className="flex flex-col gap-5 p-4 pb-6">
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/30 overflow-hidden">
            {card?.avatarUrl ? (
              <img src={card.avatarUrl} alt={studentName} className="h-full w-full object-cover" />
            ) : (
              <span className="text-base font-bold text-primary">{studentName.charAt(0)}</span>
            )}
          </div>
          <div>
            <p className="text-xs text-white/40">{greeting},</p>
            <p className="text-sm font-bold text-white">{studentName} 🔥</p>
          </div>
        </div>
        <Link to="/student/notifications" className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <Bell className="h-5 w-5 text-white/70" />
          {unreadNotifications > 0 && (
            <span className="absolute right-1 top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-primary px-1 text-[9px] font-bold text-primary-foreground">
              {unreadNotifications}
            </span>
          )}
        </Link>
      </header>

      {/* Grupo WhatsApp */}
      <WhatsAppGroupCard />

      {/* Alerta: bioimpedância pendente */}
      {showInitialDeadlineAlert && (
        <Link to="/student/challenge" className="flex items-start gap-2 rounded-2xl border border-amber-500/40 bg-amber-500/10 px-3 py-3">
          <AlertCircle className="h-4 w-4 text-amber-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-amber-300 leading-relaxed">
            ⚠️ Faltam {daysUntilInitialDeadline} dia{daysUntilInitialDeadline !== 1 ? "s" : ""} para o prazo final da sua avaliação (bioimpedância). Caso não realize no prazo indicado não poderá participar do desafio e seu ticket não será reembolsado!
          </p>
        </Link>
      )}

      {/* Alerta: 3 dias para pesagem final */}
      {showFinalAlert && (
        <Link to="/student/challenge" className="flex items-start gap-2 rounded-2xl border border-red-500/40 bg-red-500/10 px-3 py-3">
          <AlertCircle className="h-4 w-4 text-red-400 flex-shrink-0 mt-0.5" />
          <p className="text-xs font-semibold text-red-300 leading-relaxed">
            ⚠️ Faltam {daysUntilFinalHome} dia{daysUntilFinalHome !== 1 ? "s" : ""} para a sua pesagem final do desafio. Não perca o prazo, caso contrário você não poderá concluir o desafio e seu ticket não será reembolsado!
          </p>
        </Link>
      )}


      {/* Indique e ganhe */}
      <button
        type="button"
        onClick={() => setShowReferral(true)}
        className="flex w-full items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-orange-500/10 to-transparent p-4 text-left transition-transform hover:scale-[1.01]"
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
          <Gift className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Indique e ganhe comissão</p>
          <p className="text-[11px] text-white/55">Escolha um produto, gere o link e envie para um(a) amigo(a) 🎁</p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/40" />
      </button>

      {/* Meu Treino */}
      <Link to="/student/workout" className="flex items-center gap-3 rounded-2xl border border-primary/30 bg-gradient-to-r from-primary/15 via-orange-500/10 to-transparent p-4 transition-transform hover:scale-[1.01]">
        <div className="flex h-12 w-12 items-center justify-center rounded-2xl bg-primary/20">
          <Dumbbell className="h-6 w-6 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-sm font-bold text-white">Meu Treino</p>
          <p className="text-[11px] text-white/55">Iniciar treino, evolução e conquistas 🏆</p>
        </div>
        <ChevronRight className="h-5 w-5 text-white/40" />
      </Link>


      {/* Carteirinha real */}
      {card && (
        <div className="relative overflow-hidden rounded-3xl border border-primary/30 bg-gradient-to-br from-primary/20 via-primary/10 to-transparent p-5">
          <div className="absolute -right-10 -top-10 h-40 w-40 rounded-full bg-primary/20 blur-3xl" />
          <div className="relative flex items-start justify-between gap-3">
            <div>
              <p className="text-[10px] font-bold uppercase tracking-[0.2em] text-primary">FitMind Club</p>
              <p className="text-[10px] text-white/50">Carteirinha do aluno</p>
            </div>
            <div className={`flex items-center gap-1 rounded-full px-2 py-1 text-[10px] font-bold ${cardActive ? "bg-primary/20 text-primary" : "bg-white/10 text-white/50"}`}>
              <ShieldCheck className="h-3 w-3" /> {cardActive ? "Ativa" : "Inativa"}
            </div>
          </div>

          <div className="relative mt-4 flex items-center gap-4">
            <div className="flex h-16 w-16 items-center justify-center overflow-hidden rounded-2xl bg-white/10 ring-2 ring-primary/40">
              {card.avatarUrl ? (
                <img src={card.avatarUrl} alt={card.name} className="h-full w-full object-cover" />
              ) : (
                <span className="text-xl font-bold text-primary">{card.name.charAt(0)}</span>
              )}
            </div>
            <div className="min-w-0 flex-1">
              <p className="truncate text-lg font-bold text-white">{card.name}</p>
              <p className="mt-1 text-[11px] text-white/45">Plano: <span className="text-white/80">{card.plan}</span></p>
              {card.coachName && (
                <p className="text-[11px] text-white/45">Coach: <span className="text-white/80">{card.coachName}</span></p>
              )}
            </div>
          </div>

          {cardActive ? (
            <>
              <div className="relative mt-5 flex flex-col items-center justify-center rounded-2xl bg-white p-4">
                <QRCodeSVG value={checkinUrl} size={160} level="H" includeMargin={false} />
                <p className="mt-3 text-center text-[10px] font-semibold uppercase tracking-wider text-black/60">
                  ID: {card.studentId.slice(0, 8).toUpperCase()}
                </p>
              </div>
              {validUntilDate && (
                <p className="relative mt-3 text-center text-[11px] font-semibold text-primary">
                  Válida até {validUntilDate.toLocaleDateString("pt-BR")}
                </p>
              )}
            </>
          ) : (
            <div className="relative mt-5 rounded-2xl border border-white/10 bg-white/5 p-4 text-center">
              <p className="text-sm font-bold text-white">Carteirinha inativa</p>
              <p className="mt-1 text-[11px] text-white/55">
                Adquira um produto com acesso à carteirinha para ativar seu QR code.
              </p>
            </div>
          )}
        </div>
      )}

      {/* Progresso do desafio real — escondido para coach/profissional/parceiro */}
      {!challengeBlocked && (
        <Link to="/student/challenge" className="block rounded-2xl p-4 transition-colors hover:bg-white/[0.07]" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Trophy className="h-4 w-4 text-primary" />
              <h2 className="text-sm font-semibold text-white">Desafio FitMind</h2>
            </div>
            {challenge && challengeProgress ? (
              <span className="text-xs font-bold text-primary">Dia {challengeProgress.elapsed}/{challengeProgress.total}</span>
            ) : (
              <span className="text-[10px] font-bold uppercase text-white/40">Sem inscrição</span>
            )}
          </div>

          {challenge && challengeProgress ? (
            <>
              <p className="text-[11px] text-white/50 mb-2">
                {challenge.competitionLabel} · <span className="inline-flex items-center gap-1"><Users className="h-3 w-3" />Turma {challenge.groupNumber}</span>
              </p>
              <Progress value={challengeProgress.pct} className="h-2 bg-white/5" />
              <div className="mt-2 flex justify-between text-[11px] text-white/50">
                <span>{challengeProgress.pct}% concluído</span>
                <span>{challengeProgress.remaining} dias restantes</span>
              </div>

              <div className="mt-3 grid grid-cols-2 gap-2 text-[11px]">
                <div className="rounded-lg bg-white/5 px-2.5 py-2">
                  <p className="text-white/40 flex items-center gap-1"><Calendar className="h-3 w-3" />Pesagem inicial</p>
                  <p className="font-bold text-white">{fmtDate(challenge.initialStart)} – {fmtDate(challenge.initialEnd)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-2.5 py-2">
                  <p className="text-white/40 flex items-center gap-1"><Calendar className="h-3 w-3" />Pesagem final</p>
                  <p className="font-bold text-white">{fmtDate(challenge.finalWeighIn)}</p>
                </div>
                <div className="rounded-lg bg-white/5 px-2.5 py-2">
                  <p className="text-white/40 flex items-center gap-1"><Trophy className="h-3 w-3" />Premiação</p>
                  <p className="font-bold text-white">{fmtDate(challenge.awardDate)}</p>
                </div>
                <div className="rounded-lg bg-primary/10 px-2.5 py-2">
                  <p className="text-primary/70 flex items-center gap-1"><Coins className="h-3 w-3" />Tickets</p>
                  <p className="font-bold text-primary">{tokens}</p>
                </div>
              </div>
            </>
          ) : (
            <div className="text-xs text-white/55">
              <p>Você ainda não está inscrito no desafio.</p>
              {tokens > 0 && (
                <p className="mt-1 text-primary font-semibold flex items-center gap-1">
                  <Coins className="h-3 w-3" /> {tokens} ticket{tokens > 1 ? "s" : ""} disponível{tokens > 1 ? "is" : ""} — toque para entrar.
                </p>
              )}
            </div>

          )}
        </Link>
      )}

      <StudentReferralModal
        open={showReferral}
        onClose={() => setShowReferral(false)}
        referralCode={referralCode || "ALUNO"}
      />
    </div>
  );
}
