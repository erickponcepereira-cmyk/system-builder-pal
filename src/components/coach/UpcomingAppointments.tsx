import { useEffect, useState } from "react";
import { Calendar, ExternalLink, MapPin, User as UserIcon } from "lucide-react";
import { getUpcomingEvents, type UpcomingEvent } from "@/server/google-calendar.functions";

export function UpcomingAppointments() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getUpcomingEvents()
      .then((r) => {
        if (cancelled) return;
        setEvents(r.events);
        if (r.error) setError(r.error);
      })
      .catch((e) => !cancelled && setError(String(e?.message ?? e)))
      .finally(() => !cancelled && setLoading(false));
    return () => {
      cancelled = true;
    };
  }, []);

  const fmt = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  };

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">
            Próximos atendimentos
          </h3>
        </div>
        <a
          href="https://calendar.google.com/calendar/u/0/r"
          target="_blank"
          rel="noreferrer"
          className="text-[11px] text-primary hover:underline flex items-center gap-1"
        >
          Google Agenda <ExternalLink className="h-3 w-3" />
        </a>
      </div>

      {loading && <p className="text-xs text-white/50">Carregando...</p>}

      {!loading && error && (
        <p className="text-xs text-white/60">
          Não foi possível carregar a agenda. {error}
        </p>
      )}

      {!loading && !error && events.length === 0 && (
        <p className="text-xs text-white/50">
          Nenhum atendimento agendado nos próximos dias.
        </p>
      )}

      {!loading && events.length > 0 && (
        <ul className="space-y-3">
          {events.map((ev) => (
            <li
              key={ev.id}
              className="rounded-xl p-3 bg-black/30 border border-white/5"
            >
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-sm font-semibold text-white truncate">
                    {ev.summary}
                  </p>
                  <p className="text-[11px] text-white/60 mt-0.5">
                    {fmt(ev.start)}
                  </p>
                  {ev.attendee && (
                    <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                      <UserIcon className="h-3 w-3" /> {ev.attendee}
                    </p>
                  )}
                  {ev.location && (
                    <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
                      <MapPin className="h-3 w-3" /> {ev.location}
                    </p>
                  )}
                </div>
                {ev.htmlLink && (
                  <a
                    href={ev.htmlLink}
                    target="_blank"
                    rel="noreferrer"
                    className="text-primary hover:opacity-80 shrink-0"
                  >
                    <ExternalLink className="h-3.5 w-3.5" />
                  </a>
                )}
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
