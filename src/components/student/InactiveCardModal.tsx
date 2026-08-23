import { Link } from "@tanstack/react-router";
import { ShieldAlert } from "lucide-react";

export function InactiveCardModal({ onClose, validUntil }: { onClose: () => void; validUntil?: string | null }) {
  return (
    <div className="fixed inset-0 z-[110] flex justify-center bg-black/85 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
      <div className="w-full max-w-sm rounded-2xl border border-yellow-500/25 p-5 text-center" style={{ backgroundColor: "#141414" }}>
        <ShieldAlert className="mx-auto h-8 w-8 text-yellow-400" />
        <p className="mt-3 text-sm font-bold text-white">Sua carteirinha está inativa</p>
        <p className="mt-1 text-xs text-white/60">
          Para resgatar benefícios é necessário ter a carteirinha ativa. Basta comprar um produto na loja para ativar.
        </p>
        {validUntil && (
          <p className="mt-2 text-[11px] text-white/40">Validade anterior: {new Date(validUntil).toLocaleDateString("pt-BR")}</p>
        )}
        <Link
          to="/student/store"
          onClick={onClose}
          className="mt-4 block rounded-lg bg-primary px-4 py-2.5 text-xs font-bold text-primary-foreground"
        >
          Ir para a loja
        </Link>
        <button onClick={onClose} className="mt-2 w-full rounded-lg bg-white/5 px-4 py-2.5 text-xs font-bold text-white/70 hover:bg-white/10">
          Fechar
        </button>
      </div>
    </div>
  );
}

export default InactiveCardModal;
