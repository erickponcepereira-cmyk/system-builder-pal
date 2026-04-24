import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Flame, Users, TrendingUp, Wallet, Plus, BarChart3, User, LogOut,
  Menu, X, Calculator, Trophy, Copy, Share2, ArrowUpRight,
} from "lucide-react";
import { Button } from "@/components/ui/button";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentBadge } from "@/components/coach/PatentBadge";
import { GoalsCard } from "@/components/coach/GoalsCard";
import { CareerProgress } from "@/components/coach/CareerProgress";
import { RankingTable } from "@/components/coach/RankingTable";
import { MinhaRede } from "@/components/coach/MinhaRede";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Painel Coach — FitChain" },
      { name: "description", content: "Gerencie sua rede, vendas e comissões." },
    ],
  }),
  component: CoachDashboard,
});

type Tab = "overview" | "network" | "wallet" | "career";

function CoachDashboard() {
  const navigate = useNavigate();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<Tab>("overview");
  const [coachName, setCoachName] = useState("Coach");
  const referralCode = "MARINA2026";
  const referralLink = `https://fitchain.app/r/${referralCode}`;

  useEffect(() => {
    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!user) return;
      const { data } = await supabase
        .from("profiles")
        .select("name")
        .eq("user_id", user.id)
        .maybeSingle();
      if (data?.name) setCoachName(data.name.split(" ")[0]);
    });
  }, []);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const copyReferral = () => {
    navigator.clipboard.writeText(referralLink);
    toast.success("Link copiado!");
  };

  const navItems: { id: Tab; label: string; icon: typeof BarChart3 }[] = [
    { id: "overview", label: "Visão Geral", icon: BarChart3 },
    { id: "network", label: "Minha Rede", icon: Users },
    { id: "wallet", label: "Carteira", icon: Wallet },
    { id: "career", label: "Carreira", icon: Trophy },
  ];

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile header */}
      <div
        className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-white/5 px-4 backdrop-blur-xl lg:hidden"
        style={{ backgroundColor: "rgba(10,10,10,0.9)" }}
      >
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-white">FitChain</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)} className="text-white">
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside
        className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-white/5 p-4 transition-transform lg:relative lg:translate-x-0 ${
          sidebarOpen ? "translate-x-0" : "-translate-x-full"
        }`}
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="mb-8 flex items-center gap-2 px-2 pt-14 lg:pt-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-white">FitChain</span>
          <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
            Coach
          </span>
        </div>

        <div className="mb-6 rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center gap-2.5">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/20 text-primary font-bold">
              {coachName.charAt(0)}
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-sm font-bold text-white truncate">{coachName}</p>
              <PatentBadge patent="senior_coach" size="sm" />
            </div>
          </div>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                onClick={() => {
                  setActiveTab(item.id);
                  setSidebarOpen(false);
                }}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors w-full text-left ${
                  isActive
                    ? "bg-primary/15 text-primary font-semibold"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/40 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-30 lg:hidden"
          style={{ backgroundColor: "rgba(0,0,0,0.6)" }}
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8 max-w-6xl mx-auto">
          {activeTab === "overview" && (
            <OverviewTab coachName={coachName} referralLink={referralLink} onCopy={copyReferral} />
          )}
          {activeTab === "network" && <NetworkTab referralLink={referralLink} onCopy={copyReferral} />}
          {activeTab === "wallet" && <WalletTab />}
          {activeTab === "career" && <CareerTab />}
        </div>
      </main>
    </div>
  );
}

/* ---------- TABS ---------- */

function OverviewTab({
  coachName,
  referralLink,
  onCopy,
}: {
  coachName: string;
  referralLink: string;
  onCopy: () => void;
}) {
  const stats = [
    { label: "Alunos ativos", value: "24", change: "+3", icon: Users },
    { label: "Vendas/mês", value: "R$ 3.680", change: "+18%", icon: TrendingUp },
    { label: "Comissões", value: "R$ 1.104", change: "+22%", icon: BarChart3 },
    { label: "Saldo", value: "R$ 2.450", change: "Disponível", icon: Wallet },
  ];

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Olá, {coachName}! 💪</h1>
          <p className="text-sm text-white/50">Resumo do seu mês</p>
        </div>
        <Button size="sm">
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
        <GoalsCard />
        <CareerProgress
          currentMonths={3}
          currentStudents={24}
          isTopSeller={false}
        />
      </div>
    </>
  );
}

function NetworkTab({ referralLink, onCopy }: { referralLink: string; onCopy: () => void }) {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Minha Rede</h1>
        <p className="text-sm text-white/50">Acompanhe sua rede MLM e simule ganhos</p>
      </div>

      <div className="grid gap-4 lg:grid-cols-2 mb-6">
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Alunos diretos</p>
          <p className="text-3xl font-bold text-white">24</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +3 este mês
          </p>
        </div>
        <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50 mb-1">Rede total (3 níveis)</p>
          <p className="text-3xl font-bold text-white">187</p>
          <p className="text-[11px] text-success mt-1 flex items-center gap-1">
            <ArrowUpRight className="h-3 w-3" /> +24 este mês
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
        <MinhaRede />
      </div>

      <div className="mt-4">
        <RankingTable />
      </div>
    </>
  );
}

function WalletTab() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Carteira</h1>
        <p className="text-sm text-white/50">Suas comissões e saques</p>
      </div>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))" }}>
        <p className="text-xs uppercase tracking-wider text-primary-foreground/80 font-bold">
          Saldo disponível
        </p>
        <p className="text-4xl font-bold text-primary-foreground mt-2">R$ 2.450,00</p>
        <p className="text-xs text-primary-foreground/70 mt-1">+ R$ 654,00 pendente</p>
        <Button
          variant="outline"
          className="mt-4 border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
        >
          <Wallet className="h-4 w-4 mr-2" /> Solicitar saque PIX
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 mb-6">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total ganho</p>
          <p className="text-xl font-bold text-white mt-1">R$ 12.840</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total sacado</p>
          <p className="text-xl font-bold text-white mt-1">R$ 9.736</p>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Histórico recente</h3>
        <div className="space-y-2">
          {[
            { who: "Carlos S. (direto)", value: 98.5, type: "Comissão direta 50%" },
            { who: "Ana L. (nível 1)", value: 29.55, type: "Comissão nível 1 - 15%" },
            { who: "Pedro M. (nível 2)", value: 9.85, type: "Comissão nível 2 - 5%" },
            { who: "Saque PIX", value: -800, type: "Aprovado em 10/04" },
          ].map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ backgroundColor: "#0F0F0F" }}
            >
              <div>
                <p className="text-xs font-medium text-white">{t.who}</p>
                <p className="text-[10px] text-white/40">{t.type}</p>
              </div>
              <span className={`text-sm font-bold ${t.value > 0 ? "text-success" : "text-white/70"}`}>
                {t.value > 0 ? "+" : ""}R$ {Math.abs(t.value).toFixed(2).replace(".", ",")}
              </span>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}

function CareerTab() {
  const allPatents: { p: import("@/components/coach/PatentBadge").PatentLevel; req: string; current?: boolean; achieved?: boolean }[] = [
    { p: "coach", req: "Cadastro aprovado", achieved: true },
    { p: "senior_coach", req: "10+ alunos diretos", current: true, achieved: true },
    { p: "manager", req: "30+ alunos + 3 coaches" },
    { p: "senior_manager", req: "60+ alunos + 5 managers" },
    { p: "director", req: "100+ alunos + 10 managers" },
    { p: "senior_director", req: "200+ alunos + 3 directors" },
    { p: "master_director", req: "500+ alunos + 5 directors" },
  ];

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Plano de Carreira</h1>
        <p className="text-sm text-white/50">Sua jornada na FitChain</p>
      </div>

      <CareerProgress currentMonths={3} currentStudents={24} isTopSeller={false} />

      <div className="mt-6 rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-4">Sistema de Patentes</h3>
        <div className="space-y-2">
          {allPatents.map((item) => (
            <div
              key={item.p}
              className={`flex items-center gap-3 rounded-xl p-3 ${
                item.current ? "ring-1 ring-primary/40" : ""
              }`}
              style={{ backgroundColor: item.current ? "rgba(255,107,0,0.05)" : "#0F0F0F" }}
            >
              <PatentBadge patent={item.p} size="md" showName={false} />
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <PatentBadge patent={item.p} size="sm" showName={true} />
                  {item.current && (
                    <span className="text-[9px] font-bold rounded-full bg-primary/20 px-2 py-0.5 text-primary">
                      ATUAL
                    </span>
                  )}
                </div>
                <p className="text-[11px] text-white/50 mt-0.5">{item.req}</p>
              </div>
              {item.achieved && (
                <span className="text-[10px] font-bold text-success">✓</span>
              )}
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
