import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Building2, Search } from "lucide-react";
import { toast } from "sonner";
import { listPartnersForApproval } from "@/lib/partner-approvals.functions";
import { PartnerDetailsModal } from "@/components/partners/PartnerDetailsModal";

type PartnerRow = Awaited<ReturnType<ReturnType<typeof useServerFn<typeof listPartnersForApproval>>>>[number];

type StatusFilter = "all" | "pending" | "approved" | "blocked";

export function PartnersApprovalTab() {
  const fetchAll = useServerFn(listPartnersForApproval);
  const [items, setItems] = useState<PartnerRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("pending");
  const [search, setSearch] = useState("");
  const [openId, setOpenId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async () => {
    setLoading(true);
    setError(null);
    try {
      const data = await fetchAll();
      setItems(data as PartnerRow[]);
    } catch (e: any) {
      const msg = e?.message || "Erro ao carregar parceiros";
      setError(msg);
      toast.error(msg);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); }, []);

  const filtered = useMemo(() => {
    const q = search.toLowerCase().trim();
    return items.filter((p) => {
      if (filter !== "all" && p.status !== filter) return false;
      if (!q) return true;
      return (
        p.fantasy_name?.toLowerCase().includes(q) ||
        p.city?.toLowerCase().includes(q) ||
        p.document?.toLowerCase().includes(q)
      );
    });
  }, [items, filter, search]);

  const counts = useMemo(() => ({
    all: items.length,
    pending: items.filter((p) => p.status === "pending").length,
    approved: items.filter((p) => p.status === "approved").length,
    blocked: items.filter((p) => p.status === "blocked").length,
  }), [items]);

  return (
    <div className="space-y-4 text-white">
      <header>
        <h2 className="text-lg font-bold flex items-center gap-2">
          <Building2 className="h-5 w-5 text-primary" />
          Aprovação de Parceiros
        </h2>
        <p className="text-xs text-white/50 mt-1">
          Acesso completo a todos os parceiros cadastrados. Aprove ou bloqueie cadastros, e revise produtos gratuitos e pagos.
        </p>
      </header>

      <div className="flex gap-2 flex-wrap">
        {(["pending", "approved", "blocked", "all"] as StatusFilter[]).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`px-3 py-1.5 rounded-full text-xs font-semibold border ${
              filter === s ? "bg-primary text-primary-foreground border-primary" : "bg-white/5 border-white/10 text-white/70"
            }`}
          >
            {s === "pending" ? "Pendentes" : s === "approved" ? "Aprovados" : s === "blocked" ? "Bloqueados" : "Todos"} ({counts[s]})
          </button>
        ))}
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Buscar por nome, cidade ou documento..."
          className="w-full pl-9 pr-3 py-2 rounded-lg bg-white/5 border border-white/10 text-sm outline-none focus:border-primary"
        />
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : error ? (
        <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4 text-sm text-red-300">
          {error}
          <button onClick={load} className="ml-3 underline">Tentar novamente</button>
        </div>
      ) : filtered.length === 0 ? (
        <p className="text-sm text-white/40 text-center py-10">Nenhum parceiro encontrado.</p>
      ) : (
        <div className="grid gap-2 lg:grid-cols-2">
          {filtered.map((p) => (
            <button
              key={p.id}
              onClick={() => setOpenId(p.id)}
              className="text-left rounded-xl p-3 flex gap-3 hover:bg-white/5 transition"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              {p.photo_url ? (
                <img src={p.photo_url} alt={p.fantasy_name} className="h-14 w-14 rounded-xl object-cover" />
              ) : (
                <div className="h-14 w-14 rounded-xl bg-white/10 flex items-center justify-center text-xl">🏢</div>
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold truncate">{p.fantasy_name}</p>
                <p className="text-[11px] text-white/50 truncate">{p.document || "—"} · {p.city || "—"}{p.state ? `/${p.state}` : ""}</p>
                <span className={`mt-1 inline-block text-[10px] px-2 py-0.5 rounded ${
                  p.status === "approved" ? "bg-green-500/15 text-green-400" :
                  p.status === "blocked" ? "bg-red-500/15 text-red-400" :
                  "bg-yellow-500/15 text-yellow-400"
                }`}>{p.status === "approved" ? "Aprovado" : p.status === "blocked" ? "Bloqueado" : "Pendente"}</span>
              </div>
            </button>
          ))}
        </div>
      )}

      {openId && (
        <PartnerDetailsModal
          partnerId={openId}
          onClose={() => setOpenId(null)}
          onChanged={load}
        />
      )}
    </div>
  );
}
