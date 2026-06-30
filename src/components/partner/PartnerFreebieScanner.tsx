import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QrCode, ScanLine, Loader2, CheckCircle2, Clock, Users } from "lucide-react";
import { toast } from "sonner";
import { QRScannerModal } from "@/components/QRScannerModal";

type Reservation = {
  id: string;
  slot_start: string;
  slot_end: string;
  status: string;
  profiles: { name: string | null; avatar_url: string | null } | null;
  partner_products: { name: string } | null;
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "2-digit" });

export function PartnerFreebieScanner({ partnerId }: { partnerId: string }) {
  const [open, setOpen] = useState(false);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [processing, setProcessing] = useState(false);

  const load = async () => {
    setLoading(true);
    const startOfDay = new Date(); startOfDay.setHours(0, 0, 0, 0);
    const endOfDay = new Date(); endOfDay.setHours(23, 59, 59, 999);
    const { data } = await supabase
      .from("partner_freebie_reservations" as never)
      .select("id, slot_start, slot_end, status, profiles!partner_freebie_reservations_profile_id_fkey(name, avatar_url), partner_products(name)")
      .eq("partner_id" as never, partnerId as never)
      .gte("slot_start" as never, startOfDay.toISOString() as never)
      .lte("slot_start" as never, endOfDay.toISOString() as never)
      .order("slot_start" as never);
    setReservations(((data as unknown) as Reservation[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [partnerId]);

  const handleScan = async (decoded: string) => {
    setOpen(false);
    if (processing) return;
    setProcessing(true);
    // Accept either raw token or full URL ending in /freebie/<token>
    const token = decoded.includes("/freebie/") ? decoded.split("/freebie/").pop()!.split(/[?#]/)[0] : decoded.trim();
    const { data, error } = await supabase.rpc("redeem_partner_freebie" as never, { _qr_token: token } as never);
    setProcessing(false);
    if (error) { toast.error(error.message); return; }
    const r = (data as unknown as Array<{ student_name: string; product_name: string; slot_start: string }>)?.[0];
    if (r) toast.success(`Check-in: ${r.student_name} — ${r.product_name} ${fmtTime(r.slot_start)}`);
    load();
  };

  const counts = {
    reserved: reservations.filter(r => r.status === "reserved").length,
    used: reservations.filter(r => r.status === "used").length,
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h2 className="text-sm font-bold text-white flex items-center gap-2">
          <QrCode className="h-4 w-4 text-primary" /> Scanner de presença
        </h2>
        <button onClick={() => setOpen(true)} className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
          <ScanLine className="h-4 w-4" /> Ler QR
        </button>
      </div>

      <div className="grid grid-cols-2 gap-2">
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] text-white/50 uppercase">Reservas hoje</p>
          <p className="text-xl font-bold text-white mt-0.5">{counts.reserved}</p>
        </div>
        <div className="rounded-xl p-3" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-[10px] text-white/50 uppercase">Presenças confirmadas</p>
          <p className="text-xl font-bold text-green-400 mt-0.5">{counts.used}</p>
        </div>
      </div>

      <div className="rounded-xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="px-3 py-2 border-b border-white/5">
          <p className="text-xs font-bold text-white">Reservas de hoje</p>
        </div>
        {loading ? (
          <div className="p-6 flex justify-center"><Loader2 className="h-5 w-5 animate-spin text-primary" /></div>
        ) : reservations.length === 0 ? (
          <p className="p-6 text-center text-xs text-white/40">Nenhuma reserva para hoje.</p>
        ) : (
          <div className="divide-y divide-white/5">
            {reservations.map((r) => (
              <div key={r.id} className="p-3 flex items-center gap-2">
                {r.profiles?.avatar_url ? (
                  <img src={r.profiles.avatar_url} className="h-8 w-8 rounded-full object-cover" alt="" />
                ) : (
                  <div className="h-8 w-8 rounded-full bg-white/10 flex items-center justify-center text-[10px] text-white/60">
                    {(r.profiles?.name || "?")[0]}
                  </div>
                )}
                <div className="flex-1 min-w-0">
                  <p className="text-xs font-bold text-white truncate">{r.profiles?.name || "Aluno"}</p>
                  <p className="text-[10px] text-white/50 truncate">{r.partner_products?.name}</p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-white/60 flex items-center gap-1 justify-end">
                    <Clock className="h-3 w-3" /> {fmtTime(r.slot_start)}–{fmtTime(r.slot_end)}
                  </p>
                  {r.status === "used" ? (
                    <span className="inline-flex items-center gap-1 text-[10px] text-green-400 font-bold">
                      <CheckCircle2 className="h-3 w-3" /> Confirmado
                    </span>
                  ) : r.status === "reserved" ? (
                    <span className="text-[10px] text-amber-400 font-bold">Aguardando</span>
                  ) : (
                    <span className="text-[10px] text-white/40">{r.status}</span>
                  )}
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && <QRScannerModal onClose={() => setOpen(false)} onScan={handleScan} title="Ler QR do aluno" />}
    </div>
  );
}
