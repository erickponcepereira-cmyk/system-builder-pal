import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

const OAUTH_START_URL = "https://fitmindclub.com.br/~oauth/initiate";
const NATIVE_CALLBACK_URL = "https://fitmindclub.com.br/auth/callback?native=1";
const STATE_STORAGE_KEY = "fitmind:native-oauth-state";

export type NativeGoogleAuthResult =
  | { ok: true }
  | { ok: false; error: string };

function randomState() {
  const bytes = new Uint8Array(24);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function callbackParams(url: URL) {
  const hash = new URLSearchParams(url.hash.startsWith("#") ? url.hash.slice(1) : url.hash);
  return {
    get(name: string) {
      return url.searchParams.get(name) ?? hash.get(name);
    },
  };
}

export function isNativeGoogleCallback(value: string): boolean {
  try {
    const url = new URL(value);
    return url.origin === "https://fitmindclub.com.br" && url.pathname === "/auth/callback";
  } catch {
    return false;
  }
}

/** Abre o Google no Custom Tab; nunca tenta autenticar dentro do WebView. */
export async function startNativeGoogleAuth(): Promise<NativeGoogleAuthResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: "Login nativo indisponível nesta plataforma." };
  }

  try {
    const state = randomState();
    const { Preferences } = await import("@capacitor/preferences");
    await Preferences.set({ key: STATE_STORAGE_KEY, value: state });

    const params = new URLSearchParams({
      provider: "google",
      redirect_uri: NATIVE_CALLBACK_URL,
      state,
    });
    const { Browser } = await import("@capacitor/browser");
    await Browser.open({
      url: `${OAUTH_START_URL}?${params.toString()}`,
      toolbarColor: "#0B0707",
    });
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível abrir o Google.",
    };
  }
}

/** Valida o state devolvido pelo broker e instala a sessão no Supabase. */
export async function completeNativeGoogleAuth(value: string): Promise<NativeGoogleAuthResult> {
  if (!isNativeGoogleCallback(value)) {
    return { ok: false, error: "Retorno de login inválido." };
  }

  const { Preferences } = await import("@capacitor/preferences");
  try {
    const url = new URL(value);
    const params = callbackParams(url);
    const providerError = params.get("error_description") || params.get("error");
    if (providerError) return { ok: false, error: providerError };

    const [{ value: expectedState }] = await Promise.all([
      Preferences.get({ key: STATE_STORAGE_KEY }),
    ]);
    const receivedState = params.get("state");
    if (!expectedState || !receivedState || expectedState !== receivedState) {
      return { ok: false, error: "Não foi possível validar o retorno do Google." };
    }

    const accessToken = params.get("access_token");
    const refreshToken = params.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    const code = params.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    return { ok: false, error: "O Google não devolveu uma sessão válida." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível concluir o login.",
    };
  } finally {
    await Preferences.remove({ key: STATE_STORAGE_KEY });
  }
}
