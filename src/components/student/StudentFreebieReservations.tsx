import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { CalendarDays, CheckCircle2, Clock, Loader2, QrCode, X, Ticket } from "lucide-react";
import { toast } from "sonner";

type Reservation = {
  id: string;
  qr_token: string;
  slot_start: string;
  slot_end: string;
  status: string;
  partner_products: { name: string } | null;
  partners: { fantasy_name: string; address: string | null } | null;
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

export function StudentFreebieReservations({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reservation | null>(null);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { data } = await supabase
      .from("partner_freebie_reservations" as never)
      .select("id, qr_token, slot_start, slot_end, status, partner_products(name), partners(fantasy_name, address)")
      .eq("profile_id" as never, u.user.id as never)
      .gte("slot_end" as never, new Date(Date.now() - 24 * 3600 * 1000).toISOString() as never)
      .order("slot_start" as never);
    setItems(((data as unknown) as Reservation[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);

  // Live refresh for the open QR (catch "used" status)
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(async () => {
      const { data } = await supabase
        .from("partner_freebie_reservations" as never)
        .select("status")
        .eq("id" as never, selected.id as never)
        .maybeSingle();
      const s = (data as { status?: string } | null)?.status;
      if (s && s !== selected.status) { setSelected({ ...selected, status: s }); load(); }
    }, 5000);
    return () => clearInterval(t);
  }, [selected]);

  const cancel = async (id: string) => {
    if (!confirm("Cancelar esta reserva?")) return;
    const { error } = await supabase.rpc("cancel_partner_freebie" as never, { _reservation_id: id } as never);
    if (error) return toast.error(error.message);
    toast.success("Reserva cancelada.");
    setSelected(null);
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-6"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>;
  }
  if (items.length === 0) return null;

  return (
    <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center gap-2 mb-2">
        <Ticket className="h-4 w-4 text-primary" />
        <p className="text-sm font-bold text-white">Minhas reservas</p>
      </div>
      <div className="space-y-2">
        {items.map((r) => {
          const isUsed = r.status === "used";
          const isCancelled = r.status === "cancelled";
          const isExpired = r.status === "expired";
          return (
            <button
              key={r.id}
              onClick={() => !isCancelled && !isExpired && setSelected(r)}
              className="w-full flex items-center gap-2 rounded-lg bg-black/30 p-2 text-left hover:bg-black/40 disabled:opacity-50"
              disabled={isCancelled || isExpired}
            >
              <div className="flex-1 min-w-0">
                <p className="text-xs font-bold text-white truncate">{r.partner_products?.name}</p>
                <p className="text-[10px] text-white/50 truncate">{r.partners?.fantasy_name}</p>
                <p className="text-[10px] text-white/60 mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtDay(r.slot_start)} · {fmtTime(r.slot_start)}–{fmtTime(r.slot_end)}
                </p>
              </div>
              {isUsed ? (
                <span className="flex items-center gap-1 text-[10px] font-bold text-green-400"><CheckCircle2 className="h-3 w-3" /> Usado</span>
              ) : isCancelled ? (
                <span className="text-[10px] font-bold text-white/40">Cancelado</span>
              ) : isExpired ? (
                <span className="text-[10px] font-bold text-white/40">Expirado</span>
              ) : (
                <span className="flex items-center gap-1 text-[10px] font-bold text-primary"><QrCode className="h-3 w-3" /> Ver QR</span>
              )}
            </button>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/85 p-4" onClick={() => setSelected(null)}>
          <div className="w-full max-w-sm rounded-2xl p-5 text-center" style={{ backgroundColor: "#1A1A1A" }} onClick={(e) => e.stopPropagation()}>
            <div className="flex justify-between items-start mb-2">
              <div className="text-left">
                <p className="text-xs text-white/60">{selected.partners?.fantasy_name}</p>
                <p className="text-sm font-bold text-white">{selected.partner_products?.name}</p>
              </div>
              <button onClick={() => setSelected(null)}><X className="h-5 w-5 text-white/60" /></button>
            </div>

            {selected.status === "used" ? (
              <div className="py-6">
                <CheckCircle2 className="mx-auto h-14 w-14 text-green-400" />
                <p className="mt-2 text-base font-bold text-white">Presença confirmada!</p>
                <p className="text-xs text-white/60">Bom treino! 💪</p>
              </div>
            ) : (
              <>
                <div className="mx-auto mt-2 rounded-2xl bg-white p-3 w-fit">
                  <QRCodeSVG value={selected.qr_token} size={220} level="H" />
                </div>
                <p className="mt-3 text-xs text-white/60 flex items-center justify-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {fmtDay(selected.slot_start)} · {fmtTime(selected.slot_start)}–{fmtTime(selected.slot_end)}
                </p>
                {selected.partners?.address && (
                  <p className="mt-1 text-[11px] text-white/45">{selected.partners.address}</p>
                )}
                <p className="mt-3 text-[10px] text-white/40">Mostre este QR ao parceiro para registrar sua presença.</p>
                <button onClick={() => cancel(selected.id)} className="mt-4 w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                  Cancelar reserva
                </button>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
