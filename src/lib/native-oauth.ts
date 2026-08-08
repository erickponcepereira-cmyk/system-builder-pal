import { Capacitor } from "@capacitor/core";
import { supabase } from "@/integrations/supabase/client";

export const NATIVE_AUTH_REDIRECT_URI = "br.com.fitmindclub.app://auth/callback";

export function isNativeAuthCallback(url: string): boolean {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === "br.com.fitmindclub.app:" &&
      parsed.host === "auth" &&
      parsed.pathname === "/callback"
    );
  } catch {
    return false;
  }
}

export type NativeOAuthResult =
  | { ok: true }
  | { ok: false; error: string };

/**
 * Conclui o retorno OAuth aberto pelo Browser nativo.
 *
 * O fluxo usa PKCE: o código recebido pelo deep link só pode ser trocado pela
 * mesma instalação que iniciou o login. Não aceite URLs que não sejam o callback
 * exato do aplicativo.
 */
export async function completeNativeOAuthCallback(url: string): Promise<NativeOAuthResult> {
  if (!isNativeAuthCallback(url)) {
    return { ok: false, error: "Retorno de login inválido." };
  }

  try {
    const parsed = new URL(url);
    const query = parsed.searchParams;
    const hash = new URLSearchParams(parsed.hash.startsWith("#") ? parsed.hash.slice(1) : parsed.hash);
    const providerError = query.get("error_description") || query.get("error") || hash.get("error_description") || hash.get("error");

    if (providerError) {
      return { ok: false, error: providerError };
    }

    const code = query.get("code");
    if (code) {
      const { error } = await supabase.auth.exchangeCodeForSession(code);
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    // Mantém compatibilidade caso o provedor ainda responda com tokens no hash.
    const accessToken = hash.get("access_token");
    const refreshToken = hash.get("refresh_token");
    if (accessToken && refreshToken) {
      const { error } = await supabase.auth.setSession({
        access_token: accessToken,
        refresh_token: refreshToken,
      });
      if (error) return { ok: false, error: error.message };
      return { ok: true };
    }

    return { ok: false, error: "O Google não devolveu um código de acesso." };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Não foi possível concluir o login.",
    };
  }
}

/** Inicia Google OAuth apenas em um aplicativo Capacitor. */
export async function startNativeGoogleOAuth(): Promise<NativeOAuthResult> {
  if (!Capacitor.isNativePlatform()) {
    return { ok: false, error: "Login nativo indisponível nesta plataforma." };
  }

  const { data, error } = await supabase.auth.signInWithOAuth({
    provider: "google",
    options: {
      redirectTo: NATIVE_AUTH_REDIRECT_URI,
      skipBrowserRedirect: true,
    },
  });

  if (error) return { ok: false, error: error.message };
  if (!data.url) return { ok: false, error: "Não foi possível iniciar o Google." };

  const { Browser } = await import("@capacitor/browser");
  await Browser.open({ url: data.url, toolbarColor: "#0B0707" });
  return { ok: true };
}
