// ══════════════════════════════════════════════════════════════════════════════
// ARQUIVO: src/routes/admin.fitmind-events.tsx
// Painel admin para gerenciar o Calendário de Eventos FitMind
// ══════════════════════════════════════════════════════════════════════════════

import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  CalendarDays, Plus, Trash2, Save, X, Star, ChevronLeft, ChevronRight,
  Loader2, Edit2, Eye, EyeOff, MapPin, Clock, Tag, Sparkles, AlertTriangle,
  CheckCircle2, Flag, Palette, Globe, Users, UserCheck, Building2, Stethoscope,
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  tzToday, tzDateTimeLocal, tzLocalToISO, tzStartOfMonth,
  shiftYearMonth, yearMonthLabel,
} from "@/lib/timezone";


export const Route = createFileRoute("/admin/fitmind-events")({
  head: () => ({ meta: [{ title: "Calendário de Eventos — Admin FitMind" }] }),
  component: AdminFitmindEventsPage,
});

// ─── Types ──────────────────────────────────────────────────────────────────

type EventCategory = "aula" | "workshop" | "desafio" | "palestra" | "avaliacao" | "comemorativo" | "networking" | "outro";
type EventVisibility = "todos" | "coaches" | "alunos" | "parceiros" | "profissionais";

interface FitmindEvent {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  image_url: string | null;
  color: string | null;
  category: EventCategory;
  visibility: EventVisibility;
  visibility_roles: EventVisibility[];
  responsible_coach_id: string | null;
  tags: string[] | null;
  starts_at: string;
  ends_at: string;
  all_day: boolean;
  is_highlighted: boolean;
  is_important: boolean;
  highlight_color: string | null;
  highlight_label: string | null;
  google_calendar_title: string | null;
  google_calendar_description: string | null;
  google_calendar_location: string | null;
  is_active: boolean;
  created_at: string;
}


interface HighlightedDay {
  id: string;
  date: string;
  label: string;
  description: string | null;
  color: string | null;
  icon: string | null;
  is_active: boolean;
}

const CATEGORY_META: Record<EventCategory, { label: string; color: string; emoji: string }> = {
  aula:        { label: "Aula",         color: "#E24B4A", emoji: "🏋️" },
  workshop:    { label: "Workshop",     color: "#F09595", emoji: "🛠️" },
  desafio:     { label: "Desafio",      color: "#fb923c", emoji: "⚡" },
  palestra:    { label: "Palestra",     color: "#60a5fa", emoji: "🎤" },
  avaliacao:   { label: "Avaliação",    color: "#34d399", emoji: "📊" },
  comemorativo:{ label: "Comemorativo", color: "#f59e0b", emoji: "🎉" },
  networking:  { label: "Networking",   color: "#a78bfa", emoji: "🤝" },
  outro:       { label: "Outro",        color: "#6b7280", emoji: "📅" },
};

const VISIBILITY_META: Record<EventVisibility, { label: string; icon: typeof Globe }> = {
  todos:        { label: "Todos",         icon: Globe },
  coaches:      { label: "Coaches",       icon: UserCheck },
  alunos:       { label: "Alunos",        icon: Users },
  parceiros:    { label: "Parceiros",     icon: Building2 },
  profissionais:{ label: "Profissionais", icon: Stethoscope },
};
const EMPTY_EVENT: Omit<FitmindEvent, "id" | "created_at" | "is_active"> = {
  title: "",
  subtitle: null,
  description: null,
  location: null,
  image_url: null,
  color: "#E24B4A",
  category: "aula",
  visibility: "todos",
  visibility_roles: ["todos"],
  responsible_coach_id: null,
  tags: [],
  starts_at: tzDateTimeLocal(new Date()),
  ends_at: tzDateTimeLocal(new Date(Date.now() + 3600000)),
  all_day: false,
  is_highlighted: false,
  is_important: false,
  highlight_color: null,
  highlight_label: null,
  google_calendar_title: null,
  google_calendar_description: null,
  google_calendar_location: null,
};


const EMPTY_DAY: Omit<HighlightedDay, "id"> = {
  date: tzToday(),
  label: "",
  description: null,
  color: "#f59e0b",
  icon: "star",
  is_active: true,
};



// ─── Main Page ───────────────────────────────────────────────────────────────

