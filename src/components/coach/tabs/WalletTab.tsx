import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Button } from "@/components/ui/button";
import { Wallet, X, Eye, EyeOff, Lock, Unlock, CheckCircle2, Info, Trophy, Medal } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { getWalletSplit, type WalletSplit } from "@/lib/network-unlock.functions";
import { getCareerProgress, type CareerProgress } from "@/lib/coach-career.functions";
import { getMyWalletHistory } from "@/lib/coach-wallet-history.functions";
import { getIndividualCareer, type IndividualCareer, type MedalRule } from "@/lib/coach-medals.functions";
import { AchievementMembersModal } from "@/components/coach/AchievementMembersModal";
import { MasterCoachBadge } from "@/components/ui/MasterCoachBadge";
import { PendingInfo } from "@/components/PendingInfo";

const MIN_WITHDRAWAL = 100;



const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const TIER_COLOR_WALLET: Record<string, string> = {
  bronze: "#CD7F32", silver: "#C0C0C0", gold: "#FFD700", platinum: "#E5E4E2", crown: "#FFB300", club: "#FF6B35",
};

type HistoryItem = { id: string; who: string; type: string; value: number; created_at: string; isNetwork: boolean; customer?: string; product?: string; isMasterCoachSale?: boolean; masterCoachName?: string | null };


