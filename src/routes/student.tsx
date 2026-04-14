import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Calendar, Scale, Trophy, Gift, Users, MessageCircle, BookOpen, CreditCard, LogOut, Menu, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useState } from "react";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Minha Área — FitChain" },
      { name: "description", content: "Acompanhe seus desafios fitness." },
    ],
  }),
  component: StudentDashboard,
});

function StudentDashboard() {
  const [sidebarOpen, setSidebarOpen] = useState(false);

  const navItems = [
    { label: "Meu Desafio", icon: Trophy },
    { label: "Grade de Aulas", icon: Calendar },
    { label: "Pesagens", icon: Scale },
    { label: "Benefícios", icon: Gift },
    { label: "Indicações", icon: Users },
    { label: "Receitas", icon: BookOpen },
    { label: "Chat Coach", icon: MessageCircle },
    { label: "Meus Planos", icon: CreditCard },
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

      {sidebarOpen && (
        <div className="fixed inset-0 z-30 bg-background/60 lg:hidden" onClick={() => setSidebarOpen(false)} />
      )}

      {/* Main */}
      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 sm:p-6 lg:p-8">
          <div className="mb-8">
            <h1 className="text-2xl font-bold text-foreground">Olá, Aluno! 🔥</h1>
            <p className="text-sm text-muted-foreground">Acompanhe seu desafio de 30 dias</p>
          </div>

          {/* Digital card */}
          <div className="rounded-2xl gradient-primary p-6 mb-6 relative overflow-hidden">
            <div className="absolute top-0 right-0 w-32 h-32 bg-primary-foreground/5 rounded-full -translate-y-8 translate-x-8" />
            <div className="relative z-10">
              <p className="text-sm text-primary-foreground/80">Carteirinha Digital</p>
              <p className="text-xl font-bold text-primary-foreground mt-1">Desafio 30 Dias — Premium</p>
              <div className="mt-4 flex items-center gap-4 text-sm text-primary-foreground/70">
                <span>Válido até: 15/05/2026</span>
                <span className="rounded-full bg-primary-foreground/20 px-3 py-0.5 text-primary-foreground text-xs font-medium">Ativo</span>
              </div>
            </div>
          </div>

          {/* Progress */}
          <div className="rounded-2xl border border-border bg-card p-5 mb-6">
            <div className="flex items-center justify-between mb-3">
              <h2 className="font-semibold text-foreground">Progresso do Desafio</h2>
              <span className="text-sm text-primary font-medium">Dia 18/30</span>
            </div>
            <div className="h-3 w-full rounded-full bg-secondary">
              <div className="h-3 rounded-full gradient-primary" style={{ width: "60%" }} />
            </div>
            <p className="mt-2 text-xs text-muted-foreground">60% concluído — Continue assim!</p>
          </div>

          {/* Quick access */}
          <h2 className="font-semibold text-foreground mb-4">Acesso rápido</h2>
          <div className="grid gap-3 grid-cols-2 sm:grid-cols-4">
            {navItems.slice(0, 4).map((item) => (
              <button
                key={item.label}
                className="flex flex-col items-center gap-2 rounded-2xl border border-border bg-card p-4 transition-colors hover:border-primary/30"
              >
                <item.icon className="h-6 w-6 text-primary" />
                <span className="text-xs text-muted-foreground">{item.label}</span>
              </button>
            ))}
          </div>
        </div>
      </main>
    </div>
  );
}
