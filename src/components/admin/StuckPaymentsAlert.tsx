import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import {
  listStuckApprovedPayments,
  reconcileApprovedPendingPayments,
  type StuckApprovedPayment,
} from "@/lib/admin-reconcile.functions";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KIND_LABEL: Record<string, string> = {
  store_order: "Pedido da loja",
  partner_product_order: "Pedido parceiro/profissional",
  subscription_invoice: "Mensalidade",
  transaction: "Transação",
};

/**
 * Alerta operacional: pagamentos que o Mercado Pago aprovou mas cuja origem
 * (pedido / fatura) continua pendente — indica falha no processamento.
 */
export function StuckPaymentsAlert() {
  const load = useServerFn(listStuckApprovedPayments);
  const reconcile = useServerFn(reconcileApprovedPendingPayments);
  const [rows, setRows] = useState<StuckApprovedPayment[]>([]);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    try {
      setRows(await load({}));
    } catch {
      /* silencioso: alerta é acessório */
    }
  };

  useEffect(() => {
    void refresh();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rows.length === 0) return null;

  const handleReconcile = async () => {
    setBusy(true);
    try {
      const r = await reconcile({});
      toast.success(`${r.processed} pagamento(s) reprocessado(s)${r.failed ? ` · ${r.failed} falha(s)` : ""}`);
      await refresh();
    } catch (e) {
      toast.error((e as Error)?.message || "Falha ao reprocessar");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="mb-4 rounded-xl border border-amber-500/40 bg-amber-500/10 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-400" />
          <div>
            <p className="text-sm font-bold text-amber-300">
              {rows.length} pagamento(s) aprovado(s) sem processamento
            </p>
            <p className="text-xs text-white/60">
              O dinheiro entrou no Mercado Pago, mas o pedido/fatura continua pendente e as comissões não foram geradas.
            </p>
          </div>
        </div>
        <button
          onClick={handleReconcile}
          disabled={busy}
          className="flex items-center gap-2 rounded-lg bg-amber-500 px-3 py-2 text-xs font-bold text-black disabled:opacity-60"
        >
          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Reprocessar agora
        </button>
      </div>

      <ul className="mt-3 space-y-1">
        {rows.slice(0, 8).map((r) => (
          <li key={`${r.mpPaymentId}-${r.sourceId}`} className="text-xs text-white/70">
            <span className="font-semibold text-white/90">{KIND_LABEL[r.sourceKind] || r.sourceKind}</span>
            {" · "}
            {fmt(r.amount)}
            {" · "}
            {new Date(r.createdAt).toLocaleString("pt-BR")}
            {r.mpPaymentId ? ` · MP ${r.mpPaymentId}` : ""}
          </li>
        ))}
      </ul>
    </div>
  );
}
