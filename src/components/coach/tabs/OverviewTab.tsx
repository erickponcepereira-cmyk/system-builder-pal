import { useEffect, useState } from "react";
import { Users, TrendingUp, Wallet, BarChart3, Copy, Share2, Eye, EyeOff } from "lucide-react";
import { GoalsCard } from "@/components/coach/GoalsCard";
import { UpcomingAppointments } from "@/components/coach/UpcomingAppointments";
import { BirthdaysCard } from "@/components/BirthdaysCard";
import { supabase } from "@/integrations/supabase/client";
import { RewardsPanel } from "@/components/coach/RewardsPanel";
import { CoachAlertsCard } from "@/components/coach/CoachAlertsCard";
import { WhatsAppGroupCard } from "@/components/WhatsAppGroupCard";
import { InstallAppButton } from "@/components/InstallAppButton";

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function OverviewTab({
  coachName,
  referralLink,
  onCopy,
  coachId,
}: {
  coachName: string;
  referralLink: string;
  onCopy: () => void;
  coachId: string;
}) {
  const [data, setData] = useState({ students: 0, salesMonth: 0, commissionsMonth: 0, balance: 0 });

  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile?.id) return;

      const startMonth = new Date();
      startMonth.setDate(1);
      startMonth.setHours(0, 0, 0, 0);
      const startIso = startMonth.toISOString();

      const studentsQ = coachId
        ? supabase.from("students").select("id", { count: "exact", head: true }).eq("coach_id", coachId)
        : Promise.resolve({ count: 0 } as { count: number });

      const [studentsRes, commMonthRes, walletRes] = await Promise.all([
        studentsQ,
        supabase.from("commissions").select("amount").eq("beneficiary_profile_id", profile.id).gte("created_at", startIso),
        supabase.from("wallets").select("available_balance").eq("profile_id", profile.id).maybeSingle(),
      ]);

      const commMonth = ((commMonthRes.data as Array<{ amount: number }>) || []).reduce((s, r) => s + Number(r.amount || 0), 0);

      // Sales of the month: transactions paid this month tied to students of this coach
      let salesMonth = 0;
      if (coachId) {
        const { data: stIds } = await supabase.from("students").select("id").eq("coach_id", coachId);
        const ids = ((stIds as Array<{ id: string }>) || []).map((s) => s.id);
        if (ids.length > 0) {
          const { data: tx } = await supabase
            .from("transactions")
            .select("gross_amount")
            .in("student_id", ids)
            .eq("status", "paid")
            .gte("paid_at", startIso);
          salesMonth = ((tx as Array<{ gross_amount: number }>) || []).reduce((s, r) => s + Number(r.gross_amount || 0), 0);
        }
      }

      setData({
        students: (studentsRes as { count: number | null }).count ?? 0,
        salesMonth,
        commissionsMonth: commMonth,
        balance: Number((walletRes.data as { available_balance?: number } | null)?.available_balance ?? 0),
      });
    })();
  }, [coachId]);

  const [statsVisible, setStatsVisible] = useState(false);
  const maskMoney = (v: number) => (statsVisible ? brl(v) : "R$ ••••");
  const maskNum = (v: number) => (statsVisible ? String(v) : "••");

  const stats = [
    { label: "Alunos ativos", value: maskNum(data.students), change: "", icon: Users },
    { label: "Vendas/mês", value: maskMoney(data.salesMonth), change: "", icon: TrendingUp },
    { label: "Comissões/mês", value: maskMoney(data.commissionsMonth), change: "", icon: BarChart3 },
    { label: "Saldo", value: maskMoney(data.balance), change: "Disponível", icon: Wallet },
  ];


  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {coachName}! 💪</h1>
          <p className="text-sm text-white/50">Resumo do seu mês</p>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setStatsVisible((v) => !v)}
            className="rounded-lg bg-white/5 p-2 text-white/60 hover:bg-white/10 hover:text-white"
            title={statsVisible ? "Ocultar valores" : "Mostrar valores"}
          >
            {statsVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
      </div>
      {coachId && <CoachAlertsCard coachId={coachId} />}

      <div className="mb-4"><WhatsAppGroupCard /></div>


      {/* Stats */}
      <div className="grid gap-3 grid-cols-2 lg:grid-cols-4 mb-6">
        {stats.map((s) => {
          const Icon = s.icon;
          return (
            <div key={s.label} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-center gap-2 mb-2">
                <Icon className="h-4 w-4 text-primary" />
                <p className="text-xs text-white/50">{s.label}</p>
              </div>
              <p className="text-xl font-bold text-white font-mono">{s.value}</p>
              <p className="text-[10px] text-success mt-0.5">{s.change}</p>
            </div>
          );
        })}
      </div>

      {/* Referral link */}
      <div className="rounded-2xl p-5 mb-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.7))" }}>
        <div className="flex items-start justify-between gap-3 mb-3">
          <div>
            <p className="text-[11px] uppercase tracking-wider text-primary-foreground/80 font-bold">
              Seu link de indicação
            </p>
            <p className="text-base font-bold text-primary-foreground mt-0.5">
              Compartilhe e ganhe comissões
            </p>
          </div>
          <Share2 className="h-5 w-5 text-primary-foreground/80" />
        </div>
        <div className="flex items-center gap-2 rounded-lg bg-black/20 px-3 py-2.5">
          <span className="flex-1 text-xs text-primary-foreground truncate font-mono">
            {referralLink}
          </span>
          <button
            onClick={onCopy}
            className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary-foreground/20 hover:bg-primary-foreground/30"
          >
            <Copy className="h-3.5 w-3.5 text-primary-foreground" />
          </button>
        </div>
      </div>

      <div className="mb-6">
        <RewardsPanel />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <GoalsCard coachId={coachId} />
        <UpcomingAppointments />
      </div>

      {/* Aniversariantes */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <BirthdaysCard scope="week" title="Aniversariantes da semana" />
        {coachId && <BirthdaysCard scope="coach-month" coachId={coachId} title="Aniversariantes do mês (meus alunos)" />}
      </div>
    </>
  );
}

export default OverviewTab;
