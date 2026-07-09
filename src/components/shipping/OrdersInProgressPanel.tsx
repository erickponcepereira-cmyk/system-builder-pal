import { useEffect, useState } from "react";
import { Loader2, Package, MapPin, ExternalLink, Clock } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { getOngoingShippingOrders, type OngoingShippingOrder } from "@/lib/shipping-orders.functions";

function formatDate(s: string | null) {
  if (!s) return "—";
  return new Date(s).toLocaleDateString("pt-BR");
}

function daysBetween(start: string, end: Date) {
  const s = new Date(start).getTime();
  const diffMs = end.getTime() - s;
  return Math.floor(diffMs / 86400000);
}

function DeliveryCountdown({ startAt, days }: { startAt: string | null; days: number | null }) {
  const [now, setNow] = useState(new Date());
  useEffect(() => {
    const t = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(t);
  }, []);
  if (!startAt || !days) {
    return (
      <div className="rounded-lg bg-amber-500/10 px-2 py-1 text-[11px] font-bold text-amber-300">
        Aguardando pagamento
      </div>
    );
  }
  const elapsed = Math.max(0, daysBetween(startAt, now));
  const remaining = Math.max(0, days - elapsed);
  const overdue = elapsed > days;
  return (
    <div
      className={`rounded-lg px-2 py-1 text-[11px] font-bold ${
        overdue ? "bg-red-500/15 text-red-300" : "bg-primary/15 text-primary"
      }`}
    >
      {overdue ? `Atrasado ${elapsed - days} dia(s)` : `${remaining} dia(s) restantes`}
      <span className="ml-1 font-normal text-white/50">({elapsed}/{days})</span>
    </div>
  );
}

export function OrdersInProgressPanel({
  scope,
  studentId,
  partnerId,
  coachId,
}: {
  scope: "student" | "partner" | "professional" | "admin";
  studentId?: string | null;
  partnerId?: string | null;
  coachId?: string | null;
}) {
  const [rows, setRows] = useState<OngoingShippingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const load = useServerFn(getOngoingShippingOrders);

  useEffect(() => {
    setLoading(true);
    load({
      data: {
        scope,
        student_id: studentId || undefined,
        partner_id: partnerId || undefined,
        coach_id: coachId || undefined,
      },
    })
      .then((r: any) => setRows(r || []))
      .catch(() => setRows([]))
      .finally(() => setLoading(false));
  }, [load, scope, studentId, partnerId, coachId]);

  if (loading) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  if (!rows.length) {
    return (
      <div className="rounded-xl border border-white/10 bg-white/5 p-6 text-center">
        <Package className="mx-auto mb-2 h-8 w-8 text-white/30" />
        <p className="text-sm text-white/60">Nenhuma compra física em andamento.</p>
      </div>
    );
  }

  const sourceLabel = (s: string) => (s === "store" ? "Fitmind" : s === "partner" ? "Parceiro" : "Profissional");

  return (
    <div className="space-y-3">
      {rows.map((o) => (
        <div key={`${o.source}-${o.id}`} className="rounded-2xl border border-white/10 bg-white/5 p-4">
          <div className="mb-2 flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] uppercase tracking-wider text-white/40">
                {sourceLabel(o.source)} · #{o.order_number}
              </p>
              <h3 className="mt-0.5 text-sm font-bold text-white line-clamp-1">{o.product_name}</h3>
              {scope !== "student" && o.student && (
                <p className="mt-0.5 text-[11px] text-white/50">
                  Cliente: <span className="text-white/80">{o.student.name}</span>
                  {o.student.email ? ` · ${o.student.email}` : ""}
                </p>
              )}
            </div>
            <DeliveryCountdown startAt={o.delivery_started_at || o.paid_at} days={o.delivery_days} />
          </div>

          <div className="grid grid-cols-2 gap-2 text-[11px] text-white/60">
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <span className="block text-white/40">Pedido</span>
              <span className="text-white">{formatDate(o.created_at)}</span>
            </div>
            <div className="rounded-lg bg-black/20 px-2 py-1.5">
              <span className="block text-white/40">Prazo médio</span>
              <span className="text-white">{o.delivery_days ? `${o.delivery_days} dia(s)` : "—"}</span>
            </div>
            <div className="col-span-2 rounded-lg bg-black/20 px-2 py-1.5">
              <span className="block text-white/40">Status</span>
              <span className="text-white">
                {o.status === "paid" ? "Pago" : o.status === "pending" ? "Aguardando pagamento" : o.status}
              </span>
            </div>
          </div>

          <div className="mt-3 rounded-lg border border-primary/20 bg-primary/5 p-3">
            <div className="mb-1 flex items-center gap-1.5 text-[10px] font-bold uppercase tracking-wider text-primary">
              <MapPin className="h-3 w-3" /> Endereço de entrega
            </div>
            <p className="text-[12px] text-white">
              {o.shipping.address || <span className="text-white/40">endereço não informado</span>}
              {o.shipping.number ? `, ${o.shipping.number}` : ""}
            </p>
            {o.shipping.zip && <p className="text-[11px] text-white/50">CEP {o.shipping.zip}</p>}
            {o.shipping.reference && (
              <p className="mt-0.5 text-[11px] text-white/50">Ref.: {o.shipping.reference}</p>
            )}
            {o.shipping.location_url && (
              <a
                href={o.shipping.location_url}
                target="_blank"
                rel="noreferrer"
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-bold text-primary hover:underline"
              >
                <ExternalLink className="h-3 w-3" /> Abrir mapa
              </a>
            )}
          </div>

          {o.paid_at && (
            <div className="mt-2 flex items-center gap-1 text-[10px] text-white/40">
              <Clock className="h-3 w-3" /> Pago em {new Date(o.paid_at).toLocaleString("pt-BR")}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
