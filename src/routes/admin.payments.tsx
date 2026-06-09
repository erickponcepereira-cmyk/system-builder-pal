import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Check, Clock, RefreshCw, X, DollarSign, UserRound, Wallet, TrendingDown, ChevronRight, Search, Loader2, Salad } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  getPayoutsDashboard,
  listPayoutPeople,
  getPayoutDetails,
  listPendingWithdrawals,
  registerManualPayout,
  updateWithdrawalStatus,
  type PayoutGroup,
  type SellerRole,
  type PayoutsDashboard,
  type PayoutPersonRow,
  type PayoutDetails,
  type PendingWithdrawalRow,
} from "@/lib/admin-payouts.functions";
import { listNutritionistWallets, type NutritionistWalletRow } from "@/lib/nutritionist.functions";

export const Route = createFileRoute("/admin/payments")({
  component: AdminPayments,
});

interface Transaction {
  id: string; gross_amount: number; status: string | null; purchase_type: string | null; payment_method: string; created_at: string | null; paid_at: string | null;
  metadata: { title?: string } | null;
  students: { profiles: { name: string; email: string } | null } | null;
  products: { name: string } | null;
}
interface MpPayment {
  id: string; mp_payment_id: string; source_kind: string; amount: number; status: string; payment_method: string; payer_email: string | null; payer_name: string | null; paid_at: string | null; created_at: string;
}

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const statusColor = (s: string | null) => {
  if (s === "paid" || s === "available") return "bg-success/20 text-success";
  if (s === "approved" || s === "processing") return "bg-blue-500/20 text-blue-400";
  if (s === "rejected" || s === "cancelled" || s === "failed") return "bg-destructive/20 text-destructive";
  if (s === "requested" || s === "pending") return "bg-amber-500/20 text-amber-400";
  return "bg-white/10 text-white/60";
};

function AdminPayments() {
  type Tab = "dashboard" | "seller" | "student_referrer" | "nutritionist" | "orders" | "mp";
  const [activeTab, setActiveTab] = useState<Tab>("dashboard");
  const [sellerRole, setSellerRole] = useState<SellerRole>("all");

  return (
    <>
      <div className="mb-4">
        <h1 className="text-2xl font-bold text-white">Pagamentos</h1>
        <p className="text-sm text-white/50">Saques de coaches, parceiros, profissionais, nutricionistas e alunos indicadores.</p>
      </div>

      <div className="mb-4 flex gap-1 rounded-xl bg-card p-1 overflow-x-auto">
        {[
          { k: "dashboard", l: "Dashboard" },
          { k: "seller", l: "Coach / Parceiro / Profissional" },
          { k: "student_referrer", l: "Aluno Indicador" },
          { k: "nutritionist", l: "Nutricionistas" },
          { k: "orders", l: "Pedidos" },
          { k: "mp", l: "Mercado Pago" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setActiveTab(t.k as Tab)}
            className={`flex-1 whitespace-nowrap rounded-lg px-4 py-2 text-xs font-bold ${
              activeTab === t.k ? "bg-primary text-primary-foreground" : "text-white/60"
            }`}
          >
            {t.l}
          </button>
        ))}
      </div>

      {activeTab === "dashboard" && <DashboardPanel onPickGroup={(g) => setActiveTab(g)} />}
      {activeTab === "seller" && (
        <GroupPanel key={`seller-${sellerRole}`} group="seller" sellerRole={sellerRole} onChangeSellerRole={setSellerRole} />
      )}
      {activeTab === "student_referrer" && (
        <GroupPanel key="stu" group="student_referrer" />
      )}
      {activeTab === "nutritionist" && <NutritionistPanel />}
      {activeTab === "orders" && <LegacyOrders />}
      {activeTab === "mp" && <LegacyMp />}
    </>
  );
}

// ============= Dashboard =============

