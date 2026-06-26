import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  listAdminSubscriptions, listAdminInvoices, updateSubscriptionAdmin,
  listPlansAdmin, updatePlanAdmin, markInvoicePaidAdmin, exemptInvoiceAdmin, generateInvoicesNow,
  revertInvoiceAdmin, postponeInvoiceAdmin, resetInvoiceDueDateAdmin,
} from "@/lib/admin-subscriptions.functions";
import { listAllAnnualActivationsAdmin } from "@/lib/annual-activation.functions";


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
  const [tab, setTab] = useState<"subs" | "invoices" | "config">("subs");
  const [subs, setSubs] = useState<any[]>([]);
  const [invs, setInvs] = useState<any[]>([]);
  const [plans, setPlans] = useState<any[]>([]);
  const [annualMap, setAnnualMap] = useState<Map<string, { paid_at: string | null; valid_until: string | null; source: string; note: string | null; active: boolean }>>(new Map());
  const [loading, setLoading] = useState(false);
  const [filterStatus, setFilterStatus] = useState("");

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
          ["subs", "Assinaturas"], ["invoices", "Faturas"], ["config", "Configurações"],
        ].map(([k, l]) => (
          <button key={k} onClick={() => setTab(k as any)}
            className={`px-4 py-2 text-sm font-medium ${tab === k ? "border-b-2 border-primary text-white" : "text-white/50"}`}>
            {l}
          </button>
        ))}
      </div>

      {loading && <p className="text-white/50">Carregando...</p>}

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

      {tab === "invoices" && (
        <>
          <div className="mb-3 flex gap-2">
            <select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}
              className="rounded bg-white/5 px-3 py-1 text-sm">
              <option value="">Todos os status</option>
              {Object.entries(STATUS_LABEL).map(([k, l]) => <option key={k} value={k}>{l}</option>)}
            </select>
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
                {invs.map((i) => {
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
                      {i.status !== "paid" && i.status !== "exempted" && (
                        <div className="flex justify-end gap-1">
                          <button onClick={async () => {
                            try { await fnPay({ data: { invoice_id: i.id, method: "manual_admin", wallet_source: "external" } } as any); toast.success("Marcada como paga"); load(); }
                            catch (e: any) { toast.error(e.message); }
                          }} className="rounded bg-green-600 px-2 py-1 text-xs">Marcar pago</button>
                          <button onClick={async () => {
                            try { await fnExempt({ data: { invoice_id: i.id } } as any); toast.success("Isenta"); load(); }
                            catch (e: any) { toast.error(e.message); }
                          }} className="rounded bg-blue-600 px-2 py-1 text-xs">Isentar</button>
                        </div>
                      )}
                    </td>
                  </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </>
      )}

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
