import type { CapacitorConfig } from "@capacitor/cli";

// Used only for an internal native-preview build. The production store build
// must omit this variable and bundle the approved web application locally.
const previewServerUrl = process.env.CAPACITOR_SERVER_URL;
const enableNativePush = process.env.CAPACITOR_PUSH_ENABLED === "true";
const nativeBasePlugins = [
  "@capacitor/splash-screen",
  "@capacitor/app",
  "@capacitor/browser",
  "@capacitor/geolocation",
];
const nativePlugins = enableNativePush
  ? [...nativeBasePlugins, "@capacitor-firebase/messaging"]
  : nativeBasePlugins;

const config: CapacitorConfig = {
  appId: "br.com.fitmindclub.app",
  appName: "FitMind Club",
  webDir: "dist",
  // Cor de fundo do WebView ANTES do primeiro paint do React.
  // Evita o frame branco entre o SplashScreen nativo e o React.
  backgroundColor: "#0b0707",
  android: {
    backgroundColor: "#0b0707",
    // Só habilite FCM depois de copiar google-services.json e definir
    // CAPACITOR_PUSH_ENABLED=true ao executar cap sync.
    includePlugins: nativePlugins,
  },
  ios: {
    backgroundColor: "#0b0707",
    includePlugins: nativePlugins,
  },
  experimental: {
    ios: {
      spm: {
        packageOptions: {
          "@capacitor-firebase/messaging": { symlink: true },
        },
      },
    },
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
            "project--57e54ea4-86cc-4948-814d-71b2815329a0.lovable.app",
          ],
        },
      }
    : {}),
  plugins: {
    SplashScreen: {
      launchAutoHide: true,
      launchShowDuration: 400,
      backgroundColor: "#0B0707",
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
      useDialog: false,
    },
    FirebaseMessaging: {
      presentationOptions: ["badge", "sound", "alert"],
    },
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#FF4A3D",
    },
  },
};

export default config;
