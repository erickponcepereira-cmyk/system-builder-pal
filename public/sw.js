// Service worker mínimo para viabilizar instalação como app (WebAPK) no Chrome Android.
// Requisito do Chrome/Android: um SW ativo com listener 'fetch' para o Play Services
// gerar o WebAPK ao usuário clicar em "Instalar aplicativo".
//
// Estratégia: network-only passthrough. Sem cache do app shell — evita telas em branco
// pós-deploy e problemas de chunks antigos. Push/messaging workers não são afetados
// (eles rodam em arquivos próprios com escopo próprio).

const SW_VERSION = "1.0.0";

self.addEventListener("install", (event) => {
  // Ativa o novo SW imediatamente, sem esperar abas antigas fecharem.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      // Limpa caches antigos criados por versões anteriores (Workbox/vite-plugin-pwa).
      try {
        const names = await caches.keys();
        await Promise.allSettled(
          names
            .filter((n) => /precache-v\d+-|(^|-)runtime-|^html$|^workbox-/.test(n))
            .map((n) => caches.delete(n)),
        );
      } catch {}
      await self.clients.claim();
    })(),
  );
});

// Fetch listener OBRIGATÓRIO para o Chrome oferecer instalação (WebAPK).
// Network-only: apenas repassa a requisição — sem cache, sem interceptação de conteúdo.
self.addEventListener("fetch", (event) => {
  // Não intercepta requisições de outros esquemas (chrome-extension://, etc)
  if (!event.request.url.startsWith("http")) return;
  event.respondWith(fetch(event.request));
});
