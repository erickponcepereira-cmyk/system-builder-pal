import { useEffect, useState } from "react";
import { Loader2, Plane, UtensilsCrossed, Trophy, Check, Lock, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { PatentBadge, type PatentLevel, PATENT_LEVELS } from "@/components/coach/PatentBadge";

type CareerPlan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "period" | "monthly_challenge";
  duration_months: number | null;
  required_period_points: number;
  min_monthly_points: number;
  reward_description: string | null;
  reward_details: string | null;
  reward_image_url: string | null;
  reward_value: number | null;
};

type PeriodProgress = {
  id: string;
  career_plan_id: string;
  accumulated_points: number;
  period_start: string | null;
  period_end: string | null;
  reward_earned: boolean | null;
  reward_earned_at: string | null;
};

type MonthlyProgress = {
  id: string;
  challenge_id: string;
  points_in_period: number;
  achieved_at: string | null;
};

type CoachStats = {
  coachId: string;
  totalPoints: number;
  patent: PatentLevel;
  currentMonthPoints: number;
};

export function CareerTab() {
  const [plans, setPlans]           = useState<CareerPlan[] | null>(null);
  const [periodProgress, setPeriodProgress] = useState<PeriodProgress[]>([]);
  const [monthlyProgress, setMonthlyProgress] = useState<MonthlyProgress[]>([]);
  const [stats, setStats]           = useState<CoachStats | null>(null);
  const [patentRules, setPatentRules] = useState<{ patent: PatentLevel; display_name: string; min_direct_students: number | null; min_network_students: number | null }[]>([]);
  const [loading, setLoading]       = useState(true);

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData?.user) { setLoading(false); return; }

      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile?.id) { setLoading(false); return; }

      const { data: coach } = await supabase
        .from("coaches").select("id, total_points")
        .eq("profile_id", profile.id).maybeSingle();
      if (!coach?.id) { setLoading(false); return; }

      // Fetch plans
      const { data: plansData } = await supabase
        .from("career_plan_config")
        .select("*")
        .eq("is_active", true)
        .order("created_at");

      // Fetch period plan progress
      const { data: periodData } = await supabase
        .from("career_plan_progress")
        .select("*")
        .eq("coach_id", coach.id);

      // Fetch monthly challenge progress  
      const { data: challengeProgress } = await supabase
        .from("career_challenge_progress")
        .select("*")
        .eq("coach_id", coach.id);

      // Fetch current month ranking
      const monthStr = new Date().toISOString().slice(0, 7) + "-01";
      const { data: monthRank } = await supabase
        .from("monthly_rankings")
        .select("total_points")
        .eq("coach_id", coach.id)
        .eq("reference_month", monthStr)
        .maybeSingle();

      // Fetch patent rules
      const { data: patents } = await supabase
        .from("patent_rules")
        .select("patent, display_name, min_direct_students, min_network_students")
        .order("sort_order");

      // Determine current patent based on total points / students (simplified)
      const currentPatent: PatentLevel = "coach";

      setPlans((plansData as CareerPlan[]) || []);
      setPeriodProgress((periodData as PeriodProgress[]) || []);
      setMonthlyProgress((challengeProgress as MonthlyProgress[]) || []);
      setStats({
        coachId: coach.id,
        totalPoints: coach.total_points ?? 0,
        patent: currentPatent,
        currentMonthPoints: (monthRank as any)?.total_points ?? 0,
      });
      setPatentRules((patents as any) || []);
      setLoading(false);
    })();
  }, []);

  if (loading) return (
    <div className="flex justify-center py-12">
      <Loader2 className="h-6 w-6 animate-spin text-white/30" />
    </div>
  );

  const periodPlans = plans?.filter((p) => p.plan_type === "period") || [];
  const monthlyPlans = plans?.filter((p) => p.plan_type === "monthly_challenge") || [];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Plano de Carreira</h1>
        <p className="text-sm text-white/50">Sua jornada na FitMind Club</p>
      </div>

      {/* Total points badge */}
      {stats && (
        <div className="rounded-2xl p-4 mb-4 flex items-center gap-3" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15 flex-shrink-0">
            <Star className="h-6 w-6 text-primary" />
          </div>
          <div>
            <p className="text-sm text-white/50">Total de pontos acumulados</p>
            <p className="text-2xl font-bold text-white">{stats.totalPoints.toLocaleString("pt-BR")}</p>
          </div>
          <div className="ml-auto text-right">
            <p className="text-xs text-white/40">Este mês</p>
            <p className="text-lg font-bold text-primary">{stats.currentMonthPoints}</p>
          </div>
        </div>
      )}

      {/* Planos mensais (Jantar) */}
      {monthlyPlans.map((plan) => {
        const todayStr = new Date().toISOString().slice(0, 10);
        // Check if there's active challenge progress for this plan's matching challenge
        const currentPoints = stats?.currentMonthPoints ?? 0;
        const target        = plan.required_period_points || plan.min_monthly_points;
        const pct           = Math.min((currentPoints / target) * 100, 100);
        const achieved      = currentPoints >= target;

        return (
          <MonthlyPlanCard
            key={plan.id}
            plan={plan}
            currentPoints={currentPoints}
            target={target}
            pct={pct}
            achieved={achieved}
          />
        );
      })}

      {/* Planos de período (Viagem 8 meses) */}
      {periodPlans.map((plan) => {
        const prog = periodProgress.find((p) => p.career_plan_id === plan.id && !p.reward_earned && (p.period_end ? new Date(p.period_end) > new Date() : true));
        const accumulated = prog?.accumulated_points ?? 0;
        const target      = plan.required_period_points;
        const pct         = Math.min((accumulated / target) * 100, 100);
        const earned      = prog?.reward_earned ?? false;

        // Calcular dias restantes
        let daysLeft: number | null = null;
        if (prog?.period_end) {
          const end = new Date(prog.period_end);
          daysLeft  = Math.max(0, Math.ceil((end.getTime() - Date.now()) / 86400000));
        }

        return (
          <PeriodPlanCard
            key={plan.id}
            plan={plan}
            accumulated={accumulated}
            target={target}
            pct={pct}
            earned={earned}
            daysLeft={daysLeft}
            startDate={prog?.period_start ?? null}
            endDate={prog?.period_end ?? null}
          />
        );
      })}

      {/* Sistema de Patentes */}
      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-4">Sistema de Patentes</h3>
        <div className="space-y-2">
          {PATENT_LEVELS.map((p) => {
            const rule = patentRules.find((r) => r.patent === p);
            const reqText = rule
              ? [
                  rule.min_direct_students ? `${rule.min_direct_students}+ alunos diretos` : null,
                  rule.min_network_students ? `${rule.min_network_students}+ alunos na rede` : null,
                ].filter(Boolean).join(" · ") || "Cadastro aprovado"
              : p === "coach" ? "Cadastro aprovado" : "Metas a configurar";

            const isCurrent = stats?.patent === p;
            return (
              <div
                key={p}
                className={`flex items-center gap-3 rounded-xl p-3 ${isCurrent ? "ring-1 ring-primary/40" : ""}`}
                style={{ backgroundColor: isCurrent ? "rgba(255,66,48,0.06)" : "#0F0F0F" }}
              >
                <PatentBadge patent={p} size="md" showName={false} />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2">
                    <PatentBadge patent={p} size="sm" showName={true} />
                    {isCurrent && (
                      <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">ATUAL</span>
                    )}
                  </div>
                  <p className="text-[11px] text-white/50 mt-0.5">{reqText}</p>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {(!plans || plans.length === 0) && (
        <div className="mt-6 rounded-2xl p-6 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Trophy className="h-10 w-10 text-white/10 mx-auto mb-2" />
          <p className="text-sm text-white/40">Nenhum plano de carreira configurado ainda.</p>
          <p className="text-xs text-white/20 mt-1">O administrador irá configurar em breve.</p>
        </div>
      )}
    </>
  );
}

function MonthlyPlanCard({ plan, currentPoints, target, pct, achieved }: {
  plan: CareerPlan; currentPoints: number; target: number; pct: number; achieved: boolean;
}) {
  return (
    <div className="rounded-2xl p-5 relative overflow-hidden mb-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-amber-500/5" />
      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-amber-500/15">
            <UtensilsCrossed className="h-5 w-5 text-amber-400" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">{plan.name}</h3>
            <p className="text-[11px] text-white/50">{plan.reward_description}</p>
          </div>
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold text-amber-300">
            Mensal
          </span>
        </div>

        {plan.reward_image_url && (
          <img src={plan.reward_image_url} alt="Prêmio" className="w-full h-28 object-cover rounded-lg mb-3" />
        )}

        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/70">Pontos este mês</span>
            <span className="text-xs font-bold text-white">{currentPoints}/{target}</span>
          </div>
          <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
            <div className={`h-full transition-all ${achieved ? "bg-amber-400" : "bg-amber-500"}`}
              style={{ width: `${pct}%` }} />
          </div>
        </div>

        <div className={`flex items-center gap-2 rounded-lg px-2.5 py-2 ${achieved ? "bg-amber-500/10" : "bg-white/5"}`}>
          {achieved ? (
            <Check className="h-4 w-4 text-amber-400" />
          ) : (
            <Lock className="h-4 w-4 text-white/40" />
          )}
          <span className={`text-[11px] font-medium ${achieved ? "text-amber-300" : "text-white/50"}`}>
            {achieved ? "🎉 Meta alcançada! Jantar conquistado!" : `Faltam ${target - currentPoints} pontos para o jantar`}
          </span>
        </div>

        {plan.reward_details && (
          <p className="mt-2 text-[10px] text-white/30">{plan.reward_details}</p>
        )}
      </div>
    </div>
  );
}

function PeriodPlanCard({ plan, accumulated, target, pct, earned, daysLeft, startDate, endDate }: {
  plan: CareerPlan; accumulated: number; target: number; pct: number;
  earned: boolean; daysLeft: number | null; startDate: string | null; endDate: string | null;
}) {
  const months = plan.duration_months || 8;

  return (
    <div className="rounded-2xl p-5 relative overflow-hidden mb-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="absolute -right-12 -top-12 h-40 w-40 rounded-full bg-primary/5" />
      <div className="relative">
        <div className="flex items-start gap-3 mb-4">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/15">
            <Plane className="h-5 w-5 text-primary" />
          </div>
          <div className="flex-1">
            <h3 className="text-sm font-bold text-white">{plan.name}</h3>
            <p className="text-[11px] text-white/50">{plan.reward_description}</p>
          </div>
          {plan.reward_value && (
            <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
              R$ {Number(plan.reward_value).toLocaleString("pt-BR")}
            </span>
          )}
        </div>

        {plan.reward_image_url && (
          <img src={plan.reward_image_url} alt="Prêmio" className="w-full h-28 object-cover rounded-lg mb-3" />
        )}

        {/* Progress bar */}
        <div className="mb-3">
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-xs text-white/70">Pontos acumulados no período</span>
            <span className="text-xs font-bold text-white">{accumulated.toLocaleString("pt-BR")}/{target.toLocaleString("pt-BR")}</span>
          </div>
          <div className="h-2.5 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
            <div className={`h-full transition-all ${earned ? "bg-emerald-400" : "bg-primary"}`}
              style={{ width: `${pct}%` }} />
          </div>
          <p className="text-[10px] text-white/40 mt-1">{pct.toFixed(1)}% da meta</p>
        </div>

        {/* Status info */}
        <div className="rounded-xl p-3 space-y-2" style={{ backgroundColor: "#0F0F0F" }}>
          <p className="text-[10px] uppercase tracking-wider text-white/40 font-bold">Status do ciclo</p>
          {startDate ? (
            <div className="grid grid-cols-2 gap-2 text-xs">
              <div>
                <p className="text-white/40">Início</p>
                <p className="text-white font-medium">{new Date(startDate).toLocaleDateString("pt-BR")}</p>
              </div>
              <div>
                <p className="text-white/40">Encerra</p>
                <p className="text-white font-medium">{endDate ? new Date(endDate).toLocaleDateString("pt-BR") : "—"}</p>
              </div>
              {daysLeft !== null && (
                <div className="col-span-2">
                  <p className="text-white/40">Tempo restante</p>
                  <p className={`font-bold ${daysLeft < 30 ? "text-red-400" : "text-white"}`}>
                    {daysLeft} dias
                  </p>
                </div>
              )}
            </div>
          ) : (
            <p className="text-xs text-white/40">Ciclo iniciará na sua próxima venda pontuada.</p>
          )}
        </div>

        <div className={`mt-2 flex items-center gap-2 rounded-lg px-2.5 py-2 ${earned ? "bg-emerald-500/10" : "bg-white/5"}`}>
          {earned ? (
            <Check className="h-4 w-4 text-emerald-400" />
          ) : (
            <Lock className="h-4 w-4 text-white/40" />
          )}
          <span className={`text-[11px] font-medium ${earned ? "text-emerald-300" : "text-white/50"}`}>
            {earned
              ? "🎉 Parabéns! Viagem conquistada!"
              : `Faltam ${(target - accumulated).toLocaleString("pt-BR")} pontos para a viagem`}
          </span>
        </div>

        <p className="mt-2 text-[10px] text-amber-400/60">
          ⚠ Se não atingir {target.toLocaleString("pt-BR")} pts em {months} meses, o ciclo reinicia do zero.
        </p>

        {plan.reward_details && (
          <p className="mt-1.5 text-[10px] text-white/30">{plan.reward_details}</p>
        )}
      </div>
    </div>
  );
}

export default CareerTab;
