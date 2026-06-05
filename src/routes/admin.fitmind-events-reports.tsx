import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { ChevronLeft, Loader2, BarChart3, Users, CalendarDays, Download } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getEventsReport, type EventReportRow } from "@/lib/fitmind-events.functions";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/fitmind-events-reports")({
  head: () => ({ meta: [{ title: "Relatórios — Eventos FitMind" }] }),
  component: ReportsPage,
});

function ReportsPage() {
  const navigate = useNavigate();
  const fetchReport = useServerFn(getEventsReport);
  const [loading, setLoading] = useState(true);
  const [from, setFrom] = useState<string>("");
  const [to, setTo] = useState<string>("");
  const [data, setData] = useState<{ rows: EventReportRow[]; totals: { events: number; attendees: number; byClass: EventReportRow["by_classification"] } } | null>(null);

  const load = async () => {
    setLoading(true);
    try {
      const res = await fetchReport({ data: { from: from || undefined, to: to || undefined } });
      setData(res);
    } catch (e) {
      toast.error((e as Error).message);
      navigate({ to: "/" });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      await load();
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const exportCsv = () => {
    if (!data) return;
    const header = ["Evento", "Data", "Categoria", "Coach Responsável", "Total", "Alunos", "Alunos Coach", "Alunos Parceiros", "Alunos Profissionais"];
    const lines = [header.join(",")];
    for (const r of data.rows) {
      lines.push([
        `"${r.title.replace(/"/g, '""')}"`,
        new Date(r.starts_at).toLocaleString("pt-BR"),
        r.category,
        `"${(r.responsible_coach_name || "").replace(/"/g, '""')}"`,
        r.total_attendees,
        r.by_classification.Aluno,
        r.by_classification["Aluno Coach"],
        r.by_classification["Aluno Parceiro"],
        r.by_classification["Aluno Profissional"],
      ].join(","));
    }
    const blob = new Blob([lines.join("\n")], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `relatorio-eventos-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/admin/fitmind-events" })} className="rounded-full p-2 hover:bg-muted">
            <ChevronLeft className="size-5" />
          </button>
          <div className="flex-1">
            <h1 className="text-lg font-bold">Relatórios de Eventos</h1>
            <p className="text-xs text-muted-foreground">Métricas e exportação</p>
          </div>
          <button
            onClick={exportCsv}
            disabled={!data || data.rows.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground disabled:opacity-50"
          >
            <Download className="size-4" /> CSV
          </button>
        </div>
      </header>

      <main className="mx-auto max-w-6xl px-4 py-4 space-y-4">
        <section className="rounded-xl border border-border bg-card p-4">
          <div className="flex flex-wrap items-end gap-3">
            <div>
              <label className="block text-xs text-muted-foreground">De</label>
              <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <div>
              <label className="block text-xs text-muted-foreground">Até</label>
              <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className="mt-1 rounded-lg border border-border bg-background px-3 py-2 text-sm" />
            </div>
            <button onClick={load} className="rounded-lg bg-primary px-4 py-2 text-sm font-medium text-primary-foreground">Aplicar</button>
          </div>
        </section>

        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : !data ? null : (
          <>
            <section className="grid grid-cols-2 gap-3 md:grid-cols-3">
              <StatCard icon={<CalendarDays className="size-4" />} label="Eventos" value={data.totals.events} />
              <StatCard icon={<Users className="size-4" />} label="Presenças" value={data.totals.attendees} />
              <StatCard icon={<BarChart3 className="size-4" />} label="Média/evento" value={data.totals.events ? (data.totals.attendees / data.totals.events).toFixed(1) : "0"} />
            </section>

            <section className="rounded-xl border border-border bg-card p-4">
              <h2 className="mb-3 text-sm font-semibold">Por classificação</h2>
              <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
                <Mini label="Aluno" value={data.totals.byClass.Aluno} />
                <Mini label="Aluno Coach" value={data.totals.byClass["Aluno Coach"]} />
                <Mini label="Aluno Parceiro" value={data.totals.byClass["Aluno Parceiro"]} />
                <Mini label="Aluno Profissional" value={data.totals.byClass["Aluno Profissional"]} />
              </div>
            </section>

            <section className="overflow-hidden rounded-xl border border-border bg-card">
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead className="bg-muted/50 text-xs uppercase text-muted-foreground">
                    <tr>
                      <th className="px-3 py-2 text-left">Evento</th>
                      <th className="px-3 py-2 text-left">Data</th>
                      <th className="px-3 py-2 text-left">Coach</th>
                      <th className="px-3 py-2 text-right">Total</th>
                      <th className="px-3 py-2 text-right">Alunos</th>
                      <th className="px-3 py-2 text-right">Coach</th>
                      <th className="px-3 py-2 text-right">Parc.</th>
                      <th className="px-3 py-2 text-right">Prof.</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.rows.length === 0 ? (
                      <tr><td colSpan={8} className="px-3 py-8 text-center text-muted-foreground">Nenhum evento no período.</td></tr>
                    ) : data.rows.map((r) => (
                      <tr key={r.id} className="border-t border-border">
                        <td className="px-3 py-2">{r.title}</td>
                        <td className="px-3 py-2 text-xs text-muted-foreground">{new Date(r.starts_at).toLocaleString("pt-BR")}</td>
                        <td className="px-3 py-2 text-xs">{r.responsible_coach_name || "—"}</td>
                        <td className="px-3 py-2 text-right font-medium">{r.total_attendees}</td>
                        <td className="px-3 py-2 text-right">{r.by_classification.Aluno}</td>
                        <td className="px-3 py-2 text-right">{r.by_classification["Aluno Coach"]}</td>
                        <td className="px-3 py-2 text-right">{r.by_classification["Aluno Parceiro"]}</td>
                        <td className="px-3 py-2 text-right">{r.by_classification["Aluno Profissional"]}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
          </>
        )}
      </main>
    </div>
  );
}

function StatCard({ icon, label, value }: { icon: React.ReactNode; label: string; value: number | string }) {
  return (
    <div className="rounded-xl border border-border bg-card p-4">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">{icon}{label}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
    </div>
  );
}

function Mini({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-border bg-background p-3">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-lg font-semibold">{value}</div>
    </div>
  );
}
