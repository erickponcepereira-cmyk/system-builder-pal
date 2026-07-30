import { whatsappUrl } from "@/lib/whatsapp";

/** Saudação conforme o horário de Brasília. */
export function greeting(now: Date = new Date()): string {
  const h = Number(
    new Intl.DateTimeFormat("pt-BR", {
      hour: "numeric",
      hour12: false,
      timeZone: "America/Sao_Paulo",
    }).format(now),
  );
  if (h < 12) return "Bom dia";
  if (h < 18) return "Boa tarde";
  return "Boa noite";
}

export function firstName(fullName?: string | null): string {
  return (fullName || "").trim().split(/\s+/)[0] || "";
}

/** "Bom dia, me chamo João, acabei de comprar X pela FitMind, gostaria de saber se está tudo certo." */
export function purchaseMessage(opts: {
  buyerName?: string | null;
  productName: string;
  slotLabel?: string | null;
}): string {
  const nome = firstName(opts.buyerName);
  const quem = nome ? `, me chamo ${nome}` : "";
  const quando = opts.slotLabel ? ` para as ${opts.slotLabel}` : "";
  return `${greeting()}${quem}, acabei de comprar ${opts.productName}${quando} pela FitMind, gostaria de saber se está tudo certo.`;
}

export function purchaseWhatsappUrl(opts: {
  phone?: string | null;
  buyerName?: string | null;
  productName: string;
  slotLabel?: string | null;
}): string | null {
  return whatsappUrl(opts.phone, purchaseMessage(opts));
}
