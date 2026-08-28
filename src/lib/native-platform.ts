import { Capacitor } from "@capacitor/core";

export const NATIVE_ANDROID_PURCHASE_MESSAGE =
  "Compras, pagamentos e renovações não estão disponíveis nesta versão do aplicativo.";

export function isNativeAndroid() {
  return Capacitor.isNativePlatform() && Capacitor.getPlatform() === "android";
}