function AdminFitmindEventsPage() {
  const [tab, setTab] = useState<"events" | "days" | "attendance">("events");

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Calendário de Eventos FitMind
          </h1>
          <p className="text-xs text-white/50 mt-0.5">
            Gerencie eventos, aulas gratuitas e datas especiais visíveis para toda a comunidade.
          </p>
        </div>
        <a
          href="/admin/fitmind-events-reports"
          className="inline-flex items-center gap-2 rounded-lg bg-primary px-3 py-2 text-sm font-medium text-primary-foreground hover:opacity-90"
        >
          <BarChart3 className="h-4 w-4" /> Relatórios
        </a>
      </div>

      {/* Tabs */}
      <div className="flex gap-1 border-b border-white/10">
        <TabBtn active={tab === "events"} onClick={() => setTab("events")} icon={CalendarDays} label="Eventos" />
        <TabBtn active={tab === "days"}   onClick={() => setTab("days")}   icon={Star}          label="Dias em Destaque" />
        <TabBtn active={tab === "attendance"} onClick={() => setTab("attendance")} icon={Users} label="Presenças" />
      </div>

      {tab === "events" && <EventsTab />}
      {tab === "days"   && <HighlightedDaysTab />}
      {tab === "attendance" && <AttendanceReportTab />}
    </div>
  );
}

// ─── Tab Button ──────────────────────────────────────────────────────────────

