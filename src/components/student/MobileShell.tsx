import { ReactNode } from "react";
import { Link, useLocation } from "@tanstack/react-router";
import { CalendarDays, TrendingUp, Gift, Home, ShoppingBag, Trophy, User } from "lucide-react";

import { cn } from "@/lib/utils";
import { RoleSwitcher } from "@/components/RoleSwitcher";
import { Logo } from "@/components/Logo";

interface MobileShellProps {
  children: ReactNode;
}
const navItems = [
  { to: "/student", label: "Home", icon: Home },
  { to: "/student/challenge", label: "Desafio", icon: Trophy },
  { to: "/student/calendar", label: "Agenda", icon: CalendarDays },
  { to: "/student/evolution", label: "Evolução", icon: TrendingUp },
  { to: "/student/store", label: "Loja", icon: ShoppingBag },
  { to: "/student/freebies", label: "Grátis", icon: Gift },
  { to: "/student/profile", label: "Perfil", icon: User },
] as const;

export function MobileShell({ children }: MobileShellProps) {
  const location = useLocation();

  return (
    <div className="h-screen w-full overflow-hidden flex justify-center bg-background">
      <div className="relative flex w-full max-w-[430px] flex-col h-screen overflow-hidden shadow-2xl bg-background">
        {/* Top header with role switcher */}
        <header
          className="sticky top-0 z-40 flex items-center justify-between px-4 py-2.5 border-b border-border bg-sidebar/95 text-sidebar-foreground backdrop-blur-xl"
        >
          <div className="flex items-center gap-2">
            <Logo className="h-7 w-7 object-contain" />
            <span className="text-sm font-bold text-sidebar-foreground">FitMind</span>
          </div>
          <RoleSwitcher current="student" />
        </header>

        <main className="flex-1 overflow-x-hidden overflow-y-auto pb-24 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">{children}</main>

        <nav className="absolute bottom-0 left-0 right-0 z-50 border-t border-border bg-sidebar/95 text-sidebar-foreground backdrop-blur-xl">
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
                    isActive ? "text-primary" : "text-sidebar-foreground/50 hover:text-sidebar-foreground"
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