function DashboardPanel({ onPickGroup }: { onPickGroup: (g: PayoutGroup) => void }) {
  const fetchDash = useServerFn(getPayoutsDashboard);
  const fetchPending = useServerFn(listPendingWithdrawals);
  const [dash, setDash] = useState<PayoutsDashboard | null>(null);
  const [pending, setPending] = useState<PendingWithdrawalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    try {
      const [d, p] = await Promise.all([fetchDash(), fetchPending()]);
      setDash(d); setPending(p);
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, []);

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;

  const totalAvailable = dash ? Object.values(dash.groups).reduce((s, g) => s + g.availableTotal, 0) : 0;
  const totalPending = dash ? Object.values(dash.groups).reduce((s, g) => s + g.pendingRequestsTotal, 0) : 0;
  const totalBlocked = dash ? Object.values(dash.groups).reduce((s, g) => s + g.blockedTotal, 0) : 0;
  const totalEarned = dash ? Object.values(dash.groups).reduce((s, g) => s + g.earnedTotal, 0) : 0;
  const groups: PayoutGroup[] = ["seller", "student_referrer"];

  return (
    <div className="space-y-6">
      <div className="grid gap-3 grid-cols-1 md:grid-cols-4">
        <SummaryCard icon={Wallet} title="Disponível geral para saque" value={fmt(totalAvailable)} accent />
        <SummaryCard icon={Clock} title="Solicitações pendentes" value={fmt(totalPending)} sub={`${pending.length} pedido(s)`} />
        <SummaryCard icon={TrendingDown} title="Bloqueado (a liberar)" value={fmt(totalBlocked)} />
        <SummaryCard icon={DollarSign} title="Total ganho (comissões)" value={fmt(totalEarned)} />
      </div>

      <div className="grid gap-3 grid-cols-1 md:grid-cols-2">
        {groups.map((g) => {
          const info = dash!.groups[g];
          return (
            <button key={g} onClick={() => onPickGroup(g)} className="text-left rounded-2xl p-5 hover:ring-1 hover:ring-primary/40 transition" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-center justify-between mb-3">
                <p className="text-xs uppercase tracking-wider text-white/50">{info.label}</p>
                <ChevronRight className="h-4 w-4 text-white/40" />
              </div>
              <p className="text-3xl font-bold text-primary font-mono">{fmt(info.availableTotal)}</p>
              <div className="mt-3 grid grid-cols-3 gap-2 text-xs text-white/60">
                <div>Bloqueado<br /><span className="text-white font-mono">{fmt(info.blockedTotal)}</span></div>
                <div>Total ganho<br /><span className="text-white font-mono">{fmt(info.earnedTotal)}</span></div>
                <div>Pendentes<br /><span className="text-white font-mono">{info.pendingRequestsCount}</span></div>
              </div>
              <p className="mt-2 text-[10px] text-white/40">{info.peopleCount} pessoa(s)</p>
            </button>
          );
        })}
      </div>


      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="p-5 border-b border-white/5">
          <h2 className="font-bold text-white">Solicitações de saque pendentes</h2>
          <p className="text-xs text-white/50 mt-1">Aprovar, recusar ou marcar como pago.</p>
        </div>
        {pending.length === 0 ? (
          <p className="text-center text-sm text-white/40 py-10">Nenhuma solicitação pendente.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {pending.map((p) => (
              <PendingRow key={p.id} item={p} onChanged={load} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

function PendingRow({ item, onChanged }: { item: PendingWithdrawalRow; onChanged: () => void }) {
  const update = useServerFn(updateWithdrawalStatus);
  const [busy, setBusy] = useState(false);
  const act = async (status: "approved" | "paid" | "rejected") => {
    setBusy(true);
    try { await update({ data: { withdrawalId: item.id, status } }); toast.success("Atualizado"); onChanged(); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(false); }
  };
  const groupLabel = item.sellerRole === "professional" ? "profissional" : item.sellerRole === "partner" ? "parceiro" : item.sellerRole === "coach" ? "coach" : item.group === "student_referrer" ? "aluno indicador" : "—";
  return (
    <div className="flex flex-col lg:flex-row lg:items-center gap-3 p-4">
      <div className="flex-1">
        <div className="flex items-center gap-2 flex-wrap">
          <span className="font-semibold text-white">{item.name}</span>
          <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(item.status)}`}>{item.status}</span>
          <span className="inline-flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/45">
            <UserRound className="h-3 w-3" /> {groupLabel}
          </span>
        </div>
        <div className="text-xs text-white/50 mt-1">{item.email}</div>
        {item.pix_key && <div className="text-xs text-white/50">PIX ({item.pix_key_type}): {item.pix_key}</div>}
      </div>
      <div className="text-right min-w-[100px]">
        <p className="text-xl font-bold text-primary font-mono">{fmt(item.amount)}</p>
        <p className="text-[10px] text-white/40">{item.requested_at ? new Date(item.requested_at).toLocaleDateString("pt-BR") : ""}</p>
      </div>
      <div className="flex gap-2">
        {item.status === "requested" && (
          <>
            <button disabled={busy} onClick={() => act("approved")} className="flex items-center gap-1 rounded-lg bg-blue-500 px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Clock className="h-3 w-3" />Aprovar</button>
            <button disabled={busy} onClick={() => act("rejected")} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><X className="h-3 w-3" />Rejeitar</button>
          </>
        )}
        {item.status === "approved" && (
          <button disabled={busy} onClick={() => act("paid")} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white disabled:opacity-50"><Check className="h-3 w-3" />Marcar como pago</button>
        )}
      </div>
    </div>
  );
}

function SummaryCard({ icon: Icon, title, value, sub, accent }: { icon: any; title: string; value: string; sub?: string; accent?: boolean }) {
  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-2">
        <Icon className={`h-4 w-4 ${accent ? "text-primary" : "text-white/60"}`} />
        <p className="text-xs uppercase tracking-wider text-white/50">{title}</p>
      </div>
      <p className={`text-2xl font-bold font-mono ${accent ? "text-primary" : "text-white"}`}>{value}</p>
      {sub && <p className="text-[10px] text-white/40 mt-1">{sub}</p>}
    </div>
  );
}

// ============= Grupo (Coach/Parceiro/Profissional) =============

function GroupPanel({ group, sellerRole, onChangeSellerRole }: { group: PayoutGroup; sellerRole?: SellerRole; onChangeSellerRole?: (r: SellerRole) => void }) {
  const fetchPeople = useServerFn(listPayoutPeople);
  const [people, setPeople] = useState<PayoutPersonRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<PayoutPersonRow | null>(null);

  const load = async () => {
    setLoading(true);
    try { setPeople(await fetchPeople({ data: { group, search, roleFilter: sellerRole } })); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [group, sellerRole]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? people.filter((p) => p.name.toLowerCase().includes(q) || (p.email || "").toLowerCase().includes(q)) : people;
  }, [people, search]);

  const roleLabel = (r: PayoutPersonRow["role"]) =>
    r === "coach" ? "Coach" : r === "partner" ? "Parceiro" : r === "professional" ? "Profissional" : "Aluno Indicador";

  return (
    <div className="space-y-4">
      {group === "seller" && onChangeSellerRole && (
        <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs w-fit">
          {(["all", "coach", "partner", "professional"] as const).map((r) => (
            <button
              key={r}
              onClick={() => onChangeSellerRole(r)}
              className={`px-3 py-1.5 rounded ${sellerRole === r ? "bg-primary text-primary-foreground font-bold" : "text-white/60"}`}
            >
              {r === "all" ? "Todos" : r === "coach" ? "Coaches" : r === "partner" ? "Parceiros" : "Profissionais"}
            </button>
          ))}
        </div>
      )}
      <div className="flex items-center gap-2">
        <div className="relative flex-1">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar nome ou email" className="w-full rounded-lg bg-white/5 border border-white/10 pl-9 pr-3 py-2 text-sm text-white" />
        </div>
        <button onClick={load} className="rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10"><RefreshCw className="h-4 w-4" /></button>
      </div>

      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/50">Ninguém encontrado.</p>
        </div>
      ) : (
        <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/40">
              <tr>
                <th className="text-left px-4 py-3">Pessoa</th>
                <th className="text-right px-4 py-3">Disponível</th>
                <th className="text-right px-4 py-3">Bloqueado</th>
                <th className="text-right px-4 py-3">Sacado</th>
                <th className="text-center px-4 py-3">Solicitação</th>
                <th className="px-2"></th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((p) => (
                <tr key={p.profileId} className="border-t border-white/5 hover:bg-white/[0.02] cursor-pointer" onClick={() => setSelected(p)}>
                  <td className="px-4 py-3">
                    <div className="flex items-center gap-2 flex-wrap">
                      <span className="font-medium text-white">{p.name}</span>
                      <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] uppercase text-white/45">{roleLabel(p.role)}</span>
                    </div>
                    <div className="text-xs text-white/40">{p.email}</div>
                  </td>
                  <td className="px-4 py-3 text-right font-mono text-primary">{fmt(p.available)}</td>
                  <td className="px-4 py-3 text-right font-mono text-white/60">{fmt(p.blocked)}</td>
                  <td className="px-4 py-3 text-right font-mono text-white/60">{fmt(p.totalWithdrawn)}</td>
                  <td className="px-4 py-3 text-center">
                    {p.pendingRequestId ? (
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(p.pendingRequestStatus)}`}>
                        {p.pendingRequestStatus} · {fmt(p.pendingRequestAmount)}
                      </span>
                    ) : <span className="text-xs text-white/30">—</span>}
                  </td>
                  <td className="px-2 text-white/30"><ChevronRight className="h-4 w-4" /></td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selected && <PersonModal person={selected} group={group} onClose={() => setSelected(null)} onChanged={() => { setSelected(null); load(); }} />}
    </div>
  );
}

// ============= Modal por pessoa =============

function PersonModal({ person, group, onClose, onChanged }: { person: PayoutPersonRow; group: PayoutGroup; onClose: () => void; onChanged: () => void }) {
  const fetchDetails = useServerFn(getPayoutDetails);
  const register = useServerFn(registerManualPayout);
  const update = useServerFn(updateWithdrawalStatus);

  const [details, setDetails] = useState<PayoutDetails | null>(null);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<"sales" | "commissions" | "withdrawals">("withdrawals");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [payoutAmount, setPayoutAmount] = useState("");
  const [payoutNotes, setPayoutNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const fromIso = from ? new Date(from).toISOString() : undefined;
      const toIso = to ? new Date(to + "T23:59:59").toISOString() : undefined;
      setDetails(await fetchDetails({ data: { profileId: person.profileId, group, fromDate: fromIso, toDate: toIso } }));
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); /* eslint-disable-next-line */ }, [from, to]);

  const submitPayout = async () => {
    const v = Number(payoutAmount.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    setBusy(true);
    try {
      await register({ data: { profileId: person.profileId, amount: v, notes: payoutNotes || undefined } });
      toast.success("Baixa realizada e carteira debitada");
      setPayoutAmount(""); setPayoutNotes("");
      onChanged();
    } catch (e: any) { toast.error(e?.message || "Erro"); }
    finally { setBusy(false); }
  };

  const handleUpdate = async (id: string, status: "approved" | "paid" | "rejected") => {
    try { await update({ data: { withdrawalId: id, status } }); toast.success("Atualizado"); load(); }
    catch (e: any) { toast.error(e?.message || "Erro"); }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4 overflow-y-auto" onClick={onClose}>
      <div className="w-full max-w-4xl rounded-2xl my-8" style={{ backgroundColor: "#0F0F0F" }} onClick={(e) => e.stopPropagation()}>
        <div className="p-5 border-b border-white/10 flex items-start justify-between">
          <div>
            <h3 className="text-lg font-bold text-white">{person.name}</h3>
            <p className="text-xs text-white/50">{person.email}</p>
          </div>
          <button onClick={onClose} className="text-white/40 hover:text-white"><X className="h-5 w-5" /></button>
        </div>

        {loading || !details ? (
          <div className="flex justify-center py-16"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : (
          <div className="p-5 space-y-5">
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              <Mini label="Disponível" value={fmt(details.wallet.available)} accent />
              <Mini label="Bloqueado" value={fmt(details.wallet.blocked)} />
              <Mini label="Total ganho" value={fmt(details.wallet.totalEarned)} />
              <Mini label="Total sacado" value={fmt(details.wallet.totalWithdrawn)} />
            </div>

            <div className="rounded-xl p-4 border border-primary/30" style={{ backgroundColor: "rgba(255,107,0,0.05)" }}>
              <p className="text-xs uppercase tracking-wider text-primary font-bold mb-2">Dar baixa em saque</p>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-2">
                <input value={payoutAmount} onChange={(e) => setPayoutAmount(e.target.value)} placeholder="Valor (R$)" inputMode="decimal" className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                <input value={payoutNotes} onChange={(e) => setPayoutNotes(e.target.value)} placeholder="Observação (opcional)" className="md:col-span-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white" />
                <button disabled={busy} onClick={submitPayout} className="rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50 flex items-center justify-center gap-2">
                  {busy && <Loader2 className="h-4 w-4 animate-spin" />} Lançar baixa
                </button>
              </div>
              <p className="text-[10px] text-white/40 mt-2">Debita automaticamente o saldo disponível e registra no histórico.</p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <div className="flex gap-1 rounded-lg bg-white/5 p-1 text-xs">
                {(["withdrawals", "sales", "commissions"] as const).map((k) => (
                  <button key={k} onClick={() => setTab(k)} className={`px-3 py-1.5 rounded ${tab === k ? "bg-primary text-primary-foreground font-bold" : "text-white/60"}`}>
                    {k === "withdrawals" ? "Saques" : k === "sales" ? `Vendas (${details.totals.salesCount})` : `Comissões`}
                  </button>
                ))}
              </div>
              <div className="ml-auto flex gap-2 items-center text-xs">
                <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
                <span className="text-white/30">até</span>
                <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded bg-white/5 border border-white/10 px-2 py-1 text-white" />
                {(from || to) && <button onClick={() => { setFrom(""); setTo(""); }} className="text-white/40 hover:text-white"><X className="h-3 w-3" /></button>}
              </div>
            </div>

            {tab === "sales" && (
              <div className="rounded-lg overflow-hidden border border-white/5">
                <div className="px-4 py-2 bg-white/5 text-xs text-white/60">{details.totals.salesCount} venda(s) · {fmt(details.totals.salesAmount)}</div>
                <DataTable rows={details.sales.map((s) => [
                  s.date ? new Date(s.date).toLocaleDateString("pt-BR") : "—",
                  s.student || "—",
                  s.product || "—",
                  <span key="s" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(s.status)}`}>{s.status}</span>,
                  <span key="a" className="font-mono">{fmt(s.amount)}</span>,
                ])} headers={["Data", "Aluno", "Produto", "Status", "Valor"]} />
              </div>
            )}

            {tab === "commissions" && (
              <div className="rounded-lg overflow-hidden border border-white/5">
                <div className="px-4 py-2 bg-white/5 text-xs text-white/60 flex gap-4 flex-wrap">
                  <span>Disponível: <span className="text-success font-mono">{fmt(details.totals.commissionsAvailable)}</span></span>
                  <span>Pendente: <span className="text-amber-400 font-mono">{fmt(details.totals.commissionsPending)}</span></span>
                  <span>Pago: <span className="text-white font-mono">{fmt(details.totals.commissionsPaid)}</span></span>
                </div>
                <DataTable rows={details.commissions.map((c) => [
                  c.date ? new Date(c.date).toLocaleDateString("pt-BR") : "—",
                  c.level !== null ? `L${c.level}` : "—",
                  <span key="s" className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(c.status)}`}>{c.status}</span>,
                  <span key="a" className="font-mono">{fmt(c.amount)}</span>,
                ])} headers={["Data", "Nível", "Status", "Valor"]} />
              </div>
            )}

            {tab === "withdrawals" && (
              <div className="rounded-lg overflow-hidden border border-white/5">
                <div className="px-4 py-2 bg-white/5 text-xs text-white/60">Histórico de saques ({details.withdrawals.length})</div>
                {details.withdrawals.length === 0 ? (
                  <p className="text-center text-sm text-white/40 py-8">Nenhum saque registrado.</p>
                ) : (
                  <div className="divide-y divide-white/5">
                    {details.withdrawals.map((w) => (
                      <div key={w.id} className="p-3 flex items-center gap-3 flex-wrap">
                        <div className="flex-1 min-w-[200px]">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(w.status)}`}>{w.status}</span>
                            <span className="text-xs text-white/40">{w.requested_at ? new Date(w.requested_at).toLocaleString("pt-BR") : ""}</span>
                          </div>
                          {w.pix_key && <p className="text-xs text-white/50 mt-1">PIX: {w.pix_key}</p>}
                          {w.notes && <p className="text-xs text-white/40 mt-1">{w.notes}</p>}
                          {w.paid_at && <p className="text-xs text-white/40">Pago em {new Date(w.paid_at).toLocaleString("pt-BR")}</p>}
                        </div>
                        <span className="font-mono text-primary font-bold">{fmt(w.amount)}</span>
                        {w.status === "requested" && (
                          <div className="flex gap-1">
                            <button onClick={() => handleUpdate(w.id, "approved")} className="rounded bg-blue-500 px-2 py-1 text-xs text-white">Aprovar</button>
                            <button onClick={() => handleUpdate(w.id, "rejected")} className="rounded bg-destructive px-2 py-1 text-xs text-white">Rejeitar</button>
                          </div>
                        )}
                        {w.status === "approved" && (
                          <button onClick={() => handleUpdate(w.id, "paid")} className="rounded bg-success px-2 py-1 text-xs text-white">Marcar pago</button>
                        )}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

function Mini({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className="rounded-lg p-3 bg-white/[0.04]">
      <p className="text-[10px] uppercase tracking-wider text-white/40">{label}</p>
      <p className={`mt-1 text-lg font-bold font-mono ${accent ? "text-primary" : "text-white"}`}>{value}</p>
    </div>
  );
}

function DataTable({ headers, rows }: { headers: string[]; rows: React.ReactNode[][] }) {
  if (rows.length === 0) return <p className="text-center text-sm text-white/40 py-8">Sem registros.</p>;
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="bg-white/5 text-xs uppercase tracking-wider text-white/40">
          <tr>{headers.map((h, i) => <th key={i} className={`px-4 py-2 ${i === headers.length - 1 ? "text-right" : "text-left"}`}>{h}</th>)}</tr>
        </thead>
        <tbody>
          {rows.map((r, ri) => (
            <tr key={ri} className="border-t border-white/5">
              {r.map((c, ci) => <td key={ci} className={`px-4 py-2 text-white/80 ${ci === r.length - 1 ? "text-right" : ""}`}>{c}</td>)}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ============= Abas legadas (Pedidos + Mercado Pago) =============

function LegacyOrders() {
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("transactions")
      .select("id,gross_amount,status,purchase_type,payment_method,created_at,paid_at,metadata,students!transactions_student_id_fkey(profiles!students_profile_id_fkey(name,email)),products!transactions_product_id_fkey(name)")
      .order("created_at", { ascending: false })
      .limit(100);
    setTransactions((data as unknown as Transaction[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const confirmTransaction = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ status: "paid", paid_at: new Date().toISOString() } as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Pagamento confirmado"); load(); }
  };
  const cancelTransaction = async (id: string) => {
    const { error } = await supabase.from("transactions").update({ status: "failed" } as never).eq("id", id);
    if (error) toast.error(error.message); else { toast.success("Pedido cancelado"); load(); }
  };
  const releaseCommissions = async () => {
    const { data, error } = await supabase.rpc("release_available_commissions" as never);
    if (error) toast.error(error.message); else { toast.success(`${data || 0} comissão(ões) liberada(s)`); load(); }
  };

  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const approvedOnly = transactions.filter((t) => t.status === "paid");
  return (
    <div className="space-y-3">
      <div className="flex justify-end">
        <button onClick={releaseCommissions} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"><RefreshCw className="h-4 w-4" />Liberar comissões vencidas</button>
      </div>
      {approvedOnly.length === 0 ? (
        <div className="rounded-2xl bg-card p-12 text-center"><DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" /><p className="text-white/50">Nenhum pedido aprovado.</p></div>
      ) : approvedOnly.map((t) => (
        <div key={t.id} className="rounded-2xl border border-white/5 bg-card p-5">
          <div className="flex flex-col gap-4 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="mb-2 flex flex-wrap items-center gap-2">
                <h3 className="text-base font-bold text-white">{t.metadata?.title || t.products?.name || "Pedido FitMind"}</h3>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(t.status)}`}>{t.status}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{t.purchase_type || "challenge"}</span>
              </div>
              <div className="text-xs text-white/60">
                <div>{t.students?.profiles?.name || "Aluno"} · {t.students?.profiles?.email || "—"}</div>
                <div>{t.payment_method} · {t.created_at ? new Date(t.created_at).toLocaleDateString("pt-BR") : "—"}</div>
              </div>
            </div>
            <p className="text-2xl font-bold text-primary">{fmt(t.gross_amount)}</p>
            {t.status === "pending" && (
              <div className="flex gap-2">
                <button onClick={() => confirmTransaction(t.id)} className="flex items-center gap-1 rounded-lg bg-success px-3 py-1.5 text-xs font-bold text-white"><Check className="h-3 w-3" />Confirmar</button>
                <button onClick={() => cancelTransaction(t.id)} className="flex items-center gap-1 rounded-lg bg-destructive px-3 py-1.5 text-xs font-bold text-white"><X className="h-3 w-3" />Cancelar</button>
              </div>
            )}
          </div>
        </div>
      ))}
    </div>
  );
}

function LegacyMp() {
  const [items, setItems] = useState<MpPayment[]>([]);
  const [loading, setLoading] = useState(true);
  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("mercadopago_payments" as never).select("id,mp_payment_id,source_kind,amount,status,payment_method,payer_email,payer_name,paid_at,created_at" as never).order("created_at" as never, { ascending: false }).limit(200);
      setItems((data as unknown as MpPayment[]) || []);
      setLoading(false);
    })();
  }, []);
  if (loading) return <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  const approved = items.filter((p) => p.status === "approved");
  const totalApproved = approved.reduce((s, p) => s + Number(p.amount || 0), 0);
  return (
    <div className="space-y-4">
      <div className="grid gap-3 md:grid-cols-2">
        <div className="rounded-2xl bg-card p-4"><p className="text-xs text-white/50">Total arrecadado</p><p className="mt-1 text-2xl font-bold text-primary">{fmt(totalApproved)}</p></div>
        <div className="rounded-2xl bg-card p-4"><p className="text-xs text-white/50">Aprovadas</p><p className="mt-1 text-2xl font-bold text-white">{approved.length}</p></div>
      </div>
      {approved.length === 0 ? (
        <div className="rounded-2xl bg-card p-12 text-center"><DollarSign className="h-10 w-10 text-white/20 mx-auto mb-3" /><p className="text-white/50">Nenhum pagamento aprovado.</p></div>
      ) : approved.map((p) => (
        <div key={p.id} className="rounded-2xl border border-white/5 bg-card p-4">
          <div className="flex flex-col gap-2 lg:flex-row lg:items-center">
            <div className="flex-1">
              <div className="mb-1 flex flex-wrap items-center gap-2">
                <span className="text-sm font-bold text-white">{p.payer_name || p.payer_email || "Pagador"}</span>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold uppercase ${statusColor(p.status)}`}>{p.status}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{p.payment_method}</span>
                <span className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] text-white/50">{p.source_kind}</span>
              </div>
              <div className="text-xs text-white/60">MP #{p.mp_payment_id} · {new Date(p.created_at).toLocaleString("pt-BR")}</div>
            </div>
            <p className="text-xl font-bold text-primary">{fmt(Number(p.amount))}</p>
          </div>
        </div>
      ))}
    </div>
  );
}
