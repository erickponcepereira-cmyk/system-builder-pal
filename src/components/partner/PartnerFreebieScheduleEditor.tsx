import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, Loader2, Plus, Save, Trash2, Users } from "lucide-react";
import { toast } from "sonner";

type Slot = { weekday: number; start_time: string; end_time: string; capacity: number };

const WEEKDAYS = [
  { v: 1, label: "Seg" },
  { v: 2, label: "Ter" },
  { v: 3, label: "Qua" },
  { v: 4, label: "Qui" },
  { v: 5, label: "Sex" },
  { v: 6, label: "Sáb" },
  { v: 0, label: "Dom" },
];

interface Props {
  productId: string;
  weeklyLimit: number | null;
  onChangeWeeklyLimit: (n: number) => void;
}

export function PartnerFreebieScheduleEditor({ productId, weeklyLimit, onChangeWeeklyLimit }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from("partner_product_schedules" as never)
        .select("weekday, start_time, end_time, capacity")
        .eq("partner_product_id" as never, productId as never)
        .order("weekday" as never)
        .order("start_time" as never);
      setSlots(((data as unknown) as Slot[]) || []);
      setLoading(false);
    })();
  }, [productId]);

  const add = (weekday: number) => {
    setSlots((s) => [...s, { weekday, start_time: "07:00", end_time: "08:00", capacity: 1 }]);
  };
  const update = (idx: number, patch: Partial<Slot>) => {
    setSlots((s) => s.map((sl, i) => (i === idx ? { ...sl, ...patch } : sl)));
  };
  const remove = (idx: number) => setSlots((s) => s.filter((_, i) => i !== idx));

  const save = async () => {
    for (const s of slots) {
      if (s.end_time <= s.start_time) return toast.error("Horário final deve ser maior que o inicial.");
      if (s.capacity < 1) return toast.error("Capacidade deve ser pelo menos 1.");
    }
    setSaving(true);
    const { error } = await supabase.rpc("set_partner_product_schedules" as never, {
      _product_id: productId,
      _schedules: slots,
    } as never);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success("Agenda salva.");
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center rounded-xl bg-black/30 p-4">
        <Loader2 className="h-5 w-5 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-primary">
        <CalendarDays className="h-3.5 w-3.5" /> Agenda semanal (reserva obrigatória)
      </div>
      <p className="text-[10px] text-white/45">
        Defina dias, janelas de horário e quantas vagas por turma. Aluno reserva e gera QR único — o QR é dado baixa quando você lê no scanner.
      </p>

      <div className="flex items-center gap-2 rounded-lg bg-black/30 p-2">
        <Users className="h-3.5 w-3.5 text-primary" />
        <label className="text-[11px] font-bold text-white">Limite por aluno / semana:</label>
        <input
          type="number"
          min={1}
          value={weeklyLimit ?? 1}
          onChange={(e) => onChangeWeeklyLimit(Math.max(1, Number(e.target.value) || 1))}
          className="w-16 rounded bg-black/40 border border-white/10 px-2 py-1 text-xs text-white"
        />
        <span className="text-[10px] text-white/40">(reseta segunda 00h)</span>
      </div>

      {WEEKDAYS.map((d) => {
        const daySlots = slots.map((s, i) => ({ ...s, _idx: i })).filter((s) => s.weekday === d.v);
        return (
          <div key={d.v} className="rounded-lg bg-black/30 p-2">
            <div className="flex items-center justify-between">
              <p className="text-[11px] font-bold text-white">{d.label}</p>
              <button type="button" onClick={() => add(d.v)} className="flex items-center gap-1 text-[10px] text-primary hover:underline">
                <Plus className="h-3 w-3" /> Adicionar janela
              </button>
            </div>
            {daySlots.length === 0 && <p className="mt-1 text-[10px] text-white/30">— sem janelas</p>}
            <div className="mt-1.5 space-y-1.5">
              {daySlots.map((s) => (
                <div key={s._idx} className="flex items-center gap-1.5">
                  <input
                    type="time"
                    value={s.start_time.slice(0, 5)}
                    onChange={(e) => update(s._idx, { start_time: e.target.value })}
                    className="rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                  />
                  <span className="text-[10px] text-white/40">até</span>
                  <input
                    type="time"
                    value={s.end_time.slice(0, 5)}
                    onChange={(e) => update(s._idx, { end_time: e.target.value })}
                    className="rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                  />
                  <div className="ml-auto flex items-center gap-1">
                    <Users className="h-3 w-3 text-white/40" />
                    <input
                      type="number"
                      min={1}
                      value={s.capacity}
                      onChange={(e) => update(s._idx, { capacity: Math.max(1, Number(e.target.value) || 1) })}
                      className="w-12 rounded bg-black/40 border border-white/10 px-1.5 py-1 text-[11px] text-white"
                    />
                  </div>
                  <button type="button" onClick={() => remove(s._idx)} className="text-red-400">
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>
        );
      })}

      <button
        type="button"
        disabled={saving}
        onClick={save}
        className="w-full rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
      >
        {saving ? <Loader2 className="inline h-4 w-4 animate-spin" /> : <><Save className="inline h-3.5 w-3.5 mr-1" /> Salvar agenda</>}
      </button>
    </div>
  );
}
