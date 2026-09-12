import { describe, expect, it } from "vitest";
import {
  formatarPermanencia,
  formatarPlaca,
  isPlacaValida,
  minutosDesde,
  normalizarPlaca,
} from "../pdv-patio";

describe("normalizarPlaca", () => {
  it("tira separador, espaço e caixa", () => {
    expect(normalizarPlaca("abc-1d23")).toBe("ABC1D23");
    expect(normalizarPlaca(" abc 1234 ")).toBe("ABC1234");
  });

  it("devolve nulo quando não sobra nada", () => {
    expect(normalizarPlaca("---")).toBeNull();
    expect(normalizarPlaca("")).toBeNull();
  });
});

describe("isPlacaValida", () => {
  it("aceita os dois formatos que circulam", () => {
    expect(isPlacaValida("ABC1D23")).toBe(true);
    expect(isPlacaValida("abc-1d23")).toBe(true);
    expect(isPlacaValida("ABC1234")).toBe(true);
  });

  it("recusa o que o teclado do operador produz por engano", () => {
    expect(isPlacaValida("ABC123")).toBe(false);
    expect(isPlacaValida("ABCD123")).toBe(false);
    expect(isPlacaValida("AB1C234")).toBe(false);
    expect(isPlacaValida("ABC12345")).toBe(false);
    expect(isPlacaValida("")).toBe(false);
  });
});

describe("formatarPlaca", () => {
  it("separa para leitura", () => {
    expect(formatarPlaca("abc1d23")).toBe("ABC-1D23");
    expect(formatarPlaca("ABC1234")).toBe("ABC-1234");
  });

  it("devolve o que der quando o tamanho não é de placa", () => {
    expect(formatarPlaca("ABC12")).toBe("ABC12");
    expect(formatarPlaca("")).toBe("");
  });
});

describe("minutosDesde", () => {
  const agora = new Date("2026-09-12T12:00:00Z");

  it("conta fração de minuto como minuto, igual ao banco", () => {
    expect(minutosDesde("2026-09-12T11:00:00Z", agora)).toBe(60);
    expect(minutosDesde("2026-09-12T11:59:01Z", agora)).toBe(1);
  });

  it("nunca devolve negativo com relógio adiantado", () => {
    expect(minutosDesde("2026-09-12T16:00:00Z", agora)).toBe(0);
  });

  it("não quebra com data inválida", () => {
    expect(minutosDesde("banana", agora)).toBe(0);
  });
});

describe("formatarPermanencia", () => {
  it("escreve como o operador fala", () => {
    expect(formatarPermanencia(13)).toBe("13min");
    expect(formatarPermanencia(60)).toBe("1h");
    expect(formatarPermanencia(161)).toBe("2h 41min");
    expect(formatarPermanencia(1440)).toBe("1d");
    expect(formatarPermanencia(1560)).toBe("1d 2h");
  });

  it("trata zero e lixo", () => {
    expect(formatarPermanencia(0)).toBe("0min");
    expect(formatarPermanencia(-5)).toBe("0min");
    expect(formatarPermanencia(Number.NaN)).toBe("0min");
  });
});
