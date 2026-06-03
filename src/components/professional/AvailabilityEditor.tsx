import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { CalendarDays, Plus, Trash2, Loader2, Save } from "lucide-react";

type Slot = {
  id: string;
  weekday: number;
  start_time: string;
  end_time: string;
  slot_minutes: number;
  is_active: boolean;
};

const WEEKDAYS = ["Domingo", "Segunda", "Terça", "Quarta", "Quinta", "Sexta", "Sábado"];

interface Props { coachId: string }

export function AvailabilityEditor({ coachId }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("professional_availability" as never)
        .select("id,weekday,start_time,end_time,slot_minutes,is_active")
        .eq("professional_coach_id" as never, coachId as never)
        .order("weekday" as never, { ascending: true });
      setSlots(((data as unknown as Slot[]) || []));
      setLoading(false);
    })();
  }, [coachId]);

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
            weekday: s.weekday,
            start_time: s.start_time,
            end_time: s.end_time,
            slot_minutes: s.slot_minutes,
            is_active: s.is_active,
          } as never);
          if (error) throw error;
        } else {
          const { error } = await supabase.from("professional_availability" as never).update({
            weekday: s.weekday,
            start_time: s.start_time,
            end_time: s.end_time,
            slot_minutes: s.slot_minutes,
            is_active: s.is_active,
          } as never).eq("id" as never, s.id as never);
          if (error) throw error;
        }
      }
      toast.success("Agenda salva");
      const { data } = await supabase
        .from("professional_availability" as never)
        .select("id,weekday,start_time,end_time,slot_minutes,is_active")
        .eq("professional_coach_id" as never, coachId as never)
        .order("weekday" as never, { ascending: true });
      setSlots(((data as unknown as Slot[]) || []));
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (loading) return <div className="flex justify-center p-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;

  return (
    <div className="rounded-2xl p-5 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2">
        <CalendarDays className="h-5 w-5 text-primary" />
        <div>
          <h3 className="text-sm font-bold text-white">Agenda de atendimentos</h3>
          <p className="text-[11px] text-white/50">
            Defina dias e horários disponíveis. Outros profissionais e alunos só poderão agendar dentro dessas faixas.
          </p>
        </div>
      </div>

      <div className="space-y-2">
        {slots.length === 0 && (
          <p className="text-xs text-white/40 text-center py-4">Nenhuma faixa cadastrada ainda.</p>
        )}
        {slots.map((s, i) => (
          <div key={s.id} className="grid grid-cols-12 gap-2 rounded-xl border border-white/10 p-3" style={{ backgroundColor: "#0F0F0F" }}>
            <select
              value={s.weekday}
              onChange={(e) => update(i, { weekday: Number(e.target.value) })}
              className="col-span-3 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none"
            >
              {WEEKDAYS.map((w, idx) => (
                <option key={idx} value={idx} className="bg-zinc-900">{w}</option>
              ))}
            </select>
            <input
              type="time"
              value={s.start_time}
              onChange={(e) => update(i, { start_time: e.target.value })}
              className="col-span-2 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none"
            />
            <input
              type="time"
              value={s.end_time}
              onChange={(e) => update(i, { end_time: e.target.value })}
              className="col-span-2 rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none"
            />
            <div className="col-span-3 flex items-center gap-1">
              <input
                type="number"
                min={5}
                max={240}
                step={5}
                value={s.slot_minutes}
                onChange={(e) => update(i, { slot_minutes: Number(e.target.value) || 30 })}
                className="w-full rounded-lg bg-white/5 px-2 py-2 text-xs text-white outline-none"
              />
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
  );
}
