import { getShareOrigin } from "@/lib/auth-redirects";
/**
 * Links de indicação.
 *
 * Regra: ATRIBUIÇÃO e DESTINO são coisas separadas, mas o link "padrão"
 * de indicação existe para levar ao CADASTRO. A loja tem um link próprio,
 * também vinculado ao indicador.
 */

function origin(): string {
  return getShareOrigin();
}
function _legacyOrigin(): string {
  if (typeof window !== "undefined") return getShareOrigin();
  return "https://fitmindclub.com.br";
}

/** Link de indicação clássico: leva ao cadastro com o indicador travado. */
export function linkCadastro(code: string | null | undefined): string {
  if (!code) return "";
  return `${origin()}/r/${code}`;
}

/** Link da loja vinculada ao indicador. */
export function linkLoja(code: string | null | undefined): string {
  if (!code) return "";
  return `${origin()}/r/${code}?to=loja`;
}

/** Link direto de um produto, mantendo a atribuição do indicador. */
export function linkProduto(code: string | null | undefined, productId: string): string {
  if (!code) return `${origin()}/produto/${productId}`;
  return `${origin()}/produto/${productId}?ref=${code}`;
}
