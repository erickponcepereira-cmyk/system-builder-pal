import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, UserCheck, Package, CreditCard,
  Settings, BarChart3, LogOut, Menu, X, Award, AlertTriangle,
  Library, ShoppingCart, GraduationCap, ShieldCheck, Loader2,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

const navItems = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true },
  { to: "/admin/coaches", label: "Coaches", icon: UserCheck },
  { to: "/admin/coaches/inactivity", label: "Inatividade", icon: AlertTriangle },
  { to: "/admin/students", label: "Alunos", icon: Users },
  { to: "/admin/users", label: "Admins", icon: ShieldCheck },
  { to: "/admin/products", label: "Produtos", icon: Package },
  { to: "/admin/orders", label: "Pedidos", icon: ShoppingCart },
  { to: "/admin/digital-products", label: "Cursos", icon: Library },
  { to: "/admin/coach-applications", label: "Formação Coach", icon: GraduationCap },
  { to: "/admin/payments", label: "Pagamentos", icon: CreditCard },
  { to: "/admin/reports", label: "Relatórios", icon: BarChart3 },
  { to: "/admin/patents", label: "Patentes", icon: Award },
  { to: "/admin/settings", label: "Configurações", icon: Settings },
] as const;

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session?.user) {
        if (active) navigate({ to: "/login" });
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (profile?.role === "admin") setAuthState("ok");
      else setAuthState("denied");
    })();
    return () => { active = false; };
  }, [navigate]);

  const handleLogout = async () => {
    await supabase.auth.signOut();
    navigate({ to: "/login" });
  };

  if (authState === "checking") {
    return (
      <div className="flex min-h-screen items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (authState === "denied") {
    return (
      <div className="flex min-h-screen flex-col items-center justify-center gap-4 p-8 text-center" style={{ backgroundColor: "#0A0A0A" }}>
        <ShieldCheck className="h-12 w-12 text-primary" />
        <h1 className="text-2xl font-bold text-white">Acesso restrito</h1>
        <p className="max-w-md text-sm text-white/60">
          Esta área é exclusiva para administradores. Solicite a um admin existente que promova sua conta.
        </p>
        <button
          onClick={handleLogout}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          Sair e voltar ao login
        </button>
      </div>
    );
  }

  const isActive = (to: string, exact?: boolean) =>
    exact ? location.pathname === to : location.pathname.startsWith(to);

  return (
    <div className="flex min-h-screen" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile top bar */}
      <header className="fixed top-0 left-0 right-0 z-40 flex h-14 items-center justify-between border-b border-white/5 bg-[#0F0F0F] px-4 lg:hidden">
        <div className="flex items-center gap-2">
<Logo className="h-8 w-auto object-contain" />
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
<Logo className="h-9 w-auto object-contain" />
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