export function WalletTab() {
  const fetchSplit = useServerFn(getWalletSplit);
  const fetchCareer = useServerFn(getCareerProgress);
  const fetchMedals = useServerFn(getIndividualCareer);
  const fetchHistory = useServerFn(getMyWalletHistory);

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
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [walletVisible, setWalletVisible] = useState(false);
  const [split, setSplit] = useState<WalletSplit | null>(null);
  const [tab, setTab] = useState<"direct" | "network">("direct");
  const [showRules, setShowRules] = useState(false);
  const [career, setCareer] = useState<CareerProgress | null>(null);
  const [medals, setMedals] = useState<IndividualCareer | null>(null);
  const [modal, setModal] = useState<
    | { kind: "patent" | "medal_monthly" | "medal_cumulative"; key: string; title: string; subtitle?: string; color: string }
    | null
  >(null);


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

      const [historyRows, recentWithdrawsRes] = await Promise.all([
        fetchHistory().catch(() => []),
        supabase.from("withdrawal_requests").select("id,amount,status,requested_at,paid_at").eq("profile_id", profile.id).order("requested_at", { ascending: false }).limit(10),
      ]);

      const items: HistoryItem[] = [];
      (historyRows || []).forEach((cm) => {
        const ptype = cm.purchase_type || "";
        const channel = ptype === "store_order" ? "🛒 Loja (auto)" : "🤝 Venda direta";
        const baseWho = cm.level === 0 ? "Comissão direta" : `Comissão rede nível ${cm.level}`;
        items.push({
          id: `c-${cm.id}`,
          who: `${baseWho} · ${channel}`,
          type: cm.slot_label || (cm.level === 0 ? "Venda direta" : `Rede MLM nível ${cm.level}`),
          value: Number(cm.amount),
          created_at: cm.created_at,
          isNetwork: cm.level > 0,
          customer: cm.customer || undefined,
          product: cm.product || undefined,
        });
      });
      ((recentWithdrawsRes.data as Array<{ id: string; amount: number; status: string; requested_at: string; paid_at: string | null }>) || []).forEach((wr) => {
        items.push({
          id: `w-${wr.id}`,
          who: "Saque PIX",
          type: wr.status === "paid" ? `Aprovado em ${new Date(wr.paid_at || wr.requested_at).toLocaleDateString("pt-BR")}` : `Status: ${wr.status}`,
          value: -Number(wr.amount),
          created_at: wr.paid_at || wr.requested_at,
          isNetwork: false,
        });
      });
      items.sort((a, b) => b.created_at.localeCompare(a.created_at));
      setHistory(items.slice(0, 20));
    })();
    fetchCrossSales().then((r) => setCross(r)).catch(() => {});
    fetchSplit().then((r) => setSplit(r)).catch((e) => console.error("getWalletSplit failed:", e));
    fetchCareer().then(setCareer).catch(() => {});
    fetchMedals().then(setMedals).catch(() => {});

  }, []);


  const hasBank = Boolean(bank.pix_key);
  const directAvail = split?.direct.available ?? 0;
  const networkAvail = split?.network.available ?? 0;
  const networkLocked = split?.network.locked ?? true;
  const withdrawableMax = directAvail + (networkLocked ? 0 : networkAvail);

  const requestWithdraw = async () => {
    if (!bank.coachId) return;
    if (!bank.pix_key.trim()) { toast.error("Informe sua chave PIX"); return; }
    const value = Number(amount);
    if (!value || value <= 0) { toast.error("Informe o valor do saque"); return; }
    if (value < MIN_WITHDRAWAL) { toast.error(`Saque mínimo: ${brl(MIN_WITHDRAWAL)}`); return; }
    if (value > withdrawableMax) {
      toast.error(networkLocked
        ? `Valor maior que o disponível para saque. Sua rede está bloqueada — bata a meta mensal para liberar ${brl(networkAvail)}.`
        : "Valor maior que o saldo disponível");
      return;
    }
    setSaving(true);
    try {
      const { error: upErr } = await supabase.from("coaches").update({
        pix_key: bank.pix_key.trim(),
        pix_key_type: bank.pix_key_type,
        bank_name: bank.bank_name.trim() || null,
        bank_agency: bank.bank_agency.trim() || null,
        bank_account: bank.bank_account.trim() || null,
        bank_account_type: bank.bank_account_type,
      }).eq("id", bank.coachId);
      if (upErr) throw upErr;

      const { data: userData } = await supabase.auth.getUser();
      const { data: profile } = await supabase.from("profiles").select("id").eq("user_id", userData.user!.id).maybeSingle();
      if (!profile?.id) throw new Error("Perfil não encontrado");

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

  const mask = (v: number) => walletVisible ? brl(v) : "R$ ••••";

  const currentPatent = career?.patents.find((p) => p.key === career.currentPatentKey) ?? null;

  // Last conquered medal (any kind), used in Vendas Diretas
  let topMonthlyMedal: MedalRule | null = null;
  let topMonthlyKind: "medal_monthly" | "medal_cumulative" = "medal_monthly";
  if (medals && medals.earned.length) {
    const sorted = [...medals.earned].sort((a, b) => b.awarded_at.localeCompare(a.awarded_at));
    const last = sorted[0];
    const rules = last.medal_kind === "monthly" ? medals.monthlyRules : medals.cumulativeRules;
    topMonthlyMedal = rules.find((r) => r.key === last.medal_key) ?? null;
    topMonthlyKind = last.medal_kind === "monthly" ? "medal_monthly" : "medal_cumulative";
  }

  const renderDirect = () => (

    <>
      <div className="rounded-2xl p-6 mb-4" style={{ background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))" }}>
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider text-primary-foreground/80 font-bold">Vendas Diretas — disponível</p>
          <Unlock className="h-4 w-4 text-primary-foreground/80" />
        </div>
        <p className="text-4xl font-bold text-primary-foreground mt-2 font-mono">{mask(directAvail)}</p>
        <p className="text-xs text-primary-foreground/70 mt-1 inline-flex items-center gap-1.5">
          + {mask(split?.direct.pending ?? 0)} pendente
          <PendingInfo days={3} />
        </p>
      </div>
      <div className="grid gap-3 grid-cols-2">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Total ganho (direto)</p>
          <p className="text-xl font-bold text-white mt-1 font-mono">{mask(split?.direct.total ?? 0)}</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/50">Pendente</p>
          <p className="text-xl font-bold text-white mt-1 font-mono">{mask(split?.direct.pending ?? 0)}</p>
        </div>
      </div>

      {topMonthlyMedal && (
        <button
          type="button"
          onClick={() => setModal({
            kind: topMonthlyKind,
            key: topMonthlyMedal!.key,
            title: topMonthlyMedal!.display_name,
            subtitle: "Última medalha conquistada",
            color: TIER_COLOR_WALLET[topMonthlyMedal!.tier || ""] || "#CD7F32",
          })}
          className="w-full text-left rounded-2xl p-4 mt-3 transition hover:bg-white/[0.02] relative overflow-hidden"
          style={{
            backgroundColor: "#1A1A1A",
            border: `1px solid ${TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32"}55`,
          }}
        >
          <div
            className="absolute -right-8 -top-8 h-32 w-32 rounded-full"
            style={{ backgroundColor: `${TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32"}1A` }}
          />
          <div className="relative flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
              style={{
                backgroundColor: `${TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32"}25`,
                border: `1px solid ${TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32"}66`,
              }}
            >
              <Medal className="h-6 w-6" style={{ color: TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: TIER_COLOR_WALLET[topMonthlyMedal.tier || ""] || "#CD7F32" }}>
                Medalha conquistada
              </p>
              <p className="text-base font-bold text-white truncate">{topMonthlyMedal.display_name}</p>
              <p className="text-[10px] text-white/40">Toque para ver quem mais está nesta conquista</p>
            </div>
          </div>
        </button>
      )}
    </>
  );


  const renderNetwork = () => (
    <>
      <div
        className="rounded-2xl p-6 mb-4 relative overflow-hidden"
        style={{
          background: networkLocked
            ? "linear-gradient(135deg, #2a1f1a, #1a1410)"
            : "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary)/0.6))",
        }}
      >
        <div className="flex items-center justify-between">
          <p className="text-xs uppercase tracking-wider font-bold" style={{ color: networkLocked ? "#ffb86b" : "rgba(255,255,255,0.85)" }}>
            Rede {networkLocked ? "— bloqueada" : "— liberada"}
          </p>
          {networkLocked ? <Lock className="h-4 w-4 text-orange-300" /> : <Unlock className="h-4 w-4 text-primary-foreground/80" />}
        </div>
        <p className={`text-4xl font-bold mt-2 font-mono ${networkLocked ? "text-orange-100/80" : "text-primary-foreground"}`}>
          {mask(networkAvail)}
        </p>
        <p className={`text-xs mt-1 ${networkLocked ? "text-orange-200/70" : "text-primary-foreground/70"}`}>
          + {mask(split?.network.pending ?? 0)} pendente · Total {mask(split?.network.total ?? 0)}
        </p>
        {networkLocked && (
          <p className="text-[11px] mt-3 text-orange-200/80">
            🔒 Para liberar este saldo, atinja uma das metas mensais abaixo.
          </p>
        )}
      </div>

      {currentPatent && (
        <button
          type="button"
          onClick={() => setModal({
            kind: "patent",
            key: currentPatent.key,
            title: currentPatent.display_name,
            subtitle: "Patente atual",
            color: currentPatent.badge_color || "#FF4230",
          })}
          className="w-full text-left rounded-2xl p-4 mb-4 transition hover:bg-white/[0.02] relative overflow-hidden"
          style={{ backgroundColor: "#1A1A1A", border: `1px solid ${(currentPatent.badge_color || "#FF4230")}55` }}
        >
          <div className="absolute -right-10 -top-10 h-32 w-32 rounded-full" style={{ backgroundColor: `${currentPatent.badge_color || "#FF4230"}1A` }} />
          <div className="relative flex items-center gap-3">
            <div
              className="flex h-12 w-12 items-center justify-center rounded-xl flex-shrink-0"
              style={{
                backgroundColor: `${currentPatent.badge_color || "#FF4230"}25`,
                border: `1px solid ${currentPatent.badge_color || "#FF4230"}66`,
              }}
            >
              <Trophy className="h-6 w-6" style={{ color: currentPatent.badge_color || "#FF4230" }} />
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-[10px] uppercase tracking-wider font-bold" style={{ color: currentPatent.badge_color || "#FF4230" }}>
                Patente atual
              </p>
              <p className="text-base font-bold text-white truncate">{currentPatent.display_name}</p>
              <p className="text-[10px] text-white/40">Toque para ver quem mais está nesta patente</p>
            </div>
          </div>
        </button>
      )}


      {/* Gamification */}
      {split && (
        <div className="rounded-2xl p-5 mb-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-3">
            <div>
              <h3 className="text-sm font-bold text-white">Missão do mês</h3>
              <p className="text-[11px] text-white/50">
                {new Date(split.unlock.monthStart).toLocaleDateString("pt-BR", { month: "long", year: "numeric", timeZone: "UTC" })} · {split.unlock.multiplierTier}
              </p>
            </div>
            <button onClick={() => setShowRules((s) => !s)} className="text-[11px] text-white/60 hover:text-white flex items-center gap-1">
              <Info className="h-3 w-3" /> Regras
            </button>
          </div>

          {showRules && (
            <div className="mb-3 rounded-lg border border-primary/20 bg-primary/5 p-3 text-[11px] text-white/70 space-y-1">
              <p className="font-bold text-white">Por que essa missão existe?</p>
              <p>O FitChain não é uma pirâmide: é uma empresa que <strong>comissiona e gratifica produção</strong>. Para receber as comissões da sua rede, você precisa também produzir um mínimo no mês.</p>
              <ul className="list-disc pl-4 space-y-0.5">
                <li>Período: do dia 01 até o último dia do mês.</li>
                <li>Basta atingir <strong>uma das metas</strong> abaixo para liberar TODA a comissão da rede do mês.</li>
                <li>Patente 1-3: meta base · Patente 4-7: meta dobrada · Patente 8-12: meta quadruplicada.</li>
                <li>Sem atingir, a comissão da rede fica bloqueada até o próximo mês.</li>
              </ul>
            </div>
          )}

          <div className="space-y-2">
            {split.unlock.goals.length === 0 && (
              <p className="text-xs text-white/40">Nenhuma meta configurada pelo admin.</p>
            )}
            {split.unlock.goals.map((g) => {
              const pct = Math.min(100, Math.round((g.current / Math.max(1, g.required_scaled)) * 100));
              const done = g.completed || split.unlock.anyCompleted;
              return (
                <div key={g.id} className="rounded-lg p-3" style={{ backgroundColor: "#0F0F0F" }}>
                  <div className="flex items-center justify-between mb-1.5">
                    <div className="flex items-center gap-2">
                      {done && <CheckCircle2 className="h-4 w-4 text-success" />}
                      <span className="text-xs font-medium text-white">{g.label}</span>
                    </div>
                    <span className={`text-[11px] font-bold ${done ? "text-success" : "text-white/60"}`}>
                      {done ? "✓ Concluído" : `${g.current}/${g.required_scaled}`}
                    </span>
                  </div>
                  <div className="h-2 rounded-full bg-white/10 overflow-hidden">
                    <div
                      className="h-full rounded-full transition-all"
                      style={{
                        width: `${done ? 100 : Math.max(pct, g.current > 0 ? 4 : 0)}%`,
                        background: done ? "var(--success)" : "var(--primary)",
                      }}
                    />
                  </div>
                </div>
              );
            })}
          </div>

          {split.unlock.anyCompleted && (
            <div className="mt-3 rounded-lg border border-success/30 bg-success/10 p-3 text-xs text-white">
              🎉 <strong>Parabéns!</strong> Você liberou a comissão da rede deste mês.
            </div>
          )}
        </div>
      )}
    </>
  );

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Carteira</h1>
          <p className="text-sm text-white/50">Suas comissões e saques</p>
        </div>
        <button
          onClick={() => setWalletVisible((v) => !v)}
          className="rounded-full bg-white/10 p-2 text-white/70 hover:bg-white/15"
          title={walletVisible ? "Ocultar saldo" : "Mostrar saldo"}
        >
          {walletVisible ? <Eye className="h-4 w-4" /> : <EyeOff className="h-4 w-4" />}
        </button>
      </div>

      {/* Tabs */}
      <div className="flex gap-2 mb-4 rounded-lg p-1" style={{ backgroundColor: "#1A1A1A" }}>
        <button
          onClick={() => setTab("direct")}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition ${tab === "direct" ? "bg-primary text-primary-foreground" : "text-white/60"}`}
        >
          Vendas Diretas
        </button>
        <button
          onClick={() => setTab("network")}
          className={`flex-1 rounded-md px-3 py-2 text-xs font-bold transition flex items-center justify-center gap-1.5 ${tab === "network" ? "bg-primary text-primary-foreground" : "text-white/60"}`}
        >
          Rede {networkLocked ? <Lock className="h-3 w-3" /> : <Unlock className="h-3 w-3" />}
        </button>
      </div>

      {tab === "direct" ? renderDirect() : renderNetwork()}

      <Button
        variant="outline"
        onClick={() => setOpen(true)}
        disabled={loadingBank}
        className="mt-4 w-full border-primary/30 text-white bg-primary/10 hover:bg-primary/20"
      >
        <Wallet className="h-4 w-4 mr-2" /> Solicitar saque PIX (disponível: {mask(withdrawableMax)})
      </Button>

      <div className="rounded-2xl p-5 mt-6" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="text-sm font-bold text-white mb-3">Histórico recente</h3>
        {history.length === 0 ? (
          <p className="text-xs text-white/40">Sem movimentações ainda.</p>
        ) : (
          <div className="space-y-2">
            {history.filter((h) => tab === "direct" ? !h.isNetwork || h.value < 0 : h.isNetwork || h.value < 0).map((t) => (
              <div key={t.id} className="flex items-start justify-between gap-3 rounded-lg p-3" style={{ backgroundColor: "#0F0F0F" }}>
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-medium text-white">{t.who}</p>
                  <p className="text-[10px] text-white/40">{t.type}</p>
                  {(t.customer || t.product) && (
                    <p className="text-[10px] text-white/60 mt-0.5 truncate">
                      {t.customer && <>👤 {t.customer}</>}
                      {t.customer && t.product && " · "}
                      {t.product && <>📦 {t.product}</>}
                    </p>
                  )}
                  <p className="text-[10px] text-white/30 mt-0.5">{new Date(t.created_at).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" })}</p>
                </div>
                <span className={`text-sm font-bold whitespace-nowrap ${t.value > 0 ? "text-success" : "text-white/70"}`}>
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
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => !saving && setOpen(false)}>
          <div className="w-full max-w-md rounded-2xl p-6 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-white">Solicitar saque PIX</h3>
              <button onClick={() => !saving && setOpen(false)} className="text-white/50 hover:text-white"><X className="h-5 w-5" /></button>
            </div>

            {networkLocked && networkAvail > 0 && (
              <div className="mb-4 rounded-lg border border-orange-400/30 bg-orange-400/10 p-3 text-xs text-orange-100">
                <Lock className="inline h-3 w-3 mr-1" /> Você tem <strong>{brl(networkAvail)}</strong> em comissões da rede bloqueadas. Bata a meta mensal para liberá-las.
              </div>
            )}
            {!hasBank && (
              <div className="mb-4 rounded-lg border border-primary/30 bg-primary/10 p-3 text-xs text-white/80">
                Como é seu primeiro saque, precisamos dos seus dados bancários.
              </div>
            )}

            <div className="space-y-3">
              <label className="block text-xs text-white/60">
                <span className="mb-1 block">Valor do saque (R$) * — mín {brl(MIN_WITHDRAWAL)} · máx {brl(withdrawableMax)}</span>
                <input type="number" step="0.01" min={MIN_WITHDRAWAL} value={amount} onChange={(e) => setAmount(e.target.value)} className="w-full rounded-md border border-white/10 bg-white/5 px-3 py-2 text-sm text-white" placeholder="0,00" />
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

      {modal && (
        <AchievementMembersModal
          open={!!modal}
          onClose={() => setModal(null)}
          kind={modal.kind}
          achievementKey={modal.key}
          title={modal.title}
          subtitle={modal.subtitle}
          accentColor={modal.color}
        />
      )}
    </>
  );
}


export default WalletTab;
