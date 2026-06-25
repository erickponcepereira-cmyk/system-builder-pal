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
        const ok = Boolean(data.session?.user);
        if (ok) console.log("[AUTH_GATE] sessão encontrada");
        setHasSession(ok);
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
      console.log("[AUTH_GATE] navegando para portal-selector");
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
          background: "#0B0707",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 28,
          zIndex: 9999,
          padding: "0 32px",
        }}
      >
        <style>{`
          @keyframes fm-splash-logo {
            0% { opacity: 0; transform: scale(0.85); }
            100% { opacity: 1; transform: scale(1); }
          }
          @keyframes fm-splash-slogan {
            0% { opacity: 0; transform: translateY(8px); }
            100% { opacity: 1; transform: translateY(0); }
          }
        `}</style>
        <Logo
          className="h-28 sm:h-36 w-auto object-contain"
          alt="FitMind Club"
          style={{
            animation: "fm-splash-logo 400ms cubic-bezier(0.22, 1, 0.36, 1) both",
            willChange: "opacity, transform",
          } as React.CSSProperties}
        />
        <p
          style={{
            margin: 0,
            color: "#FFFFFF",
            fontSize: 14,
            letterSpacing: 0.3,
            textAlign: "center",
            maxWidth: 320,
            lineHeight: 1.5,
            opacity: 0,
            animation: "fm-splash-slogan 600ms ease-out 1200ms forwards",
          }}
        >
          Conectando corpo e mente
          <br />
          <span style={{ color: "#FF4A3D", fontWeight: 600 }}>para uma versão melhor</span>
        </p>
      </div>
    );
  }

  return <>{children}</>;
}
