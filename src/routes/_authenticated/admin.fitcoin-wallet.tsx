import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Search, Loader2, X, Coins } from "lucide-react";
import { listAdminFitcoinWallets, getStudentFitcoinDetail, type AdminFitcoinRow, type FitcoinFilter, type FitcoinLedgerEntry } from "@/lib/admin-fitcoin.functions";
import { TestModeBanner } from "@/components/admin/TestModeBanner";

export const Route = createFileRoute("/_authenticated/admin/fitcoin-wallet")({
  validateSearch: (s: Record<string, unknown>) => ({ focus: typeof s.focus === "string" ? s.focus : undefined }),
  component: AdminFitcoinWallet,
});

const fmtFC = (n: number) => `${n.toFixed(2).replace(".", ",")} FC`;
const fmtDate = (iso: string | null) => {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
};

function AdminFitcoinWallet() {
  const fetchList = useServerFn(listAdminFitcoinWallets);
  const [rows, setRows] = useState<AdminFitcoinRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<FitcoinFilter>("with_balance");
  const [sort, setSort] = useState<"available_desc" | "earned_desc" | "used_desc" | "recent">("available_desc");
  const [search, setSearch] = useState("");
  const [selected, setSelected] = useState<AdminFitcoinRow | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const data = await fetchList({ data: { filter, sort, search } });
      setRows(data);
    } finally { setLoading(false); }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [filter, sort]);

  const totals = useMemo(() => rows.reduce((acc, r) => {
    acc.available += r.available; acc.pending += r.pending; acc.earned += r.totalEarned; acc.used += r.used; return acc;
  }, { available: 0, pending: 0, earned: 0, used: 0 }), [rows]);

  return (
    <>
      <TestModeBanner hiddenLabel="Movimentações de Fitcoin" />
      <div className="mb-4 flex items-center gap-3">
        <Coins className="h-7 w-7 text-primary" />
        <div>
          <h1 className="text-2xl font-bold text-white">Carteira de Fitcoin</h1>
          <p className="text-sm text-white/50">Saldo, pendente e histórico de cashback dos alunos indicadores.</p>
        </div>
      </div>

      <div className="mb-4 grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="Disponível" value={fmtFC(totals.available)} accent="text-success" />
        <Stat label="Pendente (7 dias)" value={fmtFC(totals.pending)} accent="text-amber-400" />
        <Stat label="Total Creditado" value={fmtFC(totals.earned)} accent="text-white" />
        <Stat label="Já Usado/Sacado" value={fmtFC(totals.used)} accent="text-white/60" />
      </div>

      <div className="mb-3 flex flex-wrap items-center gap-2">
        {[
          { k: "with_balance", l: "Com saldo" },
          { k: "all", l: "Todos" },
          { k: "with_other_role", l: "Com outro papel" },
          { k: "auto_credited", l: "Creditado automático" },
          { k: "used", l: "Já usaram" },
        ].map((t) => (
          <button
            key={t.k}
            onClick={() => setFilter(t.k as FitcoinFilter)}
            className={`rounded-lg px-3 py-1.5 text-xs font-bold ${filter === t.k ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}
          >{t.l}</button>
        ))}
        <select
          value={sort}
          onChange={(e) => setSort(e.target.value as any)}
          className="ml-auto rounded-lg bg-white/5 px-3 py-1.5 text-xs font-bold text-white outline-none"
        >
          <option value="available_desc">Mais disponível</option>
          <option value="earned_desc">Mais ganho</option>
          <option value="used_desc">Mais usado</option>
          <option value="recent">Crédito mais recente</option>
        </select>
      </div>

      <form onSubmit={(e) => { e.preventDefault(); load(); }} className="mb-4 flex items-center gap-2 rounded-xl bg-card px-3 py-2">
        <Search className="h-4 w-4 text-white/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome ou e-mail"
          className="flex-1 bg-transparent text-sm text-white placeholder:text-white/30 outline-none"
        />
        <button type="submit" className="rounded-lg bg-primary px-3 py-1 text-xs font-bold text-primary-foreground">Buscar</button>
      </form>

      <div className="overflow-hidden rounded-xl bg-card">
        <div className="grid grid-cols-12 gap-2 border-b border-white/5 px-4 py-2 text-[10px] font-bold uppercase tracking-wider text-white/40">
          <div className="col-span-4">Aluno</div>
          <div className="col-span-2">Papéis</div>
          <div className="col-span-1 text-right">Disponível</div>
          <div className="col-span-1 text-right">Pendente</div>
          <div className="col-span-1 text-right">Ganho</div>
          <div className="col-span-1 text-right">Usado</div>
          <div className="col-span-2 text-right">Último crédito</div>
        </div>
        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
        ) : rows.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">Nenhum aluno com fitcoin neste filtro.</p>
        ) : rows.map((r) => (
          <button
            key={r.studentId}
            onClick={() => setSelected(r)}
            className="grid w-full grid-cols-12 items-center gap-2 border-b border-white/5 px-4 py-3 text-left text-sm transition hover:bg-white/5"
          >
            <div className="col-span-4 min-w-0">
              <p className="truncate font-bold text-white">{r.name}</p>
              <p className="truncate text-[11px] text-white/40">{r.email || "—"}</p>
            </div>
            <div className="col-span-2 flex flex-wrap gap-1">
              {r.roles.length === 0 ? (
                <span className="rounded bg-white/5 px-1.5 py-0.5 text-[10px] text-white/40">apenas aluno</span>
              ) : r.roles.map((role) => (
                <span key={role} className="rounded bg-primary/15 px-1.5 py-0.5 text-[10px] font-bold uppercase text-primary">{role}</span>
              ))}
            </div>
            <div className="col-span-1 text-right font-bold text-success">{fmtFC(r.available)}</div>
            <div className="col-span-1 text-right font-bold text-amber-400">{fmtFC(r.pending)}</div>
            <div className="col-span-1 text-right text-white">{fmtFC(r.totalEarned)}</div>
            <div className="col-span-1 text-right text-white/60">{fmtFC(r.used)}</div>
            <div className="col-span-2 text-right text-[11px] text-white/50">{fmtDate(r.lastCreditAt)}</div>
          </button>
        ))}
      </div>

      {selected && <DetailModal row={selected} onClose={() => setSelected(null)} />}
    </>
  );
}

function Stat({ label, value, accent }: { label: string; value: string; accent: string }) {
  return (
    <div className="rounded-xl bg-card p-4">
      <p className="text-[10px] font-bold uppercase tracking-wider text-white/40">{label}</p>
      <p className={`mt-1 text-xl font-bold ${accent}`}>{value}</p>
    </div>
  );
}

function DetailModal({ row, onClose }: { row: AdminFitcoinRow; onClose: () => void }) {
  const fetchDetail = useServerFn(getStudentFitcoinDetail);
  const [entries, setEntries] = useState<FitcoinLedgerEntry[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      setLoading(true);
      try { setEntries(await fetchDetail({ data: { studentId: row.studentId } })); }
      finally { setLoading(false); }
    })();
  }, [row.studentId]);

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-black/70 backdrop-blur-sm sm:items-center sm:p-4">
      <div className="flex max-h-[90vh] w-full max-w-3xl flex-col overflow-hidden rounded-t-3xl bg-card sm:rounded-2xl">
        <div className="flex items-center justify-between border-b border-white/5 p-4">
          <div>
            <h2 className="text-base font-bold text-white">{row.name}</h2>
            <p className="text-[11px] text-white/50">{row.email}</p>
          </div>
          <button onClick={onClose} className="flex h-8 w-8 items-center justify-center rounded-full bg-white/10"><X className="h-4 w-4 text-white" /></button>
        </div>
        <div className="grid grid-cols-2 gap-2 p-4 md:grid-cols-4">
          <Stat label="Disponível" value={fmtFC(row.available)} accent="text-success" />
          <Stat label="Pendente" value={fmtFC(row.pending)} accent="text-amber-400" />
          <Stat label="Total Ganho" value={fmtFC(row.totalEarned)} accent="text-white" />
          <Stat label="Usado/Sacado" value={fmtFC(row.used)} accent="text-white/60" />
        </div>
        <div className="border-t border-white/5 px-4 py-2 text-[11px] text-white/50">
          {row.hasOtherRole
            ? "Este aluno também é " + row.roles.join(", ") + " — o saldo disponível aparece em Pagamentos para saque."
            : "Aluno sem outro papel ativo — fitcoin fica retido para uso interno (loja)."}
        </div>
        <div className="flex-1 overflow-y-auto">
          {loading ? (
            <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
          ) : entries.length === 0 ? (
            <p className="py-10 text-center text-sm text-white/40">Sem movimentações.</p>
          ) : (
            <table className="w-full text-sm">
              <thead className="border-b border-white/5 text-left text-[10px] font-bold uppercase tracking-wider text-white/40">
                <tr><th className="px-4 py-2">Data/Hora</th><th className="px-4 py-2">Produto</th><th className="px-4 py-2">Comprador</th><th className="px-4 py-2">Status</th><th className="px-4 py-2 text-right">Valor</th></tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-b border-white/5">
                    <td className="px-4 py-2 text-white/70">{fmtDate(e.createdAt)}</td>
                    <td className="px-4 py-2 text-white">{e.productLabel || "—"}</td>
                    <td className="px-4 py-2 text-white/70">{e.buyerName || "—"}</td>
                    <td className="px-4 py-2">
                      <span className={`rounded px-2 py-0.5 text-[10px] font-bold ${e.status === "pending" ? "bg-amber-500/20 text-amber-400" : e.status === "available" || e.status === "paid" ? "bg-success/20 text-success" : "bg-white/10 text-white/60"}`}>
                        {e.status === "pending" ? `pendente${e.availableAt ? " · libera " + fmtDate(e.availableAt) : ""}` : e.status}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-right font-bold text-primary">{fmtFC(e.amount)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}
