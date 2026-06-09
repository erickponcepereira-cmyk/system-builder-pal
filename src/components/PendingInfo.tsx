import { useState } from "react";
import { HelpCircle } from "lucide-react";

interface Props {
  days: number;
  label?: string;
}

/**
 * Pequeno botão de ajuda (?) que explica em quantos dias as comissões
 * pendentes saem do status "pendente" e ficam disponíveis para saque
 * após a finalização da compra (sem chargeback / reembolso).
 */
export function PendingInfo({ days, label = "Prazo de liberação" }: Props) {
  const [open, setOpen] = useState(false);
  return (
    <span className="relative inline-flex items-center align-middle">
      <button
        type="button"
        onClick={(e) => { e.stopPropagation(); setOpen((v) => !v); }}
        onBlur={() => setTimeout(() => setOpen(false), 150)}
        className="text-white/40 hover:text-white transition"
        aria-label={label}
      >
        <HelpCircle className="h-3.5 w-3.5" />
      </button>
      {open && (
        <span
          className="absolute z-50 left-1/2 -translate-x-1/2 top-full mt-2 w-56 rounded-lg p-3 text-[11px] text-white/85 shadow-xl border border-white/10"
          style={{ backgroundColor: "#0F0F0F" }}
        >
          <strong className="block text-white mb-1">{label}</strong>
          As comissões ficam <b>pendentes por {days} dia{days > 1 ? "s" : ""}</b> após
          a finalização da compra. Esse prazo garante que não haja
          estorno ou cancelamento. Depois disso, o valor vai automaticamente
          para o saldo disponível para saque.
        </span>
      )}
    </span>
  );
}

export default PendingInfo;
