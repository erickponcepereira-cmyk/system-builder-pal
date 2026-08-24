import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { QRCodeSVG } from "qrcode.react";
import { AlertCircle, CalendarDays, CheckCircle2, Clock, Loader2, MapPin, QrCode, X, Ticket } from "lucide-react";
import { toast } from "sonner";
import { loadPartnersById } from "@/lib/partner-public";

type Reservation = {
  id: string;
  qr_token: string;
  slot_start: string;
  slot_end: string;
  status: string;
  partner_products: { name: string; redemption_location_name: string | null; redemption_location_url: string | null } | null;
  partners: { fantasy_name: string; address: string | null } | null;
};

const fmtTime = (iso: string) => new Date(iso).toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit" });
const fmtDay = (iso: string) => new Date(iso).toLocaleDateString("pt-BR", { weekday: "short", day: "2-digit", month: "short" });

function getReservationState(r: Reservation, now: number) {
  const start = new Date(r.slot_start).getTime();
  const end = new Date(r.slot_end).getTime();
  if (r.status === "used") return { label: "Usado", tone: "text-green-400", canOpenQr: false, canCancel: false };
  if (r.status === "cancelled") return { label: "Cancelado", tone: "text-white/40", canOpenQr: false, canCancel: false };
  if (r.status === "expired" || now > end) return { label: "Expirado", tone: "text-white/40", canOpenQr: false, canCancel: false };
  if (now < start) return { label: "Aguardando horário", tone: "text-amber-400", canOpenQr: false, canCancel: true };
  return { label: "QR disponível", tone: "text-primary", canOpenQr: true, canCancel: false };
}

