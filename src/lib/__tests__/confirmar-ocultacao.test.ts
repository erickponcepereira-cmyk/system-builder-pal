import { afterEach, describe, expect, it, vi } from "vitest";

// O módulo cria o cliente do Supabase ao carregar; a pergunta não usa banco.
vi.mock("@/integrations/supabase/client", () => ({ supabase: {} }));

import { confirmarOcultacao } from "../coach-store-overrides";

function perguntaFeita(resposta: boolean) {
  const confirm = vi.fn(() => resposta);
  vi.stubGlobal("window", { confirm });
  return confirm;
}

afterEach(() => vi.unstubAllGlobals());

describe("confirmarOcultacao", () => {
  it("pergunta pelo grupo inteiro, com o nome", () => {
    const confirm = perguntaFeita(true);
    confirmarOcultacao({ grupo: "da categoria «Herbalife»" });
    expect(confirm).toHaveBeenCalledWith(
      "Tem certeza que deseja ocultar todos os produtos da categoria «Herbalife»?\n\n"
      + "Ninguém da sua rede verá mais esses produtos nem poderá comprar. Essa ação é reversível.",
    );
  });

  it("fala de um produto só no singular", () => {
    const confirm = perguntaFeita(true);
    confirmarOcultacao({ produto: "Shake Baunilha" });
    expect(confirm).toHaveBeenCalledWith(
      "Tem certeza que deseja ocultar o produto «Shake Baunilha»?\n\n"
      + "Ninguém da sua rede verá mais esse produto nem poderá comprar. Essa ação é reversível.",
    );
  });

  it("sem nome, diz 'este produto' em vez de aspas vazias", () => {
    const confirm = perguntaFeita(true);
    confirmarOcultacao({ produto: null });
    expect(confirm.mock.calls[0][0]).toMatch(/^Tem certeza que deseja ocultar este produto\?/);
  });

  it("devolve a resposta da pessoa", () => {
    perguntaFeita(false);
    expect(confirmarOcultacao({ grupo: "da FitMind" })).toBe(false);
    perguntaFeita(true);
    expect(confirmarOcultacao({ grupo: "da FitMind" })).toBe(true);
  });
});
