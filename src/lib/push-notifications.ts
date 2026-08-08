/**
 * Push nativo via Firebase Cloud Messaging.
 *
 * O plugin escolhido devolve token FCM tanto no Android quanto no iOS. O
 * plugin oficial do Capacitor devolve APNs no iOS, que não é enviável pela
 * API FCM HTTP v1 usada no backend deste projeto.
 */
import { Capacitor } from "@capacitor/core";
import {
  FirebaseMessaging,
  Importance,
  Visibility,
  type Notification,
  type NotificationActionPerformedEvent,
} from "@capacitor-firebase/messaging";

export type PushTokenHandler = (token: string, platform: string) => void | Promise<void>;

export interface PushNotificationOptions {
  onToken?: PushTokenHandler;
  onNotification?: (notification: Notification) => void;
  onNotificationAction?: (action: NotificationActionPerformedEvent) => void;
  onError?: (error: unknown) => void;
}

let initialized = false;
let lastPushToken: string | null = null;
let handlers: PushNotificationOptions = {};

export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

function isNativePushAvailable() {
  return isNativePlatform() && Capacitor.isPluginAvailable("FirebaseMessaging");
}

async function emitToken(token: string) {
  if (!token) return;
  lastPushToken = token;
  try {
    await handlers.onToken?.(token, Capacitor.getPlatform());
  } catch (error) {
    console.error("[Push] Erro ao processar token:", error);
  }
}

/**
 * Inicializa FCM somente quando há sessão autenticada. A função é um no-op
 * seguro enquanto o Firebase ainda não foi incluído na build nativa.
 */
export async function initPushNotifications(options: PushNotificationOptions = {}): Promise<boolean> {
  handlers = { ...handlers, ...options };
  if (!isNativePushAvailable()) return false;

  if (initialized) {
    if (lastPushToken) await emitToken(lastPushToken);
    return true;
  }

  try {
    let permission = await FirebaseMessaging.checkPermissions();
    if (permission.receive === "prompt" || permission.receive === "prompt-with-rationale") {
      permission = await FirebaseMessaging.requestPermissions();
    }
    if (permission.receive !== "granted") return false;

    await FirebaseMessaging.addListener("tokenReceived", ({ token }) => {
      void emitToken(token);
    });
    await FirebaseMessaging.addListener("notificationReceived", ({ notification }) => {
      handlers.onNotification?.(notification);
    });
    await FirebaseMessaging.addListener("notificationActionPerformed", (action) => {
      handlers.onNotificationAction?.(action);
    });

    if (Capacitor.getPlatform() === "android") {
      await FirebaseMessaging.createChannel({
        id: "fitmind_default",
        name: "FitMind Club",
        description: "Lembretes e atualizações da FitMind Club",
        importance: Importance.High,
        visibility: Visibility.Private,
        vibration: true,
        lightColor: "#FF4A3D",
      });
    }

    initialized = true;
    const { token } = await FirebaseMessaging.getToken();
    await emitToken(token);
    return true;
  } catch (error) {
    console.error("[Push] Falha ao inicializar:", error);
    handlers.onError?.(error);
    initialized = false;
    return false;
  }
}

/** Tenta vincular o token guardado quando um login acontece depois do bootstrap. */
export async function syncPushTokenToCurrentUser(): Promise<void> {
  if (lastPushToken) await saveTokenToSupabase(lastPushToken, Capacitor.getPlatform());
}

/**
 * Revoga o token FCM ao sair. Isso evita que o próximo push seja entregue a
 * um celular que acabou de trocar de conta; o registro antigo é limpo pelo
 * backend na primeira tentativa de envio inválida.
 */
export async function disablePushNotificationsOnSignOut(): Promise<void> {
  if (!isNativePushAvailable()) return;
  try {
    await FirebaseMessaging.deleteToken();
  } catch {
    // O token local pode já ter sido invalidado pelo Firebase.
  }
  try {
    await FirebaseMessaging.removeAllListeners();
  } catch {
    // ignore
  }
  initialized = false;
  lastPushToken = null;
}

export async function removePushListeners(): Promise<void> {
  if (!isNativePushAvailable()) return;
  await FirebaseMessaging.removeAllListeners();
  initialized = false;
}

/** Persiste o token FCM e o reassocia caso este aparelho troque de usuário. */
export const saveTokenToSupabase: PushTokenHandler = async (token, platform) => {
  try {
    const { supabase } = await import("@/integrations/supabase/client");
    const { data: { user }, error: authError } = await supabase.auth.getUser();
    if (authError || !user) return;

    const { error } = await supabase.from("device_tokens").upsert(
      {
        user_id: user.id,
        token,
        platform,
        updated_at: new Date().toISOString(),
      },
      { onConflict: "token" },
    );
    if (error) console.error("[Push] Erro ao salvar token:", error);
  } catch (error) {
    console.error("[Push] Erro ao salvar token:", error);
  }
};
