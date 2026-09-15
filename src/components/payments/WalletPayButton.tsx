import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyWalletTotals, payStoreOrderWithWallet, payPartnerOrderWithWallet } from "@/lib/wallet-checkout.functions";
import { toast } from "sonner";

type Props = {
  orderId: string;
  amount: number;
  kind: "store" | "partner";
  onPaid?: () => void;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function WalletPayButton({ orderId, amount, kind, onPaid }: Props) {
  const fetchTotals = useServerFn(getMyWalletTotals);
  const payStore = useServerFn(payStoreOrderWithWallet);
  const payPartner = useServerFn(payPartnerOrderWithWallet);
  const [totals, setTotals] = useState<{ coach: number; partner: number; professional: number; total: number } | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchTotals().then(setTotals).catch(() => setTotals({ coach: 0, partner: 0, professional: 0, total: 0 })); }, []);

  const enough = totals && totals.total + 0.001 >= amount;

  const handlePay = async () => {
    if (!enough) return;
    setLoading(true);
    try {
      const fn = kind === "store" ? payStore : payPartner;
      const res = await fn({ data: { order_id: orderId } });
      const br = res.breakdown || {};
      const parts = ["coach", "partner", "professional"]
        .filter((k) => br[k])
        .map((k) => `${k === "coach" ? "Coach" : k === "partner" ? "Parceiro" : "Profissional"}: ${brl(Number(br[k]))}`);
      toast.success("Pagamento com carteira confirmado", { description: parts.join(" • ") });
      onPaid?.();
    } catch (e: any) {
      toast.error("Erro ao pagar com carteira", { description: e?.message || "" });
    } finally { setLoading(false); }
  };

  if (!totals) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/70">
        <Wallet className="h-4 w-4 text-primary" />
        <span>Saldo interno: <span className="font-semibold text-white">{brl(totals.total)}</span></span>
      </div>
      {/* Origem do que foi ganho — não são caixas separadas. O saldo é um só, e
          saque e gasto saem dele sem pertencer a nenhuma origem. */}
      <div className="mb-1 text-[10px] uppercase tracking-wide text-white/30">Veio de</div>
      <div className="mb-3 grid grid-cols-3 gap-1 text-[10px] text-white/50">
        <span>Coach: {brl(totals.coach)}</span>
        <span>Parceiro: {brl(totals.partner)}</span>
        <span>Prof.: {brl(totals.professional)}</span>
      </div>
      <button
        type="button"
        disabled={!enough || loading}
        onClick={handlePay}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {enough ? `Pagar ${brl(amount)} com carteira` : `Saldo insuficiente (faltam ${brl(amount - totals.total)})`}
      </button>
      <p className="mt-1 text-[10px] text-white/40">Débito em cascata: coach → parceiro → profissional.</p>
    </div>
  );
}
