// Worker temporário de limpeza: remove caches antigos do app e desregistra o SW.
// Mantém workers de push/mensageria fora desse fluxo.
function isAppCacheForThisRegistration(name) {
  const appCache = /(^|-)precache-v\d+-|(^|-)runtime-|(^|-)googleAnalytics-|^html$|^workbox-/.test(name);
  return appCache && (name.endsWith(self.registration.scope) || name === "html" || name.indexOf("workbox-") === 0);
}

self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", (event) =>
  event.waitUntil(
    (async () => {
      try {
        const cacheNames = await caches.keys();
        const appCacheNames = cacheNames.filter(isAppCacheForThisRegistration);
        await Promise.allSettled(appCacheNames.map((name) => caches.delete(name)));
        await self.clients.claim();
        const windowClients = await self.clients.matchAll({ type: "window" });
        await Promise.allSettled(windowClients.map((client) => client.navigate(client.url)));
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);
