import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Calendar, RefreshCw, ExternalLink, MapPin, User as UserIcon, CheckCircle2, XCircle } from "lucide-react";
import {
  adminListAppointments,
  adminListCoachConnections,
} from "@/lib/google-calendar.functions";

export const Route = createFileRoute("/admin/calendars")({
  head: () => ({
    meta: [
      { title: "Agendas — Admin FitMind Club" },
      { name: "description", content: "Visão consolidada das agendas dos coaches." },
    ],
  }),
  component: AdminCalendarsPage,
});

type Coach = { id: string; name: string; googleEmail: string | null; lastSyncedAt: string | null; connected: boolean };
type Appt = {
  id: string; coachId: string; coachName: string; summary: string;
  start: string; end: string; attendee: string | null;
  location: string | null; htmlLink: string | null; status: string;
};

function AdminCalendarsPage() {
  const [coaches, setCoaches] = useState<Coach[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [coachFilter, setCoachFilter] = useState<string>("");
  const [days, setDays] = useState(30);
  const [view, setView] = useState<"timeline" | "byCoach">("timeline");

  const load = async () => {
    setLoading(true);
    setErr(null);
    try {
      const [c, a] = await Promise.all([
        adminListCoachConnections(),
        adminListAppointments({ data: { coachId: coachFilter || null, daysAhead: days } }),
      ]);
      setCoaches(c.coaches);
      setAppts(a.appointments);
    } catch (e: any) {
      setErr(e?.message ?? String(e));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, [coachFilter, days]);

  const todayCount = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    const tEnd = new Date(t); tEnd.setDate(tEnd.getDate() + 1);
    return appts.filter(a => { const d = new Date(a.start); return d >= t && d < tEnd; }).length;
  }, [appts]);
  const weekCount = useMemo(() => {
    const t = new Date(); t.setHours(0,0,0,0);
    const wEnd = new Date(t); wEnd.setDate(wEnd.getDate() + 7);
    return appts.filter(a => { const d = new Date(a.start); return d >= t && d < wEnd; }).length;
  }, [appts]);
  const connectedCount = coaches.filter(c => c.connected).length;

  const fmt = (iso: string) => new Date(iso).toLocaleString("pt-BR", {
    day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit",
  });

  const grouped = useMemo(() => {
    const map = new Map<string, { coachName: string; items: Appt[] }>();
    for (const a of appts) {
      if (!map.has(a.coachId)) map.set(a.coachId, { coachName: a.coachName, items: [] });
      map.get(a.coachId)!.items.push(a);
    }
    return Array.from(map.entries()).sort((x, y) => x[1].coachName.localeCompare(y[1].coachName));
  }, [appts]);

  return (
    <div className="p-4 sm:p-6 lg:p-8 max-w-7xl mx-auto">
      <div className="mb-6 flex items-center justify-between gap-3 flex-wrap">
        <div>
          <h1 className="text-2xl font-bold text-foreground flex items-center gap-2">
            <Calendar className="h-6 w-6 text-primary" /> Agendas
          </h1>
          <p className="text-sm text-muted-foreground">Visão consolidada das agendas de todos os coaches.</p>
        </div>
        <button onClick={load} disabled={loading}
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90 disabled:opacity-50">
          <RefreshCw className={`h-3.5 w-3.5 ${loading ? "animate-spin" : ""}`} /> Atualizar
        </button>
      </div>

      {/* KPIs */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 mb-6">
        <Kpi label="Hoje" value={todayCount} />
        <Kpi label="Próximos 7 dias" value={weekCount} />
        <Kpi label={`Próximos ${days} dias`} value={appts.length} />
        <Kpi label="Coaches conectados" value={`${connectedCount}/${coaches.length}`} />
      </div>

      {/* Filters */}
      <div className="flex flex-wrap items-end gap-3 mb-6">
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Coach</label>
          <select value={coachFilter} onChange={(e) => setCoachFilter(e.target.value)}
            className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground">
            <option value="">Todos</option>
            {coaches.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name} {c.connected ? "" : "(sem Google)"}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="block text-xs text-muted-foreground mb-1">Período</label>
          <select value={days} onChange={(e) => setDays(Number(e.target.value))}
            className="rounded-lg bg-card border border-border px-3 py-2 text-sm text-foreground">
            <option value={7}>7 dias</option>
            <option value={14}>14 dias</option>
            <option value={30}>30 dias</option>
            <option value={60}>60 dias</option>
            <option value={90}>90 dias</option>
          </select>
        </div>
        <div className="ml-auto flex rounded-lg overflow-hidden border border-border">
          <button onClick={() => setView("timeline")}
            className={`px-3 py-2 text-xs ${view === "timeline" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
            Cronológica
          </button>
          <button onClick={() => setView("byCoach")}
            className={`px-3 py-2 text-xs ${view === "byCoach" ? "bg-primary text-primary-foreground" : "bg-card text-foreground"}`}>
            Por coach
          </button>
        </div>
      </div>

      {err && <p className="text-sm text-destructive mb-4">{err}</p>}

      {/* Coach connections panel */}
      <div className="rounded-2xl border border-border bg-card p-4 mb-6">
        <h3 className="text-sm font-bold text-foreground mb-3">Status de conexão Google</h3>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-2">
          {coaches.map((c) => (
            <div key={c.id} className="flex items-center justify-between rounded-lg bg-background/50 px-3 py-2">
              <div className="min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{c.name}</p>
                <p className="text-[11px] text-muted-foreground truncate">
                  {c.googleEmail || "—"}
                </p>
              </div>
              {c.connected ? (
                <CheckCircle2 className="h-4 w-4 text-success shrink-0" />
              ) : (
                <XCircle className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Appointments */}
      {loading ? (
        <p className="text-sm text-muted-foreground">Carregando...</p>
      ) : appts.length === 0 ? (
        <div className="rounded-2xl border border-border bg-card p-8 text-center">
          <p className="text-sm text-muted-foreground">Nenhum atendimento no período selecionado.</p>
        </div>
      ) : view === "timeline" ? (
        <div className="rounded-2xl border border-border bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-background/50">
              <tr className="text-left text-muted-foreground">
                <th className="px-4 py-2 font-medium">Quando</th>
                <th className="px-4 py-2 font-medium">Coach</th>
                <th className="px-4 py-2 font-medium">Atendimento</th>
                <th className="px-4 py-2 font-medium">Aluno</th>
                <th className="px-4 py-2 font-medium"></th>
              </tr>
            </thead>
            <tbody>
              {appts.map((a) => (
                <tr key={a.id} className="border-t border-border">
                  <td className="px-4 py-2 text-foreground whitespace-nowrap">{fmt(a.start)}</td>
                  <td className="px-4 py-2 text-foreground">{a.coachName}</td>
                  <td className="px-4 py-2 text-foreground">
                    <div className="font-medium">{a.summary}</div>
                    {a.location && (
                      <div className="text-[11px] text-muted-foreground flex items-center gap-1">
                        <MapPin className="h-3 w-3" /> {a.location}
                      </div>
                    )}
                  </td>
                  <td className="px-4 py-2 text-muted-foreground">
                    {a.attendee ? (
                      <span className="inline-flex items-center gap-1">
                        <UserIcon className="h-3 w-3" /> {a.attendee}
                      </span>
                    ) : "—"}
                  </td>
                  <td className="px-4 py-2 text-right">
                    {a.htmlLink && (
                      <a href={a.htmlLink} target="_blank" rel="noreferrer"
                        className="text-primary hover:opacity-80 inline-flex">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      ) : (
        <div className="space-y-4">
          {grouped.map(([coachId, g]) => (
            <details key={coachId} open className="rounded-2xl border border-border bg-card">
              <summary className="cursor-pointer px-4 py-3 flex items-center justify-between">
                <span className="font-semibold text-foreground">{g.coachName}</span>
                <span className="text-xs text-muted-foreground">{g.items.length} atendimento(s)</span>
              </summary>
              <ul className="divide-y divide-border">
                {g.items.map((a) => (
                  <li key={a.id} className="px-4 py-3 flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-medium text-foreground">{a.summary}</p>
                      <p className="text-[11px] text-muted-foreground">{fmt(a.start)}</p>
                      {a.attendee && (
                        <p className="text-[11px] text-muted-foreground flex items-center gap-1">
                          <UserIcon className="h-3 w-3" /> {a.attendee}
                        </p>
                      )}
                    </div>
                    {a.htmlLink && (
                      <a href={a.htmlLink} target="_blank" rel="noreferrer" className="text-primary shrink-0">
                        <ExternalLink className="h-4 w-4" />
                      </a>
                    )}
                  </li>
                ))}
              </ul>
            </details>
          ))}
        </div>
      )}
    </div>
  );
}

function Kpi({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-card p-4">
      <p className="text-xs text-muted-foreground">{label}</p>
      <p className="text-2xl font-bold text-foreground mt-1">{value}</p>
    </div>
  );
}
