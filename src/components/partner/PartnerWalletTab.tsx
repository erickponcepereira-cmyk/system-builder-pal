import { useEffect, useState } from "react";
import { Wallet, X, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

const brl = (n: number) =>
  Number(n || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const MIN_WITHDRAWAL = 100;

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
  student_id: string | null;
  partner_product_id: string | null;
  professional_product_id: string | null;
  student_name?: string | null;
  product_name?: string | null;
};

type WithdrawRow = {
  id: string;
  amount: number;
  status: string;
  requested_at: string;
  paid_at: string | null;
};

export function PartnerWalletTab() {
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

    const [walletRes, ordersRes, withdrawsRes] = await Promise.all([
      supabase
        .from("partner_wallets" as never)
        .select("available_balance,pending_balance,total_earned,total_withdrawn" as never)
        .eq("partner_id" as never, partner.id as never)
        .maybeSingle(),
      supabase
        .from("partner_product_orders")
        .select("id,order_number,status,gross_amount,partner_net_amount,payment_method,paid_at,created_at,student_id,partner_product_id,professional_product_id")
        .eq("partner_id", partner.id)
        .order("created_at", { ascending: false })
        .limit(50),
      supabase
        .from("withdrawal_requests")
        .select("id,amount,status,requested_at,paid_at")
        .eq("partner_id" as never, partner.id as never)
        .order("requested_at", { ascending: false })
        .limit(20),
    ]);

    setWallet(((walletRes.data as unknown as WalletRow | null)) || {
      available_balance: 0, pending_balance: 0, total_earned: 0, total_withdrawn: 0,
    });
    const baseOrders = (ordersRes.data as OrderRow[]) || [];
    // Resolve student names + product names
    const studentIds = Array.from(new Set(baseOrders.map((o) => o.student_id).filter(Boolean))) as string[];
    const partnerProductIds = Array.from(new Set(baseOrders.map((o) => o.partner_product_id).filter(Boolean))) as string[];
    const professionalProductIds = Array.from(new Set(baseOrders.map((o) => o.professional_product_id).filter(Boolean))) as string[];
    const [studentsRes, ppRes, profProdRes] = await Promise.all([
      studentIds.length
        ? supabase.from("students").select("id, profiles(name)").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      partnerProductIds.length
        ? supabase.from("partner_products" as never).select("id, name" as never).in("id" as never, partnerProductIds as never)
        : Promise.resolve({ data: [] as any[] }),
      professionalProductIds.length
        ? supabase.from("professional_products" as never).select("id, name" as never).in("id" as never, professionalProductIds as never)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const sMap = new Map<string, string>();
    ((studentsRes.data as any[]) || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
    const pMap = new Map<string, string>();
    ((ppRes.data as any[]) || []).forEach((p: any) => pMap.set(p.id, p.name));
    ((profProdRes.data as any[]) || []).forEach((p: any) => pMap.set(p.id, p.name));
    const enriched = baseOrders.map((o) => ({
      ...o,
      student_name: o.student_id ? sMap.get(o.student_id) || null : null,
      product_name:
        (o.partner_product_id ? pMap.get(o.partner_product_id) : null) ||
        (o.professional_product_id ? pMap.get(o.professional_product_id) : null) ||
        null,
    }));
    setOrders(enriched);
    setWithdraws((withdrawsRes.data as WithdrawRow[]) || []);
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
    const { error } = await supabase
      .from("withdrawal_requests")
      .insert({
        profile_id: profileId,
        partner_id: partnerId,
        amount: value,
        pix_key: pixKey.trim(),
        pix_key_type: "other",
        status: "requested",
      } as never);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    toast.success("Solicitação enviada");
    setOpen(false); setAmount("");
    load();
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
      </div>

      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Últimas vendas dos seus produtos</h3>
        {orders.length === 0 ? (
          <p className="text-sm text-white/40">Nenhuma venda registrada.</p>
        ) : (
          <div className="space-y-2">
            {orders.map((o) => (
              <div key={o.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <div>
                  <p className="text-sm font-semibold text-white">{o.order_number}</p>
                  <p className="text-[11px] text-white/40">
                    {new Date(o.paid_at || o.created_at).toLocaleString("pt-BR")} · {o.payment_method?.toUpperCase()} · {o.status}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-sm font-bold text-success">{brl(o.partner_net_amount)}</p>
                  <p className="text-[11px] text-white/40">bruto {brl(o.gross_amount)}</p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Saques</h3>
        {withdraws.length === 0 ? (
          <p className="text-sm text-white/40">Nenhum saque solicitado ainda.</p>
        ) : (
          <div className="space-y-2">
            {withdraws.map((wr) => (
              <div key={wr.id} className="flex items-center justify-between rounded-lg bg-white/5 px-3 py-2">
                <div>
                  <p className="text-sm text-white">{brl(wr.amount)}</p>
                  <p className="text-[11px] text-white/40">
                    {new Date(wr.requested_at).toLocaleDateString("pt-BR")} · {wr.status}
                  </p>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
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
