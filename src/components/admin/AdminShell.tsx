import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  Flame, LayoutDashboard, Users, UserCheck, Package, CreditCard,
  Settings, BarChart3, LogOut, Menu, X, Award, AlertTriangle,
} from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/coaches", label: "Coaches", icon: UserCheck },
  { to: "/admin/coaches/inactivity", label: "Inatividade", icon: AlertTriangle },
  { to: "/admin/students", label: "Alunos", icon: Users },
  { to: "/admin/products", label: "Produtos", icon: Package },
  { to: "/admin/payments", label: "Pagamentos", icon: CreditCard },
  { to: "/admin/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/admin/patents", label: "Patentes", icon: Award },
  { to: "/admin/settings", label: "Configurações", icon: Settings },
] as const;

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-white/5 bg-[#0F0F0F] px-4 lg:hidden">
        <div className="flex items-center gap-2">
          <div className="flex h-7 w-7 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="font-bold text-white">FitMind Club Admin</span>
        </div>
        <button onClick={() => setOpen(!open)} className="text-white">
          {open ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
        </button>
      </header>

      {/* Sidebar */}
      <aside
        className={`fixed lg:sticky top-0 left-0 z-30 h-screen w-64 flex-col border-r border-white/5 p-4 transition-transform lg:flex lg:translate-x-0 ${
          open ? "flex translate-x-0" : "hidden -translate-x-full"
        }`}
        style={{ backgroundColor: "#0F0F0F" }}
      >
        <div className="mb-8 hidden items-center gap-2 px-2 lg:flex">
          <div className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary">
            <Flame className="h-4 w-4 text-primary-foreground" />
          </div>
          <span className="text-lg font-bold text-white">FitMind Club</span>
          <span className="ml-auto rounded bg-primary/20 px-2 py-0.5 text-xs font-medium text-primary">
            Admin
          </span>
        </div>

        <nav className="mt-14 flex flex-1 flex-col gap-1 lg:mt-0">
          {navItems.map((item) => {
            const active = isActive(item.to, "exact" in item ? item.exact : false);
            return (
              <Link
                key={item.label}
                to={item.to}
                onClick={() => setOpen(false)}
                className={`flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm transition-colors ${
                  active
                    ? "bg-primary/15 text-primary font-medium"
                    : "text-white/60 hover:bg-white/5 hover:text-white"
                }`}
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>

        <button
          onClick={handleLogout}
          className="mt-auto flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/50 hover:text-white transition-colors"
        >
          <LogOut className="h-4 w-4" />
          Sair
        </button>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
