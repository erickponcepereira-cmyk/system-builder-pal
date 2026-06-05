// ══════════════════════════════════════════════════════════════════════════════
// ARQUIVO: src/components/FitmindCalendar.tsx
// Calendário de eventos reutilizável — coach, aluno, parceiro, profissional
// ══════════════════════════════════════════════════════════════════════════════

import { useEffect, useState, useMemo } from "react";
import {
  ChevronLeft, ChevronRight, CalendarDays, MapPin, Clock, ExternalLink,
  Star, Zap, Sparkles, X, CalendarPlus, Tag, Users, Check, QrCode,
} from "lucide-react";
import { QRCodeSVG } from "qrcode.react";
import { useServerFn } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  TZ, tzDateKey, tzToday, tzCurrentYearMonth, ymdKey,
  tzStartOfMonth, shiftYearMonth, yearMonthLabel,
} from "@/lib/timezone";
import { getEventAttendees, type EnrichedAttendee } from "@/lib/fitmind-attendance.functions";
import {
  toggleMyRegistration, getMyRegistration, getMyRegisteredEventIds,
  getEventRegistrations, setRegistrationStatus, finalizeEventAttendance,
  type RegistrationRow,
} from "@/lib/fitmind-registrations.functions";
import { Heart, HeartOff, ClipboardCheck } from "lucide-react";


// ─── Types ──────────────────────────────────────────────────────────────────

type EventCategory = "aula" | "workshop" | "desafio" | "palestra" | "avaliacao" | "comemorativo" | "networking" | "outro";

interface FitmindEvent {
  id: string;
  title: string;
  subtitle: string | null;
  description: string | null;
  location: string | null;
  image_url: string | null;
  color: string | null;
  category: EventCategory;
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
  responsible_coach_id?: string | null;
  responsible_coach_name?: string | null;
  responsible_coach_whatsapp?: string | null;
  appointment_pay_url?: string | null;
  appointment_pending?: boolean;
}



interface HighlightedDay {
  id: string;
  date: string;
  label: string;
  description: string | null;
  color: string | null;
  icon: string | null;
}

// ─── Category meta ──────────────────────────────────────────────────────────

const CATEGORY_META: Record<EventCategory, { label: string; emoji: string }> = {
  aula:        { label: "Aula",         emoji: "🏋️" },
  workshop:    { label: "Workshop",     emoji: "🛠️" },
  desafio:     { label: "Desafio",      emoji: "⚡" },
  palestra:    { label: "Palestra",     emoji: "🎤" },
  avaliacao:   { label: "Avaliação",    emoji: "📊" },
  comemorativo:{ label: "Comemorativo", emoji: "🎉" },
  networking:  { label: "Networking",   emoji: "🤝" },
  outro:       { label: "Outro",        emoji: "📅" },
};

// ─── Google Calendar helper ──────────────────────────────────────────────────

function buildGoogleCalendarUrl(ev: FitmindEvent): string {
  const title = encodeURIComponent(ev.google_calendar_title || ev.title);
  const desc  = encodeURIComponent(ev.google_calendar_description || ev.description || "Evento FitMind Club — gratuito para toda a comunidade.");
  const loc   = encodeURIComponent(ev.google_calendar_location || ev.location || "");

  const fmt = (iso: string) => iso.replace(/[-:]/g, "").replace("T", "T").slice(0, 15) + "Z";

  let dates: string;
  if (ev.all_day) {
    const d = ev.starts_at.slice(0, 10).replace(/-/g, "");
    const endD = new Date(ev.ends_at);
    endD.setDate(endD.getDate() + 1);
    const endStr = endD.toISOString().slice(0, 10).replace(/-/g, "");
    dates = `${d}/${endStr}`;
  } else {
    dates = `${fmt(ev.starts_at)}/${fmt(ev.ends_at)}`;
  }

  return `https://calendar.google.com/calendar/render?action=TEMPLATE&text=${title}&dates=${dates}&details=${desc}&location=${loc}`;
}

// ─── Pessoal: eventos do desafio do aluno logado ─────────────────────────
async function loadMyChallengeEvents(from: Date, to: Date): Promise<FitmindEvent[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
    if (!profile) return [];
    const { data: student } = await supabase
      .from("students" as never).select("id").eq("profile_id" as never, profile.id).maybeSingle();
    if (!student) return [];

    const { data: enrolls } = await supabase
      .from("competition_enrollments" as never)
      .select(`
        id, initial_date, final_date,
        competition:competition_id ( month, year ),
        group:group_id ( group_number, initial_start_date, initial_end_date, final_weigh_in_date, award_date )
      `)
      .eq("student_id" as never, (student as any).id);

    if (!enrolls || !enrolls.length) return [];

    const MONTHS = ["","Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
    const fromKey = from.toISOString().slice(0, 10);
    const toKey = to.toISOString().slice(0, 10);
    const inRange = (d: string) => d >= fromKey && d < toKey;
    const mkISO = (d: string) => `${d}T00:00:00-04:00`;
    const mkEndISO = (d: string) => `${d}T23:59:00-04:00`;
    const out: FitmindEvent[] = [];

    for (const e of (enrolls as any[])) {
      const g = e.group;
      if (!g) continue;
      const compLabel = e.competition ? `${MONTHS[e.competition.month]} ${e.competition.year}` : "";
      const turmaTxt = `Turma ${g.group_number}${compLabel ? " · " + compLabel : ""}`;

      // Pesagem inicial — preferência: agendada; senão, todos os dias da janela
      if (e.initial_date && inRange(e.initial_date)) {
        out.push({
          id: `challenge-init-${e.id}`,
          title: `⚖️ Sua Pesagem Inicial`, subtitle: turmaTxt,
          description: "Pesagem inicial do Desafio FitMind agendada para você.",
          location: null, image_url: null, color: "#3b82f6",
          category: "desafio", tags: ["desafio"],
          starts_at: mkISO(e.initial_date), ends_at: mkEndISO(e.initial_date),
          all_day: true, is_highlighted: true, is_important: false,
          highlight_color: "#3b82f6", highlight_label: "Sua pesagem inicial",
          google_calendar_title: null, google_calendar_description: null, google_calendar_location: null,
        });
      } else if (g.initial_start_date && g.initial_end_date) {
        const start = new Date(g.initial_start_date + "T12:00:00");
        const end = new Date(g.initial_end_date + "T12:00:00");
        for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
          const dk = d.toISOString().slice(0, 10);
          if (!inRange(dk)) continue;
          out.push({
            id: `challenge-window-${e.id}-${dk}`,
            title: `📅 Semana da Pesagem Inicial`, subtitle: turmaTxt,
            description: `Agende sua pesagem inicial dentro desta semana (${g.initial_start_date} – ${g.initial_end_date}).`,
            location: null, image_url: null, color: "#3b82f6",
            category: "desafio", tags: ["desafio"],
            starts_at: mkISO(dk), ends_at: mkEndISO(dk),
            all_day: true, is_highlighted: false, is_important: false,
            highlight_color: "#3b82f6", highlight_label: null,
            google_calendar_title: null, google_calendar_description: null, google_calendar_location: null,
          });
        }
      }

      // Pesagem final
      const finalDay = e.final_date || g.final_weigh_in_date;
      if (finalDay && inRange(finalDay)) {
        out.push({
          id: `challenge-final-${e.id}`,
          title: `⚖️ Pesagem Final do Desafio`, subtitle: turmaTxt,
          description: "Dia da pesagem final do Desafio FitMind. Não perca!",
          location: null, image_url: null, color: "#ef4444",
          category: "desafio", tags: ["desafio"],
          starts_at: mkISO(finalDay), ends_at: mkEndISO(finalDay),
          all_day: true, is_highlighted: true, is_important: true,
          highlight_color: "#ef4444", highlight_label: "Pesagem final",
          google_calendar_title: null, google_calendar_description: null, google_calendar_location: null,
        });
      }

      // Premiação
      if (g.award_date && inRange(g.award_date)) {
        out.push({
          id: `challenge-award-${e.id}`,
          title: `🏆 Premiação do Desafio`, subtitle: turmaTxt,
          description: "Dia da premiação do Desafio FitMind.",
          location: null, image_url: null, color: "#f59e0b",
          category: "desafio", tags: ["desafio", "premiação"],
          starts_at: mkISO(g.award_date), ends_at: mkEndISO(g.award_date),
          all_day: true, is_highlighted: true, is_important: false,
          highlight_color: "#f59e0b", highlight_label: "Premiação",
          google_calendar_title: null, google_calendar_description: null, google_calendar_location: null,
        });
      }
    }
    return out;
  } catch (e) {
    console.warn("loadMyChallengeEvents failed", e);
    return [];
  }
}

