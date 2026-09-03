import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, Eye, Loader2, RefreshCw, Search } from "lucide-react";

export type ShelfHiddenProduct = {
  id: string;
  name: string;
  origem: string;
  status: string;
  section_name: string | null;
  category_name: string | null;
  seller_name: string;
  reason: string;
  can_reactivate: boolean;
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
  "Oculto pelo parceiro": "bg-amber-500/15 text-amber-400",
  "Oculto pelo profissional": "bg-amber-500/15 text-amber-400",
  "Não está pronto para venda": "bg-rose-500/15 text-rose-400",
  "Parceiro indisponível": "bg-rose-500/15 text-rose-400",
  "Profissional indisponível": "bg-rose-500/15 text-rose-400",
  "Restrito a uma rede": "bg-violet-500/15 text-violet-300",
};

/** Lista, em um só lugar, todos os produtos que existem mas não aparecem na loja. */
export function StoreShelfDiagnostics() {
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [hidden, setHidden] = useState<ShelfHiddenProduct[]>([]);
  const [filter, setFilter] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [reactivatingId, setReactivatingId] = useState<string | null>(null);

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

  const reactivate = async (product: ShelfHiddenProduct) => {
    setReactivatingId(product.id);
    setError(null);
    const { error: rpcError } = await supabase.rpc("store_admin_set_product_visibility" as never, {
      _product_id: product.id,
      _source: product.origem,
      _visible: true,
    } as never);
    setReactivatingId(null);
    if (rpcError) { setError(rpcError.message); return; }
    await load();
  };

  const reasons = Array.from(new Set(hidden.map((h) => h.reason)));
  const normalizedQuery = query.trim().toLocaleLowerCase("pt-BR");
  const rows = hidden.filter((product) => {
    const matchesReason = !filter || product.reason === filter;
    const searchable = `${product.name} ${product.seller_name || ""}`.toLocaleLowerCase("pt-BR");
    return matchesReason && (!normalizedQuery || searchable.includes(normalizedQuery));
  });

  return (
    <div className="rounded-2xl border border-white/10 bg-white/[0.03] p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-bold text-white">
            <AlertTriangle className="h-4 w-4 text-amber-400" /> Produtos que não aparecem na loja
          </h2>
          <p className="text-[11px] text-white/50">
            Diagnóstico pelos mesmos critérios da vitrine: aprovação, vendedor, publicação, prontidão, classificação e restrição de rede.
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
          <label className="mb-3 flex items-center gap-2 rounded-lg border border-white/10 bg-black/20 px-3 py-2">
            <Search className="h-3.5 w-3.5 text-white/40" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Buscar produto ou vendedor"
              className="min-w-0 flex-1 bg-transparent text-xs text-white outline-none placeholder:text-white/35"
            />
          </label>
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
                    {h.origem} · {h.seller_name || "Responsável não identificado"}
                    {h.section_name ? ` · ${h.section_name}` : " · sem seção"}
                    {h.category_name ? ` › ${h.category_name}` : ""}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${REASON_COLOR[h.reason] || "bg-white/10 text-white/60"}`}>
                    {h.reason}
                  </span>
                  {h.can_reactivate && (
                    <button
                      type="button"
                      onClick={() => void reactivate(h)}
                      disabled={reactivatingId === h.id}
                      className="inline-flex items-center gap-1 rounded-md border border-primary/30 bg-primary/10 px-2 py-1 text-[10px] font-bold text-primary disabled:opacity-50"
                    >
                      {reactivatingId === h.id ? <Loader2 className="h-3 w-3 animate-spin" /> : <Eye className="h-3 w-3" />}
                      Reativar na loja
                    </button>
                  )}
                </div>
              </div>
            ))}
            {rows.length === 0 && <p className="py-4 text-center text-xs text-white/45">Nenhum produto corresponde à busca.</p>}
          </div>
        </>
      )}
    </div>
  );
}
