import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import "../styles.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { touchLastLogin } from "@/lib/last-login.functions";
import { AuthLoadingGate } from "@/components/AuthLoadingGate";

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
        <link rel="icon" type="image/png" href="/fitmind-icon.png" />
        <link rel="apple-touch-icon" href="/fitmind-icon.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fitmind_theme')||'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.dataset.theme=t;}catch(e){}})();`,
          }}
        />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{if('serviceWorker' in navigator){navigator.serviceWorker.getRegistrations().then(function(rs){rs.forEach(function(r){r.unregister();});}).catch(function(){});}if(typeof caches!=='undefined'&&caches.keys){caches.keys().then(function(ks){return Promise.all(ks.map(function(k){return caches.delete(k);}));}).catch(function(){});}}catch(e){}})();`,
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
      <AuthLoadingGate>
        <Outlet />
      </AuthLoadingGate>
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  );
}

