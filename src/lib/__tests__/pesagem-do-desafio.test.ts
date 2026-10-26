import { describe, expect, it } from "vitest";
import { recusaDaPesagem } from "@/lib/fitmind-challenge.functions";

const inicial = { id: "a-inicial", assessment_date: "2026-09-18T15:00:00+00:00" };

describe("recusaDaPesagem", () => {
  it("aceita a primeira pesagem, sem outra vinculada", () => {
    expect(recusaDaPesagem("initial", inicial, null)).toBeNull();
  });

  it("recusa a avaliação inicial como final da mesma inscrição", () => {
    // Caso de setembro de 2026: editar a inicial e tocar em "Pesagem Final".
    expect(recusaDaPesagem("final", inicial, inicial)).toMatch(/já é a pesagem inicial/);
  });

  it("recusa final no mesmo dia ou antes da inicial", () => {
    const mesmoDia = { id: "b", assessment_date: "2026-09-18T20:00:00+00:00" };
    const antes = { id: "c", assessment_date: "2026-09-10T12:00:00+00:00" };
    expect(recusaDaPesagem("final", mesmoDia, inicial)).toMatch(/depois da inicial \(18\/09\/2026\)/);
    expect(recusaDaPesagem("final", antes, inicial)).not.toBeNull();
  });

  it("aceita final de um dia depois da inicial", () => {
    const final = { id: "d", assessment_date: "2026-10-14T12:00:00+00:00" };
    expect(recusaDaPesagem("final", final, inicial)).toBeNull();
  });

  it("recusa inicial depois da final já vinculada", () => {
    const final = { id: "d", assessment_date: "2026-10-14T12:00:00+00:00" };
    const tardia = { id: "e", assessment_date: "2026-10-20T12:00:00+00:00" };
    expect(recusaDaPesagem("initial", tardia, final)).toMatch(/antes da final \(14\/10\/2026\)/);
  });
});
