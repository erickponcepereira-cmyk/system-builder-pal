import { supabase } from "@/integrations/supabase/client";

/**
 * Login com Google em janela pop-up (sem sair da página).
 *
 * Usa o mesmo broker OAuth da Lovable Cloud (`/~oauth/initiate`) com
 * `response_mode=web_message`: a janela devolve os tokens por postMessage e a
 * sessão é gravada aqui mesmo. Se o pop-up for bloqueado, devolvemos
 * `blocked: true` para o chamador cair no fluxo de redirecionamento.
 */

const BROKER_URL = "/~oauth/initiate";
const ALLOWED_ORIGINS = ["https://oauth.lovable.app", "https://lovable.dev"];
const MESSAGE_TYPE = "authorization_response";

type PopupResult =
  | { ok: true }
  | { ok: false; blocked?: boolean; cancelled?: boolean; error?: string };

function randomState() {
  if (typeof crypto !== "undefined" && crypto.getRandomValues) {
    return [...crypto.getRandomValues(new Uint8Array(16))]
      .map((b) => b.toString(16).padStart(2, "0"))
      .join("");
  }
  return Math.random().toString(36).slice(2) + Date.now().toString(36);
}

export async function signInWithGooglePopup(
  redirectUri: string,
  extraParams?: Record<string, string>,
): Promise<PopupResult> {
  if (typeof window === "undefined") return { ok: false, blocked: true };

  const state = randomState();
  const params = new URLSearchParams({
    ...(extraParams ?? {}),
    provider: "google",
    redirect_uri: redirectUri,
    state,
    response_mode: "web_message",
  });

  // O pop-up precisa abrir no mesmo gesto do clique, senão o navegador bloqueia.
  const width = Math.min(520, Math.round(window.outerWidth * 0.9));
  const height = Math.min(680, Math.round(window.outerHeight * 0.9));
  const left = window.screenX + (window.outerWidth - width) / 2;
  const top = window.screenY + (window.outerHeight - height) / 2;
  const popup = window.open(
    `${BROKER_URL}?${params.toString()}`,
    "fitmind-google-oauth",
    `width=${width},height=${height},left=${left},top=${top}`,
  );

  if (!popup) return { ok: false, blocked: true };

  const origins = [...ALLOWED_ORIGINS, window.location.origin];

  const response = await new Promise<Record<string, string> | null>((resolve) => {
    let done = false;
    const finish = (value: Record<string, string> | null) => {
      if (done) return;
      done = true;
      window.removeEventListener("message", onMessage);
      clearInterval(checkClosed);
      try {
        popup.close();
      } catch {
        /* ignore */
      }
      resolve(value);
    };

    const onMessage = (event: MessageEvent) => {
      if (!origins.includes(event.origin)) return;
      const data = event.data as { type?: string; response?: Record<string, string> } | null;
      if (!data || typeof data !== "object" || data.type !== MESSAGE_TYPE) return;
      finish(data.response ?? null);
    };

    window.addEventListener("message", onMessage);
    const checkClosed = setInterval(() => {
      if (popup.closed) finish(null);
    }, 500);
  });

  if (!response) return { ok: false, cancelled: true };
  if (response.state !== state) return { ok: false, error: "Estado inválido." };
  if (response.error) return { ok: false, error: response.error_description || response.error };
  if (!response.access_token || !response.refresh_token) {
    return { ok: false, error: "Não recebemos os dados de acesso do Google." };
  }

  const { error } = await supabase.auth.setSession({
    access_token: response.access_token,
    refresh_token: response.refresh_token,
  });
  if (error) return { ok: false, error: error.message };

  return { ok: true };
}
