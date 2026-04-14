import { createFileRoute, Link, Outlet } from "@tanstack/react-router";
import { Flame, LayoutDashboard, Users, Package, CreditCard, Settings, BarChart3, LogOut } from "lucide-react";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FitChain" },
      { name: "description", content: "Painel administrativo FitChain." },
    ],
  }),
  component: AdminLayout,
});

const navItems = [
  { to: "/admin" as const, label: "Dashboard", icon: LayoutDashboard },
  { to: "/admin" as const, label: "Coaches", icon: Users },
  { to: "/admin" as const, label: "Alunos", icon: Users },
  { to: "/admin" as const, label: "Produtos", icon: Package },
  { to: "/admin" as const, label: "Pagamentos", icon: CreditCard },
  { to: "/admin" as const, label: "Relatórios", icon: BarChart3 },
  { to: "/admin" as const, label: "Configurações", icon: Settings },
];

function AdminLayout() {
  return (
    <div className="flex min-h-screen bg-background">
      {/* Sidebar */}
      <aside className="hidden w-64 flex-col border-r border-border bg-sidebar p-4 lg:flex">
        <div className="mb-8 flex items-center gap-2 px-2">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-sidebar-foreground">FitChain</span>
          <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">Admin</span>
        </div>

        <nav className="flex flex-1 flex-col gap-1">
          {navItems.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className="flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/70 transition-colors hover:bg-sidebar-accent hover:text-sidebar-foreground"
            >
              <item.icon className="h-4 w-4" />
              {item.label}
            </Link>
          ))}
        </nav>

        <button className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-sidebar-foreground/50 hover:text-sidebar-foreground transition-colors">
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      {/* Main content */}
      <main className="flex-1 overflow-y-auto">
        <div className="p-6 lg:p-8">
          <AdminDashboard />
        </div>
      </main>
    </div>
  );
}

function AdminDashboard() {
  const stats = [
    { label: "Faturamento do mês", value: "R$ 45.230", change: "+12%", positive: true },
    { label: "Coaches ativos", value: "128", change: "+8", positive: true },
    { label: "Alunos ativos", value: "2.341", change: "+156", positive: true },
    { label: "Taxa de renovação", value: "73%", change: "-2%", positive: false },
  ];

  return (
    <>
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-foreground">Dashboard Admin</h1>
        <p className="text-sm text-muted-foreground">Visão geral da plataforma</p>
      </div>

      <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
        {stats.map((s) => (
          <div key={s.label} className="rounded-2xl border border-border bg-card p-5">
            <p className="text-sm text-muted-foreground">{s.label}</p>
            <p className="mt-1 text-2xl font-bold text-foreground">{s.value}</p>
            <p className={`mt-1 text-xs font-medium ${s.positive ? "text-success" : "text-destructive"}`}>
              {s.change} vs. mês anterior
            </p>
          </div>
        ))}
      </div>

      <div className="mt-8 rounded-2xl border border-border bg-card p-6">
        <h2 className="text-lg font-semibold text-foreground mb-4">Últimas vendas</h2>
        <p className="text-sm text-muted-foreground">
          Conecte o Lovable Cloud para ver dados reais do banco de dados.
        </p>
      </div>
    </>
  );
}
