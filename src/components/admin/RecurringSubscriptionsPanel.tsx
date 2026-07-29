import { useState } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useServerFn } from "@tanstack/react-start";
import { adminListRecurring, adminSetRecurringStatus, adminForceCharge, adminSetNextChargeDate } from "@/lib/recurring.functions";
import { toast } from "sonner";
import { RefreshCw, Pause, Play, XCircle, CreditCard, Zap, CalendarClock } from "lucide-react";

const money = (v: number) => Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const date = (d?: string | null) => (d ? new Date(d).toLocaleDateString("pt-BR") : "—");

const STATUS_LABEL: Record<string, string> = {
  active: "Ativa",
  pending: "Aguardando autorização",
  paused: "Pausada",
  past_due: "Em atraso",
  cancelled: "Cancelada",
};

export function RecurringSubscriptionsPanel() {
  const list = useServerFn(adminListRecurring);
  const setStatus = useServerFn(adminSetRecurringStatus);
  const forceCharge = useServerFn(adminForceCharge);
  const setNextDate = useServerFn(adminSetNextChargeDate);
  const qc = useQueryClient();
  const [filter, setFilter] = useState<string>("all");
  const [busy, setBusy] = useState<string | null>(null);

  const { data, isLoading } = useQuery({ queryKey: ["admin-recurring"], queryFn: () => list({}) });

  const mut = useMutation({
    mutationFn: (v: { id: string; status: "active" | "paused" | "cancelled" }) => setStatus({ data: v }),
    onSuccess: () => { toast.success("Assinatura atualizada"); qc.invalidateQueries({ queryKey: ["admin-recurring"] }); },
    onError: (e: any) => toast.error(e?.message || "Erro ao atualizar"),
  });

  const anticipate = async (id: string) => {
    setBusy(id);
    try {
      await setNextDate({ data: { id } });
      toast.success("Vencimento antecipado para hoje");
      qc.invalidateQueries({ queryKey: ["admin-recurring"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao antecipar");
    } finally { setBusy(null); }
  };

  const chargeNow = async (id: string) => {
    setBusy(id);
    try {
      const res: any = await forceCharge({ data: { id } });
      if (res?.ok) toast.success("Cobrança aprovada!");
      else toast.error(`Cobrança recusada: ${res?.error || "motivo não informado"}`);
      qc.invalidateQueries({ queryKey: ["admin-recurring"] });
    } catch (e: any) {
      toast.error(e?.message || "Erro ao cobrar");
    } finally { setBusy(null); }
  };


  const subs = (data?.subscriptions || []).filter((s: any) => filter === "all" || s.status === filter);
  const charges = data?.charges || [];
  const approved = charges.filter((c: any) => c.status === "approved").length;
  const rejected = charges.filter((c: any) => c.status === "rejected").length;
  const rate = approved + rejected ? Math.round((approved / (approved + rejected)) * 100) : 0;
  const mrr = (data?.subscriptions || [])
    .filter((s: any) => s.status === "active")
    .reduce((acc: number, s: any) => acc + Number(s.amount) / (s.interval_type === "yearly" ? 12 : 1), 0);

  if (isLoading) return <div className="p-6 text-center text-white/50">Carregando…</div>;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Assinaturas ativas" value={String((data?.subscriptions || []).filter((s: any) => s.status === "active").length)} />
        <Stat label="Receita recorrente (MRR)" value={money(mrr)} />
        <Stat label="Em atraso" value={String((data?.subscriptions || []).filter((s: any) => s.status === "past_due").length)} />
        <Stat label="Aprovação das cobranças" value={`${rate}%`} />
      </div>

      <div className="flex flex-wrap gap-1 rounded-xl bg-card p-1">
        {["all", "active", "pending", "past_due", "paused", "cancelled"].map((k) => (
          <button
            key={k}
            onClick={() => setFilter(k)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === k ? "bg-primary text-primary-foreground" : "text-white/60"}`}
          >
            {k === "all" ? "Todas" : STATUS_LABEL[k]}
          </button>
        ))}
      </div>

      <div className="overflow-x-auto rounded-xl border border-white/10 bg-card">
        <table className="w-full text-sm">
          <thead className="text-left text-xs text-white/50">
            <tr>
              {["Assinante", "Plano", "Valor", "Motor", "Próxima cobrança", "Status", "Falhas", ""].map((h) => (
                <th key={h} className="px-3 py-2 font-medium">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {subs.map((s: any) => (
              <tr key={s.id} className="border-t border-white/5 text-white/80">
                <td className="px-3 py-2">{s.subscriber}</td>
                <td className="px-3 py-2">{s.title}</td>
                <td className="px-3 py-2">{money(s.amount)}<span className="text-white/40">/{s.interval_type === "yearly" ? "ano" : "mês"}</span></td>
                <td className="px-3 py-2">
                  <span className="inline-flex items-center gap-1 text-xs text-white/60">
                    <CreditCard className="h-3 w-3" />
                    {s.engine === "mp_preapproval" ? "Assinatura MP" : "Cartão salvo"}
                  </span>
                </td>
                <td className="px-3 py-2">{date(s.next_charge_at)}</td>
                <td className="px-3 py-2">
                  <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${
                    s.status === "active" ? "bg-green-500/10 text-green-400"
                      : s.status === "past_due" ? "bg-destructive/10 text-destructive"
                      : "bg-white/10 text-white/60"
                  }`}>{STATUS_LABEL[s.status] || s.status}</span>
                </td>
                <td className="px-3 py-2 text-xs text-white/50">{s.failure_count > 0 ? `${s.failure_count} — ${s.last_failure_reason || ""}` : "—"}</td>
                <td className="px-3 py-2">
                  <div className="flex gap-1">
                    {s.status !== "cancelled" && (
                      <>
                        {s.status === "paused" ? (
                          <IconBtn title="Reativar" onClick={() => mut.mutate({ id: s.id, status: "active" })}><Play className="h-3.5 w-3.5" /></IconBtn>
                        ) : (
                          <IconBtn title="Pausar" onClick={() => mut.mutate({ id: s.id, status: "paused" })}><Pause className="h-3.5 w-3.5" /></IconBtn>
                        )}
                        <IconBtn title="Cancelar" onClick={() => mut.mutate({ id: s.id, status: "cancelled" })}><XCircle className="h-3.5 w-3.5" /></IconBtn>
                      </>
                    )}
                  </div>
                </td>
              </tr>
            ))}
            {!subs.length && (
              <tr><td colSpan={8} className="px-3 py-6 text-center text-white/40">Nenhuma assinatura recorrente.</td></tr>
            )}
          </tbody>
        </table>
      </div>

      <div className="rounded-xl border border-white/10 bg-card p-4">
        <div className="mb-3 flex items-center gap-2">
          <RefreshCw className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-white">Últimas cobranças automáticas</h3>
        </div>
        <div className="space-y-1">
          {charges.slice(0, 20).map((c: any) => (
            <div key={c.id} className="flex justify-between text-xs text-white/70">
              <span>{date(c.reference_date)} · tentativa {c.attempt}</span>
              <span>{money(c.amount)}</span>
              <span className={c.status === "approved" ? "text-green-400" : "text-destructive"}>
                {c.status === "approved" ? "Aprovada" : c.status === "skipped" ? "Ignorada" : `Recusada — ${c.status_detail || ""}`}
              </span>
            </div>
          ))}
          {!charges.length && <p className="text-xs text-white/40">Nenhuma cobrança registrada ainda.</p>}
        </div>
      </div>
    </div>
  );
}

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-white/10 bg-card p-3">
      <p className="text-xs text-white/50">{label}</p>
      <p className="text-lg font-bold text-white">{value}</p>
    </div>
  );
}

function IconBtn({ children, title, onClick }: { children: React.ReactNode; title: string; onClick: () => void }) {
  return (
    <button title={title} onClick={onClick} className="rounded-lg bg-white/5 p-1.5 text-white/70 hover:bg-white/10 hover:text-white">
      {children}
    </button>
  );
}
