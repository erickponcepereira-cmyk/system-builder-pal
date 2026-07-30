/**
 * Produto pendente de um link de indicação (/r/{code}?p=…).
 *
 * Gravamos em localStorage (sobrevive a login, cadastro e ao redirect do
 * OAuth do Google, que abre um contexto novo e zera o sessionStorage) e
 * também em sessionStorage por compatibilidade com telas antigas.
 */
const ID_KEY = "fitmind_pending_product";
const KIND_KEY = "fitmind_pending_product_kind";

export type PendingProductKind = "challenge" | "partner" | "professional";

export function setPendingProduct(id: string, kind?: PendingProductKind | null) {
  try {
    localStorage.setItem(ID_KEY, id);
    sessionStorage.setItem(ID_KEY, id);
    if (kind) {
      localStorage.setItem(KIND_KEY, kind);
      sessionStorage.setItem(KIND_KEY, kind);
    } else {
      localStorage.removeItem(KIND_KEY);
      sessionStorage.removeItem(KIND_KEY);
    }
  } catch { /* storage indisponível */ }
}

export function getPendingProduct(): { id: string | null; kind: string | null } {
  try {
    return {
      id: localStorage.getItem(ID_KEY) ?? sessionStorage.getItem(ID_KEY),
      kind: localStorage.getItem(KIND_KEY) ?? sessionStorage.getItem(KIND_KEY),
    };
  } catch {
    return { id: null, kind: null };
  }
}

export function clearPendingProduct() {
  try {
    localStorage.removeItem(ID_KEY);
    localStorage.removeItem(KIND_KEY);
    sessionStorage.removeItem(ID_KEY);
    sessionStorage.removeItem(KIND_KEY);
  } catch { /* storage indisponível */ }
}
