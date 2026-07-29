import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Loader2, RefreshCw } from "lucide-react";

export type ShelfHiddenProduct = {
  id: string;
  name: string;
  origem: string;
  status: string;
  section_name: string | null;
  category_name: string | null;
  reason: string;
};

export type ShelfReport = {
  section_counts: Array<{ section_id: string; total: number }>;
  category_counts: Array<{ category_id: string; total: number }>;
  hidden: ShelfHiddenProduct[];
};

export async function fetchShelfReport(): Promise<ShelfReport> {
  const { data, error } = await supabase.rpc("store_admin_shelf_report" as never);
  if (error) throw new Error(error.message);
  const r = (data as unknown as ShelfReport) || null;
  return {
    section_counts: Array.isArray(r?.section_counts) ? r.section_counts : [],
    category_counts: Array.isArray(r?.category_counts) ? r.category_counts : [],
    hidden: Array.isArray(r?.hidden) ? r.hidden : [],
  };
}

const REASON_COLOR: Record<string, string> = {
  "Aguardando aprovação": "bg-amber-500/15 text-amber-400",
  "Sem seção definida": "bg-rose-500/15 text-rose-400",
  "Sem subcategoria definida": "bg-rose-500/15 text-rose-400",
  "Seção desativada": "bg-sky-500/15 text-sky-400",
  "Subcategoria desativada": "bg-sky-500/15 text-sky-400",
};

/** Lista, em um só lugar, todos os produtos que existem mas não aparecem na loja. */
export function StoreShelfDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ShelfHiddenProduct[]>([]);
  const [filter, setFilter] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const r = await fetchShelfReport();
      setHidden(r.hidden);
    } catch (e) {
      setError(e instanceof Error ? e.message : "Erro ao carregar diagnóstico");
    } finally {
      setLoading(false);
    }
  };
  useEffect(() => { void load(); }, []);

  const reasons = Array.from(new Set(hidden.map((h) => h.reason)));
  const rows = filter ? hidden.filter((h) => h.reason === filter) : hidden;

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Produtos que não aparecem na loja
          </h2>
          <p className="text-[11px] text-white/50">
            Cadastrados no sistema, mas invisíveis para o cliente: aguardando aprovação, sem seção/subcategoria ou presos em seção desativada.
          </p>
        </div>
        <button onClick={load} className="flex items-center gap-1.5 rounded-lg border border-white/10 px-2.5 py-1.5 text-[11px] text-white/70 hover:bg-white/10">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Carregando…</div>
      ) : error ? (
        <p className="text-sm text-rose-400">{error}</p>
      ) : hidden.length === 0 ? (
        <p className="text-sm text-emerald-400">Tudo certo: nenhum produto oculto por classificação ou aprovação.</p>
      ) : (
        <>
          <div className="mb-3 flex flex-wrap gap-2">
            <button onClick={() => setFilter(null)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${!filter ? "bg-primary/20 text-primary" : "bg-white/5 text-white/60"}`}>
              Todos ({hidden.length})
            </button>
            {reasons.map((r) => (
              <button key={r} onClick={() => setFilter(r)} className={`rounded-full px-2.5 py-1 text-[11px] font-bold ${filter === r ? "bg-primary/20 text-primary" : "bg-white/5 text-white/60"}`}>
                {r} ({hidden.filter((h) => h.reason === r).length})
              </button>
            ))}
          </div>
          <div className="max-h-[420px] space-y-1.5 overflow-y-auto pr-1">
            {rows.map((h) => (
              <div key={`${h.origem}-${h.id}`} className="flex flex-wrap items-center justify-between gap-2 rounded-xl border border-white/5 bg-black/30 px-3 py-2">
                <div className="min-w-0">
                  <p className="truncate text-xs font-semibold text-white">{h.name}</p>
                  <p className="text-[10px] text-white/45">
                    {h.origem}
                    {h.section_name ? ` · ${h.section_name}` : " · sem seção"}
                    {h.category_name ? ` › ${h.category_name}` : ""}
                  </p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${REASON_COLOR[h.reason] || "bg-white/10 text-white/60"}`}>
                  {h.reason}
                </span>
              </div>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
