import { describe, it, expect } from "vitest";
import { classificarQrDoAluno } from "../qr-do-aluno";

const UUID = "3f2b8c1e-9d4a-4c7b-8e21-5a6f0b1c2d3e";
const COUPON = "A1B2C3D4E5F60718293A4B5C";
const RESERVA = "0123456789abcdef0123456789abcdef";

describe("classificarQrDoAluno", () => {
  it("reconhece a carteirinha pela URL de check-in", () => {
    expect(classificarQrDoAluno(`https://app.fitmind.club/checkin/${UUID}`))
      .toEqual({ tipo: "carteirinha", studentId: UUID });
  });

  it("reconhece o uuid sozinho, mesmo em maiúsculo", () => {
    expect(classificarQrDoAluno(UUID.toUpperCase())).toEqual({ tipo: "carteirinha", studentId: UUID });
  });

  it("ignora query string na URL da carteirinha", () => {
    expect(classificarQrDoAluno(`https://x.com/checkin/${UUID}?utm=1#a`))
      .toEqual({ tipo: "carteirinha", studentId: UUID });
  });

  it("reconhece o cupom e devolve o token em maiúsculo", () => {
    expect(classificarQrDoAluno(`COUPON:${COUPON}`)).toEqual({ tipo: "cupom", token: COUPON });
  });

  it("aceita prefixo do cupom em qualquer caixa e os 24 hex sozinhos", () => {
    expect(classificarQrDoAluno(`coupon:${COUPON.toLowerCase()}`)).toEqual({ tipo: "cupom", token: COUPON });
    expect(classificarQrDoAluno(COUPON.toLowerCase())).toEqual({ tipo: "cupom", token: COUPON });
  });

  it("reconhece a reserva (32 hex cru)", () => {
    expect(classificarQrDoAluno(RESERVA)).toEqual({ tipo: "reserva", token: RESERVA });
  });

  it("reconhece a URL antiga de reserva, com ou sem query", () => {
    expect(classificarQrDoAluno(`https://x.com/freebie/${RESERVA}`)).toEqual({ tipo: "reserva", token: RESERVA });
    expect(classificarQrDoAluno(`https://x.com/freebie/${RESERVA}?a=1`)).toEqual({ tipo: "reserva", token: RESERVA });
  });

  it("tolera espaços e quebras de linha", () => {
    expect(classificarQrDoAluno(`  \n${RESERVA}\r\n`)).toEqual({ tipo: "reserva", token: RESERVA });
    expect(classificarQrDoAluno(` COUPON:${COUPON}\n`)).toEqual({ tipo: "cupom", token: COUPON });
  });

  it.each([
    "",
    "   ",
    "olá",
    "https://example.com",
    `https://x.com/checkin/${UUID.slice(0, 30)}`,
    `COUPON:${COUPON.slice(0, 20)}`,
    `COUPON:${COUPON}ZZ`,
    RESERVA.slice(0, 31),
    `${RESERVA}0`,
    "COUPON:GGGGGGGGGGGGGGGGGGGGGGGG",
  ])("rejeita %j", (texto) => {
    expect(classificarQrDoAluno(texto)).toEqual({ tipo: "invalido" });
  });
});
