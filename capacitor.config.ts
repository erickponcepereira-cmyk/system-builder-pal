import type { CapacitorConfig } from "@capacitor/cli";

// Preview interno: carrega temporariamente o site publicado para validar a
// camada Android enquanto o bundle local é separado das funções de servidor.
// Builds de loja devem omitir CAPACITOR_SERVER_URL.
const previewServerUrl = process.env.CAPACITOR_SERVER_URL?.trim();
const nativePlugins = [
  "@capacitor/splash-screen",
  "@capacitor/app",
  "@capacitor/browser",
  "@capacitor/geolocation",
  "@capacitor-community/background-geolocation",
  "@capacitor/preferences",
  "@capacitor/push-notifications",
];

const config: CapacitorConfig = {
  appId: "br.com.fitmindclub.app",
  appName: "FitMind Club",
  webDir: "dist",
  // Cor de fundo do WebView ANTES do primeiro paint do React.
  // Evita o frame branco entre o SplashScreen nativo e o React.
  backgroundColor: "#0b0707",
  android: {
    backgroundColor: "#0b0707",
    includePlugins: nativePlugins,
    // Exigido pelo plugin de geolocalizacao em background para que o Android
    // nao interrompa as atualizacoes poucos minutos apos apagar a tela.
    useLegacyBridge: true,
  },
  ios: {
    backgroundColor: "#0b0707",
    includePlugins: nativePlugins,
  },
  ...(previewServerUrl
    ? {
        server: {
          url: previewServerUrl,
          cleartext: false,
          allowNavigation: [
            "fitmindclub.com.br",
            "www.fitmindclub.com.br",
            "fitmindclub.lovable.app",
          ],
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchAutoHide: false,
      launchShowDuration: 0,
      backgroundColor: "#0B0707",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: false,
    },
    PushNotifications: {
      presentationOptions: ["badge", "sound", "alert"],
    },
  },
};

export default config;