// ─── Pessoal: agendamentos com profissionais ─────────────────────────────

async function loadMyAppointments(from: Date, to: Date): Promise<FitmindEvent[]> {
  try {
    const { data: auth } = await supabase.auth.getUser();
    if (!auth.user) return [];
    const { data: profile } = await supabase
      .from("profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
    if (!profile) return [];
    const { data: student } = await supabase
      .from("students" as never).select("id").eq("profile_id" as never, profile.id).maybeSingle();
    if (!student) return [];

    const { data: appts } = await supabase
      .from("professional_appointments" as never)
      .select(
        "id,starts_at,ends_at,status,order_id,professional_products(name),professional:coaches!professional_appointments_professional_coach_id_fkey(profiles!coaches_profile_id_fkey(name)),order:partner_product_orders(order_number,status)" as never,
      )
      .eq("student_id" as never, (student as any).id)
      .neq("status" as never, "cancelled" as never)
      .gte("starts_at" as never, from.toISOString() as never)
      .lt("starts_at" as never, to.toISOString() as never);

    const paidStatuses = new Set(["paid", "approved", "completed"]);
    return ((appts as any[]) || []).map((a) => {
      const orderStatus: string | null = a.order?.status || null;
      const orderNumber: string | null = a.order?.order_number || null;
      const pending = !!a.order_id && (!orderStatus || !paidStatuses.has(orderStatus));
      const profName = a.professional?.profiles?.name || "profissional";
      const prodName = a.professional_products?.name || "Consulta";

      const color = pending ? "#f59e0b" : "#22c55e";
      return {
        id: `appt-${a.id}`,
        title: pending ? `⏳ ${prodName} (pagamento pendente)` : `🩺 ${prodName}`,
        subtitle: `com ${profName}`,
        description: pending
          ? "Sua pré-reserva está aguardando pagamento. Toque em Pagar agora para concluir."
          : "Consulta confirmada.",
        location: null,
        image_url: null,
        color,
        category: "avaliacao",
        tags: pending ? ["pagamento pendente"] : ["consulta"],
        starts_at: a.starts_at,
        ends_at: a.ends_at,
        all_day: false,
        is_highlighted: pending,
        is_important: pending,
        highlight_color: color,
        highlight_label: pending ? "Pagamento pendente" : null,
        google_calendar_title: prodName,
        google_calendar_description: `Consulta com ${profName}`,
        google_calendar_location: null,
        appointment_pay_url: pending && orderNumber ? `/pay/${orderNumber}` : null,
        appointment_pending: pending,
      } satisfies FitmindEvent;
    });
  } catch (e) {
    console.warn("loadMyAppointments failed", e);
    return [];
  }
}

// ─── Main component ──────────────────────────────────────────────────────────

interface FitmindCalendarProps {
  /** Modo compacto (sidebar / widget). Padrão: false (tela inteira) */
  compact?: boolean;
  /** Mostra apenas eventos em destaque no widget compacto */
  onlyHighlighted?: boolean;
}

export function FitmindCalendar({ compact = false, onlyHighlighted = false }: FitmindCalendarProps) {

  const [events, setEvents] = useState<FitmindEvent[]>([]);
  const [highlightedDays, setHighlightedDays] = useState<HighlightedDay[]>([]);
  const [loading, setLoading] = useState(true);
  const [todayKey] = useState(() => tzToday());
  const [currentYM, setCurrentYM] = useState(() => {
    const { year, month } = tzCurrentYearMonth();
    return `${year}-${String(month + 1).padStart(2, "0")}`;
  });
  const [selectedDayKey, setSelectedDayKey] = useState<string | null>(null);
  const [detail, setDetail] = useState<FitmindEvent | null>(null);
  const [viewMode, setViewMode] = useState<"calendar" | "list">("calendar");
  const [canCreate, setCanCreate] = useState(false);
  const [showCreate, setShowCreate] = useState(false);
  const [reloadKey, setReloadKey] = useState(0);
  const [onlyMine, setOnlyMine] = useState(false);
  const [myRegisteredIds, setMyRegisteredIds] = useState<Set<string>>(new Set());
  const fetchMyRegisteredIds = useServerFn(getMyRegisteredEventIds);

  // Load my registered event IDs for the filter
  useEffect(() => {
    let mounted = true;
    fetchMyRegisteredIds().then((res) => {
      if (mounted) setMyRegisteredIds(new Set(res.eventIds));
    }).catch(() => {});
    return () => { mounted = false; };
  }, [fetchMyRegisteredIds, reloadKey]);

  // Check if current user can create FitMind events (admin or coach with permission)
  useEffect(() => {
    let mounted = true;
    (async () => {
      const { data: auth } = await supabase.auth.getUser();
      if (!auth.user) return;
      const { data: adminCheck } = await supabase.rpc("is_admin" as never, { _user_id: auth.user.id } as never);
      if (mounted && adminCheck === true) { setCanCreate(true); return; }
      const { data: prof } = await supabase
        .from("profiles").select("id").eq("user_id", auth.user.id).maybeSingle();
      if (!mounted || !prof) return;
      const { data: coach } = await supabase
        .from("coaches")
        .select("id")
        .eq("profile_id", (prof as { id: string }).id)
        .maybeSingle();
      if (!mounted || !coach) return;
      const { data: badge } = await supabase
        .from("coach_badges")
        .select("badge_key")
        .eq("coach_id", (coach as { id: string }).id)
        .eq("badge_key", "event_creator" as never)
        .maybeSingle();
      if (mounted && badge) setCanCreate(true);
    })();
    return () => { mounted = false; };
  }, []);



  const [yearStr, monthStr] = currentYM.split("-");
  const year = Number(yearStr);
  const month = Number(monthStr) - 1;

  // ── Load events for the visible month range (Cuiabá timezone) ───────────
  useEffect(() => {
    const from = tzStartOfMonth(currentYM);
    const to   = tzStartOfMonth(shiftYearMonth(currentYM, 1));

    setLoading(true);
    Promise.all([
      supabase
        .from("fitmind_events" as never)
        .select("id,title,subtitle,description,location,image_url,color,category,tags,starts_at,ends_at,all_day,is_highlighted,is_important,highlight_color,highlight_label,google_calendar_title,google_calendar_description,google_calendar_location,responsible_coach_id,responsible_coach:responsible_coach_id(profiles:profile_id(name,phone))" as never)
        .eq("is_active" as never, true as never)
        .gte("starts_at" as never, from.toISOString() as never)
        .lt("starts_at" as never, to.toISOString() as never)
        .order("starts_at" as never, { ascending: true }),
      supabase
        .from("fitmind_highlighted_days" as never)
        .select("id,date,label,description,color,icon" as never)
        .eq("is_active" as never, true as never)
        .gte("date" as never, tzDateKey(from) as never)
        .lt("date" as never, tzDateKey(to) as never),
      loadMyChallengeEvents(from, to),
      loadMyAppointments(from, to),
    ]).then(([evRes, dayRes, challengeEvents, appointmentEvents]) => {
      if (evRes.error)  toast.error(evRes.error.message);
      if (dayRes.error) toast.error(dayRes.error.message);
      const base = ((evRes.data as any[]) || []).map((r) => ({
        ...r,
        responsible_coach_name: r.responsible_coach?.profiles?.name || null,
        responsible_coach_whatsapp: r.responsible_coach?.profiles?.phone || null,
      })) as FitmindEvent[];
      setEvents([...base, ...challengeEvents, ...appointmentEvents]);
      setHighlightedDays((dayRes.data as unknown as HighlightedDay[]) || []);
      setLoading(false);
    });
  }, [currentYM, reloadKey]);


  // ── Calendar grid ────────────────────────────────────────────────────────

  const { gridDays, monthLabel } = useMemo(() => {
    const firstWeekday = new Date(year, month, 1).getDay(); // 0 = Sun
    const daysInMonth  = new Date(year, month + 1, 0).getDate();
    const label = yearMonthLabel(currentYM);

    const prefix = Array.from({ length: firstWeekday }, () => null as number | null);
    const days   = Array.from({ length: daysInMonth }, (_, i) => i + 1);
    return { gridDays: [...prefix, ...days], monthLabel: label };
  }, [currentYM, year, month]);

  // ── Apply "Meus eventos" filter (only to FitMind events; keeps personal items) ──
  const displayEvents = useMemo(() => {
    if (!onlyMine) return events;
    return events.filter((ev) =>
      ev.id.startsWith("appt-") || ev.id.startsWith("challenge-") || myRegisteredIds.has(ev.id),
    );
  }, [events, onlyMine, myRegisteredIds]);

  // ── Events indexed by date string (Cuiabá date) ──────────────────────────

  const eventsByDate = useMemo(() => {
    const map = new Map<string, FitmindEvent[]>();
    for (const ev of displayEvents) {
      const key = tzDateKey(ev.starts_at);
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(ev);
    }
    return map;
  }, [displayEvents]);

  const highlightByDate = useMemo(() => {
    const map = new Map<string, HighlightedDay>();
    for (const d of highlightedDays) map.set(d.date, d);
    return map;
  }, [highlightedDays]);

  // ── Day events panel ──────────────────────────────────────────────────────

  const selectedDayEvents = selectedDayKey ? (eventsByDate.get(selectedDayKey) || []) : [];
  const selectedDayHighlight = selectedDayKey ? highlightByDate.get(selectedDayKey) : undefined;

  // ── Highlighted/upcoming events list (for compact mode) ──────────────────

  const upcomingEvents = useMemo(() => {
    return displayEvents
      .filter((ev) => tzDateKey(ev.starts_at) >= todayKey && (!onlyHighlighted || ev.is_highlighted || ev.is_important))
      .slice(0, 5);
  }, [displayEvents, todayKey, onlyHighlighted]);

  // ─── Compact widget mode ─────────────────────────────────────────────────
  if (compact) {
    return (
      <div className="rounded-2xl p-4 space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between">
          <h3 className="text-sm font-bold text-white flex items-center gap-2">
            <CalendarDays className="h-4 w-4 text-primary" /> Agenda FitMind
          </h3>
          <span className="text-[10px] font-bold uppercase text-white/30 tracking-wider capitalize">{monthLabel}</span>
        </div>

        {loading ? (
          <div className="py-4 text-center text-xs text-white/40">Carregando...</div>
        ) : upcomingEvents.length === 0 ? (
          <p className="text-xs text-white/40 py-2">Nenhum evento próximo este mês.</p>
        ) : (
          <div className="space-y-2">
            {upcomingEvents.map((ev) => {
              const cat = CATEGORY_META[ev.category] || CATEGORY_META.outro;
              const evColor = ev.color || "#E24B4A";
              const dtStart = new Date(ev.starts_at);
              return (
                <button
                  key={ev.id}
                  onClick={() => setDetail(ev)}
                  className="w-full flex items-center gap-3 rounded-xl p-3 text-left hover:bg-white/5 transition border border-white/5"
                  style={{ borderLeftColor: evColor, borderLeftWidth: 3 }}>
                  <div className="flex-none text-center min-w-8">
                    <p className="text-[10px] text-white/40 uppercase">{dtStart.toLocaleDateString("pt-BR", { month: "short" })}</p>
                    <p className="text-lg font-bold text-white leading-none">{dtStart.getDate()}</p>
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-1 mb-0.5">
                      {ev.is_highlighted && <Star className="h-3 w-3 text-yellow-400 flex-none" />}
                      {ev.is_important   && <Zap  className="h-3 w-3 text-red-400 flex-none"    />}
                      <span className="text-[10px] font-bold" style={{ color: evColor }}>{cat.emoji} {cat.label}</span>
                    </div>
                    <p className="text-xs font-semibold text-white truncate">{ev.title}</p>
                    {!ev.all_day && (
                      <p className="text-[10px] text-white/40">
                        {dtStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                      </p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}

        {detail && <EventDetailModal event={detail} onClose={() => setDetail(null)} />}
      </div>
    );
  }

  // ─── Full calendar mode ──────────────────────────────────────────────────
  const WEEKDAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];

  return (
    <div className="flex flex-col gap-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-bold text-white flex items-center gap-2">
            <CalendarDays className="h-5 w-5 text-primary" /> Calendário FitMind
          </h2>
          <p className="text-xs text-white/45 mt-0.5">Eventos gratuitos para toda a comunidade</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <div className="flex rounded-xl bg-white/5 p-0.5">
            <button onClick={() => setViewMode("calendar")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === "calendar" ? "bg-primary text-white" : "text-white/60"}`}>
              Calendário
            </button>
            <button onClick={() => setViewMode("list")}
              className={`px-3 py-1.5 rounded-lg text-xs font-bold transition ${viewMode === "list" ? "bg-primary text-white" : "text-white/60"}`}>
              Lista
            </button>
          </div>
          <button
            onClick={() => setOnlyMine((v) => !v)}
            className={`px-3 py-1.5 rounded-xl text-xs font-bold transition inline-flex items-center gap-1.5 ${onlyMine ? "bg-primary text-white" : "bg-white/5 text-white/70 hover:bg-white/10"}`}
            title="Mostrar apenas eventos em que você se inscreveu">
            <Heart className={`h-3.5 w-3.5 ${onlyMine ? "fill-current" : ""}`} /> Meus eventos
          </button>
          <button onClick={() => setCurrentYM(shiftYearMonth(currentYM, -1))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <span className="text-sm font-bold text-white capitalize min-w-36 text-center">{monthLabel}</span>
          <button onClick={() => setCurrentYM(shiftYearMonth(currentYM, 1))}
            className="p-2 rounded-xl bg-white/5 hover:bg-white/10 transition text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
          {canCreate && (
            <button
              onClick={() => setShowCreate(true)}
              className="ml-1 flex items-center gap-1.5 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-white hover:opacity-90 transition">
              <CalendarPlus className="h-4 w-4" /> Criar evento
            </button>
          )}

        </div>

      </div>

      {/* Eventos em destaque (banner) */}
      {displayEvents.filter((ev) => ev.is_highlighted).length > 0 && (
        <div className="space-y-2">
          <p className="text-[11px] font-bold uppercase tracking-wider text-white/40 flex items-center gap-1.5">
            <Sparkles className="h-3.5 w-3.5 text-yellow-400" /> Destaques do mês
          </p>
          <div className="grid gap-2 grid-cols-1">
            {displayEvents.filter((ev) => ev.is_highlighted).map((ev) => {
              const cat = CATEGORY_META[ev.category] || CATEGORY_META.outro;
              const evColor = ev.color || "#E24B4A";
              const dtStart = new Date(ev.starts_at);
              return (
                <button
                  key={ev.id}
                  onClick={() => setDetail(ev)}
                  className="flex items-center gap-3 rounded-2xl p-4 text-left hover:scale-[1.02] transition-all"
                  style={{
                    background: `linear-gradient(135deg, ${evColor}22, ${evColor}10)`,
                    border: `1px solid ${evColor}40`,
                  }}>
                  <div className="flex h-12 w-12 items-center justify-center rounded-xl text-2xl flex-none" style={{ backgroundColor: evColor + "30" }}>
                    {cat.emoji}
                  </div>
                  <div className="flex-1 min-w-0">
                    {ev.highlight_label && (
                      <p className="text-[10px] font-bold mb-0.5" style={{ color: ev.highlight_color || evColor }}>
                        {ev.highlight_label}
                      </p>
                    )}
                    <p className="text-sm font-bold text-white break-words">{ev.title}</p>

                    <p className="text-[11px] text-white/50">
                      {dtStart.toLocaleDateString("pt-BR", { day: "2-digit", month: "short" })}
                      {!ev.all_day && ` · ${dtStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
                    </p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>
      )}

      {viewMode === "calendar" ? (
        <>
      {/* Grid do calendário */}
      <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        {/* Cabeçalho dos dias da semana */}
        <div className="grid grid-cols-7 border-b border-white/5">
          {WEEKDAYS.map((wd) => (
            <div key={wd} className="py-2 text-center text-[11px] font-bold text-white/30 uppercase tracking-wider">
              {wd}
            </div>
          ))}
        </div>

        {/* Células */}
        {loading ? (
          <div className="py-16 text-center text-sm text-white/40">Carregando eventos...</div>
        ) : (
          <div className="grid grid-cols-7">
            {gridDays.map((day, i) => {

              if (!day) return <div key={`empty-${i}`} className="h-20 sm:h-24 border-b border-r border-white/5 bg-black/20" />;

              const dateKey     = ymdKey(year, month, day);
              const isToday     = dateKey === todayKey;
              const isSelected  = dateKey === selectedDayKey;
              const dayEvents   = eventsByDate.get(dateKey) || [];
              const dayHighlight= highlightByDate.get(dateKey);
              const hasImportant= dayEvents.some((ev) => ev.is_important);

              return (
                <button
                  key={dateKey}
                  onClick={() => setSelectedDayKey(isSelected ? null : dateKey)}
                  className={`relative h-20 sm:h-24 p-1 sm:p-2 text-left border-b border-r border-white/5 transition hover:bg-white/5 ${
                    isSelected ? "bg-primary/10 ring-1 ring-inset ring-primary/30" : ""
                  }`}
                  style={dayHighlight ? { backgroundColor: (dayHighlight.color || "#f59e0b") + "15" } : undefined}
                >
                  {/* Número do dia */}
                  <div className={`mb-1 flex h-6 w-6 items-center justify-center rounded-full text-xs font-bold ${
                    isToday
                      ? "bg-primary text-white"
                      : isSelected
                        ? "bg-primary/30 text-primary"
                        : "text-white/70"
                  }`}>
                    {day}
                  </div>


                  {/* Badge "Importante" */}
                  {hasImportant && (
                    <div className="absolute top-1 right-1 h-2 w-2 rounded-full bg-red-500 ring-1 ring-black" />
                  )}

                  {/* Rótulo do dia em destaque */}
                  {dayHighlight && (
                    <p className="text-[9px] font-bold leading-tight truncate mb-0.5"
                      style={{ color: dayHighlight.color || "#f59e0b" }}>
                      {dayHighlight.label}
                    </p>
                  )}

                  {/* Pílulas de eventos */}
                  <div className="space-y-0.5">
                    {dayEvents.slice(0, 3).map((ev) => (
                      <div
                        key={ev.id}
                        className="truncate rounded-sm px-1 py-0.5 text-[9px] font-semibold text-white leading-tight"
                        style={{ backgroundColor: (ev.color || "#E24B4A") + "CC" }}
                        title={ev.title}>
                        {ev.title}
                      </div>
                    ))}
                    {dayEvents.length > 3 && (
                      <p className="text-[9px] text-white/40 px-1">+{dayEvents.length - 3} mais</p>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        )}
      </div>

      {/* Painel do dia selecionado */}
      {selectedDayKey && (
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-4">
            <div>
              <p className="text-xs text-white/40 uppercase tracking-wider">Eventos do dia</p>
              <h3 className="text-base font-bold text-white capitalize">
                {new Date(`${selectedDayKey}T12:00:00${"-04:00"}`).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", timeZone: TZ })}
              </h3>
            </div>
            <button onClick={() => setSelectedDayKey(null)} className="p-1.5 rounded-lg hover:bg-white/10 text-white/50"><X className="h-4 w-4" /></button>
          </div>


          {/* Destaque do dia */}
          {selectedDayHighlight && (
            <div className="mb-3 flex items-center gap-3 rounded-xl p-3" style={{ backgroundColor: (selectedDayHighlight.color || "#f59e0b") + "20", border: `1px solid ${selectedDayHighlight.color || "#f59e0b"}40` }}>
              <span className="text-xl">⭐</span>
              <div>
                <p className="text-sm font-bold" style={{ color: selectedDayHighlight.color || "#f59e0b" }}>{selectedDayHighlight.label}</p>
                {selectedDayHighlight.description && <p className="text-xs text-white/50 mt-0.5">{selectedDayHighlight.description}</p>}
              </div>
            </div>
          )}

          {selectedDayEvents.length === 0 ? (
            <p className="text-sm text-white/40 py-4 text-center">Sem eventos neste dia.</p>
          ) : (
            <div className="space-y-3">
              {selectedDayEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} onClick={() => setDetail(ev)} />
              ))}
            </div>
          )}
        </div>
      )}
        </>
      ) : (
        <EventListView
          events={displayEvents}
          year={year}
          month={month}
          loading={loading}
          onSelect={(ev) => setDetail(ev)}
        />
      )}

      {/* Modal de detalhes */}
      {detail && <EventDetailModal event={detail} onClose={() => setDetail(null)} />}
      {showCreate && (
        <CreateEventModal
          onClose={() => setShowCreate(false)}
          onCreated={() => { setShowCreate(false); setReloadKey((k) => k + 1); }}
        />
      )}
    </div>
  );
}

// ─── Event List View (alternative to calendar grid) ─────────────────────────

function EventListView({
  events,
  year,
  month,
  loading,
  onSelect,
}: {
  events: FitmindEvent[];
  year: number;
  month: number;
  loading: boolean;
  onSelect: (ev: FitmindEvent) => void;
}) {
  const monthEvents = events
    .filter((ev) => {
      const d = new Date(ev.starts_at);
      return d.getFullYear() === year && d.getMonth() === month;
    })
    .sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());

  const grouped = new Map<string, FitmindEvent[]>();
  for (const ev of monthEvents) {
    const d = new Date(ev.starts_at);
    const key = ymdKey(d.getFullYear(), d.getMonth(), d.getDate());
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ev);
  }

  if (loading) {
    return (
      <div className="rounded-2xl py-16 text-center text-sm text-white/40" style={{ backgroundColor: "#1A1A1A" }}>
        Carregando eventos...
      </div>
    );
  }

  if (monthEvents.length === 0) {
    return (
      <div className="rounded-2xl py-16 text-center text-sm text-white/40" style={{ backgroundColor: "#1A1A1A" }}>
        Nenhum evento neste mês.
      </div>
    );
  }

  const todayKey = ymdKey(new Date().getFullYear(), new Date().getMonth(), new Date().getDate());

  return (
    <div className="space-y-4">
      {Array.from(grouped.entries()).map(([dateKey, dayEvents]) => {
        const d = new Date(`${dateKey}T12:00:00-04:00`);
        const isToday = dateKey === todayKey;
        return (
          <div key={dateKey} className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center gap-3 px-4 py-3 border-b border-white/5">
              <div className={`flex h-12 w-12 flex-col items-center justify-center rounded-xl flex-none ${isToday ? "bg-primary text-white" : "bg-white/5 text-white/80"}`}>
                <span className="text-[10px] font-bold uppercase leading-none">{d.toLocaleDateString("pt-BR", { month: "short", timeZone: TZ }).replace(".", "")}</span>
                <span className="text-lg font-bold leading-none mt-0.5">{d.getDate()}</span>
              </div>
              <div>
                <p className="text-sm font-bold text-white capitalize">
                  {d.toLocaleDateString("pt-BR", { weekday: "long", timeZone: TZ })}
                </p>
                <p className="text-[11px] text-white/40">
                  {dayEvents.length} {dayEvents.length === 1 ? "evento" : "eventos"}
                </p>
              </div>
              {isToday && (
                <span className="ml-auto text-[10px] font-bold uppercase tracking-wider px-2 py-1 rounded-full bg-primary/20 text-primary">
                  Hoje
                </span>
              )}
            </div>
            <div className="p-3 space-y-2">
              {dayEvents.map((ev) => (
                <EventCard key={ev.id} event={ev} onClick={() => onSelect(ev)} />
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ─── Event Card (used in day panel) ─────────────────────────────────────────


function EventCard({ event: ev, onClick }: { event: FitmindEvent; onClick: () => void }) {
  const cat = CATEGORY_META[ev.category] || CATEGORY_META.outro;
  const evColor = ev.color || "#E24B4A";
  const dtStart = new Date(ev.starts_at);
  const dtEnd   = new Date(ev.ends_at);

  return (
    <button
      onClick={onClick}
      className="w-full text-left flex items-start gap-3 rounded-xl p-3 hover:bg-white/5 transition border border-white/5"
      style={{ borderLeftColor: evColor, borderLeftWidth: 3 }}>
      <div className="flex h-10 w-10 items-center justify-center rounded-xl text-xl flex-none" style={{ backgroundColor: evColor + "25" }}>
        {cat.emoji}
      </div>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5 mb-0.5">
          <span className="text-[10px] font-bold" style={{ color: evColor }}>{cat.label}</span>
          {ev.is_highlighted && <Star className="h-3 w-3 text-yellow-400 flex-none" />}
          {ev.is_important   && <Zap  className="h-3 w-3 text-red-400 flex-none" />}
        </div>
        <p className="text-sm font-bold text-white truncate">{ev.title}</p>
        {ev.subtitle && <p className="text-xs text-white/50 truncate">{ev.subtitle}</p>}
        <p className="text-[11px] text-white/40 mt-1 flex items-center gap-2">
          <Clock className="h-3 w-3 flex-none" />
          {ev.all_day ? "Dia inteiro" : `${dtStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} – ${dtEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}`}
          {ev.location && <><MapPin className="h-3 w-3 flex-none ml-1" /><span className="truncate">{ev.location}</span></>}
        </p>
      </div>
    </button>
  );
}

// ─── Event Detail Modal ──────────────────────────────────────────────────────

function EventDetailModal({ event: ev, onClose }: { event: FitmindEvent; onClose: () => void }) {
  const cat = CATEGORY_META[ev.category] || CATEGORY_META.outro;
  const evColor = ev.color || "#E24B4A";
  const dtStart = new Date(ev.starts_at);
  const dtEnd   = new Date(ev.ends_at);
  const gcUrl = buildGoogleCalendarUrl(ev);

  return (
    <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/80 p-4">
      <div className="w-full max-w-md rounded-2xl overflow-hidden" style={{ backgroundColor: "#111" }}>
        {/* Banner do evento */}
        <div className="relative p-6 pb-4" style={{ background: `linear-gradient(135deg, ${evColor}30, ${evColor}10)` }}>
          <button onClick={onClose} className="absolute top-4 right-4 p-1.5 rounded-lg bg-black/30 text-white/60 hover:text-white hover:bg-black/50 transition">
            <X className="h-4 w-4" />
          </button>
          <div className="flex h-14 w-14 items-center justify-center rounded-2xl text-3xl mb-3" style={{ backgroundColor: evColor + "30" }}>
            {cat.emoji}
          </div>
          <div className="flex items-center gap-2 mb-1">
            <span className="text-[11px] font-bold px-2 py-0.5 rounded-full" style={{ backgroundColor: evColor + "30", color: evColor }}>
              {cat.label}
            </span>
            {ev.is_highlighted && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-yellow-500/20 text-yellow-400">⭐ Destaque</span>}
            {ev.is_important   && <span className="text-[11px] font-bold px-2 py-0.5 rounded-full bg-red-500/20 text-red-400">🚨 Importante</span>}
          </div>
          <h2 className="text-lg font-bold text-white leading-snug">{ev.title}</h2>
          {ev.subtitle && <p className="text-sm text-white/60 mt-0.5">{ev.subtitle}</p>}
          {ev.highlight_label && (
            <p className="text-xs font-bold mt-2" style={{ color: ev.highlight_color || evColor }}>{ev.highlight_label}</p>
          )}
        </div>

        {/* Detalhes */}
        <div className="p-5 space-y-3">
          {/* Data e hora */}
          <div className="flex items-start gap-3 text-sm">
            <Clock className="h-4 w-4 text-white/40 mt-0.5 flex-none" />
            <div>
              <p className="text-white font-semibold">
                {dtStart.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}
              </p>
              {!ev.all_day && (
                <p className="text-white/50 text-xs mt-0.5">
                  {dtStart.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })} até {dtEnd.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                </p>
              )}
              {ev.all_day && <p className="text-white/50 text-xs mt-0.5">Evento de dia inteiro</p>}
            </div>
          </div>

          {/* Local */}
          {ev.location && (
            <div className="flex items-start gap-3 text-sm">
              <MapPin className="h-4 w-4 text-white/40 mt-0.5 flex-none" />
              <p className="text-white/80 break-all">{ev.location}</p>
            </div>
          )}

          {/* Descrição */}
          {ev.description && (
            <div className="rounded-xl p-3 text-sm text-white/70 leading-relaxed" style={{ backgroundColor: "#1A1A1A" }}>
              {ev.description}
            </div>
          )}

          {/* Tags */}
          {(ev.tags || []).length > 0 && (
            <div className="flex items-center gap-2 flex-wrap">
              <Tag className="h-3.5 w-3.5 text-white/30" />
              {(ev.tags || []).map((t) => (
                <span key={t} className="text-[11px] rounded-full bg-white/8 px-2 py-0.5 text-white/50">#{t}</span>
              ))}
            </div>
          )}

          {/* CTA: Pagar agora (pré-reserva pendente) */}
          {ev.appointment_pay_url && (
            <a
              href={ev.appointment_pay_url}
              className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90"
              style={{ backgroundColor: "#f59e0b" }}>
              Pagar agora e confirmar reserva
              <ExternalLink className="h-3.5 w-3.5 opacity-70" />
            </a>
          )}

          {/* Coach responsável + WhatsApp */}
          {ev.responsible_coach_name && (
            <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
              <p className="text-[10px] font-bold uppercase tracking-wider text-white/40 mb-1">Coach responsável</p>
              <p className="text-sm font-semibold text-white">{ev.responsible_coach_name}</p>
              {ev.responsible_coach_whatsapp && (
                <a
                  href={`https://wa.me/${ev.responsible_coach_whatsapp.replace(/\D/g, "")}`}
                  target="_blank" rel="noopener noreferrer"
                  className="mt-2 inline-flex items-center gap-1.5 rounded-lg bg-emerald-500/20 px-3 py-1.5 text-xs font-bold text-emerald-300 hover:bg-emerald-500/30 transition">
                  💬 Falar no WhatsApp
                </a>
              )}
            </div>
          )}

          {/* Presença (somente eventos FitMind) */}
          {!ev.id.startsWith("appt-") && !ev.id.startsWith("challenge-") && (
            <EventAttendanceBlock eventId={ev.id} color={evColor} responsibleCoachId={ev.responsible_coach_id ?? null} />
          )}


          {/* CTA: Adicionar ao Google Agenda */}
          <a
            href={gcUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-sm font-bold text-white transition hover:opacity-90"
            style={{ backgroundColor: evColor }}
            onClick={() => toast.success("Abrindo Google Agenda...")}>
            <CalendarPlus className="h-4 w-4" />
            Adicionar ao Google Agenda
            <ExternalLink className="h-3.5 w-3.5 opacity-60" />
          </a>

        </div>
      </div>
    </div>
  );
}

// ─── Attendance ─────────────────────────────────────────────────────────────

function EventAttendanceBlock({ eventId, color, responsibleCoachId }: { eventId: string; color: string; responsibleCoachId: string | null }) {
  const [attendees, setAttendees] = useState<EnrichedAttendee[]>([]);
  const [myProfileId, setMyProfileId] = useState<string | null>(null);
  const [showList, setShowList] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [showRoster, setShowRoster] = useState(false);
  const [loading, setLoading] = useState(false);
  const [canManage, setCanManage] = useState(false);
  const [myRegStatus, setMyRegStatus] = useState<"registered" | "attended" | "no_show" | null>(null);
  const [registrations, setRegistrations] = useState<RegistrationRow[]>([]);
  const fetchAttendees = useServerFn(getEventAttendees);
  const callToggleReg = useServerFn(toggleMyRegistration);
  const callGetMyReg = useServerFn(getMyRegistration);
  const callGetRegs = useServerFn(getEventRegistrations);
  const callSetRegStatus = useServerFn(setRegistrationStatus);
  const callFinalize = useServerFn(finalizeEventAttendance);

  const reload = async () => {
    try {
      const data = await fetchAttendees({ data: { eventId } });
      setAttendees(data);
    } catch {
      setAttendees([]);
    }
  };

  const reloadRegs = async () => {
    try {
      const r = await callGetRegs({ data: { eventId } });
      setRegistrations(r);
    } catch {
      setRegistrations([]);
    }
  };

  useEffect(() => {
    (async () => {
      await reload();
      try {
        const r = await callGetMyReg({ data: { eventId } });
        setMyRegStatus(r.status);
      } catch { /* noop */ }
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;
      const { data: profile } = await supabase
        .from("profiles").select("id").eq("user_id", userData.user.id).maybeSingle();
      if (!profile) return;
      setMyProfileId(profile.id);

      const { data: adminCheck } = await supabase.rpc("is_admin" as never, { _user_id: userData.user.id } as never);
      if (adminCheck === true) { setCanManage(true); return; }
      const { data: coach } = await supabase
        .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
      if (!coach) return;
      const coachId = (coach as { id: string }).id;
      if (responsibleCoachId && coachId === responsibleCoachId) { setCanManage(true); return; }
      const { data: badge } = await supabase
        .from("coach_badges")
        .select("badge_key")
        .eq("coach_id", coachId)
        .eq("badge_key", "event_creator" as never)
        .maybeSingle();
      if (badge) setCanManage(true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [eventId, responsibleCoachId]);

  useEffect(() => {
    if (showRoster && canManage) reloadRegs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [showRoster, canManage, eventId]);

  const mine = attendees.find((a) => a.profile_id === myProfileId);

  const toggleQueroIr = async () => {
    setLoading(true);
    try {
      const r = await callToggleReg({ data: { eventId } });
      setMyRegStatus(r.registered ? "registered" : null);
      toast.success(r.registered ? "Inscrição confirmada — você receberá lembretes!" : "Inscrição cancelada.");
    } catch (e) {
      toast.error((e as Error).message || "Não foi possível atualizar inscrição.");
    } finally {
      setLoading(false);
    }
  };

  const markPresent = async () => {
    if (!myProfileId) { toast.error("Faça login para marcar presença."); return; }
    setLoading(true);
    const { data: prof } = await supabase
      .from("profiles").select("name,avatar_url").eq("id", myProfileId).maybeSingle();
    const { data: student } = await supabase
      .from("students").select("id").eq("profile_id", myProfileId).maybeSingle();
    const { error } = await supabase.from("event_attendances").insert({
      event_id: eventId,
      profile_id: myProfileId,
      display_name: prof?.name || "Participante",
      avatar_url: prof?.avatar_url || null,
      student_id: student?.id || null,
    });
    setLoading(false);
    if (error) { toast.error("Não foi possível marcar presença."); return; }
    toast.success("Presença confirmada!");
    reload();
  };

  const removePresent = async () => {
    if (!mine) return;
    setLoading(true);
    const { error } = await supabase.from("event_attendances").delete().eq("id", mine.id);
    setLoading(false);
    if (error) { toast.error("Não foi possível remover presença."); return; }
    toast.success("Presença removida.");
    reload();
  };

  const checkinUrl = typeof window !== "undefined"
    ? `${window.location.origin}/fitmind-checkin/${eventId}`
    : `/fitmind-checkin/${eventId}`;

  const CLASS_STYLES: Record<EnrichedAttendee["classification"], string> = {
    "Aluno":              "bg-white/10 text-white/70",
    "Aluno Coach":        "bg-primary/20 text-primary",
    "Aluno Parceiro":     "bg-blue-500/20 text-blue-300",
    "Aluno Profissional": "bg-emerald-500/20 text-emerald-300",
  };

  const STATUS_STYLES: Record<"registered" | "attended" | "no_show", { label: string; cls: string }> = {
    registered: { label: "Inscrito", cls: "bg-blue-500/20 text-blue-300" },
    attended:   { label: "Compareceu", cls: "bg-emerald-500/20 text-emerald-300" },
    no_show:    { label: "Faltou", cls: "bg-red-500/20 text-red-300" },
  };

  const cycleStatus = async (reg: RegistrationRow) => {
    const next: "registered" | "attended" | "no_show" = reg.status === "registered" ? "attended"
      : reg.status === "attended" ? "no_show" : "registered";
    try {
      await callSetRegStatus({ data: { registrationId: reg.id, status: next } });
      setRegistrations((prev) => prev.map((r) => r.id === reg.id ? { ...r, status: next } : r));
    } catch (e) {
      toast.error((e as Error).message || "Falha ao atualizar status.");
    }
  };

  const handleFinalize = async () => {
    if (!confirm("Finalizar evento? Todos os inscritos que não escanearam o QR serão marcados como 'Faltou' (editável depois).")) return;
    try {
      const r = await callFinalize({ data: { eventId } });
      toast.success(`Evento finalizado — ${r.marked} marcado(s) como 'Faltou'.`);
      reloadRegs();
    } catch (e) {
      toast.error((e as Error).message || "Falha ao finalizar.");
    }
  };

  const regCounts = {
    total: registrations.length,
    registered: registrations.filter((r) => r.status === "registered").length,
    attended: registrations.filter((r) => r.status === "attended").length,
    no_show: registrations.filter((r) => r.status === "no_show").length,
  };

  return (
    <div className="rounded-xl p-3 space-y-3" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <div className="flex items-center gap-2 text-sm text-white/80">
          <Users className="h-4 w-4 text-white/50" />
          <span className="font-semibold">{attendees.length}</span>
          <span className="text-white/50">{attendees.length === 1 ? "presente" : "presentes"}</span>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          {canManage && (
            <button
              onClick={() => setShowQR((v) => !v)}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/80 bg-white/5 hover:bg-white/10 transition inline-flex items-center gap-1.5">
              <QrCode className="h-3.5 w-3.5" /> {showQR ? "Ocultar QR" : "QR de presença"}
            </button>
          )}
          <button
            onClick={() => setShowList((v) => !v)}
            className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/80 bg-white/5 hover:bg-white/10 transition">
            {showList ? "Ocultar lista" : "Ver lista"}
          </button>
          {mine ? (
            <button
              onClick={removePresent}
              disabled={loading}
              className="rounded-lg px-3 py-1.5 text-xs font-bold text-white/80 bg-white/5 hover:bg-white/10 transition">
              Cancelar presença
            </button>
          ) : (
            <button
              onClick={markPresent}
              disabled={loading || !myProfileId}
              className="flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-bold text-white transition hover:opacity-90 disabled:opacity-50"
              style={{ backgroundColor: color }}>
              <Check className="h-3.5 w-3.5" />
              Marcar presença
            </button>
          )}
        </div>
      </div>

      {showQR && canManage && (
        <div className="flex flex-col items-center gap-2 rounded-xl bg-white p-4">
          <QRCodeSVG value={checkinUrl} size={180} />
          <p className="text-[11px] text-black/60 text-center max-w-[200px]">
            Aponte a câmera para o QR. O participante precisa estar logado para confirmar presença.
          </p>
        </div>
      )}

      {showList && attendees.length > 0 && (
        <ul className="max-h-64 overflow-y-auto divide-y divide-white/5">
          {attendees.map((a) => (
            <li key={a.id} className="flex items-center gap-2 py-2 text-xs">
              <div className="h-7 w-7 rounded-full bg-white/10 flex items-center justify-center text-[10px] font-bold text-white/60 overflow-hidden flex-none">
                {a.avatar_url
                  ? <img src={a.avatar_url} alt="" className="h-full w-full object-cover" />
                  : (a.display_name?.[0] || "?").toUpperCase()}
              </div>
              <div className="flex-1 min-w-0">
                <p className="text-white/90 truncate font-medium">{a.display_name}</p>
                {a.coach_name && (
                  <p className="text-[10px] text-white/40 truncate">Coach: {a.coach_name}</p>
                )}
              </div>
              <span className={`text-[9px] font-bold px-2 py-0.5 rounded-full flex-none ${CLASS_STYLES[a.classification]}`}>
                {a.classification}
              </span>
            </li>
          ))}
        </ul>
      )}
      {showList && attendees.length === 0 && (
        <p className="text-xs text-white/40">Nenhuma presença confirmada ainda.</p>
      )}
    </div>
  );
}

// ─── Create Event Modal (admin + coach creator) ─────────────────────────────

type RoleKey = "coaches" | "alunos" | "parceiros" | "profissionais" | "todos";

function CreateEventModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [title, setTitle] = useState("");
  const [subtitle, setSubtitle] = useState("");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [category, setCategory] = useState<EventCategory>("aula");
  const [color, setColor] = useState("#E24B4A");
  const [date, setDate] = useState("");
  const [startTime, setStartTime] = useState("19:00");
  const [endTime, setEndTime] = useState("20:00");
  const [allDay, setAllDay] = useState(false);
  const [isHighlighted, setIsHighlighted] = useState(false);
  const [isImportant, setIsImportant] = useState(false);
  const [roles, setRoles] = useState<RoleKey[]>(["todos"]);
  const [responsibleCoachId, setResponsibleCoachId] = useState<string>("");
  const [coaches, setCoaches] = useState<{ id: string; name: string }[]>([]);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    supabase
      .from("coaches")
      .select("id, profiles!coaches_profile_id_fkey(name)")
      .not("approved_at", "is", null)
      .is("blocked_at", null)
      .order("created_at", { ascending: false })
      .then(({ data }) => {
        const list = ((data as unknown as Array<{ id: string; profiles: { name: string } | null }>) || [])
          .map((c) => ({ id: c.id, name: c.profiles?.name || "Coach" }));
        setCoaches(list);
      });
  }, []);

  const toggleRole = (r: RoleKey) => {
    setRoles((prev) => {
      if (r === "todos") return prev.includes("todos") ? [] : ["todos"];
      const without = prev.filter((x) => x !== "todos" && x !== r);
      return prev.includes(r) ? without : [...without, r];
    });
  };

  const handleSave = async () => {
    if (!title.trim()) { toast.error("Informe um título"); return; }
    if (!date) { toast.error("Informe a data"); return; }
    if (roles.length === 0) { toast.error("Selecione ao menos uma visibilidade"); return; }

    const startsAt = allDay
      ? new Date(`${date}T00:00:00-04:00`).toISOString()
      : new Date(`${date}T${startTime}:00-04:00`).toISOString();
    const endsAt = allDay
      ? new Date(`${date}T23:59:00-04:00`).toISOString()
      : new Date(`${date}T${endTime}:00-04:00`).toISOString();

    setSaving(true);
    const { data: auth } = await supabase.auth.getUser();
    const { data: prof } = await supabase
      .from("profiles").select("id").eq("user_id", auth.user!.id).maybeSingle();

    const { error } = await supabase.from("fitmind_events" as never).insert({
      title: title.trim(),
      subtitle: subtitle.trim() || null,
      description: description.trim() || null,
      location: location.trim() || null,
      category,
      color,
      starts_at: startsAt,
      ends_at: endsAt,
      all_day: allDay,
      is_highlighted: isHighlighted,
      is_important: isImportant,
      visibility_roles: roles,
      responsible_coach_id: responsibleCoachId || null,
      created_by: (prof as { id: string } | null)?.id || null,
      is_active: true,
    } as never);
    setSaving(false);
    if (error) { toast.error(error.message || "Erro ao criar evento"); return; }
    toast.success("Evento criado!");
    onCreated();
  };

  const ROLE_OPTIONS: { key: RoleKey; label: string }[] = [
    { key: "todos", label: "Todos" },
    { key: "coaches", label: "Coaches" },
    { key: "alunos", label: "Alunos" },
    { key: "parceiros", label: "Parceiros" },
    { key: "profissionais", label: "Profissionais" },
  ];

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl my-8" style={{ backgroundColor: "#111" }}>
        <div className="flex items-center justify-between px-5 py-4 border-b border-white/5">
          <h3 className="text-base font-bold text-white flex items-center gap-2">
            <CalendarPlus className="h-4 w-4 text-primary" /> Criar evento FitMind
          </h3>
          <button onClick={onClose} className="p-1.5 rounded-lg hover:bg-white/10 text-white/60">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="p-5 space-y-4">
          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Título *</label>
            <input value={title} onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Subtítulo</label>
            <input value={subtitle} onChange={(e) => setSubtitle(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Descrição</label>
            <textarea value={description} onChange={(e) => setDescription(e.target.value)} rows={3}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Local</label>
            <input value={location} onChange={(e) => setLocation(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary" />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Categoria</label>
              <select value={category} onChange={(e) => setCategory(e.target.value as EventCategory)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary">
                {Object.entries(CATEGORY_META).map(([k, v]) => (
                  <option key={k} value={k}>{v.emoji} {v.label}</option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Cor</label>
              <input type="color" value={color} onChange={(e) => setColor(e.target.value)}
                className="w-full h-10 rounded-lg bg-white/5 border border-white/10 cursor-pointer" />
            </div>
          </div>

          <div className="grid grid-cols-3 gap-3">
            <div>
              <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Data *</label>
              <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Início</label>
              <input type="time" value={startTime} disabled={allDay} onChange={(e) => setStartTime(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary disabled:opacity-40" />
            </div>
            <div>
              <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Fim</label>
              <input type="time" value={endTime} disabled={allDay} onChange={(e) => setEndTime(e.target.value)}
                className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary disabled:opacity-40" />
            </div>
          </div>

          <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
            <input type="checkbox" checked={allDay} onChange={(e) => setAllDay(e.target.checked)} />
            Dia inteiro
          </label>

          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-2 uppercase">Quem pode ver</label>
            <div className="flex flex-wrap gap-2">
              {ROLE_OPTIONS.map((r) => {
                const active = roles.includes(r.key);
                return (
                  <button
                    key={r.key}
                    type="button"
                    onClick={() => toggleRole(r.key)}
                    className={`px-3 py-1.5 rounded-full text-xs font-bold transition border ${
                      active
                        ? "bg-primary text-white border-primary"
                        : "bg-white/5 text-white/60 border-white/10 hover:bg-white/10"
                    }`}>
                    {r.label}
                  </button>
                );
              })}
            </div>
          </div>

          <div>
            <label className="block text-[11px] font-bold text-white/60 mb-1 uppercase">Coach responsável</label>
            <select value={responsibleCoachId} onChange={(e) => setResponsibleCoachId(e.target.value)}
              className="w-full rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary">
              <option value="">Nenhum</option>
              {coaches.map((c) => <option key={c.id} value={c.id}>{c.name}</option>)}
            </select>
          </div>

          <div className="flex gap-4">
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={isHighlighted} onChange={(e) => setIsHighlighted(e.target.checked)} />
              <Star className="h-3.5 w-3.5 text-yellow-400" /> Destaque
            </label>
            <label className="flex items-center gap-2 text-xs text-white/70 cursor-pointer">
              <input type="checkbox" checked={isImportant} onChange={(e) => setIsImportant(e.target.checked)} />
              <Zap className="h-3.5 w-3.5 text-red-400" /> Importante
            </label>
          </div>
        </div>

        <div className="flex gap-2 px-5 py-4 border-t border-white/5">
          <button onClick={onClose} disabled={saving}
            className="flex-1 rounded-lg border border-white/10 px-3 py-2 text-xs font-bold text-white/70 hover:bg-white/5 disabled:opacity-50">
            Cancelar
          </button>
          <button onClick={handleSave} disabled={saving}
            className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-white hover:opacity-90 disabled:opacity-50">
            {saving ? "Criando..." : "Criar evento"}
          </button>
        </div>
      </div>
    </div>
  );
}
