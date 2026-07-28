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