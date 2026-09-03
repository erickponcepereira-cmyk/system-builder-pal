import { describe, expect, it } from "vitest";
import { buscar, expand, matchesQuery, palavras, type UnifiedProduct } from "../unified-store";

/**
 * Monta o produto como `loadUnifiedCatalog` monta: o haystack passa pelo
 * `expand` (é o que traz os sinônimos), o título e o vendedor não. É essa
 * diferença que faz a busca por sinônimo achar sem inflar o peso do título.
 */
function produto(title: string, sellerName: string, taxonomia = ""): UnifiedProduct {
  const haystack = expand(`${title} ${sellerName} ${taxonomia}`);
  return {
    title,
    sellerName,
    titleWords: palavras(title),
    sellerWords: palavras(sellerName),
    haystack,
    haystackWords: palavras(haystack),
  } as UnifiedProduct;
}

describe("busca no catálogo médico", () => {
  const rm = produto("RM - CRANIO ENCEFALO", "Augustus Fagundes", "Medicina Imagem Ressonância Magnética");

  it("acha pela sigla do laudo", () => {
    expect(matchesQuery(rm, "RM")).toBe(true);
    expect(matchesQuery(rm, "cranio")).toBe(true);
  });

  it("acha pela palavra que o cliente digita, não pela sigla do laudo", () => {
    expect(matchesQuery(rm, "ressonancia")).toBe(true);
    expect(matchesQuery(rm, "ressonância magnética")).toBe(true);
  });

  it("acha pelo nome da subcategoria, que agora entra no índice", () => {
    expect(matchesQuery(rm, "imagem")).toBe(true);
  });

  it("um termo que não casa em lugar nenhum descarta o produto", () => {
    expect(matchesQuery(rm, "whey")).toBe(false);
    expect(matchesQuery(rm, "cranio whey")).toBe(false);
  });

  it('"ultrassom" acha o exame escrito como "USG -"', () => {
    const usg = produto("USG - ABDOME TOTAL", "Imagens");
    expect(matchesQuery(usg, "ultrassom")).toBe(true);
    expect(matchesQuery(usg, "ecografia")).toBe(true);
  });

  it('"raio x" acha o exame escrito como "RX"', () => {
    const rx = produto("RX - TORAX 2 INCIDENCIAS", "Imagens");
    expect(matchesQuery(rx, "radiografia")).toBe(true);
  });

  it('"diabetes" acha a glicemia', () => {
    const g = produto("GLICOSE DE JEJUM", "Clinilab");
    expect(matchesQuery(g, "diabetes")).toBe(true);
  });

  it("o título ganha do corpo: quem digita o nome do exame vê o exame primeiro", () => {
    const exame = produto("HEMOGRAMA COMPLETO", "Clinilab");
    const outro = produto("CONSULTA CLINICO GERAL", "Clinilab", "inclui hemograma");
    expect(buscar([outro, exame], "hemograma")[0]).toBe(exame);
  });

  it("tolera uma letra errada em termo longo", () => {
    const p = produto("ULTRASSONOGRAFIA ABDOME TOTAL", "Imagens");
    expect(matchesQuery(p, "abdomen")).toBe(true);
  });

  it("acha enquanto a pessoa ainda digita", () => {
    const p = produto("TOMOGRAFIA DE TORAX", "Imagens");
    expect(matchesQuery(p, "tomog")).toBe(true);
  });
});

describe("sinônimos casam por palavra, não por pedaço de palavra", () => {
  // A regressão que a mudança em `expand` evita: com casamento por substring,
  // a sigla "us" casaria dentro de "uso" e "rm" dentro de "dermatológico",
  // e qualquer produto do catálogo viraria um exame de imagem.
  it('"uso" não vira ultrassom', () => {
    const p = produto("Creatina para uso diário", "Loja X");
    expect(expand("uso diario")).not.toContain("ultrassom");
    expect(matchesQuery(p, "ultrassom")).toBe(false);
  });

  it('"dermatológica" não vira ressonância', () => {
    const p = produto("Consulta dermatológica", "Clínica Y");
    expect(matchesQuery(p, "ressonancia")).toBe(false);
  });

  it("chave longa continua casando por prefixo: plural acha o sinônimo", () => {
    expect(expand("suplementos importados")).toContain("whey");
  });
});
