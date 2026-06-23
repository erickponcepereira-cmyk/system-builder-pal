/**
 * Push Notifications service for Capacitor (Android/iOS) via Firebase Cloud Messaging.
 *
 * - Solicita permissão ao usuário
 * - Registra o dispositivo no FCM
 * - Obtém e expõe o token FCM
 * - Estrutura pronta para persistir o token no backend (ex: Supabase)
 * - Executa APENAS dentro do Capacitor; ignorado silenciosamente no navegador web
 */

import { Capacitor } from "@capacitor/core";
import {
  PushNotifications,
  type Token,
  type PushNotificationSchema,
  type ActionPerformed,
} from "@capacitor/push-notifications";

export type PushTokenHandler = (token: string, platform: string) => void | Promise<void>;

export interface PushNotificationOptions {
  /** Chamado quando o token FCM é recebido. Use para salvar no Supabase. */
  onToken?: PushTokenHandler;
  /** Chamado quando uma notificação é recebida com o app aberto. */
  onNotification?: (notification: PushNotificationSchema) => void;
  /** Chamado quando o usuário toca em uma notificação. */
  onNotificationAction?: (action: ActionPerformed) => void;
  /** Chamado em caso de erro no registro. */
  onError?: (error: unknown) => void;
}

let initialized = false;

/** Retorna true se estamos rodando dentro do Capacitor (Android/iOS). */
export function isNativePlatform(): boolean {
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/**
 * Inicializa o serviço de Push Notifications.
 * Só roda em plataformas nativas (Android/iOS). No navegador, retorna false.
 */
export async function initPushNotifications(
  options: PushNotificationOptions = {},
): Promise<boolean> {
  if (!isNativePlatform()) return false;
  if (initialized) return true;
  initialized = true;

  try {
    let permStatus = await PushNotifications.checkPermissions();

    if (permStatus.receive === "prompt" || permStatus.receive === "prompt-with-rationale") {
      permStatus = await PushNotifications.requestPermissions();
    }

    if (permStatus.receive !== "granted") {
      initialized = false;
      return false;
    }

    // Listeners ANTES do register() para não perder eventos
    await PushNotifications.addListener("registration", async (token: Token) => {
      try {
        await options.onToken?.(token.value, Capacitor.getPlatform());
      } catch (err) {
        console.error("[Push] Erro ao processar token:", err);
      }
    });

    await PushNotifications.addListener("registrationError", (err) => {
      console.error("[Push] Erro de registro:", err);
      options.onError?.(err);
    });

    await PushNotifications.addListener(
      "pushNotificationReceived",
      (notification: PushNotificationSchema) => {
        options.onNotification?.(notification);
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        options.onNotificationAction?.(action);
      },
    );

    await PushNotifications.register();
    return true;
  } catch (err) {
    console.error("[Push] Falha ao inicializar:", err);
    options.onError?.(err);
    initialized = false;
    return false;
  }
}

/** Remove todos os listeners de push notifications. */
export async function removePushListeners(): Promise<void> {
  if (!isNativePlatform()) return;
  await PushNotifications.removeAllListeners();
  initialized = false;
}

/**
 * Persiste o token FCM no Supabase na tabela `device_tokens`.
 * Faz upsert pelo token (único) e vincula ao usuário autenticado.
 */
export const saveTokenToSupabase: PushTokenHandler = async (token, platform) => {
  try {
    const { supabase } = await import("@/integrations/supabase/client");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) return;

    const { error: upsertError } = await supabase
      .from("device_tokens")
      .upsert(
        {
          user_id: user.id,
          token,
          platform,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "token" },
      );

    if (upsertError) console.error("[Push] Erro ao salvar token:", upsertError);
  } catch (err) {
    console.error("[Push] Erro ao salvar token:", err);
  }
};
