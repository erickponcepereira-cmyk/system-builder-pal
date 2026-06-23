import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { listPendingReleases, releaseCoach } from "@/lib/coach-onboarding.functions";
import { toast } from "sonner";
import { Loader2, ExternalLink, CheckCircle2, Clock } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/coach-releases")({
  head: () => ({
    meta: [{ title: "Liberar Coaches — Admin" }],
  }),
  component: CoachReleasesPage,
});

type Row = {
  id: string;
  onboarding_stage: "awaiting_quiz_result" | "awaiting_upline_release";
  quiz_result_url: string | null;
  quiz_result_submitted_at: string | null;
  activation_paid_at: string | null;
  upline_coach_id: string | null;
  upline_name: string | null;
  profile?: { name?: string; email?: string; phone?: string } | null;
};

function CoachReleasesPage() {
  const fetchList = useServerFn(listPendingReleases);
  const releaseFn = useServerFn(releaseCoach);
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);

  const reload = async () => {
    setLoading(true);
    try {
      const data = (await fetchList()) as unknown as Row[];
      setRows(data || []);
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { reload(); /* eslint-disable-next-line */ }, []);

  const handleRelease = async (id: string, name: string) => {
    if (!confirm(`Liberar o painel de ${name}?`)) return;
    setBusyId(id);
    try {
      await releaseFn({ data: { coachId: id } });
      toast.success("Coach liberado!");
      await reload();
    } catch (e) {
      toast.error((e as Error).message);
    } finally {
      setBusyId(null);
    }
  };

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-5xl">
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Liberar Coaches</h1>
        <p className="mt-1 text-sm text-white/60">
          Coaches que pagaram a ativação e enviaram o resultado do quiz, aguardando liberação do painel.
        </p>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-white/60"><Loader2 className="h-4 w-4 animate-spin" /> Carregando...</div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 bg-white/5 p-8 text-center text-white/60">
          Nenhum coach aguardando liberação.
        </div>
      ) : (
        <div className="space-y-3">
          {rows.map((r) => {
            const isReady = r.onboarding_stage === "awaiting_upline_release";
            return (
              <div key={r.id} className="rounded-xl border border-white/10 bg-white/[0.03] p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-bold text-white">{r.profile?.name || "—"}</h3>
                      {isReady ? (
                        <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[11px] font-bold text-emerald-300">
                          <CheckCircle2 className="h-3 w-3" /> Pronto p/ liberar
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[11px] font-bold text-amber-300">
                          <Clock className="h-3 w-3" /> Aguardando quiz
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-white/50">{r.profile?.email} · {r.profile?.phone}</p>
                    <p className="mt-1 text-xs text-white/40">
                      Indicador: <span className="text-white/70">{r.upline_name || "—"}</span>
                    </p>
                    {r.activation_paid_at && (
                      <p className="mt-1 text-xs text-white/40">
                        Pagamento: {new Date(r.activation_paid_at).toLocaleString("pt-BR")}
                      </p>
                    )}
                    {r.quiz_result_url && (
                      <a
                        href={r.quiz_result_url}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-primary hover:underline"
                      >
                        Ver resultado do quiz <ExternalLink className="h-3 w-3" />
                      </a>
                    )}
                  </div>
                  <div className="shrink-0">
                    <button
                      disabled={!isReady || busyId === r.id}
                      onClick={() => handleRelease(r.id, r.profile?.name || "este coach")}
                      className="inline-flex items-center gap-2 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:bg-primary/90 disabled:opacity-40"
                    >
                      {busyId === r.id ? <Loader2 className="h-4 w-4 animate-spin" /> : "Liberar painel"}
                    </button>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
