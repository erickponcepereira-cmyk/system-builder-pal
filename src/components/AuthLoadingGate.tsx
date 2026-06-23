import { useEffect, useRef, useState } from "react";
import { useNavigate, useRouterState } from "@tanstack/react-router";
import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";

let nativeSplashHidden = false;
async function hideNativeSplash() {
  if (nativeSplashHidden) return;
  nativeSplashHidden = true;
  try {
    if (Capacitor.isNativePlatform()) {
      const { SplashScreen } = await import("@capacitor/splash-screen");
      // DIAGNÓSTICO TEMPORÁRIO — segura o splash nativo por 1s antes de esconder
      await new Promise((r) => setTimeout(r, 1000));
      await SplashScreen.hide({ fadeOutDuration: 200 });
    }
  } catch {
    // ignore
  }
}

/**
 * Splash inicial que bloqueia COMPLETAMENTE qualquer renderização até
 * resolver a sessão Supabase no primeiro mount.
 *
 * Por que existe:
 *  - Ao abrir o APK com sessão válida, qualquer render intermediário de
 *    "/" (landing) ou "/login" aparece como flash antes do redirect.
 *  - Mesmo um único frame de Outlet renderizando a rota errada é visível.
 *
 * Estratégia:
 *  - No primeiro mount, NUNCA renderiza children até `supabase.auth.getSession()`
 *    resolver. Mostra apenas o splash.
 *  - Após resolver:
 *      • com sessão e rota atual em "/" ou "/login" → navega para
 *        /portal-selector e mantém o splash até a rota mudar.
 *      • sem sessão → libera children normalmente.
 *  - Deep links (ex.: /pay/:order, /r/:code, /resultado/:token, /invite/:token)
 *    NÃO são afetados pelo redirect — o splash some assim que a sessão é
 *    avaliada e o conteúdo da rota carrega normalmente.
 */
export function AuthLoadingGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sessionResolved, setSessionResolved] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const redirectedRef = useRef(false);

  // Bloqueia qualquer render até resolver a primeira chamada de getSession().
  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data } = await supabase.auth.getSession();
        if (!active) return;
        setHasSession(Boolean(data.session?.user));
      } catch {
        if (active) setHasSession(false);
      } finally {
        if (active) setSessionResolved(true);
      }
    })();
    return () => {
      active = false;
    };
  }, []);

  // Com sessão válida, se ainda estamos em "/" ou "/login", manda para o
  // seletor de portal. O splash continua visível até a rota mudar.
  useEffect(() => {
    if (!sessionResolved || !hasSession || redirectedRef.current) return;
    if (pathname === "/" || pathname === "/login") {
      redirectedRef.current = true;
      navigate({ to: "/portal-selector", replace: true });
    }
  }, [sessionResolved, hasSession, pathname, navigate]);

  const stillRedirecting =
    sessionResolved && hasSession && (pathname === "/" || pathname === "/login");

  const showSplash = !sessionResolved || stillRedirecting;

  // Esconde o splash nativo do Capacitor APENAS quando o React já decidiu
  // o destino final (portal selector ou login/children) e está pronto para
  // pintar — evita ver a landing entre splash nativo e React.
  useEffect(() => {
    if (!showSplash) {
      hideNativeSplash();
    }
  }, [showSplash]);

  if (showSplash) {
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
