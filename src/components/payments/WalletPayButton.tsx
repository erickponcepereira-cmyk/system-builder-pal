import { useEffect, useState } from "react";
import { Loader2, Wallet } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { payStoreOrderWithWallet, payPartnerOrderWithWallet, payCheckoutGroupWithWallet } from "@/lib/wallet-checkout.functions";
import { getMyBalance } from "@/lib/my-balance.functions";
import { toast } from "sonner";

type Props = {
  orderId: string;
  amount: number;
  kind: "store" | "partner" | "group";
  onPaid?: () => void;
};

const brl = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function WalletPayButton({ orderId, amount, kind, onPaid }: Props) {
  const fetchBalance = useServerFn(getMyBalance);
  const payStore = useServerFn(payStoreOrderWithWallet);
  const payPartner = useServerFn(payPartnerOrderWithWallet);
  const payGroup = useServerFn(payCheckoutGroupWithWallet);
  const [balance, setBalance] = useState<number | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => { fetchBalance().then((b) => setBalance(b.disponivel)).catch(() => setBalance(0)); }, []);

  const enough = balance !== null && balance + 0.001 >= amount;

  const handlePay = async () => {
    if (!enough) return;
    setLoading(true);
    try {
      const res = kind === "group"
        ? await payGroup({ data: { group_id: orderId } })
        : await (kind === "store" ? payStore : payPartner)({ data: { order_id: orderId } });
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

  if (balance === null) return null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3">
      <div className="mb-2 flex items-center gap-2 text-xs text-white/70">
        <Wallet className="h-4 w-4 text-primary" />
        <span>Saldo disponível: <span className="font-semibold text-white">{brl(balance)}</span></span>
      </div>
      <button
        type="button"
        disabled={!enough || loading}
        onClick={handlePay}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground disabled:cursor-not-allowed disabled:opacity-50"
      >
        {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Wallet className="h-4 w-4" />}
        {enough ? `Pagar ${brl(amount)} com carteira` : `Saldo insuficiente (faltam ${brl(amount - balance)})`}
      </button>
    </div>
  );
}
