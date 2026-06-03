import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Loader2, ChevronLeft, ChevronRight } from "lucide-react";

type Slot = { slot_start: string; slot_end: string };

interface Props {
  professionalCoachId: string;
  durationMinutes?: number;
  /** dias para frente a buscar (default 30) */
  daysAhead?: number;
  value: string | null; // ISO string slot_start
  onChange: (slotStart: string | null) => void;
}

const fmtDay = (d: Date) =>
  d.toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });
const fmtTime = (iso: string) =>
  new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });

export function AvailabilityPicker({
  professionalCoachId,
  durationMinutes = 30,
  daysAhead = 30,
  value,
  onChange,
}: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeDay, setActiveDay] = useState<string | null>(null);

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
      if (list.length && !activeDay) {
        setActiveDay(new Date(list[0].slot_start).toDateString());
      }
      setLoading(false);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [professionalCoachId, durationMinutes, daysAhead]);

  const byDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const key = new Date(s.slot_start).toDateString();
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(s);
    }
    return map;
  }, [slots]);

  const days = useMemo(() => Array.from(byDay.keys()), [byDay]);
  const dayIdx = activeDay ? days.indexOf(activeDay) : -1;

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
        Este profissional ainda não tem horários disponíveis nos próximos {daysAhead} dias.
      </div>
    );
  }

  const todaySlots = activeDay ? byDay.get(activeDay) || [] : [];

  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center gap-2">
        <CalendarDays className="h-4 w-4 text-primary" />
        <p className="text-xs font-bold text-foreground">Escolha o horário</p>
        <span className="ml-auto text-[10px] text-muted-foreground">
          {durationMinutes} min · janela de cancelamento 24 h
        </span>
      </div>

      <div className="mb-3 flex items-center gap-1">
        <button
          type="button"
          onClick={() => dayIdx > 0 && setActiveDay(days[dayIdx - 1])}
          disabled={dayIdx <= 0}
          className="rounded-lg bg-card p-1.5 text-muted-foreground disabled:opacity-30"
        >
          <ChevronLeft className="h-3.5 w-3.5" />
        </button>
        <div className="flex-1 overflow-x-auto">
          <div className="flex gap-1">
            {days.map((d) => {
              const date = new Date(d);
              const active = d === activeDay;
              return (
                <button
                  type="button"
                  key={d}
                  onClick={() => setActiveDay(d)}
                  className={`whitespace-nowrap rounded-lg px-2.5 py-1.5 text-[11px] font-medium transition ${
                    active
                      ? "bg-primary text-primary-foreground"
                      : "bg-card text-muted-foreground hover:text-foreground"
                  }`}
                >
                  {fmtDay(date)}
                </button>
              );
            })}
          </div>
        </div>
        <button
          type="button"
          onClick={() => dayIdx < days.length - 1 && setActiveDay(days[dayIdx + 1])}
          disabled={dayIdx >= days.length - 1}
          className="rounded-lg bg-card p-1.5 text-muted-foreground disabled:opacity-30"
        >
          <ChevronRight className="h-3.5 w-3.5" />
        </button>
      </div>

      <div className="grid grid-cols-4 gap-1.5 sm:grid-cols-5">
        {todaySlots.map((s) => {
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
    </div>
  );
}
