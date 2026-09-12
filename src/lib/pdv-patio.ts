/**
 * Placa e permanência — o que a tela do pátio precisa formatar sozinha.
 *
 * O valor cobrado NÃO mora aqui: a régua de tarifa é do banco
 * (`pdv_calcular_tarifa`), uma vez só. O que existe neste arquivo é entrada e
 * apresentação — validar o que o operador digita e escrever "2h 41min".
 */

/** Sem separador e em caixa alta. Espelha `pdv_normalizar_placa` no banco. */
export function normalizarPlaca(texto: string): string | null {
  const limpa = (texto || "").replace(/[^A-Za-z0-9]/g, "").toUpperCase();
  return limpa || null;
}

const PLACA_ANTIGA = /^[A-Z]{3}\d{4}$/;
const PLACA_MERCOSUL = /^[A-Z]{3}\d[A-Z]\d{2}$/;

export function isPlacaValida(texto: string): boolean {
  const placa = normalizarPlaca(texto);
  if (!placa) return false;
  return PLACA_ANTIGA.test(placa) || PLACA_MERCOSUL.test(placa);
}

/** ABC1D23 vira ABC-1D23 — o formato que o operador lê no para-brisa. */
export function formatarPlaca(texto: string): string {
  const placa = normalizarPlaca(texto);
  if (!placa) return "";
  if (placa.length !== 7) return placa;
  return `${placa.slice(0, 3)}-${placa.slice(3)}`;
}

/** Mesma conta do banco: fração de minuto conta como minuto, e nunca negativo. */
export function minutosDesde(inicioIso: string, agora: Date = new Date()): number {
  const inicio = new Date(inicioIso).getTime();
  if (Number.isNaN(inicio)) return 0;
  return Math.max(0, Math.ceil((agora.getTime() - inicio) / 60000));
}

export function formatarPermanencia(minutos: number): string {
  if (!Number.isFinite(minutos) || minutos <= 0) return "0min";
  const dias = Math.floor(minutos / 1440);
  const horas = Math.floor((minutos % 1440) / 60);
  const restantes = minutos % 60;
  if (dias > 0) return horas > 0 ? `${dias}d ${horas}h` : `${dias}d`;
  if (horas > 0) return restantes > 0 ? `${horas}h ${restantes}min` : `${horas}h`;
  return `${restantes}min`;
}
