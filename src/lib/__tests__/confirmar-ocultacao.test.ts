import { describe, expect, it, vi } from "vitest";

// O módulo cria o cliente do Supabase ao carregar; a pergunta não usa banco.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { perguntaDaOcultacao } from "../coach-store-overrides";

describe("perguntaDaOcultacao", () => {
  it("pergunta pelo grupo inteiro, com o nome", () => {
    expect(perguntaDaOcultacao({ grupo: "da categoria «Herbalife»" })).toEqual({
      titulo: "Tem certeza que deseja ocultar todos os produtos da categoria «Herbalife»?",
      descricao: "Ninguém da sua rede verá mais esses produtos nem poderá comprar. Essa ação é reversível.",
      acao: "Ocultar",
    });
  });

  it("fala de um produto só no singular", () => {
    expect(perguntaDaOcultacao({ produto: "Shake Baunilha" })).toEqual({
      titulo: "Tem certeza que deseja ocultar o produto «Shake Baunilha»?",
      descricao: "Ninguém da sua rede verá mais esse produto nem poderá comprar. Essa ação é reversível.",
      acao: "Ocultar",
    });
  });

  it("sem nome, diz 'este produto' em vez de aspas vazias", () => {
    expect(perguntaDaOcultacao({ produto: null }).titulo)
      .toBe("Tem certeza que deseja ocultar este produto?");
  });

  it("a FitMind inteira leva o nome dela", () => {
    expect(perguntaDaOcultacao({ grupo: "da FitMind" }).titulo)
      .toBe("Tem certeza que deseja ocultar todos os produtos da FitMind?");
  });
});
