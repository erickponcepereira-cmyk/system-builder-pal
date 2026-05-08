import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Users, TrendingUp, Wallet, Plus, BarChart3, Copy, Share2 } from "lucide-react";
import { GoalsCard } from "@/components/coach/GoalsCard";
import { UpcomingAppointments } from "@/components/coach/UpcomingAppointments";
import { NewSaleModal } from "@/components/coach/NewSaleModal";
import { BirthdaysCard } from "@/components/BirthdaysCard";

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
  const stats = [
    { label: "Alunos ativos", value: "24", change: "+3", icon: Users },
    { label: "Vendas/mês", value: "R$ 3.680", change: "+18%", icon: TrendingUp },
    { label: "Comissões", value: "R$ 1.104", change: "+22%", icon: BarChart3 },
    { label: "Saldo", value: "R$ 2.450", change: "Disponível", icon: Wallet },
  ];
  const [saleOpen, setSaleOpen] = useState(false);

  return (
    <>
      <NewSaleModal open={saleOpen} onClose={() => setSaleOpen(false)} />
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {coachName}! 💪</h1>
          <p className="text-sm text-white/50">Resumo do seu mês</p>
        </div>
        <Button size="sm" onClick={() => setSaleOpen(true)}>
          <Plus className="h-4 w-4 mr-1" /> Nova venda
        </Button>
      </div>

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
              <p className="text-xl font-bold text-white">{s.value}</p>
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
