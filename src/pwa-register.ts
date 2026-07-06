// Registra o Service Worker apenas em produção fora dos previews Lovable.
// Necessário para o Chrome/Android oferecer instalação como app (WebAPK).
// Kill-switch: acesse com ?sw=off para forçar desregistro.

const SW_PATH = "/sw.js";

function isBlockedContext(): boolean {
  if (!import.meta.env.PROD) return true;
  if (typeof window === "undefined") return true;
  try {
    if (window.self !== window.top) return true;
  } catch {
    return true;
  }
  const host = window.location.hostname;
  if (
    host.startsWith("id-preview--") ||
    host.startsWith("preview--") ||
    host === "lovableproject.com" ||
    host.endsWith(".lovableproject.com") ||
    host === "lovableproject-dev.com" ||
    host.endsWith(".lovableproject-dev.com") ||
    host === "beta.lovable.dev" ||
    host.endsWith(".beta.lovable.dev")
  ) {
    return true;
  }
  if (new URLSearchParams(window.location.search).has("sw") &&
      new URLSearchParams(window.location.search).get("sw") === "off") {
    return true;
  }
  return false;
}

async function unregisterOwnSW() {
  if (!("serviceWorker" in navigator)) return;
  try {
    const regs = await navigator.serviceWorker.getRegistrations();
    for (const r of regs) {
      const scriptURL = r.active?.scriptURL || r.installing?.scriptURL || r.waiting?.scriptURL || "";
      // Só desregistra o SW da aplicação; NÃO toca em firebase-messaging-sw etc.
      if (scriptURL.endsWith(SW_PATH)) {
        await r.unregister();
      }
    }
  } catch {}
}

export function registerAppServiceWorker() {
  if (typeof window === "undefined") return;
  if (!("serviceWorker" in navigator)) return;

  if (isBlockedContext()) {
    // Em preview/dev: garante que nenhum SW da app fique registrado.
    unregisterOwnSW();
    return;
  }

  // Produção: registra o SW mínimo para viabilizar instalação PWA no Android.
  window.addEventListener("load", () => {
    navigator.serviceWorker
      .register(SW_PATH, { scope: "/" })
      .catch((err) => {
        console.warn("[PWA] Falha ao registrar service worker:", err);
      });
  });
}
