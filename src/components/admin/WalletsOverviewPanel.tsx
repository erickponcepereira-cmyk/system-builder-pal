import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, RefreshCw, Download, Search, Plus } from "lucide-react";
import { toast } from "sonner";
import {
  getWalletsOverview,
  createWalletAdvance,
  type WalletsOverview,
  type WalletKind,
} from "@/lib/wallet-statement.functions";

const fmt = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KIND_LABEL: Record<WalletKind, string> = {
  commission: "Comissões (rede/vendas)",
  partner: "Produtos do parceiro",
  professional: "Produtos do profissional",
  fitcoin: "Indicação / Fitcoin",
  nutritionist: "Nutricionista",
  professor: "Professor",
};
const KIND_ORDER: WalletKind[] = ["commission", "partner", "professional", "nutritionist", "professor", "fitcoin"];

export function WalletsOverviewPanel() {
  const fetchOverview = useServerFn(getWalletsOverview);
  const addAdvance = useServerFn(createWalletAdvance);
  const [data, setData] = useState<WalletsOverview | null>(null);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [advanceFor, setAdvanceFor] = useState<{ profileId: string; name: string } | null>(null);
  const [advAmount, setAdvAmount] = useState("");
  const [advReason, setAdvReason] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      setData(await fetchOverview());
    } catch (e) {
      toast.error((e as Error).message || "Falha ao carregar carteiras");
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const people = useMemo(() => {
    if (!data) return [];
    const term = q.trim().toLowerCase();
    if (!term) return data.people;
    return data.people.filter(
      (p) => p.name.toLowerCase().includes(term) || (p.email || "").toLowerCase().includes(term),
    );
  }, [data, q]);

  const totalsByKind = useMemo(() => {
    const map = new Map<WalletKind, WalletsOverview["totals"][number]>();
    (data?.totals || []).forEach((t) => map.set(t.kind, t));
    return KIND_ORDER.map((k) => map.get(k)).filter(Boolean) as WalletsOverview["totals"];
  }, [data]);

  const submitAdvance = async () => {
    if (!advanceFor) return;
    const v = Number(advAmount.replace(",", "."));
    if (!v || v <= 0) return toast.error("Informe um valor válido");
    setBusy(true);
    try {
      await addAdvance({ data: { profileId: advanceFor.profileId, amount: v, reason: advReason || undefined } });
      toast.success("Adiantamento lançado");
      setAdvanceFor(null);
      setAdvAmount("");
      setAdvReason("");
      await load();
    } catch (e) {
      toast.error((e as Error).message || "Erro ao lançar");
    } finally {
      setBusy(false);
    }
  };

  const exportCsv = () => {
    if (!data) return;
    const head =
      "Nome;Email;" +
      KIND_ORDER.map((k) => `${KIND_LABEL[k]} disponivel`).join(";") +
      ";Total disponivel;Total pendente;Adiantamento;Total ganho;Total sacado\n";
    const num = (v: number) => v.toFixed(2).replace(".", ",");
    const body = people
      .map((p) =>
        [
          p.name,
          p.email || "",
          ...KIND_ORDER.map((k) => num(p.kinds[k]?.available ?? 0)),
          num(p.available),
          num(p.pending),
          num(p.advanceOpen),
          num(p.earned),
          num(p.withdrawn),
        ].join(";"),
      )
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\uFEFF" + head + body], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `carteiras-${new Date().toISOString().slice(0, 10)}.csv`;
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

  const sumAvailableNoFitcoin = totalsByKind
    .filter((t) => t.kind !== "fitcoin")
    .reduce((a, t) => a + t.available, 0);
  const sumPending = totalsByKind.reduce((a, t) => a + t.pending + t.blocked, 0);
  const fitcoin = totalsByKind.find((t) => t.kind === "fitcoin");

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
          onClick={exportCsv}
          className="flex items-center gap-2 rounded-lg bg-card px-3 py-2 text-xs font-bold text-white/70"
        >
          <Download className="h-4 w-4" /> Exportar CSV
        </button>
        <span className="text-[11px] text-white/40">
          Gerado em {new Date(data.generatedAt).toLocaleString("pt-BR")}
        </span>
      </div>

      {/* Linha de conferência */}
      <div className="grid grid-cols-2 gap-3 md:grid-cols-5">
        {[
          { l: "Disponível (sem Fitcoin)", v: sumAvailableNoFitcoin, c: "text-success" },
          { l: "A liberar (carência + bloqueado)", v: sumPending, c: "text-amber-400" },
          { l: "Adiantamentos em aberto", v: data.advancesOpen, c: "text-red-400" },
          { l: "Fitcoin (indicação)", v: fitcoin?.available ?? 0, c: "text-blue-400" },
          { l: "Carteira do sistema", v: data.adminWallet.available, c: "text-white" },
        ].map((c) => (
          <div key={c.l} className="rounded-xl bg-card p-3">
            <p className="text-[11px] text-white/50">{c.l}</p>
            <p className={`text-lg font-bold ${c.c}`}>{fmt(c.v)}</p>
          </div>
        ))}
      </div>

      {/* Totais por tipo de carteira */}
      <div className="rounded-xl bg-card p-4">
        <h3 className="mb-3 text-sm font-bold text-white">Totais por carteira</h3>
        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-white/40">
              <tr className="text-left">
                <th className="py-1">Carteira</th>
                <th className="text-right">Pessoas</th>
                <th className="text-right">Disponível</th>
                <th className="text-right">Em carência</th>
                <th className="text-right">Bloqueado</th>
                <th className="text-right">Total ganho</th>
                <th className="text-right">Total sacado</th>
              </tr>
            </thead>
            <tbody>
              {totalsByKind.map((t) => (
                <tr key={t.kind} className="border-t border-white/10 text-white/70">
                  <td className="py-1.5 text-white">{KIND_LABEL[t.kind]}</td>
                  <td className="text-right">{t.people}</td>
                  <td className="text-right text-success">{fmt(t.available)}</td>
                  <td className="text-right text-amber-400">{fmt(t.pending)}</td>
                  <td className="text-right text-amber-400">{fmt(t.blocked)}</td>
                  <td className="text-right">{fmt(t.earned)}</td>
                  <td className="text-right">{fmt(t.withdrawn)}</td>
                </tr>
              ))}
              <tr className="border-t border-white/20 font-bold text-white">
                <td className="py-1.5">Carteira do sistema (admin)</td>
                <td className="text-right">—</td>
                <td className="text-right text-success">{fmt(data.adminWallet.available)}</td>
                <td className="text-right">—</td>
                <td className="text-right">—</td>
                <td className="text-right">{fmt(data.adminWallet.earned)}</td>
                <td className="text-right">{fmt(data.adminWallet.withdrawn)}</td>
              </tr>
            </tbody>
          </table>
        </div>
        <p className="mt-2 text-[10px] text-white/35">
          A carteira de indicação (Fitcoin) é separada: não entra no saldo profissional nem no limite de saque de
          coach/parceiro/profissional.
        </p>
      </div>

      {/* Por pessoa */}
      <div className="rounded-xl bg-card p-4">
        <div className="mb-3 flex flex-wrap items-center gap-2">
          <h3 className="text-sm font-bold text-white">Por pessoa ({people.length})</h3>
          <div className="ml-auto flex items-center gap-1 rounded-lg bg-background px-2">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar nome ou e-mail"
              className="bg-transparent py-1.5 text-xs text-white outline-none"
            />
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-xs">
            <thead className="text-white/40">
              <tr className="text-left">
                <th className="py-1">Pessoa</th>
                {KIND_ORDER.map((k) => (
                  <th key={k} className="text-right">{KIND_LABEL[k]}</th>
                ))}
                <th className="text-right">Adiantamento</th>
                <th className="text-right">Total disponível</th>
                <th></th>
              </tr>
            </thead>
            <tbody>
              {people.map((p) => (
                <tr key={p.profileId} className="border-t border-white/10 text-white/70">
                  <td className="py-1.5">
                    <span className="text-white">{p.name}</span>
                    {p.email && <span className="block text-[10px] text-white/30">{p.email}</span>}
                  </td>
                  {KIND_ORDER.map((k) => {
                    const v = p.kinds[k];
                    return (
                      <td key={k} className="text-right">
                        {v && (v.available || v.pending || v.blocked) ? (
                          <>
                            <span className="text-success">{fmt(v.available)}</span>
                            {(v.pending || v.blocked) > 0 && (
                              <span className="block text-[10px] text-amber-400/70">
                                +{fmt(v.pending + v.blocked)}
                              </span>
                            )}
                          </>
                        ) : (
                          <span className="text-white/20">—</span>
                        )}
                      </td>
                    );
                  })}
                  <td className="text-right text-red-400">{p.advanceOpen ? fmt(p.advanceOpen) : "—"}</td>
                  <td className="text-right font-bold text-white">{fmt(p.available)}</td>
                  <td className="text-right">
                    <button
                      onClick={() => setAdvanceFor({ profileId: p.profileId, name: p.name })}
                      className="inline-flex items-center gap-1 rounded-lg bg-white/5 px-2 py-1 text-[10px] font-bold text-white/60 hover:bg-white/10"
                    >
                      <Plus className="h-3 w-3" /> Adiantamento
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {advanceFor && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4">
          <div className="w-full max-w-sm rounded-2xl bg-card p-5">
            <h3 className="text-sm font-bold text-white">Lançar adiantamento</h3>
            <p className="mb-3 text-xs text-white/50">{advanceFor.name}</p>
            <input
              value={advAmount}
              onChange={(e) => setAdvAmount(e.target.value)}
              inputMode="decimal"
              placeholder="Valor (ex.: 45,98)"
              className="mb-2 w-full rounded-lg bg-background px-3 py-2 text-sm text-white outline-none"
            />
            <input
              value={advReason}
              onChange={(e) => setAdvReason(e.target.value)}
              placeholder="Motivo (opcional)"
              className="mb-3 w-full rounded-lg bg-background px-3 py-2 text-sm text-white outline-none"
            />
            <p className="mb-3 text-[10px] text-white/35">
              O valor será descontado do disponível para saque até ser compensado por novas liberações.
            </p>
            <div className="flex gap-2">
              <button
                onClick={() => setAdvanceFor(null)}
                className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white/60"
              >
                Cancelar
              </button>
              <button
                onClick={() => void submitAdvance()}
                disabled={busy}
                className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-60"
              >
                {busy ? "Salvando..." : "Lançar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
