const configuredOrigin = import.meta.env.VITE_NATIVE_API_ORIGIN?.trim();
const nativeAppVersion = import.meta.env.VITE_NATIVE_APP_VERSION?.trim() || "web";

function validatedOrigin(value: string | undefined): string | undefined {
  if (!value) return undefined;
  try {
    const parsed = new URL(value);
    return parsed.protocol === "https:" ? parsed.origin : undefined;
  } catch {
    return undefined;
  }
}

export const mobileApiOrigin = validatedOrigin(configuredOrigin);

/** Resolve uma rota hospedada pelo backend sem alterar o comportamento web. */
export function backendUrl(path: `/${string}`): string {
  return mobileApiOrigin ? `${mobileApiOrigin}${path}` : path;
}

/** Ponte global suportada pelo TanStack Start para os RPCs do bundle nativo. */
export const mobileServerFnFetch: typeof fetch = (input, init) => {
  const target =
    mobileApiOrigin && typeof input === "string" && input.startsWith("/_serverFn/")
      ? `${mobileApiOrigin}${input}`
      : input;
  const headers = new Headers(init?.headers);
  if (mobileApiOrigin) headers.set("X-FitMind-App-Version", nativeAppVersion);

  return fetch(target, {
    ...init,
    headers,
    // A autenticação é bearer; cookies web não atravessam a fronteira nativa.
    credentials: mobileApiOrigin ? "omit" : init?.credentials,
  });
};
