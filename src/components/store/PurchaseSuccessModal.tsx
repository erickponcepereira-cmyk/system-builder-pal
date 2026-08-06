import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { IdCard, MessageCircle, PartyPopper, Ticket, Trophy, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { computePartnerProductBenefits } from "@/lib/partner-product-benefits";
import { purchaseWhatsappUrl } from "@/lib/purchase-messages";
import { getProductContact } from "@/lib/product-contact.functions";

export type PurchasedItem = {
  /** id do partner_product / professional_product (nulo em produtos FitMind) */
  productId?: string | null;
  productName: string;
  price: number;
  kind: "partner" | "professional" | "fitmind";
  slotLabel?: string | null;
};

type Props = {
  /** Compra de um único produto (uso legado). */
  productId?: string;
  productName?: string;
  price?: number;
  kind?: "partner" | "professional";
  /** Compra com vários itens (carrinho). Tem prioridade sobre os campos acima. */
  items?: PurchasedItem[];
  /**
   * Contatos já resolvidos (usado em páginas públicas, sem sessão, onde a
   * server function autenticada de contato não pode ser chamada).
   */
  contacts?: Array<{ productId: string; sellerName?: string | null; whatsapp: string | null }>;
  buyerName?: string | null;
  onClose: () => void;
};

export function PurchaseSuccessModal({
  productId, productName, price, kind, items, contacts, buyerName, onClose,
}: Props) {
  const fetchContact = useServerFn(getProductContact);

  const list = useMemo<PurchasedItem[]>(() => {
    if (items && items.length) return items;
    if (productId && productName) {
      return [{ productId, productName, price: price ?? 0, kind: kind ?? "partner" }];
    }
    return [];
  }, [items, productId, productName, price, kind]);

  const contactable = useMemo(
    () => list.filter((i) => i.kind !== "fitmind" && !!i.productId),
    [list],
  );

  const [resolved, setResolved] = useState<Record<string, { whatsapp: string | null; sellerName: string | null }>>(() => {
    const seed: Record<string, { whatsapp: string | null; sellerName: string | null }> = {};
    for (const c of contacts || []) seed[c.productId] = { whatsapp: c.whatsapp, sellerName: c.sellerName ?? null };
    return seed;
  });

  const pendingKey = contactable.map((i) => `${i.kind}:${i.productId}`).join(",");

  useEffect(() => {
    let alive = true;
    const missing = contactable.filter((i) => !(i.productId! in resolved));
    if (!missing.length) return;
    void Promise.all(
      missing.map(async (i) => {
        try {
          const r = await fetchContact({ data: { productId: i.productId!, kind: i.kind as "partner" | "professional" } });
          return [i.productId!, { whatsapp: r?.whatsapp ?? null, sellerName: r?.sellerName ?? null }] as const;
        } catch {
          return [i.productId!, { whatsapp: null, sellerName: null }] as const;
        }
      }),
    ).then((entries) => {
      if (!alive) return;
      setResolved((prev) => {
        const next = { ...prev };
        for (const [id, value] of entries) next[id] = value;
        return next;
      });
    });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pendingKey]);

  const benefits = list.reduce(
    (acc, i) => {
      if (i.kind === "fitmind") return acc;
      const b = computePartnerProductBenefits(i.price);
      return { cardDays: acc.cardDays + b.cardDays, challengeTickets: acc.challengeTickets + b.challengeTickets };
    },
    { cardDays: 0, challengeTickets: 0 },
  );

  const whatsappBlocks = contactable
    .map((i) => {
      const contact = resolved[i.productId!];
      const url = purchaseWhatsappUrl({
        phone: contact?.whatsapp,
        buyerName,
        productName: i.productName,
        slotLabel: i.slotLabel ?? null,
      });
      return url ? { key: i.productId! + (i.slotLabel || ""), url, label: contact?.sellerName || i.productName } : null;
    })
    .filter(Boolean) as Array<{ key: string; url: string; label: string }>;

  return (
    <div className="fixed inset-0 z-[80] flex justify-center bg-black/70 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-card p-5">
        <div className="modal-head -mx-5 -mt-5 mb-4 flex items-start justify-between gap-3 px-5 pb-3 pt-5">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Parabéns, sua compra foi aprovada!</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <ul className="mb-4 space-y-1">
          {list.map((i, idx) => (
            <li key={`${i.productId || "fitmind"}-${idx}`} className="text-sm text-muted-foreground">
              {i.productName}
              {i.slotLabel ? <span className="text-foreground"> · {i.slotLabel}</span> : null}
            </li>
          ))}
        </ul>

        <div className="space-y-3">
          {benefits.cardDays > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Parabéns, você acabou de receber {benefits.cardDays} dias de benefícios gratuitos, venha conferir!
              </p>
              <Link to="/student/benefits" onClick={onClose} className="mt-2 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                Ver gratuitos
              </Link>
            </div>
          )}

          {benefits.challengeTickets > 0 && (
            <div className="rounded-xl border border-amber-500/20 bg-amber-500/5 p-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <Ticket className="mt-0.5 h-4 w-4 shrink-0 text-amber-400" />
                Você agora pode participar dos nossos desafios! Venha concorrer a R$ 1.000 no PIX!
              </p>
              <Link to="/student/challenge" onClick={onClose} className="mt-2 inline-flex items-center gap-1 rounded-lg bg-amber-500 px-3 py-1.5 text-xs font-bold text-black">
                <Trophy className="h-3.5 w-3.5" /> Ir para desafios
              </Link>
            </div>
          )}

          {whatsappBlocks.length > 0 && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-foreground">
                Converse com {whatsappBlocks.length > 1 ? "as empresas" : "a empresa"} pelo WhatsApp e confira se está tudo certo!
              </p>
              <div className="mt-2 flex flex-wrap gap-2">
                {whatsappBlocks.map((b) => (
                  <a key={b.key} href={b.url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black">
                    <MessageCircle className="h-3.5 w-3.5" /> {whatsappBlocks.length > 1 ? b.label : "Falar no WhatsApp"}
                  </a>
                ))}
              </div>
            </div>
          )}
        </div>

        <button onClick={onClose} className="modal-foot mt-5 -mx-5 -mb-5 block w-[calc(100%+2.5rem)] px-5 pb-5 pt-3 text-sm font-semibold text-foreground">Fechar</button>
      </div>
    </div>
  );
}
