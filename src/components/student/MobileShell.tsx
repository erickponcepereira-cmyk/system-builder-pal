import { ReactNode, useEffect, useState } from "react";
import { Link, useLocation, useNavigate } from "@tanstack/react-router";
import { BookOpen, Gift, Home, MessageCircle, Repeat, ShoppingBag, Trophy, User } from "lucide-react";
import { cn } from "@/lib/utils";
import { supabase } from "@/integrations/supabase/client";

interface MobileShellProps {
  children: ReactNode;
}

const navItems = [
  { to: "/student", label: "Home", icon: Home },
  { to: "/student/challenge", label: "Desafio", icon: Trophy },
  { to: "/student/group", label: "Grupo", icon: MessageCircle },
  { to: "/student/store", label: "Loja", icon: ShoppingBag },
  { to: "/student/coach-course", label: "Cursos", icon: BookOpen },
  { to: "/student/benefits", label: "Benefícios", icon: Gift },
  { to: "/student/profile", label: "Perfil", icon: User },
] as const;

export function MobileShell({ children }: MobileShellProps) {
  const location = useLocation();
  const navigate = useNavigate();
  const [isCoach, setIsCoach] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.id || !active) return;
      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (!active) return;
      setIsCoach(!!coach);
    })();
    return () => { active = false; };
  }, []);

  const goToCoach = () => {
    sessionStorage.removeItem("fitmind_selected_area");
    navigate({ to: "/coach" });
  };

  return (
    <div className="min-h-screen w-full overflow-x-hidden flex justify-center" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile container 430px max */}
      <div
          className="relative flex w-full max-w-[430px] flex-col min-h-screen overflow-x-hidden shadow-2xl"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        {/* Content */}
        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-24">{children}</main>

        {/* Switch to Coach panel — only visible for users with active coach record */}
        {isCoach && (
          <button
            onClick={goToCoach}
            className="fixed bottom-24 left-1/2 z-50 flex -translate-x-1/2 items-center gap-2 rounded-full bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground shadow-lg shadow-primary/30 hover:bg-primary/90 transition-colors"
            style={{ marginBottom: "env(safe-area-inset-bottom)" }}
          >
            <Repeat className="h-3.5 w-3.5" />
            Ir para painel do coach
          </button>
        )}

        {/* Bottom Navigation */}
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 border-t border-white/5"
          style={{ backgroundColor: "rgba(15,15,15,0.95)", backdropFilter: "blur(20px)" }}
        >
          <div className="grid grid-cols-7 px-1 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
            {navItems.map((item) => {
              const isActive =
                item.to === "/student"
                  ? location.pathname === "/student"
                  : location.pathname.startsWith(item.to);
              const Icon = item.icon;
              return (
                <Link
                  key={item.to}
                  to={item.to}
                  className={cn(
                    "flex flex-col items-center justify-center gap-1 rounded-xl px-0.5 py-2 min-w-0 transition-all",
                    isActive ? "text-primary" : "text-white/40 hover:text-white/70"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-8 w-8 items-center justify-center rounded-xl transition-all",
                      isActive && "bg-primary/15"
                    )}
                  >
                    <Icon className={cn("h-4 w-4", isActive && "scale-110")} />
                  </div>
                  <span className="max-w-full truncate text-[8px] font-medium leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
