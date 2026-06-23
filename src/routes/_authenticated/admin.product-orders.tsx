import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import { Loader2, Package, Truck, CheckCircle2, X, Clock, ChevronRight } from "lucide-react";
import {
  listOrderPoolEntries,
  updateTransactionOrderStatus,
  type OrderPoolEntry,
  type OrderPoolStatus,
} from "@/lib/orderpool.functions";

export const Route = createFileRoute("/_authenticated/admin/product-orders")({
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

type SaleGroup = {
  transactionId: string;
  studentName: string | null;
  coachName: string | null;
  hblFulfillerName: string | null;
  productName: string | null;
  totalAmount: number;
  createdAt: string;
  status: OrderPoolStatus; // status agregado (= status do primeiro entry; produtos vão juntos)
  trackingCode: string | null;
  notes: string | null;
  entries: OrderPoolEntry[];
};

function groupByTransaction(rows: OrderPoolEntry[]): SaleGroup[] {
  const map = new Map<string, SaleGroup>();
  for (const r of rows) {
    const key = r.transaction_id || `entry-${r.id}`;
    const g = map.get(key);
    if (g) {
      g.entries.push(r);
      g.totalAmount += r.amount;
    } else {
      map.set(key, {
        transactionId: key,
        studentName: r.student_name,
        coachName: r.coach_name,
        hblFulfillerName: r.hbl_fulfiller_name,
        productName: r.product_name,
        totalAmount: r.amount,
        createdAt: r.created_at,
        status: r.status,
        trackingCode: r.tracking_code,
        notes: r.notes,
        entries: [r],
      });
    }
  }
  return Array.from(map.values()).sort((a, b) => (b.createdAt || "").localeCompare(a.createdAt || ""));
}

function AdminProductOrdersPage() {
  const fetchList = useServerFn(listOrderPoolEntries);
  const updateTx = useServerFn(updateTransactionOrderStatus);
  const [rows, setRows] = useState<OrderPoolEntry[] | null>(null);
  const [filter, setFilter] = useState<OrderPoolStatus | "all">("all");
  const [editing, setEditing] = useState<SaleGroup | null>(null);
  const [tracking, setTracking] = useState("");
  const [notes, setNotes] = useState("");
  const [busy, setBusy] = useState(false);

  const reload = () =>
    fetchList({ data: { status: filter } })
      .then(setRows)
      .catch(() => toast.error("Erro ao carregar pedidos"));

  useEffect(() => {
    reload();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filter]);

  const sales = useMemo(() => (rows ? groupByTransaction(rows) : []), [rows]);

  const openEdit = (g: SaleGroup) => {
    setEditing(g);
    setTracking(g.trackingCode || "");
    setNotes(g.notes || "");
  };

  const save = async (newStatus: OrderPoolStatus) => {
    if (!editing) return;
    setBusy(true);
    try {
      await updateTx({
        data: {
          transactionId: editing.transactionId,
          status: newStatus,
          tracking,
          notes,
        },
      });
      toast.success("Venda atualizada");
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
          Vendas com produtos físicos a enviar. Cada linha é uma venda completa
          — os produtos da mesma venda são enviados juntos, então o status é
          aplicado à venda inteira. Clique para ver os produtos.
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
            {s === "all" ? "Todas" : STATUS_META[s as OrderPoolStatus].label}
          </button>
        ))}
      </div>

      {rows === null ? (
        <div className="flex justify-center p-12">
          <Loader2 className="h-6 w-6 animate-spin text-primary" />
        </div>
      ) : sales.length === 0 ? (
        <div className="rounded-lg border border-white/5 bg-white/5 p-8 text-center text-sm text-white/50">
          Nenhuma venda neste filtro.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-lg border border-white/5">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs uppercase text-white/50">
              <tr>
                <th className="p-3 text-left">Cliente</th>
                <th className="p-3 text-left">Coach</th>
                <th className="p-3 text-left">Venda</th>
                <th className="p-3 text-left">Coach HBL (envio)</th>
                <th className="p-3 text-center">Itens</th>
                <th className="p-3 text-right">Valor</th>
                <th className="p-3 text-left">Status</th>
                <th className="p-3 text-left">Criado</th>
                <th className="p-3"></th>
              </tr>
            </thead>
            <tbody>
              {sales.map((g) => {
                const meta = STATUS_META[g.status];
                const Icon = meta.icon;
                return (
                  <tr
                    key={g.transactionId}
                    className="border-t border-white/5 cursor-pointer hover:bg-white/5"
                    onClick={() => openEdit(g)}
                  >
                    <td className="p-3 text-white">{g.studentName || "—"}</td>
                    <td className="p-3 text-white/80">{g.coachName || "—"}</td>
                    <td className="p-3 font-mono text-[11px] text-white/50">
                      {g.transactionId.startsWith("entry-") ? "—" : g.transactionId.slice(0, 8)}
                    </td>
                    <td className="p-3 text-white/50 italic">
                      {g.hblFulfillerName || "— (aguardando HBL 42%/50%)"}
                    </td>
                    <td className="p-3 text-center text-white/70">{g.entries.length}</td>
                    <td className="p-3 text-right text-white">{money(g.totalAmount)}</td>
                    <td className="p-3">
                      <span className={`inline-flex items-center gap-1 rounded px-2 py-0.5 text-xs ${meta.color}`}>
                        <Icon className="h-3 w-3" /> {meta.label}
                      </span>
                    </td>
                    <td className="p-3 text-xs text-white/40">
                      {new Date(g.createdAt).toLocaleDateString("pt-BR")}
                    </td>
                    <td className="p-3 text-right">
                      <ChevronRight className="inline h-4 w-4 text-white/30" />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {editing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4"
          onClick={() => setEditing(null)}
        >
          <div
            className="w-full max-w-2xl space-y-4 rounded-xl border border-white/10 bg-[#0F0F0F] p-6 max-h-[90vh] overflow-y-auto"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2 className="text-lg font-bold text-white">Venda — produtos a enviar</h2>
              <div className="text-xs text-white/60 mt-1">
                Cliente: <span className="text-white">{editing.studentName || "—"}</span> • Coach:{" "}
                <span className="text-white">{editing.coachName || "—"}</span>
              </div>
              <div className="text-xs text-white/60">
                Coach HBL responsável pelo envio:{" "}
                <span className="text-white/50 italic">
                  {editing.hblFulfillerName || "— (aguardando funcionalidade HBL 42%/50%)"}
                </span>
              </div>
            </div>

            <div className="rounded-lg border border-white/5 bg-white/5 p-3">
              <p className="text-[10px] uppercase text-white/40 mb-2">Produtos desta venda</p>
              <div className="space-y-1.5">
                {editing.entries.map((e) => (
                  <div key={e.id} className="flex items-center justify-between text-xs">
                    <span className="text-white">{e.slot_label || e.product_name || "—"}</span>
                    <span className="text-white/70">{money(e.amount)}</span>
                  </div>
                ))}
                <div className="flex items-center justify-between border-t border-white/10 pt-1.5 text-xs font-bold">
                  <span className="text-white">Total</span>
                  <span className="text-primary">{money(editing.totalAmount)}</span>
                </div>
              </div>
            </div>

            <div>
              <label className="text-xs text-white/60">Código de rastreio (aplicado à venda)</label>
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
                    Marcar venda como {meta.label}
                  </button>
                );
              })}
            </div>
            <button
              onClick={() => setEditing(null)}
              className="w-full rounded bg-white/5 px-3 py-2 text-xs text-white/60"
            >
              Cancelar
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
