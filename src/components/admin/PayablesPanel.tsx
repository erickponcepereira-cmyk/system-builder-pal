import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Download, ShieldCheck, Search } from "lucide-react";
import { toast } from "sonner";
import {
  getPayablesReport,
  runWalletAudit,
  type PayablesReport,
  type PayableWalletKind,
} from "@/lib/admin-payables.functions";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const KIND_LABEL: Record<PayableWalletKind, string> = {
  coach: "Coach",
  partner: "Parceiro",
  professional: "Profissional",
  student: "Aluno",
};

const monthLabel = (m: string) => {
  if (m === "sem_data") return "Sem data definida";
  const [y, mm] = m.split("-");
  return new Date(Number(y), Number(mm) - 1, 1).toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
};

export function PayablesPanel() {
  const fetchReport = useServerFn(getPayablesReport);
  const runAudit = useServerFn(runWalletAudit);
  const [data, setData] = useState<PayablesReport | null>(null);
  const [loading, setLoading] = useState(true);
  const [auditing, setAuditing] = useState(false);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<"all" | PayableWalletKind>("all");

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchReport({ data: {} } as never));
    } catch (e) {
      toast.error((e as Error).message || "Falha ao carregar relatório");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const onAudit = async () => {
    setAuditing(true);
    try {
      const run = await runAudit({ data: {} } as never);
      toast.success(
        run && run.diffsCount > 0
          ? `${run.diffsCount} ajuste(s) aplicado(s) — diferença de ${fmt(run.totalDelta)}`
          : "Tudo conferido: nenhuma divergência encontrada",
      );
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Falha na conferência");
    } finally {
      setAuditing(false);
    }
  };

  const people = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    return data.people.filter(
      (p) =>
        (kind === "all" || p.kind === kind) &&
        (!term || p.name.toLowerCase().includes(term) || (p.email || "").toLowerCase().includes(term)),
    );
  }, [data, q, kind]);

  const exportCsv = () => {
    if (!data) return;
    const head = "Nome;Email;Carteira;Disponivel;Pendente;Saque solicitado;Ja sacado;Proxima liberacao\n";
    const body = people
      .map((p) =>
        [
          p.name,
          p.email || "",
          KIND_LABEL[p.kind],
          p.available.toFixed(2).replace(".", ","),
          p.pending.toFixed(2).replace(".", ","),
          p.requested.toFixed(2).replace(".", ","),
          p.withdrawn.toFixed(2).replace(".", ","),
          p.nextReleaseAt ? new Date(p.nextReleaseAt).toLocaleDateString("pt-BR") : "",
        ].join(";"),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `contas-a-pagar-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (loading && !data) {
    return (
      <div className="flex items-center justify-center py-16 text-white/50">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }
  if (!data) return null;

  const s = data.summary;
  const openWithdrawals = data.withdrawals.filter((w) => ["requested", "approved", "processing"].includes(w.status));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          onClick={() => void load()}
          className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-bold text-white/70"
        >
          <RefreshCw className="h-4 w-4" /> Atualizar
        </button>
        <button
          onClick={() => void onAudit()}
          disabled={auditing}
          className="flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
        >
          {auditing ? <Loader2 className="h-4 w-4 animate-spin" /> : <ShieldCheck className="h-4 w-4" />}
          Conferir todas as carteiras
        </button>
        <button
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-bold text-white/70"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
        <span className="text-[11px] text-white/40">
          Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
        </span>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { l: "Disponível para saque", v: s.available, c: "text-success" },
          { l: "Pendente (a liberar)", v: s.pending, c: "text-amber-400" },
          { l: "Saques em aberto", v: s.requestedOpen, c: "text-blue-400" },
          { l: "Pago no mês", v: s.paidThisMonth, c: "text-white" },
          { l: "Pago total", v: s.paidTotal, c: "text-white/70" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl bg-card p-3">
            <p className="text-[11px] text-white/50">{c.l}</p>
            <p className={`text-lg font-bold ${c.c}`}>{fmt(c.v)}</p>
          </div>
        ))}
      </div>

      {data.lastAudit && (
        <div
          className={`rounded-xl p-3 text-xs ${
            data.lastAudit.diffsCount > 0 ? "bg-amber-500/10 text-amber-300" : "bg-success/10 text-success"
          }`}
        >
          Última conferência em {new Date(data.lastAudit.runAt).toLocaleString("pt-BR")} —{" "}
          {data.lastAudit.walletsChecked} carteiras, {data.lastAudit.diffsCount} ajuste(s),
          diferença total de {fmt(data.lastAudit.totalDelta)}.
          {data.lastAudit.diffs.length > 0 && (
            <div className="mt-2 max-h-40 space-y-1 overflow-y-auto">
              {data.lastAudit.diffs.slice(0, 50).map((d, i) => (
                <div key={i} className="flex justify-between gap-2 border-t border-white/10 pt-1">
                  <span>
                    {d.name || d.profileId} · {d.walletKind} · {d.field === "available" ? "disponível" : "pendente"}
                  </span>
                  <span>
                    {fmt(d.before)} → {fmt(d.after)} ({d.delta > 0 ? "+" : ""}
                    {fmt(d.delta)})
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      <div className="rounded-xl bg-card p-4">
        <h3 className="mb-2 text-sm font-bold text-white">Projeção de liberação (quando vira dinheiro a pagar)</h3>
        {data.projection.length === 0 ? (
          <p className="text-xs text-white/40">Nada pendente no momento.</p>
        ) : (
          <div className="space-y-1">
            {data.projection.map((p) => (
              <div key={p.month} className="flex items-center justify-between text-xs text-white/70">
                <span className="capitalize">{monthLabel(p.month)}</span>
                <span className="font-bold text-white">
                  {fmt(p.amount)} <span className="text-white/40">({p.count})</span>
                </span>
              </div>
            ))}
          </div>
        )}
      </div>

      {openWithdrawals.length > 0 && (
        <div className="rounded-xl bg-card p-4">
          <h3 className="mb-2 text-sm font-bold text-white">Saques aguardando pagamento</h3>
          <div className="space-y-1">
            {openWithdrawals.map((w) => (
              <div key={w.id} className="flex items-center justify-between border-t border-white/10 py-1 text-xs">
                <span className="text-white/70">
                  {w.name} <span className="text-white/30">· {KIND_LABEL[w.kind]}</span>
                </span>
                <span className="font-bold text-white">
                  {fmt(w.amount)} <span className="text-white/40">· {w.status}</span>
                </span>
              </div>
            ))}
          </div>
        </div>
      )}

      <div className="rounded-xl bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-white">Por pessoa ({people.length})</h3>
          <div className="ml-auto flex items-center gap-2">
            <div className="flex items-center gap-1 rounded-lg bg-background px-2">
              <Search className="h-3.5 w-3.5 text-white/40" />
              <input
                value={q}
                onChange={(e) => setQ(e.target.value)}
                placeholder="Buscar nome ou e-mail"
                className="bg-transparent py-1.5 text-xs text-white outline-none"
              />
            </div>
            <select
              value={kind}
              onChange={(e) => setKind(e.target.value as typeof kind)}
              className="rounded-lg bg-background px-2 py-1.5 text-xs text-white"
            >
              <option value="all">Todos</option>
              <option value="coach">Coach</option>
              <option value="partner">Parceiro</option>
              <option value="professional">Profissional</option>
              <option value="student">Aluno</option>
            </select>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-white/40">
              <tr className="text-left">
                <th className="py-1">Pessoa</th>
                <th>Carteira</th>
                <th className="text-right">Disponível</th>
                <th className="text-right">Pendente</th>
                <th className="text-right">Saque aberto</th>
                <th className="text-right">Já sacado</th>
                <th className="text-right">Próx. liberação</th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={`${p.profileId}-${p.kind}`} className="border-t border-white/10 text-white/70">
                  <td className="py-1.5">
                    <span className="text-white">{p.name}</span>
                    {p.email && <span className="block text-[10px] text-white/30">{p.email}</span>}
                  </td>
                  <td>{KIND_LABEL[p.kind]}</td>
                  <td className="text-right text-success">{fmt(p.available)}</td>
                  <td className="text-right text-amber-400">{fmt(p.pending)}</td>
                  <td className="text-right text-blue-400">{p.requested ? fmt(p.requested) : "—"}</td>
                  <td className="text-right">{fmt(p.withdrawn)}</td>
                  <td className="text-right">
                    {p.nextReleaseAt ? new Date(p.nextReleaseAt).toLocaleDateString("pt-BR") : "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
