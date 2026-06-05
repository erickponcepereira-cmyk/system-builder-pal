import { useEffect, useState, useCallback } from "react";
import { Calendar, ExternalLink, MapPin, User as UserIcon, RefreshCw, LogOut, Link2, Pencil, Trash2, Copy, Check, CheckCircle2, Circle } from "lucide-react";
import {
  getUpcomingEvents,
  getGoogleConnectionStatus,
  syncMyCalendar,
  disconnectGoogle,
  updateCoachCalendarEvent,
  deleteCoachCalendarEvent,
  setAppointmentCompleted,
  type UpcomingEvent,
  type GoogleConnectionStatus,
} from "@/lib/google-calendar.functions";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

function toLocalInput(iso: string) {
  const d = new Date(iso);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function UpcomingAppointments() {
  const [events, setEvents] = useState<UpcomingEvent[]>([]);
  const [status, setStatus] = useState<GoogleConnectionStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editing, setEditing] = useState<UpcomingEvent | null>(null);
  const [editForm, setEditForm] = useState({ summary: "", start: "", end: "", location: "" });
  const [copiedId, setCopiedId] = useState<string | null>(null);

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
    if (!token) { toast.error("Faça login novamente."); return; }
    window.location.href = `/api/oauth/google/start?access_token=${encodeURIComponent(token)}`;
  };

  const sync = async () => {
    setBusy(true);
    try {
      const r = await syncMyCalendar();
      toast.success(`Sincronizado (${r.synced} eventos).`);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao sincronizar"); }
    finally { setBusy(false); }
  };

  const disconnect = async () => {
    if (!confirm("Desconectar sua agenda Google?")) return;
    setBusy(true);
    try { await disconnectGoogle(); toast.success("Conta desconectada."); await load(); }
    finally { setBusy(false); }
  };

  const onDelete = async (ev: UpcomingEvent) => {
    if (!ev.googleEventId) { toast.error("Evento sem ID do Google."); return; }
    if (!confirm(`Excluir "${ev.summary}"? Será removido também do Google Agenda.`)) return;
    setBusy(true);
    try {
      await deleteCoachCalendarEvent({ data: { googleEventId: ev.googleEventId } });
      toast.success("Evento excluído.");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao excluir"); }
    finally { setBusy(false); }
  };

  const openEdit = (ev: UpcomingEvent) => {
    setEditing(ev);
    setEditForm({
      summary: ev.summary,
      start: toLocalInput(ev.start),
      end: toLocalInput(ev.end || ev.start),
      location: ev.location ?? "",
    });
  };

  const saveEdit = async () => {
    if (!editing?.googleEventId) return;
    setBusy(true);
    try {
      await updateCoachCalendarEvent({
        data: {
          googleEventId: editing.googleEventId,
          summary: editForm.summary,
          startISO: new Date(editForm.start).toISOString(),
          endISO: new Date(editForm.end).toISOString(),
          location: editForm.location || null,
        },
      });
      toast.success("Evento atualizado.");
      setEditing(null);
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao atualizar"); }
    finally { setBusy(false); }
  };

  const copyInvite = async (ev: UpcomingEvent) => {
    if (!ev.publicToken) return;
    const url = `${window.location.origin}/invite/${ev.publicToken}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopiedId(ev.id);
      toast.success("Link de convite copiado!");
      setTimeout(() => setCopiedId((c) => (c === ev.id ? null : c)), 2000);
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  const toggleComplete = async (ev: UpcomingEvent) => {
    setBusy(true);
    try {
      await setAppointmentCompleted({ data: { appointmentId: ev.id, completed: !ev.completedAt } });
      toast.success(ev.completedAt ? "Marcado como pendente." : "Evento concluído!");
      await load();
    } catch (e: any) { toast.error(e?.message ?? "Falha ao atualizar"); }
    finally { setBusy(false); }
  };

  const fmt = (iso: string) => {
    if (!iso) return "";
    return new Date(iso).toLocaleString("pt-BR", { day: "2-digit", month: "short", hour: "2-digit", minute: "2-digit" });
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
          <p className="text-xs text-white/60">Conecte sua agenda Google para ver e centralizar seus atendimentos aqui.</p>
          <button onClick={connect}
            className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:bg-primary/90">
            <Link2 className="h-3.5 w-3.5" /> Conectar Google Agenda
          </button>
        </div>
      )}

      {!loading && status?.connected && (
        <>
          <p className="text-[11px] text-white/40 mb-2">Conectado: <span className="text-white/70">{status.email}</span></p>
          {error && <p className="text-xs text-white/60 mb-2">{error}</p>}
          {events.length === 0 ? (
            <p className="text-xs text-white/50">Nenhum atendimento agendado nos próximos dias.</p>
          ) : (
            <ul className="space-y-3">
              {events.map((ev) => (
                <li key={ev.id} className={`rounded-xl p-3 border ${ev.completedAt ? "bg-emerald-500/10 border-emerald-500/30" : ev.attendeeConfirmed ? "bg-emerald-500/5 border-emerald-500/40" : "bg-black/30 border-white/5"}`}>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex items-center gap-2 flex-wrap">
                        <p className={`text-sm font-semibold truncate ${ev.completedAt ? "text-emerald-300 line-through" : "text-white"}`}>{ev.summary}</p>
                        {ev.attendeeConfirmed && !ev.completedAt && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-500/20 px-2 py-0.5 text-[10px] font-bold text-emerald-300 border border-emerald-500/40">
                            <CheckCircle2 className="h-3 w-3" /> Presença confirmada
                          </span>
                        )}
                      </div>
                      <p className="text-[11px] text-white/60 mt-0.5">
                        {fmt(ev.start)}
                        {ev.completedAt && <span className="ml-2 text-emerald-400">• concluído</span>}
                      </p>
                      {ev.attendee && (
                        <p className="text-[11px] text-white/50 mt-1 flex items-center gap-1">
                          <UserIcon className="h-3 w-3" /> {ev.attendee}
                        </p>
                      )}
                      {ev.attendeeConfirmed && ev.attendeeConfirmedAt && (
                        <p className="text-[10px] text-emerald-400/80 mt-0.5">
                          Confirmado em {fmt(ev.attendeeConfirmedAt)}
                        </p>
                      )}
                      {ev.location && (
                        <p className="text-[11px] text-white/50 mt-0.5 flex items-center gap-1">
                          <MapPin className="h-3 w-3" /> {ev.location}
                        </p>
                      )}
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button onClick={() => toggleComplete(ev)} title={ev.completedAt ? "Desfazer conclusão" : "Marcar como concluído"}
                        className="p-1.5 rounded hover:bg-white/10">
                        {ev.completedAt
                          ? <CheckCircle2 className="h-3.5 w-3.5 text-emerald-400" />
                          : <Circle className="h-3.5 w-3.5 text-white/60" />}
                      </button>
                      {ev.publicToken && (
                        <button onClick={() => copyInvite(ev)} title="Copiar link de convite"
                          className="p-1.5 rounded hover:bg-white/10 text-white/70">
                          {copiedId === ev.id ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
                        </button>
                      )}
                      {ev.googleEventId && (
                        <button onClick={() => openEdit(ev)} title="Editar"
                          className="p-1.5 rounded hover:bg-white/10 text-white/70">
                          <Pencil className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {ev.googleEventId && (
                        <button onClick={() => onDelete(ev)} title="Excluir"
                          className="p-1.5 rounded hover:bg-white/10 text-red-400">
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      )}
                      {ev.htmlLink && (
                        <a href={ev.htmlLink} target="_blank" rel="noreferrer" title="Abrir no Google"
                          className="p-1.5 rounded hover:bg-white/10 text-primary">
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                    </div>
                  </div>
                </li>
              ))}
            </ul>
          )}
        </>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 bg-black/70 flex items-center justify-center p-4" onClick={() => !busy && setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl bg-[#1A1A1A] border border-white/10 p-5" onClick={(e) => e.stopPropagation()}>
            <h4 className="text-sm font-bold text-white uppercase mb-4">Editar evento</h4>
            <div className="space-y-3">
              <div>
                <label className="text-[11px] text-white/60">Título</label>
                <input value={editForm.summary} onChange={(e) => setEditForm({ ...editForm, summary: e.target.value })}
                  className="w-full mt-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="text-[11px] text-white/60">Início</label>
                  <input type="datetime-local" value={editForm.start} onChange={(e) => setEditForm({ ...editForm, start: e.target.value })}
                    className="w-full mt-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
                </div>
                <div>
                  <label className="text-[11px] text-white/60">Fim</label>
                  <input type="datetime-local" value={editForm.end} onChange={(e) => setEditForm({ ...editForm, end: e.target.value })}
                    className="w-full mt-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
                </div>
              </div>
              <div>
                <label className="text-[11px] text-white/60">Local</label>
                <input value={editForm.location} onChange={(e) => setEditForm({ ...editForm, location: e.target.value })}
                  className="w-full mt-1 rounded-lg bg-black/40 border border-white/10 px-3 py-2 text-sm text-white" />
              </div>
            </div>
            <div className="flex items-center justify-end gap-2 mt-5">
              <button onClick={() => setEditing(null)} disabled={busy}
                className="px-3 py-2 text-xs text-white/70 hover:text-white">Cancelar</button>
              <button onClick={saveEdit} disabled={busy}
                className="px-4 py-2 text-xs font-semibold rounded-lg bg-primary text-primary-foreground disabled:opacity-50">
                {busy ? "Salvando…" : "Salvar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
