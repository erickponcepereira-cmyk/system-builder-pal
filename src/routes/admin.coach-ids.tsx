import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listCoachIds } from "@/lib/coach-onboarding.functions";
import { toast } from "sonner";
import { Loader2, KeyRound, CheckCircle2, Clock, ShieldAlert, Search } from "lucide-react";

export const Route = createFileRoute("/admin/coach-ids")({
  head: () => ({ meta: [{ title: "IDs dos Coaches — Admin" }] }),
  component: CoachIdsPage,
});

type Row = Awaited<ReturnType<typeof listCoachIds>>[number];

function CoachIdsPage() {
  const fetchList = useServerFn(listCoachIds);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<"all" | "released" | "blocked">("all");

  useEffect(() => {
    (async () => {
      try {
        const data = await fetchList();
        setRows(data as Row[]);
      } catch (e) {
        toast.error((e as Error).message);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchList]);

  const filtered = useMemo(() => {
    const term = q.trim().toLowerCase();
    return rows.filter((r) => {
      if (filter === "released" && r.onboarding_stage !== "released") return false;
      if (filter === "blocked" && r.onboarding_stage === "released") return false;
      if (!term) return true;
      const name = r.profile?.name?.toLowerCase() || "";
      const email = r.profile?.email?.toLowerCase() || "";
      const num = String(r.coach_number ?? "");
      return name.includes(term) || email.includes(term) || num.includes(term);
    });
  }, [rows, q, filter]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-6xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white flex items-center gap-2">
          <KeyRound className="h-6 w-6 text-primary" /> IDs dos Coaches
        </h1>
        <p className="mt-1 text-sm text-white/60">
          Auditoria dos `coach_number`, status de liberação e tentativas de validação.
          Use o ID exibido aqui para anexar ao certificado entregue ao coach após o pagamento.
        </p>
      </div>

      <div className="mb-4 flex flex-wrap items-center gap-2">
        <div className="relative flex-1 min-w-[220px]">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-white/40" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome, email ou ID..."
            className="w-full rounded-lg border border-white/10 bg-white/5 pl-9 pr-3 py-2 text-sm text-white placeholder:text-white/30 focus:outline-none focus:border-primary"
          />
        </div>
        <div className="flex gap-1 rounded-lg bg-white/5 p-1">
          {(["all", "released", "blocked"] as const).map((f) => (
            <button
              key={f}
              onClick={() => setFilter(f)}
              className={`rounded-md px-3 py-1.5 text-xs font-semibold ${
                filter === f ? "bg-primary text-primary-foreground" : "text-white/60 hover:text-white"
              }`}
            >
              {f === "all" ? "Todos" : f === "released" ? "Liberados" : "Bloqueados"}
            </button>
          ))}
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/60">
          <Loader2 className="h-4 w-4 animate-spin" /> Carregando...
        </div>
      ) : (
        <div className="overflow-hidden rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/[0.04] text-left text-[11px] uppercase tracking-wider text-white/50">
              <tr>
                <th className="px-3 py-2.5">ID</th>
                <th className="px-3 py-2.5">Coach</th>
                <th className="px-3 py-2.5">Status</th>
                <th className="px-3 py-2.5">Pagamento</th>
                <th className="px-3 py-2.5">Liberado em</th>
                <th className="px-3 py-2.5 text-center">Tentativas</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {filtered.length === 0 ? (
                <tr>
                  <td colSpan={6} className="px-3 py-8 text-center text-white/40">
                    Nenhum coach encontrado.
                  </td>
                </tr>
              ) : (
                filtered.map((r) => {
                  const released = r.onboarding_stage === "released";
                  const blocked = (r.unlock_attempts ?? 0) >= 10;
                  return (
                    <tr key={r.id} className="hover:bg-white/[0.02]">
                      <td className="px-3 py-3">
                        <span className="font-mono text-base font-bold text-primary">
                          #{r.coach_number ?? "—"}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="font-semibold text-white">{r.profile?.name || "—"}</div>
                        <div className="text-xs text-white/40">{r.profile?.email || ""}</div>
                      </td>
                      <td className="px-3 py-3">
                        {released ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                            <CheckCircle2 className="h-3 w-3" /> Liberado
                          </span>
                        ) : blocked ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-red-500/15 px-2 py-0.5 text-[11px] font-bold text-red-300">
                            <ShieldAlert className="h-3 w-3" /> Bloqueado
                          </span>
                        ) : (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                            <Clock className="h-3 w-3" /> {labelStage(r.onboarding_stage)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-xs text-white/60">
                        {r.activation_paid_at
                          ? new Date(r.activation_paid_at).toLocaleString("pt-BR")
                          : "—"}
                      </td>
                      <td className="px-3 py-3 text-xs text-white/60">
                        {r.approved_at ? new Date(r.approved_at).toLocaleString("pt-BR") : "—"}
                      </td>
                      <td className="px-3 py-3 text-center">
                        <span
                          className={`font-mono text-sm font-bold ${
                            (r.unlock_attempts ?? 0) >= 5 ? "text-red-300" : "text-white/70"
                          }`}
                        >
                          {r.unlock_attempts ?? 0}
                        </span>
                        {r.last_unlock_failed_at && (
                          <div className="text-[10px] text-white/40">
                            últ.: {new Date(r.last_unlock_failed_at).toLocaleDateString("pt-BR")}
                          </div>
                        )}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function labelStage(s: string) {
  switch (s) {
    case "awaiting_payment":
      return "Aguardando pagamento";
    case "awaiting_quiz_result":
      return "Aguardando quiz";
    case "awaiting_upline_release":
      return "Aguardando ID";
    default:
      return s;
  }
}
