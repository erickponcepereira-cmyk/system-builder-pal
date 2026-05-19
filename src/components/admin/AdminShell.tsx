import { Link, Outlet, useLocation, useNavigate } from "@tanstack/react-router";
import {
  LayoutDashboard, Users, UserCheck, Package, CreditCard,
  Settings, BarChart3, LogOut, Menu, X, Award, AlertTriangle,
  Library, ShoppingCart, GraduationCap, ShieldCheck, Loader2, Repeat, Dumbbell, Calendar, Store, Gift, TrendingUp, DollarSign, Truck, Lock, Trophy, Stethoscope,
} from "lucide-react";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { canAccess, type AdminPermKey, type AdminPerms } from "@/lib/admin-permissions";

const navItems: { to: string; label: string; icon: typeof LayoutDashboard; exact?: boolean; perm: AdminPermKey }[] = [
  { to: "/admin", label: "Dashboard", icon: LayoutDashboard, exact: true, perm: "dashboard" },
  { to: "/admin/coaches", label: "Coaches", icon: UserCheck, perm: "coaches" },
  { to: "/admin/coaches/inactivity", label: "Inatividade", icon: AlertTriangle, perm: "inactivity" },
  { to: "/admin/students", label: "Alunos", icon: Users, perm: "students" },
  { to: "/admin/users", label: "Admins", icon: ShieldCheck, perm: "users" },
  
  { to: "/admin/orders", label: "Pedidos", icon: ShoppingCart, perm: "orders" },
  { to: "/admin/digital-products", label: "Cursos", icon: Library, perm: "digital_products" },
  { to: "/admin/coach-applications", label: "Formação Coach", icon: GraduationCap, perm: "coach_applications" },
  { to: "/admin/payments", label: "Pagamentos", icon: CreditCard, perm: "payments" },
  { to: "/admin/reports", label: "Relatórios", icon: BarChart3, perm: "reports" },
  { to: "/admin/patents", label: "Patentes", icon: Award, perm: "patents" },
  { to: "/admin/calendars", label: "Agendas", icon: Calendar, perm: "calendars" },
  { to: "/admin/store", label: "Loja", icon: Store, perm: "store" },
  { to: "/admin/freebies", label: "Gratuitos", icon: Gift, perm: "freebies" },
  { to: "/admin/store-reports", label: "Relatórios da Loja", icon: TrendingUp, perm: "store_reports" },
  { to: "/admin/product-orders", label: "Painel de Pedidos", icon: Truck, perm: "product_orders" },
  { to: "/admin/nutritionist-wallet", label: "Carteira Nutricionista", icon: Lock, perm: "nutritionist_wallet" },
  { to: "/admin/career", label: "Carreira", icon: Trophy, perm: "career" },
  { to: "/admin/library", label: "Biblioteca", icon: Dumbbell, perm: "library" },
  { to: "/admin/partners", label: "Empresas Parceiras", icon: Store, perm: "partners" },
  { to: "/admin/professionals", label: "Profissionais da Saúde", icon: Stethoscope, perm: "professionals" },
  { to: "/admin/assessment-deletions", label: "Exclusões de Avaliações", icon: AlertTriangle, perm: "assessment_deletions" },
  { to: "/admin/settings", label: "Configurações", icon: Settings, perm: "settings" },
];

export function AdminShell() {
  const location = useLocation();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [authState, setAuthState] = useState<"checking" | "ok" | "denied">("checking");
  const [hasCoach, setHasCoach] = useState(false);
  const [hasStudent, setHasStudent] = useState(false);
  const [hasPartner, setHasPartner] = useState(false);
  const [isMaster, setIsMaster] = useState(false);
  const [perms, setPerms] = useState<AdminPerms | null>(null);

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
        .select("id, role, is_master_admin, admin_permissions")
        .eq("user_id", session.user.id)
        .maybeSingle();
      if (!active) return;
      if (profile?.role === "admin") {
        setAuthState("ok");
        setIsMaster(!!(profile as any).is_master_admin);
        setPerms(((profile as any).admin_permissions as AdminPerms) || {});
        if (profile?.id) {
          const [{ data: coach }, { data: student }, { data: partner }] = await Promise.all([
            supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
            supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
            supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle(),
          ]);
          if (!active) return;
          setHasCoach(!!coach);
          setHasStudent(!!student);
          setHasPartner(!!partner);
        }
      } else setAuthState("denied");
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
            {isMaster ? "Master" : "Admin"}
          </span>
        </div>


        <nav className="mt-14 flex flex-1 flex-col gap-1 lg:mt-0">
          {navItems.filter((it) => canAccess(perms, isMaster, it.perm)).map((item) => {
            const active = isActive(item.to, item.exact);
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

        <div className="mt-auto space-y-1 border-t border-white/5 pt-3">
          {hasCoach && (
            <button
              onClick={() => { sessionStorage.removeItem("fitmind_selected_area"); navigate({ to: "/coach" }); }}
              className="flex w-full items-center gap-3 rounded-lg bg-primary/10 px-3 py-2.5 text-sm font-semibold text-primary hover:bg-primary/20 transition-colors"
            >
              <Repeat className="h-4 w-4" />
              Painel do coach
            </button>
          )}
          {hasStudent && (
            <button
              onClick={() => { sessionStorage.setItem("fitmind_selected_area", "student"); navigate({ to: "/student" }); }}
              className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
            >
              <Dumbbell className="h-4 w-4" />
              Painel do aluno
            </button>
          )}
          {hasPartner ? (
            <button
              onClick={() => navigate({ to: "/partner" })}
              className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-sm font-semibold text-white/80 hover:bg-white/10 transition-colors"
            >
              <Store className="h-4 w-4" />
              Painel de parceiro
            </button>
          ) : (
            <button
              onClick={() => navigate({ to: "/become-partner" })}
              className="flex w-full items-center gap-3 rounded-lg bg-white/5 px-3 py-2.5 text-sm text-white/60 hover:text-white hover:bg-white/10 transition-colors"
            >
              <Store className="h-4 w-4" />
              Tornar-se parceiro
            </button>
          )}
          <button
            onClick={handleLogout}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm text-white/50 hover:text-white transition-colors"
          >
            <LogOut className="h-4 w-4" />
            Sair
          </button>
        </div>
      </aside>

      <main className="flex-1 overflow-y-auto pt-14 lg:pt-0">
        <div className="p-4 lg:p-8">
          <Outlet />
        </div>
      </main>
    </div>
  );
}
