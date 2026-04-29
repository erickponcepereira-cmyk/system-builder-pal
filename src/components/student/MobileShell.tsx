import { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { Home, Trophy, MessageCircle, User, ShoppingBag } from "lucide-react";
import { cn } from "@/lib/utils";

interface MobileShellProps {
  children: ReactNode;
}

const navItems = [
  { to: "/student", label: "Início", icon: Home },
  { to: "/student/challenge", label: "Desafio", icon: Trophy },
  { to: "/student/group", label: "Grupo", icon: MessageCircle },
  { to: "/student/store", label: "Loja", icon: ShoppingBag },
  { to: "/student/profile", label: "Perfil", icon: User },
] as const;

export function MobileShell({ children }: MobileShellProps) {
  const location = useLocation();

  return (
    <div className="min-h-screen w-full overflow-x-clip flex justify-center" style={{ backgroundColor: "#0A0A0A" }}>
      {/* Mobile container 430px max */}
      <div
          className="relative flex w-full max-w-[430px] flex-col min-h-screen overflow-x-clip shadow-2xl"
        style={{ backgroundColor: "#0F0F0F" }}
      >
        {/* Content */}
        <main className="flex-1 overflow-x-clip overflow-y-auto pb-24">{children}</main>

        {/* Bottom Navigation */}
        <nav
          className="fixed bottom-0 left-1/2 -translate-x-1/2 w-full max-w-[430px] z-50 border-t border-white/5"
          style={{ backgroundColor: "rgba(15,15,15,0.95)", backdropFilter: "blur(20px)" }}
        >
          <div className="grid grid-cols-5 px-2 py-2 pb-[max(0.5rem,env(safe-area-inset-bottom))]">
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
                    "flex flex-col items-center justify-center gap-1 rounded-xl px-1 py-2 min-w-0 transition-all",
                    isActive ? "text-primary" : "text-white/40 hover:text-white/70"
                  )}
                >
                  <div
                    className={cn(
                      "flex h-9 w-9 items-center justify-center rounded-xl transition-all",
                      isActive && "bg-primary/15"
                    )}
                  >
                    <Icon className={cn("h-5 w-5", isActive && "scale-110")} />
                  </div>
                  <span className="max-w-full truncate text-[9px] font-medium leading-none">{item.label}</span>
                </Link>
              );
            })}
          </div>
        </nav>
      </div>
    </div>
  );
}
