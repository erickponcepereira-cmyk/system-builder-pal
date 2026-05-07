import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Logo } from "@/components/Logo";
import { Copy, CheckCircle2, Clock, AlertCircle } from "lucide-react";

export const Route = createFileRoute("/pay/$orderNumber")({
  head: () => ({ meta: [{ title: "Pagamento — FitMind Club" }] }),
  component: PayPage,
});

type OrderData = {
  order: {
    number: string;
    status: string;
    paymentMethod: string;
    total: number;
    createdAt: string;
    clientName: string;
  };
  items: Array<{ title: string; quantity: number; unitPrice: number; totalPrice: number }>;
};

const money = (v: number) => `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function PayPage() {
  const { orderNumber } = Route.useParams();
  const [data, setData] = useState<OrderData | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    fetch(`/api/public/pay/${orderNumber}`)
      .then((r) => r.json())
      .then((d) => { if (d.error) setError("Pedido não encontrado"); else setData(d); })
      .catch(() => setError("Erro ao carregar pedido"))
      .finally(() => setLoading(false));
  }, [orderNumber]);

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  if (loading) return <div className="min-h-screen flex items-center justify-center bg-background text-white/60">Carregando…</div>;
  if (error || !data) return (
    <div className="min-h-screen flex items-center justify-center bg-background">
      <div className="text-center">
        <AlertCircle className="h-10 w-10 text-destructive mx-auto mb-3" />
        <p className="text-white/70">{error}</p>
      </div>
    </div>
  );

  const isPaid = data.order.status === "paid";
  const pmLabel = data.order.paymentMethod === "pix" ? "PIX" : data.order.paymentMethod === "credit_card" ? "Cartão de crédito" : "Cartão de débito";

  return (
    <div className="min-h-screen bg-background py-8 px-4">
      <div className="max-w-md mx-auto">
        <div className="flex justify-center mb-6"><Logo /></div>
        <div className="rounded-2xl p-6 border border-white/5" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-xs text-white/40 mb-1">Pedido</p>
          <p className="text-lg font-bold text-white mb-4">#{data.order.number}</p>

          <div className={`rounded-lg px-3 py-2 mb-5 flex items-center gap-2 ${isPaid ? "bg-success/10 text-success" : "bg-primary/10 text-primary"}`}>
            {isPaid ? <CheckCircle2 className="h-4 w-4" /> : <Clock className="h-4 w-4" />}
            <span className="text-xs font-bold">{isPaid ? "Pagamento confirmado" : "Aguardando pagamento"}</span>
          </div>

          <p className="text-xs text-white/40 mb-2">Cliente</p>
          <p className="text-sm text-white mb-4">{data.order.clientName}</p>

          <p className="text-xs text-white/40 mb-2">Itens</p>
          <div className="space-y-2 mb-4">
            {data.items.map((it, i) => (
              <div key={i} className="flex justify-between items-start text-sm">
                <div className="flex-1">
                  <p className="text-white">{it.title}</p>
                  <p className="text-[11px] text-white/40">{it.quantity}× {money(it.unitPrice)}</p>
                </div>
                <p className="text-white font-medium">{money(it.totalPrice)}</p>
              </div>
            ))}
          </div>

          <div className="border-t border-white/10 pt-4 mb-5 flex justify-between items-center">
            <span className="text-sm text-white/60">Total</span>
            <span className="text-2xl font-bold text-primary">{money(data.order.total)}</span>
          </div>

          <p className="text-xs text-white/40 mb-2">Forma de pagamento</p>
          <p className="text-sm text-white mb-5">{pmLabel}</p>

          {!isPaid && (
            <div className="rounded-lg bg-white/5 p-4 mb-4">
              <p className="text-xs text-white/60 mb-2">
                💡 O checkout automático ainda não está vinculado. Confirme o pagamento via {pmLabel.toLowerCase()} diretamente com o coach.
              </p>
            </div>
          )}

          <button
            onClick={copyLink}
            className="w-full flex items-center justify-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 px-4 py-2.5 text-sm text-white"
          >
            <Copy className="h-4 w-4" />
            {copied ? "Link copiado!" : "Copiar link do pedido"}
          </button>
        </div>
      </div>
    </div>
  );
}
