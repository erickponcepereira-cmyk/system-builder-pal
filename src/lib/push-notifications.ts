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
  console.log("[Push] Inicializando");

  if (!isNativePlatform()) {
    console.info("[Push] Ignorado: não está rodando no Capacitor (Android/iOS).");
    return false;
  }
  console.log("[Push] Plataforma nativa detectada:", Capacitor.getPlatform());

  if (initialized) {
    console.info("[Push] Já inicializado.");
    return true;
  }
  initialized = true;

  try {
    // 1. Verificar e solicitar permissão
    console.log("[Push] Verificando permissões atuais...");
    let permStatus = await PushNotifications.checkPermissions();
    console.log("[Push] checkPermissions result:", permStatus.receive);

    if (permStatus.receive === "prompt" || permStatus.receive === "prompt-with-rationale") {
      console.log("[Push] Solicitando permissão ao usuário...");
      permStatus = await PushNotifications.requestPermissions();
    }

    console.log("[Push] Permissão:", permStatus.receive);

    if (permStatus.receive !== "granted") {
      console.warn("[Push] Permissão de notificações negada pelo usuário.");
      initialized = false;
      return false;
    }

    // 2. Listeners ANTES do register() para não perder eventos
    await PushNotifications.addListener("registration", async (token: Token) => {
      console.log("[Push] Token recebido:", token.value);

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
        console.log("[Push] Notificação recebida:", notification);
        options.onNotification?.(notification);
      },
    );

    await PushNotifications.addListener(
      "pushNotificationActionPerformed",
      (action: ActionPerformed) => {
        console.log("[Push] Ação na notificação:", action);
        options.onNotificationAction?.(action);
      },
    );

    // 3. Registrar no FCM (dispara o evento "registration" com o token)
    console.log("[Push] Registrando dispositivo...");
    await PushNotifications.register();
    console.log("[Push] register() concluído. Aguardando evento de token...");

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

    console.log("[Push] Salvando token");

    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    console.log("[Push] Usuário encontrado:", user?.id ?? null, "authError:", authError);

    if (authError || !user) {
      console.warn("[Push] Nenhum usuário logado. Token não será salvo.");
      return;
    }

    const payload = {
      user_id: user.id,
      token,
      platform,
      updated_at: new Date().toISOString(),
    };

    console.log("[Push] Tentando salvar token:", payload);

    const { data, error: upsertError, status, statusText } = await supabase
      .from("device_tokens")
      .upsert(payload, { onConflict: "token" })
      .select();

    console.log("[Push] Resultado do upsert:", { data, status, statusText });

    if (upsertError) {
      console.error("[Push] Erro Supabase:", upsertError);
      return;
    }

    console.log("[Push] Token salvo com sucesso", data);
  } catch (err) {
    console.error("[Push] Erro Supabase:", err);
  }
};
