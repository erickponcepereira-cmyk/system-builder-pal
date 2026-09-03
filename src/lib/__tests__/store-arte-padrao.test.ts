import { describe, expect, it } from "vitest";
import { arteDaTaxonomia } from "../store-arte-padrao";

describe("arte padrão do produto sem foto", () => {
  it("usa a subcategoria, que é o rótulo mais específico", () => {
    const arte = arteDaTaxonomia("Ressonância Magnética > Imagem > Medicina");
    expect(arte.Icone.displayName).toBe("Brain");
  });

  it("o específico ganha do genérico dentro da mesma trilha", () => {
    // "Imagem" também casaria, mas "Ultrassonografia" vem antes nas regras.
    const arte = arteDaTaxonomia("Ultrassonografia > Imagem > Medicina");
    expect(arte.Icone.displayName).toBe("Waves");
  });

  it("cai na categoria quando não há subcategoria", () => {
    expect(arteDaTaxonomia("Odontologia > Medicina").Icone.displayName).toBe("Smile");
  });

  it("cai no título quando não há taxonomia nenhuma", () => {
    expect(arteDaTaxonomia(null, "Consulta Cardiologista").Icone.displayName).toBe("HeartPulse");
  });

  it("ignora rótulo vazio e segue para o próximo", () => {
    expect(arteDaTaxonomia("", null, undefined, "Laboratório").Icone.displayName).toBe("TestTubes");
  });

  it("não depende de acento", () => {
    expect(arteDaTaxonomia("Genetica e Biologia Molecular").Icone.displayName)
      .toBe(arteDaTaxonomia("Genética e Biologia Molecular").Icone.displayName);
  });

  it("é determinística: o mesmo rótulo desenha igual sempre", () => {
    const a = arteDaTaxonomia("Hormônios > Laboratório > Medicina");
    const b = arteDaTaxonomia("Hormônios > Laboratório > Medicina");
    expect(a).toEqual(b);
  });

  it("sem nada reconhecível, cai na sacola genérica", () => {
    expect(arteDaTaxonomia("Xyzzy").Icone.displayName).toBe("ShoppingBag");
    expect(arteDaTaxonomia().Icone.displayName).toBe("ShoppingBag");
  });

  it("o resto da loja continua atendido", () => {
    expect(arteDaTaxonomia("Suplementos").Icone.displayName).toBe("Pill");
    expect(arteDaTaxonomia("Desafios").Icone.displayName).toBe("Trophy");
  });
});
