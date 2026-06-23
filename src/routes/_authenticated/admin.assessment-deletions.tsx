import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { AlertTriangle, RefreshCw } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/assessment-deletions")({
  head: () => ({ meta: [{ title: "Exclusões de Avaliações — Admin" }] }),
  component: AssessmentDeletionsPage,
});

type Row = {
  id: string;
  coach_id: string;
  client_id: string | null;
  client_name: string | null;
  assessment_id: string | null;
  assessment_date: string | null;
  reason: string;
  snapshot: any;
  created_at: string;
  coaches?: { id: string; profiles?: { name: string | null; email: string | null } } | null;
};

function AssessmentDeletionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("coach_assessment_deletions" as never)
      .select("*, coaches:coach_id(id, profiles:profile_id(name, email))" as never)
      .order("created_at" as never, { ascending: false })
      .limit(500);
    if (!error) setRows((data as any[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const filtered = rows.filter((r) => {
    if (!q.trim()) return true;
    const s = q.toLowerCase();
    return (
      (r.client_name || "").toLowerCase().includes(s) ||
      (r.reason || "").toLowerCase().includes(s) ||
      (r.coaches?.profiles?.name || "").toLowerCase().includes(s) ||
      (r.coaches?.profiles?.email || "").toLowerCase().includes(s)
    );
  });

  return (
    <div className="space-y-5">
      <div className="flex items-start justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-white flex items-center gap-2">
            <AlertTriangle className="h-6 w-6 text-primary" /> Exclusões de Avaliações
          </h1>
          <p className="text-sm text-white/50">Histórico de avaliações apagadas pelos coaches, com motivo declarado.</p>
        </div>
        <button
          onClick={load}
          className="flex items-center gap-2 rounded-lg bg-white/5 px-3 py-2 text-sm text-white/80 hover:bg-white/10"
        >
          <RefreshCw className="h-4 w-4" /> Recarregar
        </button>
      </div>

      <input
        value={q}
        onChange={(e) => setQ(e.target.value)}
        placeholder="Buscar por aluno, coach ou motivo..."
        className="w-full rounded-lg border border-white/10 bg-[#0F0F0F] px-3 py-2 text-sm text-white outline-none focus:border-primary/40"
      />

      <div className="rounded-xl border border-white/5 bg-[#0F0F0F] overflow-hidden">
        {loading ? (
          <div className="p-6 text-sm text-white/60">Carregando…</div>
        ) : filtered.length === 0 ? (
          <div className="p-6 text-sm text-white/60">Nenhuma exclusão registrada.</div>
        ) : (
          <div className="divide-y divide-white/5">
            {filtered.map((r) => (
              <div key={r.id} className="p-4 grid gap-2 md:grid-cols-[1fr_2fr_auto]">
                <div className="space-y-1">
                  <p className="text-xs text-white/40">Data exclusão</p>
                  <p className="text-sm text-white">{new Date(r.created_at).toLocaleString("pt-BR")}</p>
                  <p className="text-xs text-white/40 mt-2">Coach</p>
                  <p className="text-sm text-white">{r.coaches?.profiles?.name || "—"}</p>
                  <p className="text-[11px] text-white/40">{r.coaches?.profiles?.email || ""}</p>
                  <p className="text-xs text-white/40 mt-2">Aluno</p>
                  <p className="text-sm text-white">{r.client_name || "—"}</p>
                </div>
                <div>
                  <p className="text-xs text-white/40">Motivo</p>
                  <p className="text-sm text-white whitespace-pre-wrap">{r.reason}</p>
                  {r.assessment_date && (
                    <p className="mt-3 text-xs text-white/40">
                      Avaliação datada de {new Date(r.assessment_date).toLocaleDateString("pt-BR")}
                    </p>
                  )}
                </div>
                <details className="md:justify-self-end">
                  <summary className="cursor-pointer text-xs text-primary">Ver dados</summary>
                  <pre className="mt-2 max-w-sm overflow-auto rounded bg-black/40 p-2 text-[10px] text-white/70">
                    {JSON.stringify(r.snapshot, null, 2)}
                  </pre>
                </details>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
