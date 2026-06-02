import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Wallet, X, Crown, Eye, EyeOff } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getMyMasterCoachCrossSales, type CrossSaleRow } from "@/lib/cross-sales.functions";


const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type HistoryItem = { id: string; who: string; type: string; value: number; created_at: string };

export function WalletTab() {
  const fetchCrossSales = useServerFn(getMyMasterCoachCrossSales);
  const [bank, setBank] = useState<{
    coachId: string | null;
    pix_key: string;
    pix_key_type: string;
    bank_name: string;
    bank_agency: string;
    bank_account: string;
    bank_account_type: string;
  }>({ coachId: null, pix_key: "", pix_key_type: "cpf", bank_name: "", bank_agency: "", bank_account: "", bank_account_type: "corrente" });
  const [loadingBank, setLoadingBank] = useState(true);
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState("");
  const [saving, setSaving] = useState(false);
  const [cross, setCross] = useState<{ total: number; crossTotal: number; rows: CrossSaleRow[] } | null>(null);
  const [wallet, setWallet] = useState({ available: 0, pending: 0, total: 0, withdrawn: 0 });
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [walletVisible, setWalletVisible] = useState(false);


  useEffect(() => {
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) { setLoadingBank(false); return; }
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile?.id) { setLoadingBank(false); return; }
      const { data: c } = await supabase
        .from("coaches")
        .select("id,pix_key,pix_key_type,bank_name,bank_agency,bank_account,bank_account_type")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (c) {
        setBank({
          coachId: c.id,
          pix_key: c.pix_key || "",
          pix_key_type: c.pix_key_type || "cpf",
          bank_name: c.bank_name || "",
          bank_agency: c.bank_agency || "",
          bank_account: c.bank_account || "",
          bank_account_type: c.bank_account_type || "corrente",
        });
      }
      setLoadingBank(false);

      const [walletRes, paidWithdrawsRes, commRes, recentWithdrawsRes] = await Promise.all([
        supabase.from("wallets").select("available_balance,pending_balance,total_earned,total_withdrawn").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("withdrawal_requests").select("amount,status").eq("profile_id", profile.id).eq("status", "paid"),
        supabase.from("commissions").select("id,amount,level,created_at,transaction_id,slot_label").eq("beneficiary_profile_id", profile.id).order("created_at", { ascending: false }).limit(10),
        supabase.from("withdrawal_requests").select("id,amount,status,requested_at,paid_at").eq("profile_id", profile.id).order("requested_at", { ascending: false }).limit(10),
      ]);

      const w = walletRes.data as { available_balance?: number; pending_balance?: number; total_earned?: number; total_withdrawn?: number } | null;
      const paidSum = ((paidWithdrawsRes.data as Array<{ amount: number }>) || []).reduce((s, r) => s + Number(r.amount || 0), 0);
      setWallet({
        available: Number(w?.available_balance ?? 0),
        pending: Number(w?.pending_balance ?? 0),
        total: Number(w?.total_earned ?? 0),
        withdrawn: Number(w?.total_withdrawn ?? 0) || paidSum,
      });

      const items: HistoryItem[] = [];
      const commRows = ((commRes.data as Array<{ id: string; amount: number; level: number; created_at: string; transaction_id: string; slot_label: string | null }>) || []);
      // Fetch related transactions to get purchase_type → distinguishes Loja vs Venda direta
      const txIds = Array.from(new Set(commRows.map((c) => c.transaction_id).filter(Boolean)));
      const txTypeMap = new Map<string, string>();
      if (txIds.length) {
        const { data: txs } = await supabase
          .from("transactions" as never)
          .select("id,purchase_type" as never)
          .in("id" as never, txIds as never);
        ((txs as Array<{ id: string; purchase_type: string | null }>) || []).forEach((t) => {
          txTypeMap.set(t.id, t.purchase_type || "");
        });
      }
      commRows.forEach((cm) => {
        const ptype = txTypeMap.get(cm.transaction_id) || "";
        const channel = ptype === "store_order" ? "🛒 Loja (auto)" : "🤝 Venda direta";
        const baseWho = cm.level === 0 ? "Comissão direta" : `Comissão nível ${cm.level}`;
        items.push({
          id: `c-${cm.id}`,
          who: `${baseWho} · ${channel}`,
          type: cm.slot_label || (cm.level === 0 ? "Venda direta" : `Rede MLM nível ${cm.level}`),
          value: Number(cm.amount),
          created_at: cm.created_at,
        });
      });
      ((recentWithdrawsRes.data as Array<{ id: string; amount: number; status: string; requested_at: string; paid_at: string | null }>) || []).forEach((wr) => {
        items.push({
          id: `w-${wr.id}`,
          who: "Saque PIX",
          type: wr.status === "paid" ? `Aprovado em ${new Date(wr.paid_at || wr.requested_at).toLocaleDateString("pt-BR")}` : `Status: ${wr.status}`,
          value: -Number(wr.amount),
          created_at: wr.paid_at || wr.requested_at,
        });
      });
      items.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setHistory(items.slice(0, 12));
    })();
    fetchCrossSales()
      .then((r) => setCross(r))
      .catch((err) => {
        console.error("getMyMasterCoachCrossSales failed:", err);
      });
  }, []);


  const hasBank = Boolean(bank.pix_key);

  const requestWithdraw = async () => {
    if (!bank.coachId) return;
    if (!bank.pix_key.trim()) {
      toast.error("Informe sua chave PIX");
      return;
    }
    const value = Number(amount);
    if (!value || value <= 0) {
      toast.error("Informe o valor do saque");
      return;
    }
    if (value > wallet.available) {
      toast.error("Valor maior que o saldo disponível");
      return;
    }
    setSaving(true);
    try {
      // Save bank info for future withdrawals
      const { error: upErr } = await supabase.from("coaches").update({
        pix_key: bank.pix_key.trim(),
        pix_key_type: bank.pix_key_type,
        bank_name: bank.bank_name.trim() || null,
        bank_agency: bank.bank_agency.trim() || null,
        bank_account: bank.bank_account.trim() || null,
        bank_account_type: bank.bank_account_type,
      }).eq("id", bank.coachId);
      if (upErr) throw upErr;

      // Get profile_id
      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user!.id).maybeSingle();
      if (!profile?.id) throw new Error("Perfil não encontrado");

      // Create withdrawal request — admin will see and pay it
      const { error: insErr } = await supabase.from("withdrawal_requests").insert({
        profile_id: profile.id,
        amount: value,
        pix_key: bank.pix_key.trim(),
        pix_key_type: bank.pix_key_type,
        status: "requested",
        notes: [bank.bank_name, bank.bank_agency, bank.bank_account, bank.bank_account_type].filter(Boolean).join(" · ") || null,
      });
      if (insErr) throw insErr;

      toast.success(`Saque de ${brl(value)} solicitado! Aguardando aprovação do admin.`);
      setOpen(false);
      setAmount("");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao solicitar saque");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Carteira</h1>
        <p className="text-sm text-white/50">Suas comissões e saques</p>
      </div>

      <div className="rounded-2xl p-6 mb-6" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/80 font-bold">
            Saldo disponível
          </p>
          <button
            onClick={() => setWalletVisible((v) => !v)}
            className="rounded-full bg-primary-foreground/15 p-1.5 text-primary-foreground/80 hover:bg-primary-foreground/25"
            title={walletVisible ? "Ocultar saldo" : "Mostrar saldo"}
          >
            {walletVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
          </button>
        </div>
        <p className="text-4xl font-bold text-primary-foreground mt-2 font-mono">
          {walletVisible ? brl(wallet.available) : "R$ ••••••"}
        </p>
        <p className="text-xs text-primary-foreground/70 mt-1">
          {walletVisible ? `+ ${brl(wallet.pending)} pendente` : "+ R$ •••• pendente"}
        </p>
        <Button
          variant="outline"
          onClick={() => setOpen(true)}
          disabled={loadingBank}
          className="mt-4 border-primary-foreground/30 text-primary-foreground bg-transparent hover:bg-primary-foreground/10"
        >
          <Wallet className="h-4 w-4 mr-2" /> Solicitar saque PIX
        </Button>
      </div>

      <div className="grid gap-3 grid-cols-2 mb-6">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total ganho</p>
          <p className="text-xl font-bold text-white mt-1 font-mono">
            {walletVisible ? brl(wallet.total) : "R$ ••••"}
          </p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total sacado</p>
          <p className="text-xl font-bold text-white mt-1 font-mono">
            {walletVisible ? brl(wallet.withdrawn) : "R$ ••••"}
          </p>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Histórico recente</h3>
        {history.length === 0 ? (
          <p className="text-xs text-white/40">Sem movimentações ainda. Quando houver comissões ou saques, aparecem aqui.</p>
        ) : (
          <div className="space-y-2">
            {history.map((t) => (
              <div
                key={t.id}
                className="flex items-center justify-between rounded-lg p-3"
                style={{ backgroundColor: "#0F0F0F" }}
              >
                <div>
                  <p className="text-xs font-medium text-white">{t.who}</p>
                  <p className="text-[10px] text-white/40">{t.type}</p>
                </div>
                <span className={`text-sm font-bold ${t.value > 0 ? "text-success" : "text-white/70"}`}>
                  {t.value > 0 ? "+" : "-"}{brl(Math.abs(t.value))}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {cross && cross.rows.length > 0 && (
        <div className="rounded-2xl p-5 mt-6" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-3 flex items-center gap-2">
            <Crown className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-white">Vendas cruzadas (Master Coach)</h3>
          </div>
          <div className="grid grid-cols-2 gap-3 mb-4">
            <div className="rounded-lg p-3" style={{ backgroundColor: "#0F0F0F" }}>
              <p className="text-[10px] uppercase tracking-wide text-white/40">Total recebido</p>
              <p className="text-lg font-bold text-white mt-1">R$ {cross.total.toFixed(2).replace(".", ",")}</p>
            </div>
            <div className="rounded-lg p-3" style={{ backgroundColor: "#0F0F0F" }}>
              <p className="text-[10px] uppercase tracking-wide text-white/40">De vendas cruzadas</p>
              <p className="text-lg font-bold text-white mt-1">R$ {cross.crossTotal.toFixed(2).replace(".", ",")}</p>
            </div>
          </div>
          <div className="space-y-2">
            {cross.rows.slice(0, 10).map((r) => (
              <div key={r.id} className="flex items-center justify-between rounded-lg p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <div>
                  <p className="text-xs font-medium text-white">
                    {r.orderNumber || "Pedido"} {r.isCrossSale && <span className="ml-1 rounded bg-primary/20 px-1.5 py-0.5 text-[9px] text-primary">cruzada</span>}
                  </p>
                  <p className="text-[10px] text-white/40">
                    {r.sellerCoachName ? `vendido por ${r.sellerCoachName}` : "venda direta"} · {new Date(r.createdAt).toLocaleDateString("pt-BR")}
                  </p>
                </div>
                <span className="text-sm font-bold text-success">+R$ {r.amount.toFixed(2).replace(".", ",")}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {open && (

        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Solicitar saque PIX</h3>
              <button onClick={() => !saving && setOpen(false)} className="text-white/50 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            {!hasBank && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-white/80">
                Como é seu primeiro saque, precisamos dos seus dados bancários. Eles ficarão salvos para os próximos pagamentos.
              </div>
            )}
            {hasBank && (
              <div className="mb-4 rounded-lg border border-white/10 bg-white/5 p-3 text-xs text-white/60">
                Seus dados bancários já estão salvos. Confirme abaixo se quiser atualizar.
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Valor do saque (R$) *</span>
                <input type="number" step="0.01" min="0" value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" placeholder="0,00" />
              </label>
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Tipo da chave PIX *</span>
                <select value={bank.pix_key_type} onChange={(e) => setBank({ ...bank, pix_key_type: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  <option value="cpf">CPF</option>
                  <option value="email">E-mail</option>
                  <option value="phone">Telefone</option>
                  <option value="random">Aleatória</option>
                </select>
              </label>
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Chave PIX *</span>
                <input value={bank.pix_key} onChange={(e) => setBank({ ...bank, pix_key: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Sua chave PIX" />
              </label>
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Banco</span>
                <input value={bank.bank_name} onChange={(e) => setBank({ ...bank, bank_name: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" placeholder="Nome do banco" />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block text-xs text-white/60">
                  <span className="mb-1 block">Agência</span>
                  <input value={bank.bank_agency} onChange={(e) => setBank({ ...bank, bank_agency: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                </label>
                <label className="block text-xs text-white/60">
                  <span className="mb-1 block">Conta</span>
                  <input value={bank.bank_account} onChange={(e) => setBank({ ...bank, bank_account: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" />
                </label>
              </div>
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Tipo de conta</span>
                <select value={bank.bank_account_type} onChange={(e) => setBank({ ...bank, bank_account_type: e.target.value })} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white">
                  <option value="corrente">Corrente</option>
                  <option value="poupanca">Poupança</option>
                </select>
              </label>
            </div>

            <div className="mt-5 flex gap-3">
              <Button variant="outline" disabled={saving} onClick={() => setOpen(false)} className="flex-1 border-white/10 text-white/70 hover:bg-white/5">Cancelar</Button>
              <Button onClick={requestWithdraw} disabled={saving} className="flex-1">
                {saving ? "Processando..." : hasBank ? "Confirmar saque" : "Salvar e solicitar"}
              </Button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

export default WalletTab;
