/**
 * Destino pretendido ANTES do login/cadastro.
 *
 * O link da loja pública (`/r/{code}?to=loja` ou `/produto/{id}`) leva a
 * pessoa deslogada para a vitrine. Quando ela entra com Google ou cria conta,
 * o app precisa lembrar para onde ela estava indo — senão cai no seletor de
 * painel e o produto/loja se perde.
 *
 * Gravamos em localStorage (sobrevive ao redirect do OAuth) e em
 * sessionStorage (compatibilidade). É consumido uma única vez.
 */
const KEY = "fitmind:post-auth-intent";

function isSafePath(path: string | null | undefined): path is string {
  return !!path && path.startsWith("/") && !path.startsWith("//");
}

/** Validade: destino antigo não pode sequestrar um login futuro. */
const TTL_MS = 2 * 60 * 60 * 1000;
const TS_KEY = `${KEY}:ts`;

export function setPostAuthIntent(path: string) {
  if (typeof window === "undefined" || !isSafePath(path)) return;
  const now = String(Date.now());
  try {
    localStorage.setItem(KEY, path);
    localStorage.setItem(TS_KEY, now);
    sessionStorage.setItem(KEY, path);
    sessionStorage.setItem(TS_KEY, now);
  } catch { /* storage indisponível */ }
}

/** Lê sem consumir. */
export function peekPostAuthIntent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    if (!isSafePath(raw)) return null;
    const ts = Number(sessionStorage.getItem(TS_KEY) ?? localStorage.getItem(TS_KEY) ?? 0);
    if (!ts || Date.now() - ts > TTL_MS) {
      clearPostAuthIntent();
      return null;
    }
    return raw;
  } catch {
    return null;
  }
}


/** Lê e limpa — usar no destino final. */
export function takePostAuthIntent(): string | null {
  const value = peekPostAuthIntent();
  clearPostAuthIntent();
  return value;
}

export function clearPostAuthIntent() {
  if (typeof window === "undefined") return;
  try {
    localStorage.removeItem(KEY);
    localStorage.removeItem(TS_KEY);
    sessionStorage.removeItem(KEY);
    sessionStorage.removeItem(TS_KEY);
  } catch { /* storage indisponível */ }
}


/** Atalho: destino da loja logada, com o produto do link quando houver. */
export function setStoreIntent(productId?: string | null) {
  setPostAuthIntent(
    productId ? `/student/store?produto=${encodeURIComponent(productId)}` : "/student/store",
  );
}
