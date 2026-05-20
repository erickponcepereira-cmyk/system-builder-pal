import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Wallet, X, Crown } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getMyMasterCoachCrossSales, type CrossSaleRow } from "@/lib/cross-sales.functions";


export function WalletTab() {
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
    })();
  }, []);

  const hasBank = Boolean(bank.pix_key);

  const requestWithdraw = async () => {
    if (!bank.coachId) return;
    if (!bank.pix_key.trim()) {
      toast.error("Informe sua chave PIX");
      return;
    }
    if (!amount || Number(amount) <= 0) {
      toast.error("Informe o valor do saque");
      return;
    }
    setSaving(true);
    try {
      // Persist bank info so future withdrawals don't ask again
      const { error: upErr } = await supabase.from("coaches").update({
        pix_key: bank.pix_key.trim(),
        pix_key_type: bank.pix_key_type,
        bank_name: bank.bank_name.trim() || null,
        bank_agency: bank.bank_agency.trim() || null,
        bank_account: bank.bank_account.trim() || null,
        bank_account_type: bank.bank_account_type,
      }).eq("id", bank.coachId);
      if (upErr) throw upErr;
      toast.success(`Saque de R$ ${Number(amount).toFixed(2).replace(".", ",")} solicitado! Dados bancários salvos.`);
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
        <p className="text-xs uppercase tracking-wider text-primary-foreground/80 font-bold">
          Saldo disponível
        </p>
        <p className="text-4xl font-bold text-primary-foreground mt-2">R$ 2.450,00</p>
        <p className="text-xs text-primary-foreground/70 mt-1">+ R$ 654,00 pendente</p>
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
          <p className="text-xl font-bold text-white mt-1">R$ 12.840</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total sacado</p>
          <p className="text-xl font-bold text-white mt-1">R$ 9.736</p>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Histórico recente</h3>
        <div className="space-y-2">
          {[
            { who: "Carlos S. (direto)", value: 98.5, type: "Comissão direta 50%" },
            { who: "Ana L. (nível 1)", value: 29.55, type: "Comissão nível 1 - 15%" },
            { who: "Pedro M. (nível 2)", value: 9.85, type: "Comissão nível 2 - 5%" },
            { who: "Saque PIX", value: -800, type: "Aprovado em 10/04" },
          ].map((t, i) => (
            <div
              key={i}
              className="flex items-center justify-between rounded-lg p-3"
              style={{ backgroundColor: "#0F0F0F" }}
            >
              <div>
                <p className="text-xs font-medium text-white">{t.who}</p>
                <p className="text-[10px] text-white/40">{t.type}</p>
              </div>
              <span className={`text-sm font-bold ${t.value > 0 ? "text-success" : "text-white/70"}`}>
                {t.value > 0 ? "+" : ""}R$ {Math.abs(t.value).toFixed(2).replace(".", ",")}
              </span>
            </div>
          ))}
        </div>
      </div>

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
