import { Outlet, Link, createRootRoute, HeadContent, Scripts, useRouter } from "@tanstack/react-router";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { useEffect, useState } from "react";
import "../styles.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { touchLastLogin } from "@/lib/last-login.functions";
import { AuthLoadingGate } from "@/components/AuthLoadingGate";
import { ImageCropProvider } from "@/components/ui/ImageCropProvider";
import { Capacitor, type PluginListenerHandle } from "@capacitor/core";
import { completeNativeOAuthCallback, isNativeAuthCallback } from "@/lib/native-oauth";


function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">
          Page not found
        </h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRoute({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { name: "google", content: "notranslate" },
        { name: "theme-color", content: "#0B0707" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "FitMind Club" },
      { title: "FitMind Club" },
      { name: "description", content: "Conectando corpo e mente para uma versão melhor" },
      { property: "og:title", content: "FitMind Club" },
      { property: "og:description", content: "Conectando corpo e mente para uma versão melhor" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "FitMind Club" },
      { name: "twitter:description", content: "Conectando corpo e mente para uma versão melhor" },
      { name: "twitter:card", content: "summary" },
      { property: "og:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d768d0e4-7126-4c16-beb9-93af0700e741/id-preview-8360213d--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app-1778073116639.png" },
      { name: "twitter:image", content: "https://pub-bb2e103a32db4e198524a2e9ed8f35b4.r2.dev/d768d0e4-7126-4c16-beb9-93af0700e741/id-preview-8360213d--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app-1778073116639.png" },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
});

function RootShell({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className="dark" data-theme="dark">
      <head>
        <HeadContent />
        <link rel="manifest" href="/manifest.webmanifest" />
        <link rel="icon" type="image/png" href="/fitmind-icon.png" />
        <link rel="apple-touch-icon" sizes="180x180" href="/apple-touch-icon-180.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fitmind_theme')||'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if(!('serviceWorker' in navigator))return;navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){var u=(r.active&&r.active.scriptURL)||(r.installing&&r.installing.scriptURL)||(r.waiting&&r.waiting.scriptURL)||'';if(u.indexOf('firebase-messaging')!==-1||u.indexOf('OneSignal')!==-1)return;r.unregister();});}).catch(function(){});if('caches' in window){caches.keys().then(function(ns){ns.forEach(function(n){if(/(^|-)precache-v\\d+-|(^|-)runtime-|^html$|^workbox-/.test(n)){caches.delete(n);}});}).catch(function(){});}}catch(e){}})();`,
          }}
        />

      </head>
      <body style={{ backgroundColor: "#0b0707", margin: 0 }}>
        {children}
        <Scripts />

      </body>
    </html>
  );
}

