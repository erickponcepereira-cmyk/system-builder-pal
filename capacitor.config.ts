import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "app.lovable.fitmind",
  appName: "FitMind",
  webDir: "dist",
  // Cor de fundo do WebView ANTES do primeiro paint do React.
  // Evita o frame branco entre o SplashScreen nativo e o React.
  backgroundColor: "#0b0707",
  android: {
    backgroundColor: "#0b0707",
  },
  ios: {
    backgroundColor: "#0b0707",
  },
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
    LocalNotifications: {
      smallIcon: "ic_stat_notify",
      iconColor: "#FF4A3D",
    },
  },
};

export default config;
