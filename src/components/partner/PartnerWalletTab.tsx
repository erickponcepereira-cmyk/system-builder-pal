import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Wallet, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { getClientCutoffIso } from "@/lib/test-mode";
import { SaleChannelBadge, type SaleChannel } from "@/components/ui/SaleChannelBadge";
import { cancelMyWithdrawalRequest, requestSellerWithdrawal } from "@/lib/withdrawals.functions";
import { listMyPartnerSales } from "@/lib/partner-sales.functions";


function statusStyle(status: string) {
  const s = (status || "").toLowerCase();
  if (s === "paid" || s === "approved" || s === "completed")
    return { value: "text-emerald-400", label: "text-emerald-400" };
  if (s === "pending" || s === "requested" || s === "in_process" || s === "processing")
    return { value: "text-amber-400", label: "text-amber-400" };
  if (s === "rejected" || s === "refused" || s === "failed" || s === "cancelled" || s === "canceled" || s === "refunded" || s === "charged_back")
    return { value: "text-red-400", label: "text-red-400" };
  return { value: "text-white/70", label: "text-white/60" };
}

const brl = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MIN_WITHDRAWAL = 50;

const withdrawalLabel = (status?: string | null) => {
  if (status === "requested") return "Pendente";
  if (status === "approved" || status === "processing") return "Aprovado";
  if (status === "paid") return "Pago";
  if (status === "rejected") return "Rejeitado";
  return status || "—";
};

type WalletRow = {
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
};

type OrderRow = {
  id: string;
  order_number: string;
  status: string;
  gross_amount: number;
  partner_net_amount: number;
  payment_method: string;
  paid_at: string | null;
  created_at: string;
  student_id?: string | null;
  partner_product_id?: string | null;
  professional_product_id?: string | null;
  sale_channel: SaleChannel;
  student_name?: string | null;
  seller_name?: string | null;
  product_name?: string | null;
  coprod_amount?: number;

};

type WithdrawRow = {
  id: string;
  amount: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
};

