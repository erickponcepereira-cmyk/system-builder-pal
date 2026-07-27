import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import "../styles.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { touchLastLogin } from "@/lib/last-login.functions";
import { AuthLoadingGate } from "@/components/AuthLoadingGate";
import { registerAppServiceWorker } from "@/pwa-register";
import { ImageCropProvider } from "@/components/ui/ImageCropProvider";


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
        <link rel="apple-touch-icon" sizes="180x180" href="/fitmind-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fitmind_theme')||'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var h=location.hostname;var isPreview=(h.indexOf('id-preview--')===0||h.indexOf('preview--')===0||h==='lovableproject.com'||h.endsWith('.lovableproject.com')||h.endsWith('.lovableproject-dev.com')||h.endsWith('.beta.lovable.dev'));var killSw=(new URLSearchParams(location.search)).get('sw')==='off';if((isPreview||killSw)&&'serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){var u=(r.active&&r.active.scriptURL)||(r.installing&&r.installing.scriptURL)||(r.waiting&&r.waiting.scriptURL)||'';if(u.indexOf('firebase-messaging')===-1&&u.indexOf('OneSignal')===-1){r.unregister();}});}).catch(function(){});}}catch(e){}})();`,
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
  useEffect(() => {
    // ------------------------------------------------------------------
    // Links de e-mail (confirmação de cadastro e redefinição de senha).
    // Depois da troca de domínio para fitmindclub.com.br, o Supabase passa a
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

    // Registra o service worker mínimo (produção fora de preview) para viabilizar
    // instalação como app (WebAPK) no Chrome Android.
    registerAppServiceWorker();


    // Push Notifications (apenas em Capacitor Android/iOS; no-op no navegador)
    import("@/lib/push-notifications").then(({ initPushNotifications, saveTokenToSupabase }) => {
      initPushNotifications({ onToken: saveTokenToSupabase }).catch((err) => {
        console.error("[Push] init falhou:", err);
      });
    });

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

    let done = false;
    const ping = async () => {
      if (done) return;
      const { data } = await supabase.auth.getSession();
      if (data.session) {
        done = true;
        try { await touchLastLogin(); } catch { /* ignore */ }
      }
    };
    ping();

    // O redirect inicial baseado em sessão é tratado pelo <AuthLoadingGate />
    // que envolve o <Outlet />. Isso evita o flash da tela de login antes
    // da navegação para /portal-selector quando já existe sessão válida.

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "SIGNED_IN" || event === "TOKEN_REFRESHED") {
        done = false; ping();
      }
    });
    return () => {
      subscription.unsubscribe();
      window.removeEventListener("vite:preloadError", onPreloadError);
      window.removeEventListener("error", onChunkError);
    };
  }, []);
  return (
    <ThemeProvider>
      <ImageCropProvider>
        <AuthLoadingGate>
          <Outlet />
        </AuthLoadingGate>
        <Toaster richColors position="top-center" />
      </ImageCropProvider>
    </ThemeProvider>

  );
}

