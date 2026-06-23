import { Outlet, Link, createRootRoute, HeadContent, Scripts } from "@tanstack/react-router";
import { useEffect } from "react";
import "../styles.css";
import { ThemeProvider } from "@/components/theme-provider";
import { Toaster } from "@/components/ui/sonner";
import { supabase } from "@/integrations/supabase/client";
import { touchLastLogin } from "@/lib/last-login.functions";

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
        { name: "theme-color", content: "#0b0707" },
        { name: "mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-capable", content: "yes" },
        { name: "apple-mobile-web-app-status-bar-style", content: "black-translucent" },
        { name: "apple-mobile-web-app-title", content: "FitMind" },
      { title: "FitMindClub" },
      { name: "description", content: "Conectando corpo e mente para sua melhor versão" },
      { property: "og:title", content: "FitMindClub" },
      { property: "og:description", content: "Conectando corpo e mente para sua melhor versão" },
      { property: "og:type", content: "website" },
      { name: "twitter:title", content: "FitMindClub" },
      { name: "twitter:description", content: "Conectando corpo e mente para sua melhor versão" },
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
        <link rel="apple-touch-icon" href="/fitmind-logo.png" />
        <script
          dangerouslySetInnerHTML={{
            __html: `(function(){try{var t=localStorage.getItem('fitmind_theme')||'dark';var r=document.documentElement;r.classList.remove('light','dark');r.classList.add(t);r.dataset.theme=t;}catch(e){}})();`,
          }}
        />
      </head>
      <body>
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

    try {
      console.log("[AUTH] __root.tsx pathname:", window.location.pathname);
      console.log(
        "[AUTH] __root.tsx localStorage token raw:",
        window.localStorage.getItem("sb-myqyjifvrlwvesrwubsg-auth-token"),
      );
    } catch (e) { console.log("[AUTH] __root.tsx localStorage read error:", e); }

    let done = false;
    const ping = async () => {
      if (done) return;
      const { data } = await supabase.auth.getSession();
      console.log("[AUTH] __root.tsx getSession:", data.session);
      console.log("[AUTH] __root.tsx user:", data.session?.user?.id);
      if (data.session) {
        done = true;
        try { await touchLastLogin(); } catch { /* ignore */ }
      }
    };
    ping();

    // Capacitor (Android/iOS): ao abrir o app, sempre voltar ao seletor de portal
    // se houver sessão, ou ao /login se não houver. Apenas dispara quando a rota
    // inicial é "/" ou "/login" para não atrapalhar deep links explícitos.
    import("@capacitor/core").then(({ Capacitor }) => {
      if (!Capacitor.isNativePlatform()) return;
      const path = window.location.pathname;
      if (path !== "/" && path !== "/login") return;
      supabase.auth.getSession().then(({ data }) => {
        const target = data.session?.user ? "/portal-selector" : "/login";
        if (window.location.pathname !== target) {
          window.location.replace(target);
        }
      });
    }).catch(() => { /* navegador web ignora */ });

    const { data: { subscription } } = supabase.auth.onAuthStateChange((event, session) => {
      console.log("[AUTH] __root.tsx onAuthStateChange event:", event, "user:", session?.user?.id);
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
      <Outlet />
      <Toaster richColors position="top-center" />
    </ThemeProvider>
  );
}

