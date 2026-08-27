// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { mcpPlugin } from "@lovable.dev/mcp-js/stacks/tanstack/vite";

// PWA temporariamente desabilitado para diagnosticar flash no APK Android.
// Um kill-switch worker em public/sw.js evicta registros antigos em WebViews
// que já tinham o Service Worker instalado.
const capacitorStaticBuild = process.env.CAPACITOR_STATIC_BUILD === "true";

export default defineConfig({
  ...(capacitorStaticBuild
    ? {
        nitro: false,
        tanstackStart: {
          spa: {
            enabled: true,
            prerender: { outputPath: "/index" },
          },
        },
      }
    : {}),
  vite: {
    // As rotas MCP já são versionadas. A geração do plugin 0.24 usa paths
    // incompatíveis no Windows, então é pulada apenas nesse sistema.
    plugins: process.platform === "win32" ? [] : [mcpPlugin()],
  },
});
