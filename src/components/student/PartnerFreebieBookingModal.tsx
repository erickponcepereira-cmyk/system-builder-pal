import { useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { CalendarDays, ChevronLeft, ChevronRight, Clock, Loader2, Users, X } from "lucide-react";
import { toast } from "sonner";

type Slot = { slot_start: string; slot_end: string; capacity: number; taken: number; remaining: number };

interface Props {
  product: { id: string; name: string; weekly_limit_per_student: number | null };
  onClose: () => void;
  onReserved: (reservation: { id: string; qr_token: string; slot_end: string }) => void;
}

const WEEK_LABELS = ["D", "S", "T", "Q", "Q", "S", "S"];
const MONTH_LABELS = ["Janeiro","Fevereiro","Março","Abril","Maio","Junho","Julho","Agosto","Setembro","Outubro","Novembro","Dezembro"];
const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const keyOf = (d: Date) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;

function isoWeekKey(d: Date): string {
  const date = new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
  const day = date.getUTCDay() || 7;
  date.setUTCDate(date.getUTCDate() + 4 - day);
  const yearStart = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const week = Math.ceil(((date.getTime() - yearStart.getTime()) / 86400000 + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

export function PartnerFreebieBookingModal({ product, onClose, onReserved }: Props) {
  const [slots, setSlots] = useState<Slot[]>([]);
  const [loading, setLoading] = useState(true);
  const [reserving, setReserving] = useState<string | null>(null);
  const [usedThisWeek, setUsedThisWeek] = useState(0);
  const [cursor, setCursor] = useState(() => { const d = new Date(); return new Date(d.getFullYear(), d.getMonth(), 1); });
  const [selectedDay, setSelectedDay] = useState<string | null>(null);

  const limit = product.weekly_limit_per_student ?? 1;

  useEffect(() => {
    (async () => {
      setLoading(true);
      const from = new Date();
      const to = new Date(); to.setDate(to.getDate() + 60);
      const { data } = await supabase.rpc("list_partner_freebie_slots" as never, {
        _product_id: product.id,
        _from: from.toISOString(),
        _to: to.toISOString(),
      } as never);
      setSlots(((data as unknown) as Slot[]) || []);

      // count weekly usage (current ISO week, BR-ish via local)
      const wk = isoWeekKey(new Date());
      const { data: u } = await supabase.auth.getUser();
      if (u.user) {
        const { count } = await supabase
          .from("partner_freebie_reservations" as never)
          .select("id", { count: "exact", head: true })
          .eq("partner_product_id" as never, product.id as never)
          .eq("profile_id" as never, u.user.id as never)
          .eq("iso_week" as never, wk as never)
          .in("status" as never, ["reserved", "used"] as never);
        setUsedThisWeek(count || 0);
      }
      setLoading(false);
    })();
  }, [product.id]);

  const slotsByDay = useMemo(() => {
    const map = new Map<string, Slot[]>();
    for (const s of slots) {
      const k = keyOf(new Date(s.slot_start));
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(s);
    }
    return map;
  }, [slots]);

  useEffect(() => {
    if (!slots.length) return;
    if (selectedDay && slotsByDay.has(selectedDay)) return;
    const first = slots.find((s) => {
      const d = new Date(s.slot_start);
      return d.getMonth() === cursor.getMonth() && d.getFullYear() === cursor.getFullYear();
    });
    setSelectedDay(first ? keyOf(new Date(first.slot_start)) : null);
  }, [cursor, slots, slotsByDay, selectedDay]);

  const reserve = async (s: Slot) => {
    if (usedThisWeek >= limit) {
      toast.error(`Você já usou ${usedThisWeek}/${limit} reservas desta semana.`);
      return;
    }
    setReserving(s.slot_start);
    const { data, error } = await supabase.rpc("reserve_partner_freebie" as never, {
      _product_id: product.id,
      _slot_start: s.slot_start,
    } as never);
    setReserving(null);
    if (error) { toast.error(error.message); return; }
    const r = (data as unknown as Array<{ reservation_id: string; qr_token: string; slot_end: string }>)?.[0];
    if (!r) { toast.error("Falha ao reservar."); return; }
    toast.success("Reserva confirmada!");
    onReserved({ id: r.reservation_id, qr_token: r.qr_token, slot_end: r.slot_end });
  };

  // Month grid
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
  const prevDisabled = year === today.getFullYear() && month <= today.getMonth();

  return (
    <div className="fixed inset-0 z-[100] flex items-end sm:items-center justify-center bg-black/80 p-2" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl p-4 max-h-[92vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 mb-3">
          <div>
            <h3 className="text-base font-bold text-white">Reservar horário</h3>
            <p className="text-xs text-white/60">{product.name}</p>
          </div>
          <button onClick={onClose}><X className="h-5 w-5 text-white/60" /></button>
        </div>

        <div className="mb-3 rounded-lg bg-primary/10 px-3 py-2 text-[11px] text-white/80 flex items-center gap-2">
          <Users className="h-3.5 w-3.5 text-primary" />
          Você já usou <b className="text-white">{usedThisWeek}/{limit}</b> reservas esta semana.
          {usedThisWeek >= limit && <span className="text-amber-400 font-bold ml-1">Limite atingido</span>}
        </div>

        {loading ? (
          <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>
        ) : slots.length === 0 ? (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-4 text-xs text-amber-200">
            <CalendarDays className="mb-2 h-4 w-4" />
            Este parceiro não tem horários disponíveis nos próximos dias.
          </div>
        ) : (
          <>
            <div className="mb-2 flex items-center justify-between">
              <button type="button" onClick={() => setCursor(new Date(year, month - 1, 1))} disabled={prevDisabled}
                className="rounded-lg bg-black/40 p-1.5 text-white/60 disabled:opacity-30">
                <ChevronLeft className="h-4 w-4" />
              </button>
              <p className="text-sm font-bold text-white capitalize">{MONTH_LABELS[month]} {year}</p>
              <button type="button" onClick={() => setCursor(new Date(year, month + 1, 1))}
                className="rounded-lg bg-black/40 p-1.5 text-white/60">
                <ChevronRight className="h-4 w-4" />
              </button>
            </div>
            <div className="mb-1 grid grid-cols-7 gap-1 text-center">
              {WEEK_LABELS.map((w, i) => <p key={i} className="text-[10px] font-bold text-white/40">{w}</p>)}
            </div>
            <div className="grid grid-cols-7 gap-1">
              {cells.map((c, i) => {
                if (!c) return <div key={i} />;
                const k = keyOf(c);
                const has = slotsByDay.has(k);
                const past = c < today;
                const sel = k === selectedDay;
                return (
                  <button
                    type="button"
                    key={i}
                    disabled={!has || past}
                    onClick={() => setSelectedDay(k)}
                    className={`relative aspect-square rounded-lg text-xs font-medium transition ${
                      sel ? "bg-primary text-primary-foreground" : has && !past ? "bg-black/40 text-white hover:bg-primary/20" : "bg-black/20 text-white/30"
                    }`}
                  >
                    {c.getDate()}
                    {has && !sel && <span className="absolute bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-primary" />}
                  </button>
                );
              })}
            </div>

            {selectedDay && (
              <div className="mt-4 border-t border-white/10 pt-3">
                <p className="mb-2 text-xs font-bold text-white flex items-center gap-1.5">
                  <Clock className="h-3.5 w-3.5 text-primary" />
                  {(() => { const [y,m,d] = selectedDay.split("-").map(Number); return new Date(y, m-1, d).toLocaleDateString("pt-BR", { weekday: "long", day: "2-digit", month: "long" }); })()}
                </p>
                {todaysSlots.length === 0 ? (
                  <p className="py-3 text-center text-xs text-white/40">Sem horários neste dia.</p>
                ) : (
                  <div className="space-y-1.5">
                    {todaysSlots.map((s) => {
                      const isFull = s.remaining <= 0;
                      const isReserving = reserving === s.slot_start;
                      const blocked = usedThisWeek >= limit;
                      return (
                        <button
                          key={s.slot_start}
                          type="button"
                          disabled={isFull || isReserving || blocked}
                          onClick={() => reserve(s)}
                          className={`w-full flex items-center justify-between rounded-lg px-3 py-2.5 text-xs font-bold transition ${
                            isFull ? "bg-black/30 text-white/30" : blocked ? "bg-black/30 text-white/40" : "bg-black/40 text-white hover:bg-primary/20"
                          }`}
                        >
                          <span>{fmtTime(s.slot_start)} – {fmtTime(s.slot_end)}</span>
                          <span className={`text-[10px] font-medium ${isFull ? "text-red-400" : "text-green-400"}`}>
                            {isReserving ? "Reservando…" : isFull ? "Sem vagas" : `${s.remaining}/${s.capacity} vagas`}
                          </span>
                        </button>
                      );
                    })}
                  </div>
                )}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}
