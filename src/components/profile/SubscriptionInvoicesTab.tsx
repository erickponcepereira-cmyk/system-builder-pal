import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { CreditCard, Wallet, AlertTriangle, Calendar, Loader2, QrCode, X } from "lucide-react";
import {
  getMySubscription, updateMySubscriptionPrefs, payInvoiceWithWallet, ensureMySubscription,
} from "@/lib/subscriptions.functions";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const fmtDate = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", paid: "Paga", exempted: "Isenta",
  overdue: "Atrasada", blocked: "Bloqueada", cancelled: "Cancelada",
};

interface Props { walletSource: "coach" | "partner" | "professional" }

export function SubscriptionInvoicesTab({ walletSource }: Props) {
  const [state, setState] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);

  const fnGet = useServerFn(getMySubscription);
  const fnUpd = useServerFn(updateMySubscriptionPrefs);
  const fnPay = useServerFn(payInvoiceWithWallet);
  const fnEnsure = useServerFn(ensureMySubscription);

  const load = async () => {
    setLoading(true);
    try {
      let r = await fnGet();
      if (!r) {
        await fnEnsure({ data: { billing_day: 5 } } as any);
        r = await fnGet();
      }
      setState(r);
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex items-center gap-2 p-6 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Carregando faturas...</div>;
  if (!state) return <p className="p-6 text-white/60">Sem assinatura.</p>;

  const sub = state.subscription;
  const invoices: any[] = state.invoices;
  const current = invoices.find((i) => i.status !== "paid" && i.status !== "exempted") ?? invoices[0];
  const walletBalance = state.wallets?.[walletSource] ?? 0;

  const updatePrefs = async (patch: any) => {
    setBusy(true);
    try { await fnUpd({ data: patch } as any); toast.success("Atualizado"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  const payWallet = async (invId: string) => {
    if (walletBalance < Number(current?.amount || 0)) {
      toast.error("Saldo insuficiente"); return;
    }
    setBusy(true);
    try { await fnPay({ data: { invoice_id: invId, wallet_source: walletSource } } as any); toast.success("Fatura paga"); await load(); }
    catch (e: any) { toast.error(e.message); }
    finally { setBusy(false); }
  };

  return (
    <div className="space-y-4 p-2">
      {current && current.status !== "paid" && (
        <div className={`rounded-2xl border p-5 ${
          current.status === "blocked" ? "border-red-500/50 bg-red-500/10" :
          current.status === "overdue" ? "border-orange-500/50 bg-orange-500/10" :
          "border-primary/40 bg-primary/5"
        }`}>
          <div className="mb-3 flex items-center justify-between gap-2">
            <div>
              <p className="text-xs uppercase text-white/50">Fatura {new Date(current.reference_month).toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}</p>
              <h2 className="text-2xl font-bold text-white">{fmt(current.amount)}</h2>
              <p className="text-sm text-white/60">Vence em {fmtDate(current.due_date)} · {STATUS_LABEL[current.status]}</p>
            </div>
            {current.status === "blocked" && <AlertTriangle className="h-8 w-8 text-red-400" />}
          </div>
          <div className="flex flex-wrap gap-2">
            <button disabled={busy || walletBalance < current.amount}
              onClick={() => payWallet(current.id)}
              className="flex items-center gap-2 rounded-lg bg-green-600 px-4 py-2 text-sm font-bold disabled:opacity-40">
              <Wallet className="h-4 w-4" /> Descontar da carteira ({fmt(walletBalance)})
            </button>
            <button disabled className="flex items-center gap-2 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold opacity-60">
              <CreditCard className="h-4 w-4" /> Pagar com PIX / Cartão (em breve)
            </button>
          </div>
        </div>
      )}

      <div className="rounded-2xl border border-white/10 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase text-white/60">Preferências</h3>
        <div className="grid gap-4 md:grid-cols-2">
          <label className="text-sm">
            <span className="flex items-center gap-1 text-white/60"><Calendar className="h-3 w-3" /> Dia do vencimento</span>
            <input type="number" min={1} max={28} defaultValue={sub.billing_day}
              onBlur={(e) => { const v = Number(e.target.value); if (v !== sub.billing_day) updatePrefs({ billing_day: v }); }}
              className="mt-1 w-full rounded bg-white/10 px-3 py-2" />
          </label>
          <label className="text-sm">
            <span className="text-white/60">Método de pagamento preferido</span>
            <select defaultValue={sub.preferred_payment_method}
              onChange={(e) => updatePrefs({ preferred_payment_method: e.target.value })}
              className="mt-1 w-full rounded bg-white/10 px-3 py-2">
              <option value="wallet">Descontar da carteira interna</option>
              <option value="pix">PIX</option>
              <option value="card">Cartão</option>
              <option value="auto_debit">Débito automático</option>
            </select>
          </label>
        </div>
      </div>

      <div className="rounded-2xl border border-white/10 p-5">
        <h3 className="mb-3 text-sm font-bold uppercase text-white/60">Histórico</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead className="text-xs uppercase text-white/40">
              <tr><th className="p-2 text-left">Mês</th><th className="p-2 text-left">Vencimento</th><th className="p-2 text-right">Valor</th><th className="p-2 text-left">Status</th><th className="p-2 text-left">Pago em</th></tr>
            </thead>
            <tbody>
              {invoices.map((i) => (
                <tr key={i.id} className="border-t border-white/5">
                  <td className="p-2">{new Date(i.reference_month).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" })}</td>
                  <td className="p-2">{fmtDate(i.due_date)}</td>
                  <td className="p-2 text-right">{fmt(i.amount)}</td>
                  <td className="p-2">{STATUS_LABEL[i.status] ?? i.status}</td>
                  <td className="p-2 text-xs text-white/40">{fmtDate(i.paid_at)}</td>
                </tr>
              ))}
              {invoices.length === 0 && <tr><td colSpan={5} className="p-4 text-center text-white/40">Nenhuma fatura ainda.</td></tr>}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export default SubscriptionInvoicesTab;
