import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { CheckCircle2, XCircle, RefreshCw, Download } from "lucide-react";

type HistoryRow = {
  id: string;
  profile_id: string;
  coach_id: string | null;
  period_year: number;
  period_month: number;
  patent_level: number;
  multiplier: number;
  total_sales: number;
  any_completed: boolean;
  goals_snapshot: Array<{ label: string; required_scaled: number; current: number; completed: boolean; missing: number }>;
  computed_at: string;
};

type ProfileMini = { id: string; full_name: string | null; email: string | null };

const monthName = (m: number) => ["Jan","Fev","Mar","Abr","Mai","Jun","Jul","Ago","Set","Out","Nov","Dez"][m - 1] || "";

function RouteComponent() {
  const [rows, setRows] = useState<HistoryRow[]>([]);
  const [profiles, setProfiles] = useState<Record<string, ProfileMini>>({});
  const [loading, setLoading] = useState(true);
  const [running, setRunning] = useState(false);
  const [filter, setFilter] = useState<"all" | "completed" | "missed">("all");
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState(now.getMonth() + 1);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("network_unlock_history")
      .select("*")
      .order("period_year", { ascending: false })
      .order("period_month", { ascending: false })
      .limit(500);
    if (error) toast.error(error.message);
    const list = (data as HistoryRow[]) || [];
    setRows(list);
    const profileIds = Array.from(new Set(list.map((r) => r.profile_id)));
    if (profileIds.length) {
      const { data: pp } = await supabase.from("profiles").select("id,full_name,email").in("id", profileIds);
      const map: Record<string, ProfileMini> = {};
      ((pp as ProfileMini[]) || []).forEach((p) => { map[p.id] = p; });
      setProfiles(map);
    }
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const runSnapshot = async (yy: number, mm: number) => {
    setRunning(true);
    try {
      const res = await fetch("/api/public/hooks/network-unlock-snapshot", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ year: yy, month: mm }),
      });
      const j = await res.json();
      if (!j.ok) throw new Error(j.error || "Falha ao gerar snapshot");
      toast.success(`Snapshot ${monthName(mm)}/${yy} gerado: ${j.count} coaches`);
      await load();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro");
    } finally { setRunning(false); }
  };

  const exportCsv = () => {
    const headers = ["Mes","Coach","Email","Patente","Multiplicador","Vendas","Atingiu?","Metas (rótulo: alcançado/exigido, faltam)"];
    const lines = [headers.join(";")];
    filtered.forEach((r) => {
      const p = profiles[r.profile_id];
      const goalsStr = (r.goals_snapshot || []).map((g) => `${g.label}: ${g.current}/${g.required_scaled} (faltam ${g.missing})`).join(" | ");
      lines.push([
        `${monthName(r.period_month)}/${r.period_year}`,
        p?.full_name || "—",
        p?.email || "—",
        r.patent_level,
        `${r.multiplier}x`,
        r.total_sales,
        r.any_completed ? "Sim" : "Não",
        `"${goalsStr.replace(/"/g, '""')}"`,
      ].join(";"));
    });
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `liberacao-rede-${Date.now()}.csv`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = rows.filter((r) => {
    if (filter === "completed" && !r.any_completed) return false;
    if (filter === "missed" && r.any_completed) return false;
    return true;
  });

  return (
    <div className="p-6 max-w-7xl">
      <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-white">Histórico — Liberação da Rede</h1>
          <p className="text-sm text-white/50 mt-1">Snapshot mensal do desempenho de cada coach. O job roda automaticamente todo dia 01.</p>
        </div>
        <div className="flex items-end gap-2">
          <label className="text-xs text-white/60">
            <span className="block mb-1">Ano</span>
            <input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
          </label>
          <label className="text-xs text-white/60">
            <span className="block mb-1">Mês</span>
            <select value={month} onChange={(e) => setMonth(Number(e.target.value))} className="w-24 rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white">
              {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => <option key={m} value={m}>{monthName(m)}</option>)}
            </select>
          </label>
          <Button onClick={() => runSnapshot(year, month)} disabled={running} variant="outline">
            <RefreshCw className={`h-4 w-4 mr-1 ${running ? "animate-spin" : ""}`} /> Recalcular mês
          </Button>
          <Button onClick={exportCsv} variant="outline"><Download className="h-4 w-4 mr-1" /> CSV</Button>
        </div>
      </div>

      <div className="mb-4 flex gap-2">
        {(["all", "completed", "missed"] as const).map((f) => (
          <button key={f} onClick={() => setFilter(f)}
            className={`rounded-md px-3 py-1.5 text-xs font-bold ${filter === f ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>
            {f === "all" ? "Todos" : f === "completed" ? "Atingiram meta" : "Não atingiram"}
          </button>
        ))}
      </div>

      {loading ? (
        <p className="text-white/60">Carregando...</p>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs text-white/60">
              <tr>
                <th className="px-3 py-2 text-left">Mês</th>
                <th className="px-3 py-2 text-left">Coach</th>
                <th className="px-3 py-2 text-left">Patente</th>
                <th className="px-3 py-2 text-left">Mult.</th>
                <th className="px-3 py-2 text-left">Vendas</th>
                <th className="px-3 py-2 text-left">Status</th>
                <th className="px-3 py-2 text-left">Metas (snapshot)</th>
              </tr>
            </thead>
            <tbody>
              {filtered.length === 0 && (
                <tr><td colSpan={7} className="px-3 py-6 text-center text-white/40">Sem registros. Recalcule um mês acima para gerar.</td></tr>
              )}
              {filtered.map((r) => {
                const p = profiles[r.profile_id];
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="px-3 py-2 text-white">{monthName(r.period_month)}/{r.period_year}</td>
                    <td className="px-3 py-2 text-white">
                      <div>{p?.full_name || "—"}</div>
                      <div className="text-[10px] text-white/40">{p?.email}</div>
                    </td>
                    <td className="px-3 py-2 text-white/70">Nível {r.patent_level}</td>
                    <td className="px-3 py-2 text-white/70">{r.multiplier}x</td>
                    <td className="px-3 py-2 text-white">{r.total_sales}</td>
                    <td className="px-3 py-2">
                      {r.any_completed ? (
                        <span className="inline-flex items-center gap-1 text-success"><CheckCircle2 className="h-4 w-4" /> Liberado</span>
                      ) : (
                        <span className="inline-flex items-center gap-1 text-orange-400"><XCircle className="h-4 w-4" /> Bloqueado</span>
                      )}
                    </td>
                    <td className="px-3 py-2 text-xs text-white/70">
                      <div className="flex flex-wrap gap-1">
                        {(r.goals_snapshot || []).map((g, i) => (
                          <span key={i} className={`rounded px-2 py-0.5 ${g.completed ? "bg-success/20 text-success" : "bg-white/5 text-white/70"}`}>
                            {g.label}: {g.current}/{g.required_scaled}
                            {!g.completed && g.missing > 0 && <span className="text-orange-300"> (faltam {g.missing})</span>}
                          </span>
                        ))}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

export const Route = createFileRoute("/admin/network-unlock-history")({
  head: () => ({ meta: [{ title: "Histórico Liberação da Rede — Admin" }] }),
  component: RouteComponent,
});