export function StudentFreebieReservations({ refreshKey }: { refreshKey?: number }) {
  const [items, setItems] = useState<Reservation[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Reservation | null>(null);
  const [now, setNow] = useState(() => Date.now());
  /** Reserva aguardando confirmação de cancelamento. null = diálogo fechado. */
  const [paraCancelar, setParaCancelar] = useState<Reservation | null>(null);
  const [cancelando, setCancelando] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data: u } = await supabase.auth.getUser();
    if (!u.user) { setLoading(false); return; }
    const { data: profile, error: profileError } = await supabase
      .from("profiles" as never)
      .select("id" as never)
      .eq("user_id" as never, u.user.id as never)
      .maybeSingle();
    if (profileError) {
      toast.error(profileError.message);
      setLoading(false);
      return;
    }
    const profileId = (profile as { id?: string } | null)?.id;
    if (!profileId) { setItems([]); setLoading(false); return; }
    // Sem embed `partners(...)`: a tabela perdeu o SELECT direto e pedir
    // `address` fazia o PostgREST recusar a consulta INTEIRA — a tela mostrava
    // "nenhuma reserva" quando na verdade era 42501. O caminho autorizado é a
    // RPC security-definer, via `loadPartnersById`.
    const { data, error } = await supabase
      .from("partner_freebie_reservations" as never)
      .select("id, qr_token, slot_start, slot_end, status, partner_id, partner_products(name, redemption_location_name, redemption_location_url)")
      .eq("profile_id" as never, profileId as never)
      .gte("slot_end" as never, new Date(Date.now() - 24 * 3600 * 1000).toISOString() as never)
      .order("slot_start" as never);

    // Falha de consulta e lista vazia são coisas diferentes, e precisam
    // parecer diferentes na tela. Foi exatamente isto que escondeu o
    // incidente dos gratuitos por horas.
    if (error) {
      console.error("[reservas de gratuito]", error);
      toast.error("Não foi possível carregar suas reservas. Tente de novo.");
      setLoading(false);
      return;
    }

    const linhas = ((data as unknown) as Array<Reservation & { partner_id: string | null }>) || [];
    const parceiros = await loadPartnersById(
      Array.from(new Set(linhas.map((r) => r.partner_id).filter((id): id is string => !!id))),
    );
    setItems(linhas.map((r) => {
      const parceiro = r.partner_id ? parceiros.get(r.partner_id) : undefined;
      return {
        ...r,
        partners: parceiro
          ? { fantasy_name: parceiro.fantasy_name, address: parceiro.address ?? null }
          : null,
      };
    }));
    setLoading(false);
  };

  useEffect(() => { load(); }, [refreshKey]);
  useEffect(() => {
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, []);

  // Live refresh for the open QR (catch "used" status)
  useEffect(() => {
    if (!selected) return;
    const t = setInterval(async () => {
      const { data, error } = await supabase
        .from("partner_freebie_reservations" as never)
        .select("status")
        .eq("id" as never, selected.id as never)
        .maybeSingle();
      if (error) { console.error("[reserva: status]", error); return; }
      const s = (data as { status?: string } | null)?.status;
      if (s && s !== selected.status) { setSelected({ ...selected, status: s }); load(); }
    }, 5000);
    return () => clearInterval(t);
  }, [selected]);

  /**
   * Cancelamento efetivo. A confirmação acontece em diálogo próprio, não em
   * `window.confirm` — o confirm nativo não abre em parte das WebViews do
   * app, e o botão parecia simplesmente não funcionar.
   *
   * As mensagens de erro de `cancel_partner_freebie` já vêm em português
   * do banco ("Reserva não pode ser cancelada", "Não é possível cancelar
   * após o início do horário"), então são exibidas como vêm.
   */
  const confirmarCancelamento = async () => {
    if (!paraCancelar || cancelando) return;
    setCancelando(true);
    const { error } = await supabase.rpc(
      "cancel_partner_freebie" as never,
      { _reservation_id: paraCancelar.id } as never,
    );
    setCancelando(false);
    setParaCancelar(null);

    if (error) {
      toast.error(error.message || "Não foi possível cancelar a reserva.");
      load(); // recarrega para refletir o estado real
      return;
    }
    toast.success("Reserva cancelada");
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
          const state = getReservationState(r, now);
          return (
            // Container, não <button>: o cancelar é um botão próprio e não
            // pode ficar aninhado dentro de outro botão.
            <div
              key={r.id}
              className="flex items-center gap-2 rounded-lg bg-black/30 p-2 transition-colors hover:bg-black/40"
            >
              <button
                type="button"
                onClick={() => setSelected(r)}
                className="flex-1 min-w-0 text-left"
              >
                <p className="text-xs font-bold text-white truncate">{r.partner_products?.name}</p>
                <p className="text-[10px] text-white/50 truncate">{r.partners?.fantasy_name}</p>
                <p className="text-[10px] text-white/60 mt-0.5 flex items-center gap-1">
                  <Clock className="h-3 w-3" />
                  {fmtDay(r.slot_start)} · {fmtTime(r.slot_start)}–{fmtTime(r.slot_end)}
                </p>
              </button>
              <div className="flex shrink-0 flex-col items-end gap-1">
                {isUsed ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-green-400"><CheckCircle2 className="h-3 w-3" /> Usado</span>
                ) : state.canOpenQr ? (
                  <span className="flex items-center gap-1 text-[10px] font-bold text-primary"><QrCode className="h-3 w-3" /> QR</span>
                ) : (
                  <span className={`text-[10px] font-bold ${state.tone}`}>{state.label}</span>
                )}
                {/* Cancelar visível na própria lista, sem precisar abrir o QR. */}
                {state.canCancel && (
                  <button
                    type="button"
                    onClick={() => setParaCancelar(r)}
                    className="rounded-md border border-red-400/25 px-2 py-0.5 text-[10px] font-bold text-red-300 transition-colors hover:bg-red-500/10"
                  >
                    Cancelar
                  </button>
                )}
              </div>
            </div>
          );
        })}
      </div>

      {selected && (
        <div className="fixed inset-0 z-[100] flex justify-center bg-black/85 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center" onClick={() => setSelected(null)}>
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
              (() => {
                const state = getReservationState(selected, now);
                return <>
                {state.canOpenQr ? (
                  <div className="mx-auto mt-2 rounded-2xl bg-white p-3 w-fit">
                    <QRCodeSVG value={selected.qr_token} size={220} level="H" />
                  </div>
                ) : (
                  <div className="mx-auto mt-2 rounded-2xl border border-white/10 bg-white/5 p-5">
                    <AlertCircle className={`mx-auto h-10 w-10 ${state.tone}`} />
                    <p className="mt-3 text-sm font-bold text-white">{state.label}</p>
                    <p className="mt-1 text-xs text-white/55">
                      {selected.status === "cancelled" ? "Esta reserva foi cancelada." : now < new Date(selected.slot_start).getTime()
                        ? `QR liberado no horário da reserva: ${fmtTime(selected.slot_start)}.`
                        : "Produto fora do horário de utilização."}
                    </p>
                  </div>
                )}
                <p className="mt-3 text-xs text-white/60 flex items-center justify-center gap-1">
                  <CalendarDays className="h-3 w-3" /> {fmtDay(selected.slot_start)} · {fmtTime(selected.slot_start)}–{fmtTime(selected.slot_end)}
                </p>
                {selected.partner_products?.redemption_location_name ? (
                  <a
                    href={selected.partner_products.redemption_location_url || `https://maps.google.com/?q=${encodeURIComponent(selected.partner_products.redemption_location_name)}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="mt-2 mx-auto flex w-fit items-center gap-1.5 rounded-lg bg-white/5 px-3 py-1.5 text-[11px] font-bold text-white hover:bg-white/10"
                  >
                    <MapPin className="h-3.5 w-3.5 text-primary" /> {selected.partner_products.redemption_location_name}
                    <span className="text-primary text-[10px]">→</span>
                  </a>
                ) : selected.partners?.address && (
                  <p className="mt-1 text-[11px] text-white/45">{selected.partners.address}</p>
                )}
                <p className="mt-3 text-[10px] text-white/40">
                  {state.canOpenQr ? "Mostre este QR ao parceiro para registrar sua presença." : "A reserva fica registrada para o parceiro mesmo antes da liberação do QR."}
                </p>
                {state.canCancel && <button type="button" onClick={() => setParaCancelar(selected)} className="mt-4 w-full rounded-lg bg-white/5 px-3 py-2 text-xs text-red-300 hover:bg-red-500/10">
                  Cancelar reserva
                </button>}
              </>;
              })()
            )}
          </div>
        </div>
      )}
      {/*
        Diálogo de confirmação próprio, acima do modal do QR (z-110 > z-100),
        porque o cancelar também pode ser acionado de dentro dele.
      */}
      {paraCancelar && (
        <div
          className="fixed inset-0 z-[110] flex justify-center bg-black/85 p-4 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center"
          onClick={() => { if (!cancelando) setParaCancelar(null); }}
        >
          <div
            className="w-full max-w-xs rounded-2xl p-5"
            style={{ backgroundColor: "#1A1A1A" }}
            onClick={(e) => e.stopPropagation()}
          >
            <p className="text-sm font-bold text-white">Cancelar esta reserva?</p>
            <p className="mt-1 text-xs leading-relaxed text-white/60">
              Você poderá reservar outro horário depois.
            </p>
            <p className="mt-2 text-[11px] text-white/45">
              {paraCancelar.partner_products?.name} · {fmtDay(paraCancelar.slot_start)} ·{" "}
              {fmtTime(paraCancelar.slot_start)}–{fmtTime(paraCancelar.slot_end)}
            </p>
            <div className="mt-4 flex gap-2">
              <button
                type="button"
                disabled={cancelando}
                onClick={() => setParaCancelar(null)}
                className="flex-1 rounded-lg bg-white/5 px-3 py-2 text-xs font-bold text-white hover:bg-white/10 disabled:opacity-40"
              >
                Voltar
              </button>
              <button
                type="button"
                disabled={cancelando}
                onClick={confirmarCancelamento}
                className="flex-1 rounded-lg bg-red-500/15 px-3 py-2 text-xs font-bold text-red-300 hover:bg-red-500/25 disabled:opacity-40"
              >
                {cancelando ? (
                  <span className="flex items-center justify-center gap-1.5">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" /> Cancelando
                  </span>
                ) : (
                  "Cancelar reserva"
                )}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
