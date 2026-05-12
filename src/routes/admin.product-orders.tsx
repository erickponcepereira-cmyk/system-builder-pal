import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Package, Truck, CheckCircle2, X, Clock } from "lucide-react";
import {
  listOrderPoolEntries,
  updateOrderPoolEntry,
  type OrderPoolEntry,
  type OrderPoolStatus,
} from "@/lib/orderpool.functions";

export const Route = createFileRoute("/admin/product-orders")({
  head: () => ({ meta: [{ title: "Painel de Pedidos — Admin" }] }),
  component: AdminProductOrdersPage,
});

const STATUS_META: Record<OrderPoolStatus, { label: string; color: string; icon: typeof Clock }> = {
  pending: { label: "Pendente", color: "bg-amber-500/15 text-amber-300", icon: Clock },
  preparing: { label: "Separando", color: "bg-sky-500/15 text-sky-300", icon: Package },
  shipped: { label: "Enviado", color: "bg-indigo-500/15 text-indigo-300", icon: Truck },
  delivered: { label: "Entregue", color: "bg-emerald-500/15 text-emerald-300", icon: CheckCircle2 },
  cancelled: { label: "Cancelado", color: "bg-red-500/15 text-red-300", icon: X },
};

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

function AdminProductOrdersPage() {
  const fetchList = useServerFn(listOrderPoolEntries);
  const updateFn = useServerFn(updateOrderPoolEntry);
  const [rows, setRows] = useState<OrderPoolEntry[] | null>(null);
  const [filter, setFilter] = useState<OrderPoolStatus | "all">("all");
  const [editing, setEditing] = useState<OrderPoolEntry | null>(null);
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchList({ data: { status: filter } })
      .then(setRows)
      .catch(() => toast.error("Erro ao carregar pedidos"));

  useEffect(() => {
    reload();
  }, [filter]);

  const openEdit = (e: OrderPoolEntry) => {
    setEditing(e);
    setTracking(e.tracking_code || "");
    setNotes(e.notes || "");
  };

  const save = async (newStatus: OrderPoolStatus) => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateFn({
        data: { entryId: editing.id, status: newStatus, tracking, notes },
      });
      toast.success("Pedido atualizado");
      setEditing(null);
      reload();
    } catch (err: any) {
      toast.error(err.message || "Erro");
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold text-white">Painel de Pedidos</h1>
        <p className="text-xs text-white/50">
          Itens cuja parte do valor foi direcionada à pool de "Painel de Pedidos" (custos de produto físico).
          Atualize o status conforme separa, envia e entrega.
        </p>
      </div>

      <div className="flex flex-wrap gap-2">
        {(["all", "pending", "preparing", "shipped", "delivered", "cancelled"] as const).map((s) => (
          <button
            key={s}
            onClick={() => setFilter(s)}
            className={`rounded-lg px-3 py-1.5 text-xs font-medium transition ${
              filter === s
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-white/60 hover:bg-white/10"
            }`}
          >
            {s === "all" ? "Todos" : STATUS_META[s as OrderPoolStatus].label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : rows.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 p-8 text-center text-sm text-white/50">
          Nenhum pedido neste filtro.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="p-3 text-left">Aluno</th>
                <th className="p-3 text-left">Produto</th>
                <th className="p-3 text-left">Slot</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-left">Rastreio</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Criado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => {
                const meta = STATUS_META[r.status];
                const Icon = meta.icon;
                return (
                  <tr key={r.id} className="border-t border-white/5">
                    <td className="p-3 text-white">{r.student_name || "—"}</td>
                    <td className="p-3 text-white/80">{r.product_name || "—"}</td>
                    <td className="p-3 text-white/60">{r.slot_label || "—"}</td>
                    <td className="p-3 text-right text-white">{money(r.amount)}</td>
                    <td className="p-3 text-white/60">{r.tracking_code || "—"}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-white/40">
                      {new Date(r.created_at).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      <button
                        onClick={() => openEdit(r)}
                        className="rounded bg-white/10 px-2 py-1 text-xs text-white hover:bg-white/20"
                      >
                        Atualizar
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setEditing(null)}>
          <div
            className="w-full max-w-lg space-y-4 rounded-xl border border-white/10 bg-[#0F0F0F] p-6"
            onClick={(e) => e.stopPropagation()}
          >
            <h2 className="text-lg font-bold text-white">Atualizar pedido</h2>
            <div className="text-xs text-white/60">
              {editing.student_name || "—"} • {editing.product_name || editing.slot_label}
              <div className="text-white">{money(editing.amount)}</div>
            </div>
            <div>
              <label className="text-xs text-white/60">Código de rastreio</label>
              <input
                value={tracking}
                onChange={(e) => setTracking(e.target.value)}
                className="mt-1 w-full rounded bg-white/5 px-3 py-2 text-sm text-white outline-none"
                placeholder="BR123456789BR"
              />
            </div>
            <div>
              <label className="text-xs text-white/60">Notas</label>
              <textarea
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
                className="mt-1 w-full rounded bg-white/5 px-3 py-2 text-sm text-white outline-none"
                rows={2}
              />
            </div>
            <div className="grid grid-cols-2 gap-2">
              {(["preparing", "shipped", "delivered", "cancelled"] as OrderPoolStatus[]).map((s) => {
                const meta = STATUS_META[s];
                return (
                  <button
                    key={s}
                    disabled={busy}
                    onClick={() => save(s)}
                    className={`rounded-lg px-3 py-2 text-xs font-medium ${meta.color} hover:opacity-80 disabled:opacity-50`}
                  >
                    Marcar como {meta.label}
                  </button>
                );
              })}
            </div>
            <button onClick={() => setEditing(null)} className="w-full rounded bg-white/5 px-3 py-2 text-xs text-white/60">
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
