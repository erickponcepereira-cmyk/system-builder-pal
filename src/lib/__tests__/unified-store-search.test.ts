import { describe, expect, it } from "vitest";
import { buscar, matchesQuery, type UnifiedProduct } from "../unified-store";

function createSearchProduct(title: string, sellerName: string): UnifiedProduct {
  const titleWords = title.toLocaleLowerCase("pt-BR").split(/\s+/);
  const sellerWords = sellerName.toLocaleLowerCase("pt-BR").split(/\s+/);
  return {
    title,
    sellerName,
    titleWords,
    sellerWords,
    haystack: `${title} ${sellerName}`.toLocaleLowerCase("pt-BR"),
    haystackWords: [...titleWords, ...sellerWords],
  } as UnifiedProduct;
}

describe("busca da loja unificada", () => {
  const majorProduct = createSearchProduct("Desenvolvimento de Sistema Gago", "Major Hub");

  it.each(["Desenvolvimento de Sistema Gago", "Major Hub", "Desenvolvimento", "Gago"])(
    "encontra o produto da Major por %s",
    (query) => {
      expect(matchesQuery(majorProduct, query)).toBe(true);
      expect(buscar([majorProduct], query)).toEqual([majorProduct]);
    },
  );

  it("não devolve o produto para um termo alheio", () => {
    expect(buscar([majorProduct], "suplemento")).toEqual([]);
  });
});