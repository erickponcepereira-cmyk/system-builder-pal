import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { TestModeBanner } from "@/components/admin/TestModeBanner";
import {
  listAdminSubscriptions, listAdminInvoices, updateSubscriptionAdmin,
  listPlansAdmin, updatePlanAdmin, markInvoicePaidAdmin, exemptInvoiceAdmin, generateInvoicesNow,
  revertInvoiceAdmin, postponeInvoiceAdmin, resetInvoiceDueDateAdmin, resetInvoicePaymentAttemptAdmin,
  skipInvoiceAdmin, getInvoiceAuditLog, getSubscriptionsDashboard, adminReleaseUserSubscription,
} from "@/lib/admin-subscriptions.functions";
import { listAllAnnualActivationsAdmin } from "@/lib/annual-activation.functions";
import { History, X, SkipForward, Unlock, Search } from "lucide-react";




export const Route = createFileRoute("/_authenticated/admin/subscriptions")({
  head: () => ({ meta: [{ title: "Mensalidades — Admin" }] }),
  component: AdminSubscriptionsPage,
});

const fmt = (n: number) => `R$ ${Number(n || 0).toFixed(2).replace(".", ",")}`;
const parseLocalDate = (d: string) => {
  const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(d);
  if (m) return new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3]));
  return new Date(d);
};
const fmtDate = (d?: string | null) => (d ? parseLocalDate(d).toLocaleDateString("pt-BR") : "—");
const fmtMonth = (d: string) => parseLocalDate(d).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" });
const STATUS_LABEL: Record<string, string> = {
  pending: "Pendente", paid: "Pago", exempted: "Isenta", overdue: "Atrasada",
  blocked: "Bloqueado", cancelled: "Cancelada",
};
const SUB_STATUS_LABEL: Record<string, string> = {
  active: "Ativa", exempt_monthly: "Isenta (mês)", exempt_annual: "Isenta (ano)",
  exempt_permanent: "Isenta (permanente)", cancelled: "Cancelada",
};

