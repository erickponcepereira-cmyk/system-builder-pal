import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Users, TrendingUp, Wallet, Plus, BarChart3, User, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/coach")({
  head: () => ({
    meta: [
      { title: "Painel Coach — FitChain" },
      { name: "description", content: "Gerencie sua rede, vendas e comissões." },
    ],
  }),
  component: CoachDashboard,
});

function CoachDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const stats = [
    { label: "Clientes ativos", value: "24", icon: Users },
    { label: "Vendas no mês", value: "R$ 3.680", icon: TrendingUp },
    { label: "Comissões do mês", value: "R$ 1.104", icon: BarChart3 },
    { label: "Saldo disponível", value: "R$ 2.450", icon: Wallet },
  ];

  const navItems = [
    { label: "Visão Geral", icon: BarChart3 },
    { label: "Minha Rede", icon: Users },
    { label: "Meus Clientes", icon: User },
    { label: "Vendas", icon: TrendingUp },
    { label: "Carteira", icon: Wallet },
  ];

  return (
    <div className="flex min-h-screen bg-background">
      {/* Mobile header */}
      <div className="fixed top-0 left-0 right-0 z-50 flex h-14 items-center justify-between border-b border-border bg-background/90 px-4 backdrop-blur-xl lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-foreground">FitChain</span>
        </div>
        <button onClick={() => setSidebarOpen(!sidebarOpen)}>
          {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </div>

      {/* Sidebar */}
      <aside className={`fixed inset-y-0 left-0 z-40 w-64 transform border-r border-border bg-sidebar p-4 transition-transform lg:relative lg:translate-x-0 ${sidebarOpen ? "translate-x-0" : "-translate-x-full"}`}>
        <div className="mb-8 flex items-center gap-2 px-2 pt-14 lg:pt-0">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-foreground">FitChain</span>
          <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">Coach</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <button
              key={item.label}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground w-full text-left"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </button>
          ))}
        </nav>

        <Link to="/" className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <LogOut className="h-4 w-4" />
          Sair
        </Link>
      </aside>

      {/* Overlay */}
      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-background/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8 flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-foreground">Olá, Coach! 💪</h1>
              <p className="text-sm text-muted-foreground">Aqui está seu resumo do mês</p>
            </div>
            <Button size="sm">
              <Plus className="h-4 w-4 mr-1" /> Nova venda
            </Button>
          </div>

          <div className="grid gap-4 grid-cols-2 lg:grid-cols-4">
            {stats.map((s) => (
              <div key={s.label} className="rounded-2xl border border-border bg-card p-4 sm:p-5">
                <div className="flex items-center gap-2 mb-2">
                  <s.icon className="h-4 w-4 text-primary" />
                  <p className="text-xs text-muted-foreground">{s.label}</p>
                </div>
                <p className="text-xl font-bold text-foreground sm:text-2xl">{s.value}</p>
              </div>
            ))}
          </div>

          {/* Wallet highlight */}
          <div className="mt-6 rounded-2xl gradient-primary p-6">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-sm text-primary-foreground/80">Saldo disponível para saque</p>
                <p className="text-3xl font-bold text-primary-foreground mt-1">R$ 2.450,00</p>
              </div>
              <Button variant="outline" className="border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10">
                Solicitar saque
              </Button>
            </div>
          </div>

          <div className="mt-6 rounded-2xl border border-border bg-card p-6">
            <h2 className="text-lg font-semibold text-foreground mb-4">Últimos clientes</h2>
            <p className="text-sm text-muted-foreground">Conecte o Lovable Cloud para dados reais.</p>
          </div>
        </div>
      </main>
    </div>
  );
}
