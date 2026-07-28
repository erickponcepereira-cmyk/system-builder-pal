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
        // Não força client.navigate(): recarregar a aba aqui causava tela branca
        // e loop de recarregamento em alguns aparelhos.
      } finally {
        await self.registration.unregister();
      }
    })(),
  ),
);

