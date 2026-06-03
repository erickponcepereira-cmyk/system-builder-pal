import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Loader2, ChevronLeft, ChevronRight, Clock } from "lucide-react";

type Slot = { slot_start: string; slot_end: string };

interface Props {
  professionalCoachId: string;
  durationMinutes?: number;
  daysAhead?: number;
  value: string | null;
  onChange: (slotStart: string | null) => void;
}

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

export function AvailabilityPicker({
  professionalCoachId,
  durationMinutes = 30,
  daysAhead = 90,
  value,
  onChange,
}: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const from = new Date();
      const to = new Date();
      to.setDate(to.getDate() + daysAhead);
      const { data } = await supabase.rpc("list_professional_available_slots" as never, {
        _coach_id: professionalCoachId,
        _from: from.toISOString(),
        _to: to.toISOString(),
        _duration_minutes: durationMinutes,
      } as never);
      const list = ((data as unknown as Slot[]) || []).filter(Boolean);
      setSlots(list);
      setLoading(false);
    })();
  }, [professionalCoachId, durationMinutes, daysAhead]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const d = new Date(s.slot_start);
      const k = keyOf(d);
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [slots]);

  // Auto-select first day with availability when month changes
  useEffect(() => {
    if (!slots.length) return;
    if (selectedDay && slotsByDay.has(selectedDay)) {
      const sd = new Date(selectedDay);
      if (sd.getMonth() === cursor.getMonth() && sd.getFullYear() === cursor.getFullYear()) return;
    }
    const first = slots.find((s) => {
      const d = new Date(s.slot_start);
      return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
    });
    setSelectedDay(first ? keyOf(new Date(first.slot_start)) : null);
  }, [cursor, slots, slotsByDay, selectedDay]);

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl border border-white/10 bg-white/5 p-6">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  if (slots.length === 0) {
    return (
      <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
        <CalendarDays className="mb-2 h-4 w-4" />
        Este profissional não tem horários disponíveis nos próximos {daysAhead} dias.
      </div>
    );
  }

  // Build month grid
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);

  const today = new Date(); today.setHours(0, 0, 0, 0);
  const todaysSlots = selectedDay ? slotsByDay.get(selectedDay) || [] : [];

  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));
  const prevDisabled = year === today.getFullYear() && month <= today.getMonth();

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-3 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold text-foreground">Escolha o dia e horário</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {durationMinutes} min · cancelamento em até 24 h
        </span>
      </div>

      <div className="mb-2 flex items-center justify-between">
        <button type="button" onClick={goPrev} disabled={prevDisabled}
          className="rounded-lg bg-card p-1.5 text-muted-foreground disabled:opacity-30 hover:text-foreground">
          <ChevronLeft className="h-4 w-4" />
        </button>
        <p className="text-sm font-bold text-foreground capitalize">
          {MONTH_LABELS[month]} {year}
        </p>
        <button type="button" onClick={goNext}
          className="rounded-lg bg-card p-1.5 text-muted-foreground hover:text-foreground">
          <ChevronRight className="h-4 w-4" />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1 text-center">
        {WEEK_LABELS.map((w, i) => (
          <p key={i} className="text-[10px] font-bold text-muted-foreground">{w}</p>
        ))}
      </div>
      <div className="grid grid-cols-7 gap-1">
        {cells.map((c, i) => {
          if (!c) return <div key={i} />;
          const k = keyOf(c);
          const hasSlots = slotsByDay.has(k);
          const isPast = c < today;
          const isSelected = k === selectedDay;
          const isToday = c.getTime() === today.getTime();
          return (
            <button
              type="button"
              key={i}
              disabled={!hasSlots || isPast}
              onClick={() => setSelectedDay(k)}
              className={`relative aspect-square rounded-lg text-xs font-medium transition ${
                isSelected
                  ? "bg-primary text-primary-foreground"
                  : hasSlots && !isPast
                  ? "bg-card text-foreground hover:bg-primary/20"
                  : "bg-card/30 text-muted-foreground/40 cursor-not-allowed"
              } ${isToday && !isSelected ? "ring-1 ring-primary/40" : ""}`}
            >
              {c.getDate()}
              {hasSlots && !isSelected && (
                <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />
              )}
            </button>
          );
        })}
      </div>

      {selectedDay && (
        <div className="mt-4 border-t border-white/10 pt-3">
          <div className="mb-2 flex items-center gap-1.5">
            <Clock className="h-3.5 w-3.5 text-primary" />
            <p className="text-xs font-bold text-foreground">
              {new Date(selectedDay).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
            </p>
          </div>
          {todaysSlots.length === 0 ? (
            <p className="py-2 text-center text-xs text-muted-foreground">Sem horários nesse dia.</p>
          ) : (
            <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
              {todaysSlots.map((s) => {
                const isSel = value === s.slot_start;
                return (
                  <button
                    type="button"
                    key={s.slot_start}
                    onClick={() => onChange(isSel ? null : s.slot_start)}
                    className={`rounded-lg px-2 py-2 text-xs font-medium transition ${
                      isSel
                        ? "bg-primary text-primary-foreground"
                        : "bg-card text-foreground hover:bg-primary/15 hover:text-primary"
                    }`}
                  >
                    {fmtTime(s.slot_start)}
                  </button>
                );
              })}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
