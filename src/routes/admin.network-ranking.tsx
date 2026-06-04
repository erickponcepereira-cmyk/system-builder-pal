import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import {
  getAdminNetworkRanking,
  getAdminNetworkRankingFilters,
  type NetworkRankingRow,
} from "@/lib/network-ranking.functions";

export const Route = createFileRoute("/admin/network-ranking")({
  component: AdminNetworkRanking,
});

function todayISO() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }
function brl(v: number) { return v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" }); }

function AdminNetworkRanking() {
  const fetchRanking = useServerFn(getAdminNetworkRanking);
  const fetchFilters = useServerFn(getAdminNetworkRankingFilters);

  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [rootCoachId, setRootCoachId] = useState<string>("");
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<NetworkRankingRow[]>([]);
  const [coaches, setCoaches] = useState<Array<{ id: string; name: string; email: string }>>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    fetchFilters().then(setCoaches).catch(() => setCoaches([]));
  }, [fetchFilters]);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRanking({ data: { from, to, rootCoachId: rootCoachId || null } })
      .then((r) => { if (active) setRows(r); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchRanking, from, to, rootCoachId]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  const totalIndividual = filtered.reduce((s, r) => s + r.individualRevenue, 0);
  const totalNetwork = filtered.reduce((s, r) => s + r.networkRevenue, 0);

  return (
    <div className="p-6 max-w-7xl mx-auto">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ranking de Redes</h1>
        <p className="text-sm text-white/50">Produção individual e da rede por coach. Use o filtro para focar numa rede específica.</p>
      </div>

      <div className="mb-4 rounded-2xl p-4 bg-zinc-900 border border-white/5">
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" />
          <span className="text-xs text-white/40">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" />
          <select value={rootCoachId} onChange={(e) => setRootCoachId(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white">
            <option value="">Todos os coaches</option>
            {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar coach..." className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs text-white" />
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-xs text-white/60">
          <span>Coaches: <b className="text-white">{filtered.length}</b></span>
          <span>Soma individual: <b className="text-primary">{brl(totalIndividual)}</b></span>
          <span>Soma rede: <b className="text-emerald-400">{brl(totalNetwork)}</b></span>
        </div>
      </div>

      <div className="rounded-2xl bg-zinc-900 border border-white/5 overflow-hidden">
        {loading ? (
          <p className="p-6 text-sm text-white/50">Carregando ranking...</p>
        ) : filtered.length === 0 ? (
          <p className="p-6 text-sm text-white/50">Nenhum coach encontrado.</p>
        ) : (
          <table className="w-full text-sm">
            <thead className="bg-black/30 text-xs text-white/50 uppercase">
              <tr>
                <th className="px-4 py-3 text-left">#</th>
                <th className="px-4 py-3 text-left">Coach</th>
                <th className="px-4 py-3 text-right">Alunos</th>
                <th className="px-4 py-3 text-right">Downlines</th>
                <th className="px-4 py-3 text-right">Venda individual</th>
                <th className="px-4 py-3 text-right">Venda da rede</th>
                <th className="px-4 py-3 text-right">Total</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((r, i) => (
                <tr key={r.coachId} className="border-t border-white/5 hover:bg-white/5">
                  <td className="px-4 py-3 text-white/50">#{i + 1}</td>
                  <td className="px-4 py-3">
                    <p className="font-bold text-white">{r.name}</p>
                    <p className="text-[11px] text-white/40">{r.email}</p>
                  </td>
                  <td className="px-4 py-3 text-right text-white/70">{r.directStudents}</td>
                  <td className="px-4 py-3 text-right text-white/70">{r.downlineCoaches}</td>
                  <td className="px-4 py-3 text-right font-bold text-primary">{brl(r.individualRevenue)}</td>
                  <td className="px-4 py-3 text-right font-bold text-emerald-400">{brl(r.networkRevenue)}</td>
                  <td className="px-4 py-3 text-right font-bold text-white">{brl(r.individualRevenue + r.networkRevenue)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

export default AdminNetworkRanking;
