import { useEffect, useState, useCallback } from "react";
import { Calendar, ExternalLink, MapPin, User as UserIcon, RefreshCw, LogOut, Link2 } from "lucide-react";
import {
  getUpcomingEvents,
  getGoogleConnectionStatus,
  syncMyCalendar,
  disconnectGoogle,
  type UpcomingEvent,
  type GoogleConnectionStatus,
} from "@/server/google-calendar.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export function UpcomingAppointments() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, e] = await Promise.all([getGoogleConnectionStatus(), getUpcomingEvents()]);
      setStatus(s);
      setEvents(e.events);
      if (e.error) setError(e.error);
    } catch (err: any) {
      setError(String(err?.message ?? err));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { load(); }, [load]);

  const connect = async () => {
    const { data } = await supabase.auth.getSession();
    const token = data.session?.access_token;
    if (!token) {
      toast.error("Faça login novamente.");
      return;
    }
    window.location.href = `/api/oauth/google/start?access_token=${encodeURIComponent(token)}`;
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncMyCalendar();
      toast.success(`Sincronizado (${r.synced} eventos).`);
      await load();
    } catch (e: any) {
      toast.error(e?.message ?? "Falha ao sincronizar");
    } finally {
      setBusy(false);
    }
  };

  const disconnect = async () => {
    if (!confirm("Desconectar sua agenda Google?")) return;
    setBusy(true);
    try {
      await disconnectGoogle();
      toast.success("Conta desconectada.");
      await load();
    } finally {
      setBusy(false);
    }
  };

  const fmt = (iso: string) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
  };

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div className="flex items-center gap-2">
          <Calendar className="h-4 w-4 text-primary" />
          <h3 className="text-sm font-bold text-white uppercase tracking-wider">Próximos atendimentos</h3>
        </div>
        {status?.connected && (
          <div className="flex items-center gap-2">
            <button onClick={sync} disabled={busy} title="Sincronizar agora"
              className="text-[11px] text-primary hover:underline flex items-center gap-1 disabled:opacity-50">
              <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} /> Sincronizar
            </button>
            <button onClick={disconnect} disabled={busy} title="Desconectar"
              className="text-[11px] text-white/50 hover:text-white flex items-center gap-1 disabled:opacity-50">
              <LogOut className="h-3 w-3" />
            </button>
          </div>
        )}
      </div>

      {loading && <p className="text-xs text-white/50">Carregando...</p>}

      {!loading && !status?.connected && (
        <div className="flex flex-col items-start gap-3">
          <p className="text-xs text-white/60">
            Conecte sua agenda Google para ver e centralizar seus atendimentos aqui.
          </p>
          <button onClick={connect}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Link2 className="h-3.5 w-3.5" /> Conectar Google Agenda
          </button>
        </div>
      )}

      {!loading && status?.connected && (
        <>
          <p className="text-[11px] text-white/40 mb-2">
            Conectado: <span className="text-white/70">{status.email}</span>
          </p>
          {error && <p className="text-xs text-white/60 mb-2">{error}</p>}
          {events.length === 0 ? (
            <p className="text-xs text-white/50">Nenhum atendimento agendado nos próximos dias.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className="rounded-xl p-3 bg-black/30 border border-white/5">
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-white truncate">{ev.summary}</p>
                      <p className="text-[11px] text-white/60 mt-0.5">{fmt(ev.start)}</p>
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
                      <a href={ev.htmlLink} target="_blank" rel="noreferrer"
                        className="text-primary hover:opacity-80 shrink-0">
                        <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}
    </div>
  );
}
