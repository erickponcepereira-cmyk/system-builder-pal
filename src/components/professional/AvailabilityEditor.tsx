import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Loader2, Save, ChevronLeft, ChevronRight, Ban, Calendar as CalIcon } from "lucide-react";

type Slot = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  is_active: boolean;
};

type Block = { id: string; block_date: string; reason: string | null };
type Appt = { id: string; starts_at: string; ends_at: string; status: string };

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];
const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = [
  "Janeiro", "Fevereiro", "Março", "Abril", "Maio", "Junho",
  "Julho", "Agosto", "Setembro", "Outubro", "Novembro", "Dezembro",
];
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

interface Props { coachId: string }

export function AvailabilityEditor({ coachId }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [blocks, setBlocks] = useState<Block[]>([]);
  const [appts, setAppts] = useState<Appt[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [cursor, setCursor] = useState(() => {
    const d = new Date();
    return new Date(d.getFullYear(), d.getMonth(), 1);
  });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const loadAll = async () => {
    const [{ data: slotData }, { data: blockData }, { data: apptData }] = await Promise.all([
      supabase
        .from("professional_availability" as never)
        .select("id,weekday,start_time,end_time,slot_minutes,is_active")
        .eq("professional_coach_id" as never, coachId as never)
        .order("weekday" as never, { ascending: true }),
      supabase
        .from("professional_availability_blocks" as never)
        .select("id,block_date,reason")
        .eq("professional_coach_id" as never, coachId as never),
      supabase
        .from("professional_appointments" as never)
        .select("id,starts_at,ends_at,status")
        .eq("professional_coach_id" as never, coachId as never)
        .eq("status" as never, "scheduled" as never),
    ]);
    setSlots(((slotData as unknown as Slot[]) || []));
    setBlocks(((blockData as unknown as Block[]) || []));
    setAppts(((apptData as unknown as Appt[]) || []));
    setLoading(false);
  };

  useEffect(() => { loadAll(); /* eslint-disable-next-line */ }, [coachId]);

  // ===== Weekly editor handlers =====
  const addSlot = () => {
    setSlots((s) => [
      ...s,
      { id: `new-${Date.now()}`, weekday: 1, start_time: "08:00", end_time: "12:00", slot_minutes: 30, is_active: true },
    ]);
  };
  const update = (i: number, patch: Partial<Slot>) => {
    setSlots((s) => s.map((row, idx) => (idx === i ? { ...row, ...patch } : row)));
  };
  const removeSlot = async (i: number) => {
    const slot = slots[i];
    if (!slot.id.startsWith("new-")) {
      const { error } = await supabase.from("professional_availability" as never).delete().eq("id" as never, slot.id as never);
      if (error) return toast.error(error.message);
    }
    setSlots((s) => s.filter((_, idx) => idx !== i));
  };
  const save = async () => {
    setSaving(true);
    try {
      for (const s of slots) {
        if (!s.start_time || !s.end_time || s.start_time >= s.end_time) {
          toast.error("Horário inválido em uma das faixas");
          setSaving(false);
          return;
        }
        if (s.id.startsWith("new-")) {
          const { error } = await supabase.from("professional_availability" as never).insert({
            professional_coach_id: coachId,
            weekday: s.weekday, start_time: s.start_time, end_time: s.end_time,
            slot_minutes: s.slot_minutes, is_active: s.is_active,
          } as never);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("professional_availability" as never).update({
            weekday: s.weekday, start_time: s.start_time, end_time: s.end_time,
            slot_minutes: s.slot_minutes, is_active: s.is_active,
          } as never).eq("id" as never, s.id as never);
          if (error) throw error;
        }
      }
      toast.success("Agenda salva");
      await loadAll();
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  // ===== Calendar =====
  const blockSet = useMemo(() => new Set(blocks.map((b) => b.block_date)), [blocks]);
  const apptsByDay = useMemo(() => {
    const m = new Map<string, Appt[]>();
    for (const a of appts) {
      const k = keyOf(new Date(a.starts_at));
      if (!m.has(k)) m.set(k, []);
      m.get(k)!.push(a);
    }
    return m;
  }, [appts]);
  const workWeekdays = useMemo(() => new Set(slots.filter((s) => s.is_active).map((s) => s.weekday)), [slots]);

  const toggleBlock = async (k: string) => {
    const existing = blocks.find((b) => b.block_date === k);
    if (existing) {
      const { error } = await supabase
        .from("professional_availability_blocks" as never)
        .delete().eq("id" as never, existing.id as never);
      if (error) return toast.error(error.message);
      setBlocks((bs) => bs.filter((b) => b.id !== existing.id));
      toast.success("Dia desbloqueado");
    } else {
      const { data, error } = await supabase
        .from("professional_availability_blocks" as never)
        .insert({ professional_coach_id: coachId, block_date: k } as never)
        .select("id,block_date,reason")
        .single();
      if (error) return toast.error(error.message);
      setBlocks((bs) => [...bs, data as unknown as Block]);
      toast.success("Dia bloqueado");
    }
  };

  if (loading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  // Build month cells
  const year = cursor.getFullYear();
  const month = cursor.getMonth();
  const firstDow = new Date(year, month, 1).getDay();
  const daysInMonth = new Date(year, month + 1, 0).getDate();
  const cells: (Date | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(new Date(year, month, d));
  while (cells.length % 7) cells.push(null);
  const today = new Date(); today.setHours(0, 0, 0, 0);
  const goPrev = () => setCursor(new Date(year, month - 1, 1));
  const goNext = () => setCursor(new Date(year, month + 1, 1));

  const selectedDate = selectedDay ? new Date(selectedDay) : null;
  const selectedAppts = selectedDay ? (apptsByDay.get(selectedDay) || []).sort((a, b) => a.starts_at.localeCompare(b.starts_at)) : [];
  const selectedIsBlocked = selectedDay ? blockSet.has(selectedDay) : false;
  const selectedIsWorkday = selectedDate ? workWeekdays.has(selectedDate.getDay()) : false;

  return (
    <div className="space-y-6">
      {/* Weekly recurrence editor */}
      <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2">
          <CalendarDays className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-white">Dias e horários recorrentes</h3>
            <p className="text-[11px] text-white/50">
              Defina as faixas que se repetem toda semana. Use o calendário abaixo para bloquear datas pontuais.
            </p>
          </div>
        </div>

        <div className="space-y-2">
          {slots.length === 0 && (
            <p className="text-xs text-white/40 text-center py-4">Nenhuma faixa cadastrada ainda.</p>
          )}
          {slots.map((s, i) => (
            <div key={s.id} className="grid grid-cols-12 gap-2 rounded-xl border border-white/10 p-3" style={{ backgroundColor: "#0F0F0F" }}>
              <select value={s.weekday} onChange={(e) => update(i, { weekday: Number(e.target.value) })}
                className="col-span-3 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none">
                {WEEKDAYS.map((w, idx) => (<option key={idx} value={idx} className="bg-zinc-900">{w}</option>))}
              </select>
              <input type="time" value={s.start_time} onChange={(e) => update(i, { start_time: e.target.value })}
                className="col-span-2 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none" />
              <input type="time" value={s.end_time} onChange={(e) => update(i, { end_time: e.target.value })}
                className="col-span-2 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none" />
              <div className="col-span-3 flex items-center gap-1">
                <input type="number" min={5} max={240} step={5} value={s.slot_minutes}
                  onChange={(e) => update(i, { slot_minutes: Number(e.target.value) || 30 })}
                  className="w-full rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none" />
                <span className="text-[10px] text-white/50">min</span>
              </div>
              <div className="col-span-2 flex items-center justify-end gap-1">
                <label className="flex items-center gap-1 text-[10px] text-white/60">
                  <input type="checkbox" checked={s.is_active} onChange={(e) => update(i, { is_active: e.target.checked })} />
                  Ativo
                </label>
                <button onClick={() => removeSlot(i)} className="rounded-lg bg-red-500/15 px-2 py-2 text-red-300 hover:bg-red-500/25">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          ))}
        </div>

        <div className="flex gap-2">
          <button onClick={addSlot} className="flex-1 rounded-lg border border-dashed border-white/20 px-3 py-2 text-xs text-white/70 hover:bg-white/5 flex items-center justify-center gap-1">
            <Plus className="h-3 w-3" /> Adicionar faixa
          </button>
          <button onClick={save} disabled={saving} className="flex-1 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground hover:opacity-90 disabled:opacity-50 flex items-center justify-center gap-1">
            {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
            Salvar agenda
          </button>
        </div>
      </div>

      {/* Calendar with blocks + appointments */}
      <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2">
          <CalIcon className="h-5 w-5 text-primary" />
          <div>
            <h3 className="text-sm font-bold text-white">Calendário do mês</h3>
            <p className="text-[11px] text-white/50">
              Pontos indicam atendimentos agendados. Clique em um dia para bloqueá-lo (folga) ou desbloqueá-lo.
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between">
          <button onClick={goPrev} className="rounded-lg bg-white/5 p-1.5 text-white/70 hover:text-white">
            <ChevronLeft className="h-4 w-4" />
          </button>
          <p className="text-sm font-bold text-white capitalize">{MONTH_LABELS[month]} {year}</p>
          <button onClick={goNext} className="rounded-lg bg-white/5 p-1.5 text-white/70 hover:text-white">
            <ChevronRight className="h-4 w-4" />
          </button>
        </div>

        <div className="grid grid-cols-7 gap-1 text-center">
          {WEEK_LABELS.map((w, i) => (
            <p key={i} className="text-[10px] font-bold text-white/40">{w}</p>
          ))}
        </div>
        <div className="grid grid-cols-7 gap-1">
          {cells.map((c, i) => {
            if (!c) return <div key={i} />;
            const k = keyOf(c);
            const isBlocked = blockSet.has(k);
            const dayAppts = apptsByDay.get(k) || [];
            const isWorkDay = workWeekdays.has(c.getDay());
            const isPast = c < today;
            const isSelected = k === selectedDay;
            const isToday = c.getTime() === today.getTime();
            return (
              <button
                key={i}
                onClick={() => setSelectedDay(k)}
                className={`relative aspect-square rounded-lg text-xs font-medium transition ${
                  isSelected ? "bg-primary text-primary-foreground"
                  : isBlocked ? "bg-red-500/20 text-red-300 line-through"
                  : isWorkDay && !isPast ? "bg-white/5 text-white hover:bg-primary/20"
                  : "bg-white/[0.02] text-white/40"
                } ${isToday && !isSelected ? "ring-1 ring-primary/50" : ""}`}
              >
                {c.getDate()}
                {dayAppts.length > 0 && !isSelected && (
                  <span className="absolute bottom-1 left-1/2 -translate-x-1/2 flex gap-0.5">
                    {Array.from({ length: Math.min(dayAppts.length, 3) }).map((_, j) => (
                      <span key={j} className="h-1 w-1 rounded-full bg-primary" />
                    ))}
                  </span>
                )}
                {isBlocked && !isSelected && (
                  <Ban className="absolute right-0.5 top-0.5 h-2.5 w-2.5 text-red-400" />
                )}
              </button>
            );
          })}
        </div>

        <div className="flex flex-wrap gap-3 text-[10px] text-white/50">
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-full bg-primary" /> Atendimento</span>
          <span className="flex items-center gap-1"><Ban className="h-3 w-3 text-red-400" /> Bloqueado</span>
          <span className="flex items-center gap-1"><span className="h-2 w-2 rounded-sm bg-white/10" /> Sem expediente</span>
        </div>

        {selectedDay && selectedDate && (
          <div className="rounded-xl border border-white/10 p-3" style={{ backgroundColor: "#0F0F0F" }}>
            <div className="mb-3 flex items-center justify-between">
              <p className="text-sm font-bold text-white capitalize">
                {selectedDate.toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" })}
              </p>
              <button
                onClick={() => toggleBlock(selectedDay)}
                disabled={selectedAppts.length > 0 && !selectedIsBlocked}
                className={`rounded-lg px-3 py-1.5 text-[11px] font-bold transition disabled:opacity-40 disabled:cursor-not-allowed ${
                  selectedIsBlocked
                    ? "bg-white/10 text-white hover:bg-white/20"
                    : "bg-red-500/20 text-red-300 hover:bg-red-500/30"
                }`}
                title={selectedAppts.length > 0 && !selectedIsBlocked ? "Cancele os atendimentos antes de bloquear o dia." : ""}
              >
                {selectedIsBlocked ? "Desbloquear dia" : "Bloquear dia (folga)"}
              </button>
            </div>
            {!selectedIsWorkday && !selectedIsBlocked && (
              <p className="mb-2 text-[11px] text-white/40">Este dia da semana não está nas faixas recorrentes.</p>
            )}
            {selectedAppts.length === 0 ? (
              <p className="text-[11px] text-white/50">Nenhum atendimento agendado neste dia.</p>
            ) : (
              <ul className="space-y-1">
                {selectedAppts.map((a) => (
                  <li key={a.id} className="flex items-center gap-2 rounded-lg bg-white/5 px-2 py-1.5 text-[11px] text-white">
                    <span className="font-bold text-primary">
                      {new Date(a.starts_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                    <span className="text-white/50">→</span>
                    <span className="text-white/80">
                      {new Date(a.ends_at).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" })}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
