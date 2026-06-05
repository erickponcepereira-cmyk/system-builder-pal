import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { CalendarDays, MapPin, CheckCircle2, Clock, ChevronLeft, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { getMyEvents, type MyEventItem } from "@/lib/fitmind-events.functions";

export const Route = createFileRoute("/meus-eventos")({
  head: () => ({ meta: [{ title: "Meus Eventos — FitMind" }] }),
  component: MyEventsPage,
});

function MyEventsPage() {
  const navigate = useNavigate();
  const fetchMine = useServerFn(getMyEvents);
  const [tab, setTab] = useState<"upcoming" | "past">("upcoming");
  const [data, setData] = useState<{ upcoming: MyEventItem[]; past: MyEventItem[] } | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) { navigate({ to: "/auth" }); return; }
      try {
        const res = await fetchMine();
        setData(res);
      } catch (e) {
        console.error(e);
      } finally {
        setLoading(false);
      }
    })();
  }, [fetchMine, navigate]);

  const list = data ? (tab === "upcoming" ? data.upcoming : data.past) : [];

  return (
    <div className="min-h-screen bg-background pb-20">
      <header className="sticky top-0 z-40 border-b border-border bg-background/95 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3 px-4 py-3">
          <button onClick={() => navigate({ to: "/" })} className="rounded-full p-2 hover:bg-muted">
            <ChevronLeft className="size-5" />
          </button>
          <div>
            <h1 className="text-lg font-bold">Meus Eventos</h1>
            <p className="text-xs text-muted-foreground">Próximos e histórico de presenças</p>
          </div>
        </div>
        <div className="mx-auto flex max-w-3xl gap-2 px-4 pb-3">
          <TabBtn active={tab === "upcoming"} onClick={() => setTab("upcoming")}>
            Próximos {data ? `(${data.upcoming.length})` : ""}
          </TabBtn>
          <TabBtn active={tab === "past"} onClick={() => setTab("past")}>
            Histórico {data ? `(${data.past.length})` : ""}
          </TabBtn>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-4">
        {loading ? (
          <div className="flex justify-center py-16"><Loader2 className="size-6 animate-spin text-muted-foreground" /></div>
        ) : list.length === 0 ? (
          <div className="rounded-xl border border-dashed border-border bg-card p-10 text-center text-sm text-muted-foreground">
            {tab === "upcoming" ? "Nenhum evento próximo disponível para você." : "Você ainda não participou de nenhum evento."}
          </div>
        ) : (
          <ul className="space-y-3">
            {list.map((ev) => <EventRow key={ev.id} ev={ev} />)}
          </ul>
        )}
      </main>
    </div>
  );
}

function TabBtn({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-lg px-3 py-2 text-sm font-medium transition ${
        active ? "bg-primary text-primary-foreground" : "bg-muted text-foreground hover:bg-muted/70"
      }`}
    >
      {children}
    </button>
  );
}

function EventRow({ ev }: { ev: MyEventItem }) {
  const start = new Date(ev.starts_at);
  const dateLabel = start.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
  const timeLabel = start.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
  return (
    <li>
      <Link
        to="/calendar"
        className="block rounded-xl border border-border bg-card p-4 transition hover:border-primary/50"
      >
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            <div className="mb-1 flex items-center gap-2 text-xs text-muted-foreground">
              <CalendarDays className="size-3.5" />
              <span className="capitalize">{dateLabel}</span>
              <Clock className="size-3.5" />
              <span>{timeLabel}</span>
            </div>
            <h3 className="truncate text-base font-semibold">{ev.title}</h3>
            {ev.subtitle && <p className="truncate text-sm text-muted-foreground">{ev.subtitle}</p>}
            {ev.location && (
              <p className="mt-1 flex items-center gap-1 text-xs text-muted-foreground">
                <MapPin className="size-3" /> {ev.location}
              </p>
            )}
          </div>
          {ev.attended && (
            <span className="flex shrink-0 items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-1 text-xs font-medium text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="size-3.5" /> Presente
            </span>
          )}
        </div>
      </Link>
    </li>
  );
}
