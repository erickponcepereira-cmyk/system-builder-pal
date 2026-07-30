import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { IdCard, MessageCircle, PartyPopper, Ticket, Trophy, X } from "lucide-react";
import { Link } from "@tanstack/react-router";
import { computePartnerProductBenefits } from "@/lib/partner-product-benefits";
import { purchaseWhatsappUrl } from "@/lib/purchase-messages";
import { getProductContact } from "@/lib/product-contact.functions";

type Props = {
  productId: string;
  productName: string;
  price: number;
  kind: "partner" | "professional";
  buyerName?: string | null;
  onClose: () => void;
};

export function PurchaseSuccessModal({ productId, productName, price, kind, buyerName, onClose }: Props) {
  const fetchContact = useServerFn(getProductContact);
  const [whats, setWhats] = useState<string | null>(null);
  const { cardDays, challengeTickets } = computePartnerProductBenefits(price);

  useEffect(() => {
    let alive = true;
    fetchContact({ data: { productId, kind } })
      .then((r) => { if (alive) setWhats(r?.whatsapp || null); })
      .catch(() => { if (alive) setWhats(null); });
    return () => { alive = false; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [productId, kind]);

  const waUrl = purchaseWhatsappUrl({ phone: whats, buyerName, productName });

  return (
    <div className="fixed inset-0 z-[80] flex items-center justify-center bg-black/70 p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl border border-white/10 bg-card p-5">
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Compra confirmada!</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-foreground"><X className="h-4 w-4" /></button>
        </div>

        <p className="mb-4 text-sm text-muted-foreground">{productName}</p>

        <div className="space-y-3">
          {cardDays > 0 && (
            <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
              <p className="flex items-start gap-2 text-sm font-semibold text-foreground">
                <IdCard className="mt-0.5 h-4 w-4 shrink-0 text-primary" />
                Parabéns, você acabou de receber {cardDays} dias de benefícios gratuitos, venha conferir!
              </p>
              <Link to="/gratuitos" onClick={onClose} className="mt-2 inline-flex rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground">
                Ver gratuitos
              </Link>
            </div>
          )}

          {challengeTickets > 0 && (
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

          {waUrl && (
            <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3">
              <p className="text-sm font-semibold text-foreground">Converse com a empresa pelo WhatsApp e confira se está tudo certo!</p>
              <a href={waUrl} target="_blank" rel="noopener noreferrer" className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-1.5 text-xs font-bold text-black">
                <MessageCircle className="h-3.5 w-3.5" /> Falar no WhatsApp
              </a>
            </div>
          )}
        </div>

        <button onClick={onClose} className="mt-5 w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-foreground">Fechar</button>
      </div>
    </div>
  );
}
