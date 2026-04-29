// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { VitePWA } from "vite-plugin-pwa";

export default defineConfig({
  vite: {
    plugins: [
      VitePWA({
        injectRegister: false,
        registerType: "autoUpdate",
        devOptions: {
          enabled: false,
        },
        includeAssets: ["fitmind-logo.png"],
        manifest: {
          id: "/",
          name: "FitMind Club",
          short_name: "FitMind",
          description: "Conectando corpo e mente para a sua melhor versão.",
          start_url: "/",
          scope: "/",
          display: "standalone",
          background_color: "#0b0707",
          theme_color: "#0b0707",
          icons: [
            {
              src: "/fitmind-logo.png",
              sizes: "192x192",
              type: "image/png",
              purpose: "any maskable",
            },
            {
              src: "/fitmind-logo.png",
              sizes: "512x512",
              type: "image/png",
              purpose: "any maskable",
            },
          ],
        },
        workbox: {
          navigateFallbackDenylist: [/^\/~oauth/],
          runtimeCaching: [
            {
              urlPattern: ({ request }) => request.mode === "navigate",
              handler: "NetworkFirst",
              options: {
                cacheName: "html",
                networkTimeoutSeconds: 3,
              },
            },
          ],
        },
      }),
    ],
  },
});
