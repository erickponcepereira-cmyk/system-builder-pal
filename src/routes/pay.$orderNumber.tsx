import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { CheckCircle2, Clock, AlertCircle } from "lucide-react";
import { MercadoPagoCheckout } from "@/components/payments/MercadoPagoCheckout";

export const Route = createFileRoute("/pay/$orderNumber")({
  head: () => ({ meta: [{ title: "Pagamento — FitMind Club" }] }),
  component: PayPage,
});

type OrderData = {
  order: {
    id: string;
    number: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    clientName: string;
    clientEmail: string | null;
  };
  items: Array<{ title: string; quantity: number; unitPrice: number; totalPrice: number }>;
};

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function PayPage() {
  const { orderNumber } = Route.useParams();
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = () => {
    fetch(`/api/public/pay/${orderNumber}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError("Pedido não encontrado"); else setData(d); })
      .catch(() => setError("Erro ao carregar pedido"))
      .finally(() => setLoading(false));
  };

  useEffect(() => { reload(); }, [orderNumber]);

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-muted-foreground">Carregando…</div>;
  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
        <p className="text-muted-foreground">{error}</p>
      </div>
    </div>
  );

  const isPaid = data.order.status === "paid";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto space-y-4">
        <div className="flex justify-center"><Logo /></div>

        <div className="rounded-2xl border border-border bg-card p-5">
          <p className="text-xs text-muted-foreground mb-1">Pedido</p>
          <p className="text-lg font-bold text-foreground mb-3">#{data.order.number}</p>
          <div className={`rounded-lg px-3 py-2 mb-4 flex items-center gap-2 ${isPaid ? "bg-green-500/10 text-green-500" : "bg-primary/10 text-primary"}`}>
            {isPaid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            <span className="text-xs font-bold">{isPaid ? "Pagamento confirmado" : "Aguardando pagamento"}</span>
          </div>
          <p className="text-xs text-muted-foreground mb-2">Cliente: <span className="text-foreground">{data.order.clientName}</span></p>
          <div className="space-y-1 mb-3">
            {data.items.map((it, i) => (
              <div key={i} className="flex justify-between text-sm">
                <span className="text-foreground">{it.quantity}× {it.title}</span>
                <span className="text-foreground font-medium">{money(it.totalPrice)}</span>
              </div>
            ))}
          </div>
          <div className="border-t border-border pt-3 flex justify-between">
            <span className="text-sm text-muted-foreground">Total</span>
            <span className="text-2xl font-bold text-primary">{money(data.order.total)}</span>
          </div>
        </div>

        {!isPaid && (
          <MercadoPagoCheckout
            source={{ kind: "store_order", id: data.order.id }}
            amount={data.order.total}
            description={`Pedido #${data.order.number}`}
            defaultPayer={{ email: data.order.clientEmail || "", name: data.order.clientName }}
            onApproved={reload}
          />
        )}
      </div>
    </div>
  );
}
