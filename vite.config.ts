// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, cloudflare (build-only),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... } }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";

// PWA temporariamente desabilitado para diagnosticar flash no APK Android.
// Um kill-switch worker em public/sw.js evicta registros antigos em WebViews
// que já tinham o Service Worker instalado.
export default defineConfig({
  vite: {
    plugins: [],
  },
});