function TabBtn({ active, onClick, icon: Icon, label }: { active: boolean; onClick: () => void; icon: typeof CalendarDays; label: string }) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-4 py-2.5 text-sm border-b-2 -mb-px transition ${
        active ? "border-[#E24B4A] text-white font-semibold" : "border-transparent text-white/50 hover:text-white"
      }`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: EVENTOS
// ══════════════════════════════════════════════════════════════════════════════

function EventsTab() {
  const [events, setEvents] = useState<FitmindEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<FitmindEvent> | null>(null);
  const [saving, setSaving] = useState(false);
  const [filterMonth, setFilterMonth] = useState(() => tzToday().slice(0, 7));
  const [coachOptions, setCoachOptions] = useState<Array<{ id: string; name: string; whatsapp: string | null }>>([]);

  const [showInactive, setShowInactive] = useState(false);
  const [tagInput, setTagInput] = useState("");

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("coaches" as never)
        .select("id, profiles:profile_id(name, whatsapp)" as never);
      const opts = ((data as any[]) || [])
        .map((c) => ({ id: c.id, name: c.profiles?.name || "Coach", whatsapp: c.profiles?.whatsapp || null }))
        .sort((a, b) => a.name.localeCompare(b.name));
      setCoachOptions(opts);
    })();
  }, []);

  const load = async () => {
    setLoading(true);
    const from = tzStartOfMonth(filterMonth).toISOString();
    const to   = tzStartOfMonth(shiftYearMonth(filterMonth, 1)).toISOString();
    const { data, error } = await supabase
      .from("fitmind_events" as never)
      .select("*" as never)
      .gte("starts_at" as never, from as never)
      .lt("starts_at" as never, to as never)
      .order("starts_at" as never, { ascending: true });
    if (error) toast.error(error.message);
    setEvents((data as unknown as FitmindEvent[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterMonth]);





  const openNew = () => {
    // 15º dia do mês filtrado, às 09:00 (hora de Cuiabá)
    const startLocal = `${filterMonth}-15T09:00`;
    const startISO = tzLocalToISO(startLocal);
    const endISO = new Date(new Date(startISO).getTime() + 3600000).toISOString();
    setEditing({
      ...EMPTY_EVENT,
      starts_at: tzDateTimeLocal(startISO),
      ends_at: tzDateTimeLocal(endISO),
    });
    setTagInput("");
  };

  const openEdit = (ev: FitmindEvent) => {
    setEditing({
      ...ev,
      starts_at: tzDateTimeLocal(ev.starts_at),
      ends_at: tzDateTimeLocal(ev.ends_at),
    });
    setTagInput("");
  };



  const save = async () => {
    if (!editing) return;
    if (!editing.title?.trim()) { toast.error("Título obrigatório"); return; }
    if (!editing.starts_at || !editing.ends_at) { toast.error("Data/hora obrigatória"); return; }

    setSaving(true);
    try {
      const roles = (editing.visibility_roles && editing.visibility_roles.length > 0)
        ? editing.visibility_roles
        : ["todos"] as EventVisibility[];
      const payload = {
        title: editing.title.trim(),
        subtitle: editing.subtitle?.trim() || null,
        description: editing.description?.trim() || null,
        location: editing.location?.trim() || null,
        image_url: editing.image_url?.trim() || null,
        color: editing.color || "#E24B4A",
        category: editing.category || "aula",
        visibility: (roles.includes("todos") ? "todos" : roles[0]) as EventVisibility,
        visibility_roles: roles,
        responsible_coach_id: editing.responsible_coach_id || null,
        tags: (editing.tags || []).filter(Boolean),
        starts_at: tzLocalToISO(editing.starts_at),
        ends_at: tzLocalToISO(editing.ends_at),

        all_day: !!editing.all_day,
        is_highlighted: !!editing.is_highlighted,
        is_important: !!editing.is_important,
        highlight_color: editing.highlight_color?.trim() || null,
        highlight_label: editing.highlight_label?.trim() || null,
        google_calendar_title: editing.google_calendar_title?.trim() || null,
        google_calendar_description: editing.google_calendar_description?.trim() || null,
        google_calendar_location: editing.google_calendar_location?.trim() || null,
        is_active: editing.is_active !== false,
      };


      if (editing.id) {
        const { error } = await supabase.from("fitmind_events" as never).update(payload as never).eq("id" as never, editing.id as never);
        if (error) throw error;
        toast.success("Evento atualizado!");
      } else {
        const { error } = await supabase.from("fitmind_events" as never).insert(payload as never);
        if (error) throw error;
        toast.success("Evento criado!");
      }
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const toggleActive = async (ev: FitmindEvent) => {
    await supabase.from("fitmind_events" as never).update({ is_active: !ev.is_active } as never).eq("id" as never, ev.id as never);
    load();
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este evento permanentemente?")) return;
    await supabase.from("fitmind_events" as never).delete().eq("id" as never, id as never);
    toast.success("Evento excluído");
    load();
  };

  const addTag = () => {
    const t = tagInput.trim().toLowerCase();
    if (!t) return;
    const current = editing?.tags || [];
    if (!current.includes(t)) setEditing((e) => ({ ...e, tags: [...current, t] }));
    setTagInput("");
  };

  const removeTag = (tag: string) => setEditing((e) => ({ ...e, tags: (e?.tags || []).filter((t) => t !== tag) }));

  const filtered = events.filter((ev) => showInactive || ev.is_active);

  // Navegação de mês
  const prevMonth = () => setFilterMonth(shiftYearMonth(filterMonth, -1));
  const nextMonth = () => setFilterMonth(shiftYearMonth(filterMonth, 1));

  const monthLabel = yearMonthLabel(filterMonth);


  return (
    <div className="space-y-4">
      {/* Header da tab */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Navegação de mês */}
        <div className="flex items-center gap-2">
          <button onClick={prevMonth} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <ChevronLeft className="h-4 w-4 text-white" />
          </button>
          <span className="text-sm font-semibold text-white capitalize min-w-36 text-center">{monthLabel}</span>
          <button onClick={nextMonth} className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 transition">
            <ChevronRight className="h-4 w-4 text-white" />
          </button>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowInactive(!showInactive)}
            className={`flex items-center gap-1.5 px-3 py-1.5 text-xs rounded-lg border transition ${
              showInactive ? "bg-white/10 border-white/20 text-white" : "bg-transparent border-white/10 text-white/50"
            }`}>
            {showInactive ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
            Inativos
          </button>
          <button onClick={openNew} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition">
            <Plus className="h-4 w-4" /> Novo Evento
          </button>
        </div>
      </div>

      {/* Lista de eventos */}
      {loading ? (
        <div className="flex justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-2xl p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <CalendarDays className="mx-auto h-10 w-10 text-white/20 mb-3" />
          <p className="text-sm text-white/40">Nenhum evento em {monthLabel}.</p>
          <button onClick={openNew} className="mt-4 text-xs text-primary underline">Criar o primeiro evento</button>
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((ev) => {
            const cat = CATEGORY_META[ev.category] || CATEGORY_META.outro;
            const roles = (ev.visibility_roles && ev.visibility_roles.length > 0) ? ev.visibility_roles : [ev.visibility || "todos"];
            const respCoach = coachOptions.find((c) => c.id === ev.responsible_coach_id);

            const dtStart = new Date(ev.starts_at);
            const dtEnd   = new Date(ev.ends_at);
            return (
              <div
                key={ev.id}
                className={`flex items-start gap-3 rounded-xl p-4 border transition ${
                  ev.is_active ? "border-white/5" : "border-white/5 opacity-50"
                }`}
                style={{ backgroundColor: "#1A1A1A", borderLeftColor: ev.color || cat.color, borderLeftWidth: 3 }}>
                {/* Data */}
                <div className="flex-none text-center min-w-10">
                  <p className="text-xs text-white/40">{dtStart.toLocaleDateString("pt-BR", { month: "short" })}</p>
                  <p className="text-xl font-bold text-white leading-none">{dtStart.getDate().toString().padStart(2, "0")}</p>
                </div>

                {/* Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start gap-2 flex-wrap">
                    <span className="text-[10px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: (ev.color || cat.color) + "30", color: ev.color || cat.color }}>
                      {cat.emoji} {cat.label}
                    </span>
                    {ev.is_highlighted && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⭐ Destaque</span>}
                    {ev.is_important  && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">🚨 Importante</span>}
                    {roles.map((r) => {
                      const meta = VISIBILITY_META[r as EventVisibility] || VISIBILITY_META.todos;
                      const RIcon = meta.icon;
                      return (
                        <span key={r} className="text-[10px] text-white/50 flex items-center gap-1 rounded-full bg-white/5 px-2 py-0.5">
                          <RIcon className="h-3 w-3" /> {meta.label}
                        </span>
                      );
                    })}
                  </div>
                  <p className="text-sm font-bold text-white mt-1 truncate">{ev.title}</p>
                  {ev.subtitle && <p className="text-xs text-white/50 truncate">{ev.subtitle}</p>}
                  <p className="text-[11px] text-white/40 mt-1 flex items-center gap-3 flex-wrap">
                    <span className="flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {ev.all_day ? "Dia inteiro" : `${dtStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} – ${dtEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                    </span>
                    {ev.location && <span className="flex items-center gap-1"><MapPin className="h-3 w-3" /> {ev.location}</span>}
                    {respCoach && (
                      <span className="flex items-center gap-1 text-primary">
                        <UserCheck className="h-3 w-3" /> {respCoach.name}
                      </span>
                    )}
                  </p>

                </div>

                {/* Ações */}
                <div className="flex items-center gap-1 flex-none">
                  <button onClick={() => openEdit(ev)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition" title="Editar">
                    <Edit2 className="h-3.5 w-3.5" />
                  </button>
                  <button onClick={() => toggleActive(ev)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60 hover:text-white transition" title={ev.is_active ? "Desativar" : "Ativar"}>
                    {ev.is_active ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <button onClick={() => del(ev.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition" title="Excluir">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Modal de Edição */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/80 p-4 overflow-y-auto">
          <div className="w-full max-w-2xl rounded-2xl my-8" style={{ backgroundColor: "#111" }}>
            {/* Header do modal */}
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-base font-bold text-white">
                {editing.id ? "Editar Evento" : "Novo Evento"}
              </h2>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60">
                <X className="h-4 w-4" />
              </button>
            </div>

            <div className="p-5 space-y-4">
              {/* Título */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Título *</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                  placeholder="Ex: Aula Gratuita de Avaliação Corporal"
                  value={editing.title || ""}
                  onChange={(e) => setEditing((ev) => ({ ...ev, title: e.target.value }))}
                />
              </div>

              {/* Subtítulo */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Subtítulo</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                  placeholder="Ex: Para novos alunos – gratuito"
                  value={editing.subtitle || ""}
                  onChange={(e) => setEditing((ev) => ({ ...ev, subtitle: e.target.value }))}
                />
              </div>

              {/* Descrição */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Descrição</label>
                <textarea
                  rows={3}
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary resize-none"
                  placeholder="Detalhes do evento para os participantes..."
                  value={editing.description || ""}
                  onChange={(e) => setEditing((ev) => ({ ...ev, description: e.target.value }))}
                />
              </div>

              {/* Datas */}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Início *</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                    value={editing.starts_at || ""}
                    onChange={(e) => setEditing((ev) => ({ ...ev, starts_at: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Fim *</label>
                  <input
                    type="datetime-local"
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                    value={editing.ends_at || ""}
                    onChange={(e) => setEditing((ev) => ({ ...ev, ends_at: e.target.value }))}
                  />
                </div>
              </div>

              {/* Dia inteiro */}
              <label className="flex items-center gap-2.5 cursor-pointer">
                <input
                  type="checkbox"
                  className="rounded border-white/20"
                  checked={!!editing.all_day}
                  onChange={(e) => setEditing((ev) => ({ ...ev, all_day: e.target.checked }))}
                />
                <span className="text-sm text-white/70">Evento de dia inteiro</span>
              </label>

              {/* Categoria */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Categoria</label>
                <select
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                  value={editing.category || "aula"}
                  onChange={(e) => setEditing((ev) => ({ ...ev, category: e.target.value as EventCategory }))}
                >
                  {Object.entries(CATEGORY_META).map(([k, v]) => (
                    <option key={k} value={k} style={{ backgroundColor: "#1A1A1A" }}>{v.emoji} {v.label}</option>
                  ))}
                </select>
              </div>

              {/* Visibilidade multi-papel */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Visível para</label>
                <p className="text-[11px] text-white/40 mt-0.5">Selecione um ou mais públicos. "Todos" cobre qualquer usuário.</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {(Object.entries(VISIBILITY_META) as Array<[EventVisibility, { label: string; icon: typeof Globe }]>).map(([k, v]) => {
                    const VIcon = v.icon;
                    const roles = editing.visibility_roles || [];
                    const checked = roles.includes(k);
                    const toggle = () => {
                      let next: EventVisibility[];
                      if (k === "todos") {
                        next = checked ? [] : ["todos"];
                      } else {
                        next = checked ? roles.filter((r) => r !== k) : [...roles.filter((r) => r !== "todos"), k];
                      }
                      if (next.length === 0) next = ["todos"];
                      setEditing((ev) => ({ ...ev, visibility_roles: next }));
                    };
                    return (
                      <button
                        key={k}
                        type="button"
                        onClick={toggle}
                        className={`flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition ${
                          checked
                            ? "bg-primary/20 border-primary text-primary"
                            : "bg-white/5 border-white/10 text-white/60 hover:text-white"
                        }`}>
                        <VIcon className="h-3.5 w-3.5" /> {v.label}
                      </button>
                    );
                  })}
                </div>
              </div>

              {/* Coach responsável */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Coach responsável</label>
                <p className="text-[11px] text-white/40 mt-0.5">O WhatsApp do perfil deste coach aparecerá para contato.</p>
                <select
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                  value={editing.responsible_coach_id || ""}
                  onChange={(e) => setEditing((ev) => ({ ...ev, responsible_coach_id: e.target.value || null }))}
                >
                  <option value="" style={{ backgroundColor: "#1A1A1A" }}>— Nenhum —</option>
                  {coachOptions.map((c) => (
                    <option key={c.id} value={c.id} style={{ backgroundColor: "#1A1A1A" }}>
                      {c.name}{c.whatsapp ? ` · ${c.whatsapp}` : " · (sem WhatsApp)"}
                    </option>
                  ))}
                </select>
              </div>


              {/* Local */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Local / Link</label>
                <input
                  className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                  placeholder="Ex: Online via Zoom — https://... ou Endereço presencial"
                  value={editing.location || ""}
                  onChange={(e) => setEditing((ev) => ({ ...ev, location: e.target.value }))}
                />
              </div>

              {/* Cor */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5"><Palette className="h-3.5 w-3.5" /> Cor no calendário</label>
                <div className="mt-2 flex items-center gap-3">
                  <input
                    type="color"
                    className="h-10 w-16 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    value={editing.color || "#E24B4A"}
                    onChange={(e) => setEditing((ev) => ({ ...ev, color: e.target.value }))}
                  />
                  <div className="flex gap-1.5 flex-wrap">
                    {["#E24B4A","#F09595","#fb923c","#f59e0b","#34d399","#60a5fa","#a78bfa","#f472b6"].map((c) => (
                      <button key={c} onClick={() => setEditing((ev) => ({ ...ev, color: c }))}
                        className={`h-7 w-7 rounded-full border-2 transition ${editing.color === c ? "border-white" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>

              {/* Tags */}
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1.5"><Tag className="h-3.5 w-3.5" /> Tags</label>
                <div className="mt-1 flex gap-2">
                  <input
                    className="flex-1 rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                    placeholder="Ex: gratuito, online, nutrição..."
                    value={tagInput}
                    onChange={(e) => setTagInput(e.target.value)}
                    onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addTag(); } }}
                  />
                  <button onClick={addTag} className="px-3 py-2 rounded-xl bg-primary/20 text-primary text-sm hover:bg-primary/30 transition">
                    <Plus className="h-4 w-4" />
                  </button>
                </div>
                {(editing.tags || []).length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {(editing.tags || []).map((t) => (
                      <span key={t} className="flex items-center gap-1 rounded-full bg-white/10 px-2.5 py-0.5 text-xs text-white/70">
                        #{t}
                        <button onClick={() => removeTag(t)} className="text-white/40 hover:text-white"><X className="h-3 w-3" /></button>
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Destaque */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#0F0F0F" }}>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5"><Sparkles className="h-3.5 w-3.5" /> Destaque no calendário</p>
                <div className="grid grid-cols-2 gap-3">
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" className="rounded border-white/20"
                      checked={!!editing.is_highlighted}
                      onChange={(e) => setEditing((ev) => ({ ...ev, is_highlighted: e.target.checked }))} />
                    <div>
                      <p className="text-sm text-white">⭐ Evento em destaque</p>
                      <p className="text-[11px] text-white/40">Aparece em posição especial</p>
                    </div>
                  </label>
                  <label className="flex items-center gap-2.5 cursor-pointer">
                    <input type="checkbox" className="rounded border-white/20"
                      checked={!!editing.is_important}
                      onChange={(e) => setEditing((ev) => ({ ...ev, is_important: e.target.checked }))} />
                    <div>
                      <p className="text-sm text-white">🚨 Marcar como importante</p>
                      <p className="text-[11px] text-white/40">Badge no dia no calendário</p>
                    </div>
                  </label>
                </div>
                {(editing.is_highlighted || editing.is_important) && (
                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="text-xs text-white/50">Rótulo de destaque</label>
                      <input
                        className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                        placeholder="Ex: 🎉 Aniversário FitMind"
                        value={editing.highlight_label || ""}
                        onChange={(e) => setEditing((ev) => ({ ...ev, highlight_label: e.target.value }))}
                      />
                    </div>
                    <div>
                      <label className="text-xs text-white/50 flex items-center gap-1"><Palette className="h-3 w-3" /> Cor de destaque</label>
                      <input
                        type="color"
                        className="mt-1 h-10 w-full rounded-xl border border-white/10 bg-transparent cursor-pointer"
                        value={editing.highlight_color || "#f59e0b"}
                        onChange={(e) => setEditing((ev) => ({ ...ev, highlight_color: e.target.value }))}
                      />
                    </div>
                  </div>
                )}
              </div>

              {/* Google Calendar */}
              <div className="rounded-xl p-4 space-y-3" style={{ backgroundColor: "#0F0F0F" }}>
                <p className="text-xs font-bold text-white/60 uppercase tracking-wider flex items-center gap-1.5">
                  <CalendarDays className="h-3.5 w-3.5 text-blue-400" /> Exportar para Google Agenda
                </p>
                <p className="text-[11px] text-white/40">Esses campos substituem o conteúdo padrão ao exportar. Deixe em branco para usar título/descrição/local do evento.</p>
                <div>
                  <label className="text-xs text-white/50">Título no Google Agenda</label>
                  <input
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                    placeholder="(padrão: usa o Título acima)"
                    value={editing.google_calendar_title || ""}
                    onChange={(e) => setEditing((ev) => ({ ...ev, google_calendar_title: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50">Descrição no Google Agenda</label>
                  <textarea
                    rows={2}
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary resize-none"
                    placeholder="(padrão: usa a Descrição acima)"
                    value={editing.google_calendar_description || ""}
                    onChange={(e) => setEditing((ev) => ({ ...ev, google_calendar_description: e.target.value }))}
                  />
                </div>
                <div>
                  <label className="text-xs text-white/50">Local no Google Agenda</label>
                  <input
                    className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                    placeholder="(padrão: usa o Local acima)"
                    value={editing.google_calendar_location || ""}
                    onChange={(e) => setEditing((ev) => ({ ...ev, google_calendar_location: e.target.value }))}
                  />
                </div>
              </div>

              {/* Status */}
              {editing.id && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20"
                    checked={editing.is_active !== false}
                    onChange={(e) => setEditing((ev) => ({ ...ev, is_active: e.target.checked }))} />
                  <span className="text-sm text-white/70">Evento ativo (visível para usuários)</span>
                </label>
              )}
            </div>

            {/* Footer do modal */}
            <div className="flex justify-end gap-3 p-5 border-t border-white/10">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10 transition">
                Cancelar
              </button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing.id ? "Salvar alterações" : "Criar evento"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ══════════════════════════════════════════════════════════════════════════════
// TAB: DIAS EM DESTAQUE
// ══════════════════════════════════════════════════════════════════════════════

function HighlightedDaysTab() {
  const [days, setDays] = useState<HighlightedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<HighlightedDay> | null>(null);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("fitmind_highlighted_days" as never)
      .select("*" as never)
      .order("date" as never, { ascending: true });
    if (error) toast.error(error.message);
    setDays((data as unknown as HighlightedDay[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.label?.trim()) { toast.error("Rótulo obrigatório"); return; }
    if (!editing.date) { toast.error("Data obrigatória"); return; }
    setSaving(true);
    try {
      const payload = {
        date: editing.date,
        label: editing.label.trim(),
        description: editing.description?.trim() || null,
        color: editing.color || "#f59e0b",
        icon: editing.icon || "star",
        is_active: editing.is_active !== false,
      };
      if (editing.id) {
        const { error } = await supabase.from("fitmind_highlighted_days" as never).update(payload as never).eq("id" as never, editing.id as never);
        if (error) throw error;
        toast.success("Dia atualizado!");
      } else {
        const { error } = await supabase.from("fitmind_highlighted_days" as never).insert(payload as never);
        if (error) throw error;
        toast.success("Dia em destaque criado!");
      }
      setEditing(null);
      load();
    } catch (e: any) {
      toast.error(e.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este dia em destaque?")) return;
    await supabase.from("fitmind_highlighted_days" as never).delete().eq("id" as never, id as never);
    toast.success("Excluído");
    load();
  };

  const ICON_OPTIONS = ["star", "heart", "trophy", "flag", "sparkles", "fire", "zap", "gift", "cake", "crown"];

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <p className="text-xs text-white/50">Marque datas importantes no calendário (ex: Dia do Coach, Aniversário FitMind) mesmo sem evento específico.</p>
        <button onClick={() => setEditing({ ...EMPTY_DAY })} className="flex items-center gap-2 px-4 py-2 rounded-lg bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition">
          <Plus className="h-4 w-4" /> Novo Dia
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-8"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
      ) : days.length === 0 ? (
        <div className="rounded-2xl p-8 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Star className="mx-auto h-8 w-8 text-white/20 mb-2" />
          <p className="text-sm text-white/40">Nenhum dia em destaque cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-2 sm:grid-cols-2">
          {days.map((d) => (
            <div key={d.id} className={`flex items-center gap-3 rounded-xl p-3 border border-white/5 ${!d.is_active ? "opacity-50" : ""}`}
              style={{ backgroundColor: "#1A1A1A", borderLeftColor: d.color || "#f59e0b", borderLeftWidth: 3 }}>
              <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl flex-none" style={{ backgroundColor: (d.color || "#f59e0b") + "20" }}>⭐</div>
              <div className="flex-1 min-w-0">
                <p className="text-sm font-bold text-white truncate">{d.label}</p>
                <p className="text-xs text-white/40">{new Date(d.date + "T12:00:00").toLocaleDateString("pt-BR", { day: "2-digit", month: "long", year: "numeric" })}</p>
                {d.description && <p className="text-[11px] text-white/40 truncate mt-0.5">{d.description}</p>}
              </div>
              <div className="flex gap-1 flex-none">
                <button onClick={() => setEditing({ ...d })} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50 hover:text-white transition"><Edit2 className="h-3.5 w-3.5" /></button>
                <button onClick={() => del(d.id)} className="p-1.5 rounded-lg hover:bg-red-500/20 text-white/40 hover:text-red-400 transition"><Trash2 className="h-3.5 w-3.5" /></button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Modal */}
      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="w-full max-w-md rounded-2xl" style={{ backgroundColor: "#111" }}>
            <div className="flex items-center justify-between p-5 border-b border-white/10">
              <h2 className="text-base font-bold text-white">{editing.id ? "Editar Dia" : "Novo Dia em Destaque"}</h2>
              <button onClick={() => setEditing(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60"><X className="h-4 w-4" /></button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Data *</label>
                <input type="date" className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white focus:outline-none focus:border-primary"
                  value={editing.date || ""}
                  onChange={(e) => setEditing((d) => ({ ...d, date: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Rótulo *</label>
                <input className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2.5 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary"
                  placeholder="Ex: 🏆 Dia do Coach FitMind"
                  value={editing.label || ""}
                  onChange={(e) => setEditing((d) => ({ ...d, label: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider">Descrição</label>
                <textarea rows={2} className="mt-1 w-full rounded-xl bg-white/5 border border-white/10 px-3 py-2 text-sm text-white placeholder-white/30 focus:outline-none focus:border-primary resize-none"
                  placeholder="Contexto adicional sobre este dia..."
                  value={editing.description || ""}
                  onChange={(e) => setEditing((d) => ({ ...d, description: e.target.value }))} />
              </div>
              <div>
                <label className="text-xs font-semibold text-white/60 uppercase tracking-wider flex items-center gap-1"><Palette className="h-3 w-3" /> Cor</label>
                <div className="mt-2 flex items-center gap-3">
                  <input type="color" className="h-9 w-14 rounded-lg border border-white/10 bg-transparent cursor-pointer"
                    value={editing.color || "#f59e0b"}
                    onChange={(e) => setEditing((d) => ({ ...d, color: e.target.value }))} />
                  <div className="flex gap-1.5 flex-wrap">
                    {["#E24B4A","#f59e0b","#34d399","#60a5fa","#a78bfa","#f472b6","#fb923c"].map((c) => (
                      <button key={c} onClick={() => setEditing((d) => ({ ...d, color: c }))}
                        className={`h-6 w-6 rounded-full border-2 transition ${editing.color === c ? "border-white" : "border-transparent"}`}
                        style={{ backgroundColor: c }} />
                    ))}
                  </div>
                </div>
              </div>
              {editing.id && (
                <label className="flex items-center gap-2.5 cursor-pointer">
                  <input type="checkbox" className="rounded border-white/20"
                    checked={editing.is_active !== false}
                    onChange={(e) => setEditing((d) => ({ ...d, is_active: e.target.checked }))} />
                  <span className="text-sm text-white/70">Dia ativo (visível no calendário)</span>
                </label>
              )}
            </div>
            <div className="flex justify-end gap-3 p-5 border-t border-white/10">
              <button onClick={() => setEditing(null)} className="px-4 py-2 rounded-xl bg-white/5 text-white/60 text-sm hover:bg-white/10 transition">Cancelar</button>
              <button onClick={save} disabled={saving} className="flex items-center gap-2 px-5 py-2 rounded-xl bg-primary text-white text-sm font-semibold hover:bg-primary/80 transition disabled:opacity-50">
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                {editing.id ? "Salvar" : "Criar"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Attendance Report Tab ──────────────────────────────────────────────────

type AttRow = { id: string; display_name: string; created_at: string; event_id: string; profile_id: string };
type EventLite = { id: string; title: string; starts_at: string };

function AttendanceReportTab() {
  const [events, setEvents] = useState<EventLite[]>([]);
  const [selectedEvent, setSelectedEvent] = useState<string>("");
  const [rows, setRows] = useState<AttRow[]>([]);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("fitmind_events")
        .select("id,title,starts_at")
        .order("starts_at", { ascending: false })
        .limit(200);
      const list = (data as EventLite[]) || [];
      setEvents(list);
      if (list.length && !selectedEvent) setSelectedEvent(list[0].id);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedEvent) { setRows([]); return; }
    setLoading(true);
    (async () => {
      const { data } = await supabase
        .from("event_attendances")
        .select("id,display_name,created_at,event_id,profile_id")
        .eq("event_id", selectedEvent)
        .order("created_at", { ascending: true });
      setRows((data as AttRow[]) || []);
      setLoading(false);
    })();
  }, [selectedEvent]);

  const exportCSV = () => {
    if (!rows.length) return;
    const ev = events.find((e) => e.id === selectedEvent);
    const header = "Nome,Data de presença\n";
    const body = rows.map((r) => `"${(r.display_name || "").replace(/"/g, '""')}","${new Date(r.created_at).toLocaleString("pt-BR")}"`).join("\n");
    const blob = new Blob([header + body], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `presencas_${(ev?.title || "evento").replace(/\W+/g, "_")}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3 flex-wrap">
        <select
          value={selectedEvent}
          onChange={(e) => setSelectedEvent(e.target.value)}
          className="rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white"
        >
          {events.length === 0 && <option value="">Nenhum evento</option>}
          {events.map((ev) => (
            <option key={ev.id} value={ev.id}>
              {ev.title} — {new Date(ev.starts_at).toLocaleDateString("pt-BR")}
            </option>
          ))}
        </select>
        <button
          onClick={exportCSV}
          disabled={!rows.length}
          className="rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          Exportar CSV
        </button>
        <span className="text-xs text-white/50 ml-auto">
          <Users className="inline h-3.5 w-3.5 mr-1" />
          {rows.length} {rows.length === 1 ? "presença" : "presenças"}
        </span>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/40" /></div>
      ) : rows.length === 0 ? (
        <div className="rounded-xl border border-white/10 p-8 text-center text-sm text-white/50">
          Nenhuma presença registrada para este evento.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-white/10">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="px-4 py-2 text-left">#</th>
                <th className="px-4 py-2 text-left">Nome</th>
                <th className="px-4 py-2 text-left">Marcado em</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-white/5">
              {rows.map((r, i) => (
                <tr key={r.id} className="text-white/80">
                  <td className="px-4 py-2 text-white/40">{i + 1}</td>
                  <td className="px-4 py-2">{r.display_name}</td>
                  <td className="px-4 py-2 text-white/50">{new Date(r.created_at).toLocaleString("pt-BR")}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
