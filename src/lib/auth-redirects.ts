export const OFFICIAL_ORIGIN = "https://www.fitmindclub.com.br";
export const LEGACY_ROOT_ORIGIN = "https://fitmindclub.com.br";

function isLocalOrPreview(hostname: string) {
  return (
    hostname === "localhost" ||
    hostname === "127.0.0.1" ||
    hostname.includes("lovable") ||
    hostname.includes("lovableproject")
  );
}

export function getAuthRedirectUrl(path: `/${string}`) {
  if (typeof window === "undefined") return `${OFFICIAL_ORIGIN}${path}`;
  const { hostname, origin } = window.location;
  const base = isLocalOrPreview(hostname) ? origin : OFFICIAL_ORIGIN;
  return `${base}${path}`;
}

export function getPublicAppUrl(path: `/${string}` = "/") {
  return `${OFFICIAL_ORIGIN}${path}`;
}