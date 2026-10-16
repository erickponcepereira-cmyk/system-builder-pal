/**
 * Os três QRs que o aluno mostra no balcão do parceiro. Os formatos não se
 * confundem, então o parceiro lê qualquer um sem escolher a aba.
 *
 *  - carteirinha: `<origem>/checkin/<uuid do aluno>`
 *  - cupom:       `COUPON:<24 hex>`  (token sempre em maiúsculo)
 *  - reserva:     32 hex minúsculo cru (ou URL antiga terminando em `/freebie/<token>`)
 */
export type QrDoAluno =
  | { tipo: "carteirinha"; studentId: string }
  | { tipo: "cupom"; token: string }
  | { tipo: "reserva"; token: string }
  | { tipo: "invalido" };

const UUID = "[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}";
const RE_CARTEIRINHA_URL = new RegExp(`/checkin/(${UUID})(?:[/?#]|$)`, "i");
const RE_UUID = new RegExp(`^${UUID}$`, "i");
const RE_CUPOM = /^(?:COUPON:)?([0-9a-f]{24})$/i;
const RE_RESERVA = /^[0-9a-f]{32}$/i;
const RE_RESERVA_URL = /\/freebie\/([0-9a-f]{32})(?:[/?#]|$)/i;

export const QR_ACEITOS =
  "Aceitos: carteirinha do aluno, cupom de desconto e reserva de benefício.";

function comoCarteirinha(texto: string): QrDoAluno | null {
  const url = texto.match(RE_CARTEIRINHA_URL);
  if (url) return { tipo: "carteirinha", studentId: url[1].toLowerCase() };
  if (RE_UUID.test(texto)) return { tipo: "carteirinha", studentId: texto.toLowerCase() };
  return null;
}

function comoCupom(texto: string): QrDoAluno | null {
  const m = texto.match(RE_CUPOM);
  return m ? { tipo: "cupom", token: m[1].toUpperCase() } : null;
}

function comoReserva(texto: string): QrDoAluno | null {
  const url = texto.match(RE_RESERVA_URL);
  if (url) return { tipo: "reserva", token: url[1].toLowerCase() };
  return RE_RESERVA.test(texto) ? { tipo: "reserva", token: texto.toLowerCase() } : null;
}

export function classificarQrDoAluno(texto: string): QrDoAluno {
  const limpo = (texto ?? "").replace(/\s+/g, "");
  return comoCarteirinha(limpo) ?? comoCupom(limpo) ?? comoReserva(limpo) ?? { tipo: "invalido" };
}