function RootComponent() {
  const router = useRouter();
  const [fallbackQueryClient] = useState(() => new QueryClient());
  const queryClient =
    ((router.options.context as { queryClient?: QueryClient } | undefined)?.queryClient) ??
    fallbackQueryClient;
  useEffect(() => {
    let appUrlListener: PluginListenerHandle | undefined;
    let handlingNativeCallback = false;

    const handleNativeCallback = async (url: string) => {
      if (!isNativeAuthCallback(url) || handlingNativeCallback) return;
      handlingNativeCallback = true;
      try {
        const result = await completeNativeOAuthCallback(url);
        const { Browser } = await import("@capacitor/browser");
        await Browser.close();
        if (!result.ok) {
          const { toast } = await import("sonner");
          toast.error(result.error);
          await router.navigate({ to: "/login", replace: true });
          return;
        }
        await router.navigate({ to: "/auth/callback", replace: true });
      } finally {
        handlingNativeCallback = false;
      }
    };

    // Browser seguro + deep link para Google OAuth no Android/iOS. O listener
    // também trata o caso em que o SO reabre o app depois de o processo morrer.
    if (Capacitor.isNativePlatform()) {
      void (async () => {
        try {
          const { App } = await import("@capacitor/app");
          appUrlListener = await App.addListener("appUrlOpen", ({ url }) => {
            void handleNativeCallback(url);
          });
          const launchUrl = await App.getLaunchUrl();
          if (launchUrl?.url) void handleNativeCallback(launchUrl.url);
        } catch (error) {
          console.error("[OAuth] Listener nativo indisponível:", error);
        }
      })();
    }

    // ------------------------------------------------------------------
    // Links de e-mail (confirmação de cadastro e redefinição de senha).
    // Depois da troca para o domínio oficial fitmindclub.com.br, o Supabase passa a
    // entregar o token na RAIZ do site (hash `#access_token=...&type=recovery`
    // ou query `?code=...`). Sem este handler o usuário caía na home e o link
    // "não funcionava". Aqui interceptamos, criamos a sessão e mandamos para
    // a tela certa.
    // ------------------------------------------------------------------
    void (async () => {
      try {
        const hash = window.location.hash.startsWith("#") ? window.location.hash.slice(1) : "";
        const hashParams = new URLSearchParams(hash);
        const query = new URLSearchParams(window.location.search);

        const errorDesc = hashParams.get("error_description") || query.get("error_description");
        if (errorDesc) {
          window.history.replaceState({}, "", window.location.pathname);
          const expired = /expired|invalid/i.test(errorDesc);
          const { toast } = await import("sonner");
          toast.error(
            expired
              ? "O link expirou ou já foi utilizado. Solicite um novo e-mail."
              : "Não foi possível validar o link do e-mail.",
          );
          return;
        }

        const type = hashParams.get("type") || query.get("type");
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        const code = query.get("code");
        const path = window.location.pathname;

        // A tela de redefinição precisa tratar o código diretamente para evitar
        // corrida entre dois handlers tentando consumir o mesmo link.
        if (path === "/reset-password") return;

        if (!accessToken && !code) return;

        if (accessToken && refreshToken) {
          await supabase.auth.setSession({ access_token: accessToken, refresh_token: refreshToken });
        } else if (code) {
          const { error } = await supabase.auth.exchangeCodeForSession(code);
          if (error) return;
        }

        // Limpa o token da URL antes de navegar.
        window.history.replaceState({}, "", window.location.pathname);

        if (type === "recovery") {
          if (path !== "/reset-password") window.location.replace("/reset-password");
          return;
        }
        // signup / invite / magiclink / email_change
        if (path === "/" || path === "/login") window.location.replace("/portal-selector");
      } catch {
        /* ignora: fluxo normal segue */
      }
    })();

    // Push somente depois do login: evita pedir permissão na tela de entrada e
    // garante que o token seja associado ao usuário certo.
    const initPushForAuthenticatedUser = async () => {
      const { data } = await supabase.auth.getSession();
      if (!data.session) return;
      const { initPushNotifications, saveTokenToSupabase, syncPushTokenToCurrentUser } = await import("@/lib/push-notifications");
      await initPushNotifications({ onToken: saveTokenToSupabase });
      await syncPushTokenToCurrentUser();
    };
    void initPushForAuthenticatedUser().catch((error) => console.error("[Push] init falhou:", error));

    // Auto-reload quando o navegador tenta carregar um chunk JS antigo (após deploy)
    const onPreloadError = (e: Event) => {
      console.warn("[vite] preload error, reloading", e);
      window.location.reload();
    };
    const onChunkError = (e: ErrorEvent) => {
      const msg = e.message || "";
      if (msg.includes("Failed to fetch dynamically imported module") || msg.includes("Importing a module script failed")) {
        console.warn("[chunk] dynamic import failed, reloading", msg);
        window.location.reload();
      }
    };
    window.addEventListener("vite:preloadError", onPreloadError);
    window.addEventListener("error", onChunkError);

    // Registro de "último acesso": no máximo 1x a cada 12h por dispositivo.
    // Antes isso gravava a cada sessão detectada e a cada renovação de token,
    // gerando dezenas de milhares de escritas e travando o banco.
    const PING_KEY = "fitmind_last_login_ping";
    const PING_TTL = 12 * 60 * 60 * 1000;
    let done = false;
    const ping = async () => {
      if (done) return;
      try {
        const last = Number(localStorage.getItem(PING_KEY) || 0);
        if (Date.now() - last < PING_TTL) { done = true; return; }
      } catch { /* storage indisponível */ }
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        done = true;
        try {
          await touchLastLogin();
          try { localStorage.setItem(PING_KEY, String(Date.now())); } catch { /* ignore */ }
        } catch { /* ignore */ }
      }
    };
    ping();

    // O redirect inicial baseado em sessão é tratado pelo <AuthLoadingGate />
    // que envolve o <Outlet />. Isso evita o flash da tela de login antes
    // da navegação para /portal-selector quando já existe sessão válida.

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      // TOKEN_REFRESHED acontece a cada ~1h e em todo foco de aba: não registra acesso.
      if (event === "SIGNED_IN") {
        done = false; ping();
        void initPushForAuthenticatedUser().catch((error) => console.error("[Push] sync falhou:", error));
      }
      if (event === "SIGNED_OUT") {
        void import("@/lib/push-notifications").then(({ disablePushNotificationsOnSignOut }) => disablePushNotificationsOnSignOut());
      }
    });

    return () => {
      subscription.unsubscribe();
      void appUrlListener?.remove();
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onChunkError);
    };
  }, []);
  return (
    <ThemeProvider>
      <QueryClientProvider client={queryClient}>
        <ImageCropProvider>
          <AuthLoadingGate>
            <Outlet />
          </AuthLoadingGate>
          <Toaster richColors position="top-center" />
        </ImageCropProvider>
      </QueryClientProvider>
    </ThemeProvider>
  );
}