export function PartnerWalletTab() {
  const sendWithdrawal = useServerFn(requestSellerWithdrawal);
  const cancelWithdrawalRequest = useServerFn(cancelMyWithdrawalRequest);
  const fetchMySales = useServerFn(listMyPartnerSales);

  const [partnerId, setPartnerId] = useState<string | null>(null);
  const [profileId, setProfileId] = useState<string | null>(null);
  const [wallet, setWallet] = useState<WalletRow | null>(null);
  const [orders, setOrders] = useState<OrderRow[]>([]);
  const [withdraws, setWithdraws] = useState<WithdrawRow[]>([]);
  const [pixKey, setPixKey] = useState("");
  const [loading, setLoading] = useState(true);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);

  async function load() {
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) return;
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", u.user.id).maybeSingle();
    if (!profile) return;
    setProfileId(profile.id);

    const { data: partner } = await supabase
      .from("partners")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!partner) { setLoading(false); return; }
    setPartnerId(partner.id);

    const cutoff = await getClientCutoffIso();

    let withdrawsQ = supabase
      .from("withdrawal_requests")
      .select("id,amount,status,requested_at,paid_at")
      .eq("partner_id" as never, partner.id as never)
      .order("requested_at", { ascending: false })
      .limit(20);
    if (cutoff) withdrawsQ = withdrawsQ.gte("requested_at" as never, cutoff as never);

    const [walletRes, salesRes, withdrawsRes] = await Promise.all([
      supabase
        .from("partner_wallets" as never)
        .select("available_balance,pending_balance,total_earned,total_withdrawn" as never)
        .eq("partner_id" as never, partner.id as never)
        .maybeSingle(),
      fetchMySales({ data: { limit: 100, fromIso: cutoff || null } }).catch(() => ({ sales: [] as any[] })),
      withdrawsQ,
    ]);

    let walletRow = ((walletRes.data as unknown as WalletRow | null)) || {
      available_balance: 0, pending_balance: 0, total_earned: 0, total_withdrawn: 0,
    };
    const baseOrders = ((salesRes as any)?.sales as OrderRow[]) || [];
    const withdrawsList = (withdrawsRes.data as WithdrawRow[]) || [];

    if (cutoff) {
      let avail = 0, pending = 0, earned = 0;
      for (const o of baseOrders) {
        const net = Number(o.partner_net_amount || 0) - Number(o.coprod_amount || 0);
        if (o.status === "paid") {
          earned += net;
          const paid = o.paid_at ? new Date(o.paid_at).getTime() : 0;
          if (paid && Date.now() - paid >= 7 * 24 * 3600 * 1000) avail += net;
          else pending += net;
        }
      }
      const withdrawn = withdrawsList
        .filter((w) => w.status === "paid")
        .reduce((s, w) => s + Number(w.amount || 0), 0);
      walletRow = {
        available_balance: Math.max(0, avail - withdrawn),
        pending_balance: pending,
        total_earned: earned,
        total_withdrawn: withdrawn,
      };
    }
    setWallet(walletRow);
    setOrders(baseOrders);
    setWithdraws(withdrawsList);
    setLoading(false);
  }


  useEffect(() => { load(); }, []);

  async function requestWithdraw() {
    if (!profileId || !partnerId) return;
    const value = Number(amount.replace(",", "."));
    if (!Number.isFinite(value) || value < MIN_WITHDRAWAL) {
      toast.error(`Valor mínimo de saque: ${brl(MIN_WITHDRAWAL)}`);
      return;
    }
    if (!wallet || value > Number(wallet.available_balance)) {
      toast.error("Saldo insuficiente");
      return;
    }
    if (!pixKey.trim()) {
      toast.error("Informe a chave PIX");
      return;
    }
    setSaving(true);
    try {
      await sendWithdrawal({ data: { source: "partner", entityId: partnerId, amount: value, pixKey: pixKey.trim(), pixKeyType: "other" } });
      toast.success("Solicitação enviada");
      setOpen(false); setAmount("");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao solicitar saque");
    } finally {
      setSaving(false);
    }
  }

  async function cancelWithdrawal(id: string) {
    try {
      await cancelWithdrawalRequest({ data: { withdrawalId: id, kind: "seller" } });
      toast.success("Solicitação cancelada. Você já pode refazer com o valor correto.");
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cancelar solicitação");
    }
  }

  if (loading) {
    return <div className="p-6 text-white/60"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  if (!partnerId) {
    return <p className="p-6 text-white/60">Carteira disponível apenas para parceiros aprovados.</p>;
  }

  const w = wallet!;
  return (
    <div className="space-y-6">
      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Wallet className="h-5 w-5 text-primary" />
            <h2 className="text-lg font-bold text-white">Carteira do Parceiro</h2>
          </div>
          <Button onClick={() => setOpen(true)} disabled={Number(w.available_balance) < MIN_WITHDRAWAL}>
            Solicitar saque
          </Button>
        </div>
        <p className="mb-4 text-xs text-white/40">
          Mostra apenas o líquido das vendas dos seus produtos. Não inclui ganhos de coach/rede.
        </p>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
          <Card label="Disponível" value={brl(w.available_balance)} highlight />
          <Card label="Pendente" value={brl(w.pending_balance)} />
          <Card label="Total recebido" value={brl(w.total_earned)} />
          <Card label="Sacado" value={brl(w.total_withdrawn)} />
        </div>
        {orders.some((o) => o.status === "paid" && Number(o.coprod_amount || 0) > 0) && (
          <p className="mt-3 text-[11px] text-amber-400">
            Repassado a co-produtores nas vendas listadas:{" "}
            {brl(orders.filter((o) => o.status === "paid").reduce((s, o) => s + Number(o.coprod_amount || 0), 0))}
          </p>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Últimas vendas dos seus produtos</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-white/40">Nenhuma venda registrada.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => {
              const st = statusStyle(o.status);
              return (
              <div key={o.id} className="flex items-start justify-between rounded-lg bg-white/5 px-3 py-2">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <p className="text-sm font-semibold text-white truncate">
                      {o.product_name || o.order_number}
                    </p>
                    <SaleChannelBadge channel={o.sale_channel} compact />
                  </div>
                  <p className="text-[11px] text-white/60 truncate">
                    Cliente: {o.student_name || "—"}
                    {o.seller_name ? ` · Vendido por ${o.seller_name}` : ""}
                  </p>

                  <p className="text-[11px] text-white/40">
                    {o.order_number} · {new Date(o.paid_at || o.created_at).toLocaleString("pt-BR")} · {o.payment_method?.toUpperCase()} · <span className={`font-semibold ${st.label}`}>{o.status}</span>
                  </p>
                </div>
                <div className="text-right shrink-0 ml-3">
                    <p className={`text-sm font-bold ${st.value}`}>{brl(Number(o.partner_net_amount || 0) - Number(o.coprod_amount || 0))}</p>
                  {Number(o.coprod_amount || 0) > 0 && (
                    <p className="text-[11px] text-amber-400">co-produção −{brl(Number(o.coprod_amount || 0))}</p>
                  )}
                  <p className="text-[11px] text-white/40">bruto {brl(o.gross_amount)}</p>
                </div>
              </div>
              );
            })}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Saques</h3>
        {withdraws.length === 0 ? (
          <p className="text-sm text-white/40">Nenhum saque solicitado ainda.</p>
        ) : (
          <div className="space-y-2">
            {withdraws.map((wr) => {
              const st = statusStyle(wr.status);
              return (
              <div key={wr.id} className="flex items-center justify-between gap-3 rounded-lg bg-white/5 px-3 py-2">
                <div>
                  <p className="text-sm text-white">{brl(wr.amount)}</p>
                  <p className="text-[11px] text-white/40">
                    {new Date(wr.requested_at).toLocaleDateString("pt-BR")} · <span className={`font-semibold ${st.label}`}>{withdrawalLabel(wr.status)}</span>
                  </p>
                </div>
                {wr.status === "requested" && (
                  <button onClick={() => cancelWithdrawal(wr.id)} className="rounded-md bg-destructive/15 px-2 py-1 text-[10px] font-bold text-destructive hover:bg-destructive/25">
                    Cancelar
                  </button>
                )}
              </div>
              );
            })}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/70 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
          <div className="w-full max-w-sm rounded-2xl bg-[#1A1A1A] p-5">
            <div className="mb-3 flex items-center justify-between">
              <h3 className="text-lg font-bold text-white">Solicitar saque</h3>
              <button onClick={() => setOpen(false)} className="text-white/60"><X className="h-5 w-5" /></button>
            </div>
            <label className="mb-2 block text-xs text-white/60">Valor (mínimo {brl(MIN_WITHDRAWAL)})</label>
            <input
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="0,00"
              className="mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-white"
            />
            <label className="mb-2 block text-xs text-white/60">Chave PIX</label>
            <input
              value={pixKey}
              onChange={(e) => setPixKey(e.target.value)}
              placeholder="email, telefone, CPF/CNPJ ou aleatória"
              className="mb-4 w-full rounded-lg bg-white/5 px-3 py-2 text-white"
            />
            <Button onClick={requestWithdraw} disabled={saving} className="w-full">
              {saving ? "Enviando..." : "Enviar solicitação"}
            </Button>
          </div>
        </div>
      )}
    </div>
  );
}

function Card({ label, value, highlight }: { label: string; value: string; highlight?: boolean }) {
  return (
    <div className={`rounded-xl p-3 ${highlight ? "bg-primary/10 border border-primary/30" : "bg-white/5"}`}>
      <p className="text-[10px] uppercase text-white/40">{label}</p>
      <p className={`text-base font-bold ${highlight ? "text-primary" : "text-white"}`}>{value}</p>
    </div>
  );
}

export default PartnerWalletTab;
