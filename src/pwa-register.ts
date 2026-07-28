// Service worker do app DESATIVADO.
//
// Motivo: `public/sw.js` é um worker de limpeza (kill-switch). Registrá-lo em
// produção criava um ciclo — registra → limpa caches → desregistra → registra
// de novo — que em alguns aparelhos aparecia como tela branca / site que não
// abre. Agora esta função apenas garante que nenhum service worker do app
// permaneça registrado no aparelho e limpa caches antigos do app-shell.
//
// Workers de push/mensageria (firebase-messaging-sw, OneSignal) NÃO são tocados.

const APP_SW_PATHS = ["/sw.js", "/service-worker.js"];

function isAppServiceWorker(scriptURL: string): boolean {
  if (!scriptURL) return false;
  if (scriptURL.includes("firebase-messaging") || scriptURL.includes("OneSignal")) return false;
  return APP_SW_PATHS.some((path) => {
    try {
      return new URL(scriptURL).pathname === path;
    } catch {
      return scriptURL.endsWith(path);
    }
  });
}

async function unregisterAppServiceWorkers() {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator)) return;
  try {
    const registrations = await navigator.serviceWorker.getRegistrations();
    for (const registration of registrations) {
      const scriptURL =
        registration.active?.scriptURL ||
        registration.waiting?.scriptURL ||
        registration.installing?.scriptURL ||
        "";
      if (isAppServiceWorker(scriptURL)) {
        await registration.unregister();
      }
    }
  } catch {
    /* silencioso: limpeza é best-effort */
  }
}

async function deleteAppShellCaches() {
  if (typeof window === "undefined" || !("caches" in window)) return;
  try {
    const names = await caches.keys();
    const appCaches = names.filter((name) =>
      /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|^html$|^workbox-/.test(name),
    );
    await Promise.allSettled(appCaches.map((name) => caches.delete(name)));
  } catch {
    /* silencioso */
  }
}

/**
 * Mantido com o mesmo nome para não quebrar chamadas existentes.
 * Não registra nada — apenas desfaz registros antigos do service worker do app.
 */
export function registerAppServiceWorker() {
  if (typeof window === "undefined") return;
  void unregisterAppServiceWorkers().then(deleteAppShellCaches);
}
