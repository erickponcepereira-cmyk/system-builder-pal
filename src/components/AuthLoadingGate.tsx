import { useEffect, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

/**
 * Bloqueia a renderização inicial até resolver a sessão Supabase.
 *
 * Sem isso, ao abrir o APK em "/" ou "/login" a tela de login pisca por
 * alguns milissegundos antes do redirect para /portal-selector.
 *
 * Regras:
 *  - Só "trava" o render quando a rota atual é "/" ou "/login" — para não
 *    quebrar deep links (ex.: /pay/:order, /r/:code, /resultado/:token).
 *  - Mostra apenas o splash com a logo enquanto verifica.
 *  - Após a verificação, navega para /portal-selector (com sessão) ou
 *    libera a renderização normal de /login (sem sessão).
 */
export function AuthLoadingGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [ready, setReady] = useState(false);

  const gateActive = pathname === "/" || pathname === "/login";

  useEffect(() => {
    if (!gateActive) {
      setReady(true);
      return;
    }
    let active = true;
    setReady(false);
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        if (data.session?.user) {
          navigate({ to: "/portal-selector", replace: true });
          // Mantém o splash visível durante a transição; o portal-selector
          // assume o controle imediatamente após.
          return;
        }
        setReady(true);
      } catch {
        if (active) setReady(true);
      }
    })();
    return () => {
      active = false;
    };
  }, [gateActive, pathname, navigate]);

  if (gateActive && !ready) {
    return (
      <div
        style={{
          position: "fixed",
          inset: 0,
          background: "#0b0707",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          zIndex: 9999,
        }}
      >
        <Logo className="h-32 w-auto object-contain" alt="FitMind" />
      </div>
    );
  }

  return <>{children}</>;
}
