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

export function setPostAuthIntent(path: string) {
  if (typeof window === "undefined" || !isSafePath(path)) return;
  try {
    localStorage.setItem(KEY, path);
    sessionStorage.setItem(KEY, path);
  } catch { /* storage indisponível */ }
}

/** Lê sem consumir. */
export function peekPostAuthIntent(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = sessionStorage.getItem(KEY) ?? localStorage.getItem(KEY);
    return isSafePath(raw) ? raw : null;
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
    sessionStorage.removeItem(KEY);
  } catch { /* storage indisponível */ }
}

/** Atalho: destino da loja logada, com o produto do link quando houver. */
export function setStoreIntent(productId?: string | null) {
  setPostAuthIntent(
    productId ? `/student/store?produto=${encodeURIComponent(productId)}` : "/student/store",
  );
}
