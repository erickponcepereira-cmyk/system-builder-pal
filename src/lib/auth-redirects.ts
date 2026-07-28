export const OFFICIAL_ORIGIN = "https://fitmindclub.com.br";
export const WWW_ORIGIN = "https://www.fitmindclub.com.br";
export const PUBLISHED_ORIGIN = "https://fitmindclub.lovable.app";

function isOfficialHost(hostname: string) {
  return hostname === "fitmindclub.com.br" || hostname === "www.fitmindclub.com.br";
}

function isLocalOrPreview(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("lovable") ||
    hostname.includes("lovableproject")
  );
}

function isPublishedFallback(hostname: string) {
  return hostname === "fitmindclub.lovable.app";
}

function isTrustedCurrentOrigin(hostname: string) {
  return isOfficialHost(hostname) || isPublishedFallback(hostname) || isLocalOrPreview(hostname);
}

export function getAuthRedirectUrl(path: `/${string}`) {
  if (typeof window === "undefined") return `${OFFICIAL_ORIGIN}${path}`;
  const { hostname, origin, protocol } = window.location;
  if (isOfficialHost(hostname)) return `${OFFICIAL_ORIGIN}${path}`;
  const secureOrigin = protocol === "https:" || hostname === "localhost" || hostname === "127.0.0.1";
  const base = isTrustedCurrentOrigin(hostname) && secureOrigin ? origin : OFFICIAL_ORIGIN;
  return `${base}${path}`;
}

export function getPublicAppUrl(path: `/${string}` = "/") {
  return `${OFFICIAL_ORIGIN}${path}`;
}

/**
 * Origem canônica para QUALQUER link compartilhável gerado pelo app
 * (indicação, loja, produto, QR code de check-in, etc).
 *
 * Regra: se o usuário está no domínio oficial (apex OU www) ou em qualquer
 * origem insegura, devolvemos sempre `https://fitmindclub.com.br`. Isso evita
 * gerar links `www` ou `http://`, que hoje passam por um salto em texto puro
 * na borda e são derrubados por Chrome/antivírus/proxy em alguns aparelhos.
 *
 * Em preview/localhost mantemos a origem atual para não quebrar os testes.
 */
export function getShareOrigin(): string {
  if (typeof window === "undefined") return OFFICIAL_ORIGIN;
  const { hostname, origin, protocol } = window.location;
  if (isOfficialHost(hostname)) return OFFICIAL_ORIGIN;
  if (protocol !== "https:" && hostname !== "localhost" && hostname !== "127.0.0.1") {
    return OFFICIAL_ORIGIN;
  }
  return isTrustedCurrentOrigin(hostname) ? origin : OFFICIAL_ORIGIN;
}

/** Monta uma URL compartilhável já na origem canônica. */
export function buildShareUrl(path: `/${string}`): string {
  return `${getShareOrigin()}${path}`;
}
