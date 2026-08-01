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
 * Splash inicial que bloqueia renderização até resolver a sessão Supabase.
 * Possui múltiplas defesas contra travamento:
 *  - Timeout de 4s para getSession()
 *  - Hard cap de 5s que libera splash sempre
 *  - Watchdog que reintenta navegação e cai para window.location no pior caso
 */
export function AuthLoadingGate({ children }: { children: React.ReactNode }) {
  const navigate = useNavigate();
  const pathname = useRouterState({ select: (s) => s.location.pathname });
  const [sessionResolved, setSessionResolved] = useState(false);
  const [hasSession, setHasSession] = useState(false);
  const [hardCapReleased, setHardCapReleased] = useState(false);
  const redirectAttemptsRef = useRef(0);
  const redirectWatchdogRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const isAuthFlowRoute = pathname === "/reset-password" || pathname === "/auth/callback";
  const hasAuthLinkParams = (() => {
    if (typeof window === "undefined") return false;
    const query = new URLSearchParams(window.location.search);
    const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
    const hashParams = new URLSearchParams(hash);
    return Boolean(
      query.get("code") ||
      query.get("error_description") ||
      hashParams.get("access_token") ||
      hashParams.get("error_description") ||
      hashParams.get("type") === "recovery" ||
      query.get("type") === "recovery",
    );
  })();

  // Resolver sessão inicial + listener + timeouts de segurança
  useEffect(() => {
    let active = true;

    // PWA (ícone na tela de início): sem storage persistente o sistema pode
    // descartar o localStorage ao fechar o app — e a sessão do Google some.
    void (async () => {
      try {
        if (navigator.storage?.persist && !(await navigator.storage.persisted())) {
          await navigator.storage.persist();
        }
      } catch { /* best-effort */ }
    })();


    const getSessionTimeout = setTimeout(() => {
      if (!active) return;
      console.warn("[AUTH_GATE] getSession timeout, liberando splash");
      setSessionResolved((prev) => (prev ? prev : true));
    }, 4000);

    // Hard cap: libera splash de qualquer jeito depois de 5s
    const hardCap = setTimeout(() => {
      if (!active) return;
      console.warn("[AUTH_GATE] hard cap release");
      setSessionResolved(true);
      setHardCapReleased(true);
    }, 5000);

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
        clearTimeout(getSessionTimeout);
      }
    })();

    const { data: sub } = supabase.auth.onAuthStateChange((event, session) => {
      if (!active) return;
      const ok = Boolean(session?.user);
      if (event === "SIGNED_OUT") {
        redirectAttemptsRef.current = 0;
        setHasSession(false);
        setSessionResolved(true);
        return;
      }
      if (event === "INITIAL_SESSION") {
        setHasSession(ok);
        setSessionResolved(true);
        return;
      }
      // Outros eventos apenas atualizam hasSession, não forçam sessionResolved
      if (event === "SIGNED_IN" || event === "USER_UPDATED" || event === "TOKEN_REFRESHED") {
        setHasSession(ok);
      }
    });

    return () => {
      active = false;
      clearTimeout(getSessionTimeout);
      clearTimeout(hardCap);
      if (redirectWatchdogRef.current) clearTimeout(redirectWatchdogRef.current);
      sub.subscription.unsubscribe();
    };
  }, []);

  // Reseta contador de redirect ao sair das rotas de entrada
  useEffect(() => {
    if (pathname !== "/portal-selector" && pathname !== "/" && pathname !== "/login") {
      redirectAttemptsRef.current = 0;
    }
  }, [pathname]);

  // Navegação para portal-selector com watchdog de retry
  useEffect(() => {
    if (!sessionResolved || !hasSession) return;
    if (isAuthFlowRoute || hasAuthLinkParams) return;
    if (pathname !== "/" && pathname !== "/login") return;
    if (redirectAttemptsRef.current >= 3) return;

    const attempt = redirectAttemptsRef.current + 1;
    redirectAttemptsRef.current = attempt;
    console.log(`[AUTH_GATE] navegando para portal-selector (tentativa ${attempt})`);

    try {
      navigate({ to: "/portal-selector", replace: true });
    } catch (err) {
      console.warn("[AUTH_GATE] navigate falhou", err);
    }

    if (redirectWatchdogRef.current) clearTimeout(redirectWatchdogRef.current);
    redirectWatchdogRef.current = setTimeout(() => {
      // Se ainda estamos travados na mesma rota, escalar
      if (pathname === "/" || pathname === "/login") {
        if (attempt >= 2) {
          console.warn("[AUTH_GATE] fallback window.location.replace");
          try {
            if (typeof window !== "undefined") {
              window.location.replace("/portal-selector");
            }
          } catch {
            // ignore
          }
        }
      }
    }, 1500);
  }, [sessionResolved, hasSession, pathname, navigate, isAuthFlowRoute, hasAuthLinkParams]);

  const stillRedirecting =
    sessionResolved &&
    hasSession &&
    (pathname === "/" || pathname === "/login") &&
    !isAuthFlowRoute &&
    !hasAuthLinkParams &&
    !hardCapReleased;

  const showSplash = (!sessionResolved || stillRedirecting) && !hardCapReleased;

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
          gap: 0,
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
          className="h-32 sm:h-40 w-auto object-contain"
          alt="FitMind Club"
          style={{
            animation: "fm-splash-logo 400ms cubic-bezier(0.22, 1, 0.36, 1) both",
            willChange: "opacity, transform",
            marginBottom: 16,
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
