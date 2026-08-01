import { MessageCircle, PartyPopper, X } from "lucide-react";
import { purchaseWhatsappUrl } from "@/lib/purchase-messages";

type Props = {
  productName: string;
  whatsapp?: string | null;
  buyerName?: string | null;
  /** Ex.: "14:30" — omitido quando a reserva não tem horário. */
  slotLabel?: string | null;
  onClose: () => void;
};

export function FreebieReservedModal({ productName, whatsapp, buyerName, slotLabel, onClose }: Props) {
  const waUrl = purchaseWhatsappUrl({ phone: whatsapp, buyerName, productName, slotLabel });
  return (
    <div className="fixed inset-0 z-[90] flex justify-center bg-black/70 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
      <div className="w-full max-w-md rounded-2xl border border-white/10 bg-card p-5">
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="flex items-center gap-2">
            <PartyPopper className="h-5 w-5 text-primary" />
            <h2 className="text-base font-bold text-foreground">Reserva confirmada!</h2>
          </div>
          <button onClick={onClose} className="rounded-full bg-white/10 p-1.5 text-foreground"><X className="h-4 w-4" /></button>
        </div>
        <p className="text-sm text-foreground">
          Parabéns por adquirir o produto <span className="font-bold">{productName}</span> gratuitamente!
          {whatsapp ? <> Converse com a empresa e veja se está tudo certo: <span className="font-bold">{whatsapp}</span></> : null}
        </p>
        {waUrl && (
          <a href={waUrl} target="_blank" rel="noopener noreferrer" className="mt-4 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-bold text-black">
            <MessageCircle className="h-4 w-4" /> Falar no WhatsApp
          </a>
        )}
        <button onClick={onClose} className="mt-4 w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-semibold text-foreground">Fechar</button>
      </div>
    </div>
  );
}
