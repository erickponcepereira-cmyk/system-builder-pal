import { createFileRoute, Link } from "@tanstack/react-router";
import { OrdersInProgressPanel } from "@/components/shipping/OrdersInProgressPanel";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/orders-in-progress")({
  component: AdminOrdersInProgressPage,
  head: () => ({ meta: [{ title: "Compras físicas em andamento" }] }),
});

function AdminOrdersInProgressPage() {
  return (
    <div className="min-h-screen bg-background pb-20 pt-4">
      <div className="mx-auto max-w-4xl px-4">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/admin" className="rounded-full bg-white/5 p-2 text-white/70 hover:text-white">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-bold text-white">Compras físicas em andamento</h1>
        </div>
        <p className="mb-4 text-xs text-white/60">
          Todos os pedidos físicos ativos (Fitmind, parceiros e profissionais) com endereço, prazo e contador.
        </p>
        <OrdersInProgressPanel scope="admin" />
      </div>
    </div>
  );
}
