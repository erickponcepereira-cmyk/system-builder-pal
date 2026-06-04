import { useEffect, useMemo, useState } from "react";
import { Award, Search } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getMyNetworkRanking, type NetworkRankingRow } from "@/lib/network-ranking.functions";

function todayISO() { return new Date().toISOString().slice(0, 10); }
function firstOfMonth() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export function NetworkRankingTab() {
  const fetchRanking = useServerFn(getMyNetworkRanking);
  const [from, setFrom] = useState(firstOfMonth());
  const [to, setTo] = useState(todayISO());
  const [search, setSearch] = useState("");
  const [rows, setRows] = useState<NetworkRankingRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    setLoading(true);
    fetchRanking({ data: { from, to } })
      .then((r) => { if (active) setRows(r); })
      .catch(() => { if (active) setRows([]); })
      .finally(() => { if (active) setLoading(false); });
    return () => { active = false; };
  }, [fetchRanking, from, to]);

  const filtered = useMemo(() => {
    const q = search.trim().toLowerCase();
    return q ? rows.filter((r) => r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q)) : rows;
  }, [rows, search]);

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Ranking da Minha Rede</h1>
        <p className="text-sm text-white/50">Somente você e suas downlines infinitas, por produção individual.</p>
      </div>

      <div className="mb-4 rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex flex-wrap items-center gap-2">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" />
          <span className="text-xs text-white/40">até</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="rounded-lg border border-white/10 bg-black/40 px-3 py-2 text-xs text-white" />
          <div className="relative min-w-56 flex-1">
            <Search className="absolute left-3 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-white/40" />
            <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Buscar coach..." className="w-full rounded-lg border border-white/10 bg-black/40 py-2 pl-9 pr-3 text-xs text-white" />
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        {loading ? <p className="text-sm text-white/50">Carregando ranking...</p> : filtered.length === 0 ? <p className="text-sm text-white/50">Nenhum coach com produção no período.</p> : (
          <div className="space-y-2">
            {filtered.map((r, index) => (
              <div key={r.coachId} className={`flex items-center gap-3 rounded-xl border p-3 ${r.isYou ? "border-primary/40 bg-primary/10" : "border-white/5 bg-black/25"}`}>
                <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-white/5 text-xs font-bold text-white/70">#{index + 1}</div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-white">{r.name}{r.isYou ? " (você)" : ""}</p>
                  {r.sponsorName && (
                    <p className="mt-0.5 truncate text-[10px] text-white/50">Trazido por <span className="font-semibold text-primary/80">{r.sponsorName}</span></p>
                  )}
                  {r.categories && r.categories.length > 0 && (
                    <div className="mt-1 flex flex-wrap gap-1">
                      {r.categories.map((c) => (
                        <span key={c} className="rounded-full bg-white/5 px-2 py-0.5 text-[10px] font-semibold text-white/60">{c}</span>
                      ))}
                    </div>
                  )}
                  <p className="mt-1 truncate text-[11px] text-white/45">L{r.level} · {r.directStudents} alunos · {r.downlineCoaches} downlines</p>
                </div>
                <div className="flex flex-col items-end gap-1">
                  {r.patent && (
                    <span
                      className="inline-flex items-center gap-1 rounded-full border px-2 py-1 text-[11px] font-bold"
                      style={{
                        color: r.patent.color || "#fff",
                        backgroundColor: r.patent.color ? `${r.patent.color}20` : "rgba(255,255,255,0.08)",
                        borderColor: r.patent.color ? `${r.patent.color}55` : "rgba(255,255,255,0.15)",
                      }}
                    >
                      {r.patent.name}
                    </span>
                  )}
                  <span className="inline-flex items-center gap-1 rounded-full bg-primary/15 px-2 py-1 text-[11px] font-bold text-primary">
                    <Award className="h-3 w-3" /> {r.medal?.name || "Sem medalha"}
                  </span>
                  <span className="text-[10px] text-white/35">medalha do mês</span>
                </div>

              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}

export default NetworkRankingTab;