function AdminSubscriptionsPage() {
  const [tab, setTab] = useState<"dashboard" | "subs" | "invoices" | "config">("dashboard");
  const [subs, setSubs] = useState<any[]>([]);
  const [invs, setInvs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [annualMap, setAnnualMap] = useState<Map<string, { paid_at: string | null; valid_until: string | null; source: string; note: string | null; active: boolean }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");
  const [search, setSearch] = useState("");
  const [auditInvoiceId, setAuditInvoiceId] = useState<string | null>(null);

  const fnSubs = useServerFn(listAdminSubscriptions);
  const fnInvs = useServerFn(listAdminInvoices);
  const fnPlans = useServerFn(listPlansAdmin);
  const fnUpd = useServerFn(updateSubscriptionAdmin);
  const fnUpdPlan = useServerFn(updatePlanAdmin);
  const fnPay = useServerFn(markInvoicePaidAdmin);
  const fnExempt = useServerFn(exemptInvoiceAdmin);
  const fnGen = useServerFn(generateInvoicesNow);
  const fnAnnual = useServerFn(listAllAnnualActivationsAdmin);
  const fnRevert = useServerFn(revertInvoiceAdmin);
  const fnPostpone = useServerFn(postponeInvoiceAdmin);
  const fnResetDue = useServerFn(resetInvoiceDueDateAdmin);
  const fnResetAttempt = useServerFn(resetInvoicePaymentAttemptAdmin);
  const fnSkip = useServerFn(skipInvoiceAdmin);
  const fnRelease = useServerFn(adminReleaseUserSubscription);

  const releaseUser = async (userId: string, label?: string) => {
    if (!confirm(`Liberar acesso de ${label ?? "este usuário"} agora? Todas as faturas em aberto (bloqueadas, atrasadas e pendentes) ficarão isentas.`)) return;
    try {
      const r: any = await fnRelease({ data: { user_id: userId } } as any);
      toast.success(`Acesso liberado — ${r?.released ?? 0} fatura(s) isenta(s)`);
      load();
    } catch (e: any) { toast.error(e.message); }
  };




  const load = async () => {
    setLoading(true);
    try {
      const [s, i, p, a] = await Promise.all([
        fnSubs(),
        fnInvs({ data: { status: filterStatus || undefined } } as any),
        fnPlans(),
        fnAnnual(),
      ]);
      setSubs(s as any); setInvs(i as any); setPlans(p as any);
      setAnnualMap(new Map((a as any[]).map((r) => [r.user_id, r])));
    } catch (e: any) { toast.error(e.message); }
    finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [filterStatus]);

  return (
    <div className="p-6 text-white">
      <TestModeBanner hiddenLabel="Faturas/assinaturas" />
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">Mensalidades</h1>
          <p className="text-sm text-white/50">Assinaturas, faturas e configurações da mensalidade recorrente.</p>
        </div>
        <button onClick={async () => { try { const r = await fnGen(); toast.success(`Geradas ${(r as any)?.generated ?? 0} faturas`); load(); } catch (e: any) { toast.error(e.message); } }}
          className="rounded-lg bg-primary px-4 py-2 text-sm font-bold">Gerar faturas do mês</button>
      </div>

      <div className="mb-4 flex gap-2 border-b border-white/10">
        {[
          ["dashboard", "Dashboard"], ["subs", "Assinaturas"], ["invoices", "Faturas"], ["config", "Configurações"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? "border-b-2 border-primary text-white" : "text-white/50"}`}>
            {l}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/50">Carregando...</p>}

      {tab === "dashboard" && <DashboardTab />}


      {tab === "subs" && (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="p-3 text-left">Usuário</th>
                <th className="p-3 text-left">Email</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-center">Dia</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Isento até</th>
                <th className="p-3 text-right">Ações</th>
              </tr>
            </thead>
            <tbody>
              {subs.map((s) => (
                <SubRow key={s.id} sub={s} onSave={async (patch) => {
                  try { await fnUpd({ data: { id: s.id, ...patch } } as any); toast.success("Atualizado"); load(); }
                  catch (e: any) { toast.error(e.message); }
                }} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {tab === "invoices" && (() => {
        const term = search.trim().toLowerCase();
        const visibleInvs = term
          ? invs.filter((i) =>
              `${i.profile?.name ?? ""} ${i.profile?.email ?? ""} ${i.user_id}`.toLowerCase().includes(term))
          : invs;
        return (
        <>
          {(() => {
            const blocking = visibleInvs.filter((i) => i.status === "blocked" || i.status === "overdue");

            if (!blocking.length) return null;
            const blockedCount = blocking.filter((i) => i.status === "blocked").length;
            return (
              <div className="mb-3 rounded-xl border border-red-500/40 bg-red-500/10 p-4">
                <div className="flex items-center justify-between gap-3">
                  <div>
                    <p className="text-sm font-bold text-red-300">
                      {blocking.length} fatura(s) em aberto — {blockedCount} bloqueando acesso ao sistema
                    </p>
                    <p className="text-xs text-red-200/70">
                      Faturas com status "Atrasada" viram "Bloqueado" após os dias de carência configurados no plano.
                    </p>
                  </div>
                  <button onClick={() => setFilterStatus("blocked")}
                    className="rounded bg-red-600 px-3 py-1.5 text-xs font-bold whitespace-nowrap">
                    Ver bloqueadas
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {Array.from(new Map(blocking.map((i) => [i.user_id, i])).values()).slice(0, 30).map((i) => (
                    <span key={i.user_id} className="inline-flex items-center gap-2 rounded bg-white/5 px-2 py-1 text-xs text-white/80">
                      {i.profile?.name ?? i.profile?.email ?? i.user_id.slice(0, 8)}
                      <button onClick={() => releaseUser(i.user_id, i.profile?.name ?? i.profile?.email)}
                        className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-0.5 text-[10px] font-bold">
                        <Unlock className="h-3 w-3" /> Liberar acesso
                      </button>
                    </span>
                  ))}
                </div>

              </div>
            );
          })()}
          <div className="mb-3 flex flex-wrap items-center gap-2">
            <div className="relative">
              <Search className="pointer-events-none absolute left-2 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar por nome ou e-mail"
                className="rounded bg-white/5 py-1 pl-7 pr-3 text-sm placeholder:text-white/30" />
            </div>
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded bg-white/5 px-3 py-1 text-sm">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>

            {[
              ["", "Todas"],
              ["pending", "Pendentes"],
              ["overdue", "Atrasadas"],
              ["blocked", "Bloqueando acesso"],
              ["paid", "Pagas"],
            ].map(([k, l]) => (
              <button key={k} onClick={() => setFilterStatus(k)}
                className={`rounded px-3 py-1 text-xs font-medium ${filterStatus === k ? "bg-primary text-white" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>
                {l}
              </button>
            ))}
          </div>
          <div className="overflow-x-auto rounded-xl border border-white/10">
            <table className="w-full text-sm">
              <thead className="bg-white/5 text-xs uppercase text-white/50">
                <tr>
                  <th className="p-3 text-left">Mês</th>
                  <th className="p-3 text-left">Usuário</th>
                  <th className="p-3 text-left">Vencimento</th>
                  <th className="p-3 text-right">Valor</th>
                  <th className="p-3 text-left">Status</th>
                  <th className="p-3 text-left">Pago em</th>
                  <th className="p-3 text-left">Anuidade</th>
                  <th className="p-3 text-right">Ações</th>
                </tr>
              </thead>
              <tbody>
                {visibleInvs.map((i) => {

                  const annual = annualMap.get(i.user_id);
                  return (
                  <tr key={i.id} className="border-t border-white/5">
                    <td className="p-3">{fmtMonth(i.reference_month)}</td>
                    <td className="p-3">{i.profile?.name ?? "—"}<br /><span className="text-xs text-white/40">{i.profile?.email}</span></td>
                    <td className="p-3">{fmtDate(i.due_date)}</td>
                    <td className="p-3 text-right">{fmt(i.amount)}</td>
                    <td className="p-3">
                      <span className={`rounded px-2 py-0.5 text-xs ${
                        i.status === "paid" ? "bg-green-500/20 text-green-300" :
                        i.status === "blocked" ? "bg-red-500/20 text-red-300" :
                        i.status === "overdue" ? "bg-orange-500/20 text-orange-300" :
                        i.status === "exempted" ? "bg-blue-500/20 text-blue-300" :
                        "bg-white/10 text-white/70"
                      }`}>{STATUS_LABEL[i.status] ?? i.status}</span>
                    </td>
                    <td className="p-3 text-xs text-white/50">{fmtDate(i.paid_at)}</td>
                    <td className="p-3 text-xs">
                      {!annual || annual.source === "none" ? (
                        <span className="text-white/30">—</span>
                      ) : (
                        <div className="flex flex-col gap-0.5">
                          <span className={`inline-flex w-fit rounded px-2 py-0.5 text-[10px] font-semibold ${
                            !annual.active ? "bg-red-500/20 text-red-300" :
                            annual.source === "purchased" ? "bg-green-500/20 text-green-300" :
                            annual.source === "already_coach" ? "bg-purple-500/20 text-purple-300" :
                            annual.source === "admin_grant" ? "bg-yellow-500/20 text-yellow-300" :
                            "bg-blue-500/20 text-blue-300"
                          }`} title={annual.note ?? undefined}>
                            {!annual.active ? "Vencida" :
                              annual.source === "purchased" ? "Paga" :
                              annual.source === "already_coach" ? "Já era coach" :
                              annual.source === "admin_grant" ? "Concedida (admin)" :
                              "Isenta"}
                          </span>
                          <span className="text-[10px] text-white/40">
                            até {fmtDate(annual.valid_until)}
                          </span>
                        </div>
                      )}
                    </td>

                    <td className="p-3 text-right">
                      <div className="flex flex-wrap justify-end gap-1">
                        <button onClick={() => setAuditInvoiceId(i.id)}
                          className="inline-flex items-center gap-1 rounded bg-white/10 px-2 py-1 text-xs hover:bg-white/20" title="Histórico de ações">
                          <History className="h-3 w-3" />
                        </button>

                        {(i.status === "paid" || i.status === "exempted") && (
                          <button onClick={async () => {
                            if (!confirm("Desfazer este pagamento/isenção? A fatura volta para pendente e os lançamentos são removidos do relatório.")) return;
                            try { await fnRevert({ data: { invoice_id: i.id } } as any); toast.success("Pagamento desfeito"); load(); }
                            catch (e: any) { toast.error(e.message); }
                          }} className="rounded bg-yellow-600 px-2 py-1 text-xs">Desfazer</button>
                        )}
                        {i.status !== "paid" && i.status !== "exempted" && i.status !== "cancelled" && (
                          <>
                            <button onClick={async () => {
                              try { await fnPay({ data: { invoice_id: i.id, method: "pix", wallet_source: "external" } } as any); toast.success("Marcada como paga (PIX)"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-green-600 px-2 py-1 text-xs" title="Aplica taxa PIX (0,99%) + 6% imposto em cascata">Pago PIX</button>
                            <button onClick={async () => {
                              try { await fnPay({ data: { invoice_id: i.id, method: "card", wallet_source: "external" } } as any); toast.success("Marcada como paga (Cartão)"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-emerald-700 px-2 py-1 text-xs" title="Aplica taxa Cartão (4,98%) + 6% imposto em cascata">Pago Cartão</button>
                            <button onClick={async () => {
                              try { await fnPay({ data: { invoice_id: i.id, method: "manual_admin", wallet_source: "external" } } as any); toast.success("Marcada como paga (sem taxa)"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-green-900 px-2 py-1 text-xs" title="Sem taxa de gateway — apenas 6% imposto">Pago manual</button>
                            <button onClick={async () => {
                              try { await fnExempt({ data: { invoice_id: i.id } } as any); toast.success("Isenta"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-blue-600 px-2 py-1 text-xs">Isentar</button>
                            <button onClick={async () => {
                              const reason = prompt("Motivo para adiar/pular este mês (opcional):", "Mês adiado pelo admin");
                              if (reason === null) return;
                              try { await fnSkip({ data: { invoice_id: i.id, reason: reason || undefined } } as any); toast.success("Mês adiado — fatura isenta"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="inline-flex items-center gap-1 rounded bg-orange-600 px-2 py-1 text-xs" title="Isenta esta fatura e libera o próximo mês normalmente"><SkipForward className="h-3 w-3" /> Adiar (pular mês)</button>
                            <button onClick={async () => {
                              const current = i.due_date ? String(i.due_date).slice(0, 10) : new Date().toISOString().slice(0, 10);
                              const input = prompt("Novo vencimento (AAAA-MM-DD) — apenas muda a data, NÃO isenta a fatura:", current);
                              if (!input) return;
                              if (!/^\d{4}-\d{2}-\d{2}$/.test(input)) { toast.error("Data inválida"); return; }
                              try { await fnPostpone({ data: { invoice_id: i.id, new_due_date: input } } as any); toast.success("Vencimento alterado"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-white/10 px-2 py-1 text-xs" title="Somente altera a data de vencimento; fatura continua pendente">Mudar vencimento</button>
                            <button onClick={async () => {
                              try { await fnResetDue({ data: { invoice_id: i.id } } as any); toast.success("Vencimento restaurado"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-white/10 px-2 py-1 text-xs">Restaurar data</button>
                            <button onClick={async () => {
                              if (!confirm("Gerar uma nova tentativa de pagamento para esta fatura? Use quando uma cobrança anterior foi recusada ou travou.")) return;
                              try { await fnResetAttempt({ data: { invoice_id: i.id } } as any); toast.success("Fatura liberada para nova tentativa"); load(); }
                              catch (e: any) { toast.error(e.message); }
                            }} className="rounded bg-violet-600 px-2 py-1 text-xs">Nova tentativa</button>
                            <button onClick={() => releaseUser(i.user_id, i.profile?.name ?? i.profile?.email)}
                              className="inline-flex items-center gap-1 rounded bg-emerald-600 px-2 py-1 text-xs font-bold"
                              title="Isenta todas as faturas em aberto deste usuário e libera o acesso imediatamente">
                              <Unlock className="h-3 w-3" /> Liberar acesso
                            </button>

                          </>
                        )}
                      </div>
                    </td>

                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
        );
      })()}


      {tab === "config" && (
        <div className="space-y-4">
          {plans.map((p) => (
            <PlanRow key={p.id} plan={p} onSave={async (patch) => {
              try { await fnUpdPlan({ data: { id: p.id, ...patch } } as any); toast.success("Plano atualizado"); load(); }
              catch (e: any) { toast.error(e.message); }
            }} />
          ))}
        </div>
      )}

      {auditInvoiceId && <AuditModal invoiceId={auditInvoiceId} onClose={() => setAuditInvoiceId(null)} />}
    </div>
  );
}

function DashboardTab() {
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getSubscriptionsDashboard);
  useEffect(() => { (async () => { try { setData(await fn()); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); } })(); }, []);
  if (loading) return <p className="text-white/50">Carregando dashboard...</p>;
  if (!data) return <p className="text-white/50">Sem dados.</p>;
  const fmt = (n: number) => `R$ ${(n ?? 0).toFixed(2).replace(".", ",")}`;
  const Card = ({ label, value, tone }: { label: string; value: string; tone?: string }) => (
    <div className={`rounded-2xl border p-5 ${tone ?? "border-white/10 bg-white/5"}`}>
      <p className="text-xs uppercase text-white/50">{label}</p>
      <p className="mt-2 text-2xl font-bold text-white">{value}</p>
    </div>
  );
  return (
    <div className="space-y-6">
      <div className="grid gap-3 md:grid-cols-4">
        <Card label="Assinantes ativos" value={String(data.activeCount ?? 0)} tone="border-green-500/30 bg-green-500/5" />
        <Card label="MRR" value={fmt(data.mrr ?? 0)} tone="border-primary/30 bg-primary/5" />
        <Card label="Inadimplentes" value={String(data.overdueCount ?? 0)} tone="border-orange-500/30 bg-orange-500/5" />
        <Card label="Bloqueados" value={String(data.blockedCount ?? 0)} tone="border-red-500/30 bg-red-500/5" />
      </div>
      <div className="grid gap-3 md:grid-cols-4">
        <Card label="Recebido este mês" value={fmt(data.receivedThisMonth ?? 0)} />
        <Card label="A receber (aberto)" value={fmt(data.openReceivable ?? 0)} />
        <Card label="Isentos" value={String(data.exemptCount ?? 0)} />
        <Card label="Churn 30d" value={`${(data.churn30d ?? 0).toFixed(1)}%`} />
      </div>
    </div>
  );
}

function AuditModal({ invoiceId, onClose }: { invoiceId: string; onClose: () => void }) {
  const [logs, setLogs] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const fn = useServerFn(getInvoiceAuditLog);
  useEffect(() => { (async () => { try { setLogs(await fn({ data: { invoice_id: invoiceId } } as any) ?? []); } catch (e: any) { toast.error(e.message); } finally { setLoading(false); } })(); }, [invoiceId]);
  return (
    <div className="fixed inset-0 z-50 flex items-start sm:items-center justify-center bg-black/70 p-4 overflow-y-auto overscroll-contain modal-safe" onClick={onClose}>
      <div className="max-h-[80vh] w-full max-w-2xl overflow-auto rounded-2xl border border-white/10 bg-neutral-900 p-6" onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between">
          <h3 className="text-lg font-bold text-white">Histórico da fatura</h3>
          <button onClick={onClose} className="rounded p-1 hover:bg-white/10"><X className="h-4 w-4" /></button>
        </div>
        {loading ? <p className="text-white/50">Carregando...</p> : (
          logs.length === 0 ? <p className="text-white/50">Nenhum registro.</p> : (
            <ul className="space-y-2 text-sm">
              {logs.map((l: any) => (
                <li key={l.id} className="rounded-lg border border-white/5 bg-white/5 p-3">
                  <div className="flex justify-between text-xs text-white/50">
                    <span>{l.action}</span>
                    <span>{new Date(l.created_at).toLocaleString("pt-BR")}</span>
                  </div>
                  <p className="mt-1 text-white/80">{l.description ?? "—"}</p>
                  {l.actor_email && <p className="mt-1 text-xs text-white/40">por {l.actor_email}</p>}
                </li>
              ))}
            </ul>
          )
        )}
      </div>
    </div>
  );
}


function SubRow({ sub, onSave }: { sub: any; onSave: (p: any) => Promise<void> }) {
  const [amount, setAmount] = useState(String(sub.custom_amount ?? ""));
  const [day, setDay] = useState(String(sub.billing_day));
  const [status, setStatus] = useState(sub.status);
  const [exemptUntil, setExemptUntil] = useState(sub.exempt_until ?? "");
  return (
    <tr className="border-t border-white/5">
      <td className="p-3">{sub.profile?.name ?? "—"}</td>
      <td className="p-3 text-xs text-white/50">{sub.profile?.email}</td>
      <td className="p-3 text-right">
        <input value={amount} onChange={(e) => setAmount(e.target.value)} placeholder={String(sub.plan?.default_amount ?? 100)}
          className="w-20 rounded bg-white/10 px-2 py-1 text-right" />
      </td>
      <td className="p-3 text-center">
        <input value={day} onChange={(e) => setDay(e.target.value)} type="number" min={1} max={28}
          className="w-14 rounded bg-white/10 px-2 py-1 text-center" />
      </td>
      <td className="p-3">
        <select value={status} onChange={(e) => setStatus(e.target.value)} className="rounded bg-white/10 px-2 py-1">
          {Object.entries(SUB_STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
        </select>
      </td>
      <td className="p-3">
        {status === "exempt_annual" ? (
          <input type="date" value={exemptUntil ?? ""} onChange={(e) => setExemptUntil(e.target.value)}
            className="rounded bg-white/10 px-2 py-1" />
        ) : "—"}
      </td>
      <td className="p-3 text-right">
        <button className="rounded bg-primary px-3 py-1 text-xs font-bold" onClick={() => onSave({
          custom_amount: amount === "" ? null : Number(amount),
          billing_day: Number(day),
          status,
          exempt_until: status === "exempt_annual" ? (exemptUntil || null) : null,
        })}>Salvar</button>
      </td>
    </tr>
  );
}

function PlanRow({ plan, onSave }: { plan: any; onSave: (p: any) => Promise<void> }) {
  const [amount, setAmount] = useState(String(plan.default_amount));
  const [grace, setGrace] = useState(String(plan.grace_days));
  return (
    <div className="rounded-xl border border-white/10 p-4">
      <h3 className="mb-3 text-lg font-bold">{plan.name}</h3>
      <div className="grid gap-3 md:grid-cols-3">
        <label className="text-sm">
          <span className="text-white/50">Valor padrão (R$)</span>
          <input type="number" step="0.01" value={amount} onChange={(e) => setAmount(e.target.value)}
            className="mt-1 w-full rounded bg-white/10 px-3 py-2" />
        </label>
        <label className="text-sm">
          <span className="text-white/50">Dias de carência para bloqueio</span>
          <input type="number" min={0} max={30} value={grace} onChange={(e) => setGrace(e.target.value)}
            className="mt-1 w-full rounded bg-white/10 px-3 py-2" />
        </label>
        <div className="flex items-end">
          <button className="rounded bg-primary px-4 py-2 text-sm font-bold"
            onClick={() => onSave({ default_amount: Number(amount), grace_days: Number(grace) })}>
            Salvar
          </button>
        </div>
      </div>
    </div>
  );
}
