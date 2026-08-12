import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users, X, MessageCircle, Download } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { listProductBuyers, type ProductBuyersResult, type ProductBuyerRow } from "@/lib/product-buyers.functions";
const onlyDigits = (v: string) => v.replace(/\D/g, "");

type Props = {
  productType: "partner" | "professional";
  productId: string;
  productName?: string;
  onClose: () => void;
};

function fmtDate(iso: string | null) {
  if (!iso) return "—";
  try {
    return new Date(iso).toLocaleString("pt-BR", { dateStyle: "short", timeStyle: "short" });
  } catch {
    return "—";
  }
}

function monthKey(iso: string | null) {
  if (!iso) return "0000-00";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "0000-00";
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

function monthLabel(key: string) {
  if (key === "0000-00") return "Sem data";
  const [y, m] = key.split("-");
  const d = new Date(Number(y), Number(m) - 1, 1);
  const s = d.toLocaleDateString("pt-BR", { month: "long", year: "numeric" });
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const CANCELLED = ["cancelled", "refunded", "failed", "rejected"];
const isCancelled = (s: string) => CANCELLED.includes(s);

type Filter = "all" | "paid" | "pending" | "cancelled";

export function ProductBuyersModal({ productType, productId, productName, onClose }: Props) {
  const load = useServerFn(listProductBuyers);
  const [data, setData] = useState<ProductBuyersResult | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [q, setQ] = useState("");
  const [filter, setFilter] = useState<Filter>("all");

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    load({ data: { productType, productId } })
      .then((r) => { if (alive) setData(r as ProductBuyersResult); })
      .catch((e: unknown) => { if (alive) setError(e instanceof Error ? e.message : "Erro ao carregar compradores"); });
    return () => { alive = false; };
  }, [productType, productId, load]);

  const buyers = (data?.buyers || [])
    .filter((b) =>
      filter === "all"
        ? true
        : filter === "paid"
          ? b.status === "paid"
          : filter === "cancelled"
            ? isCancelled(b.status)
            : b.status !== "paid" && !isCancelled(b.status),
    )
    .filter((b) => (q.trim() ? b.name.toLowerCase().includes(q.trim().toLowerCase()) : true));

  const months = useMemo(() => {
    const map = new Map<string, ProductBuyerRow[]>();
    for (const b of buyers) {
      const k = monthKey(b.purchasedAt);
      const arr = map.get(k) || [];
      arr.push(b);
      map.set(k, arr);
    }
    return Array.from(map.entries())
      .sort((a, b) => (a[0] < b[0] ? 1 : -1))
      .map(([key, rows]) => {
        const sorted = [...rows].sort((x, y) =>
          new Date(y.purchasedAt || 0).getTime() - new Date(x.purchasedAt || 0).getTime());
        const paid = sorted.filter((r) => r.status === "paid");
        const cancelled = sorted.filter((r) => isCancelled(r.status));
        const pending = sorted.filter((r) => r.status !== "paid" && !isCancelled(r.status));
        const sum = (rs: ProductBuyerRow[]) => rs.reduce((t, r) => t + r.amount, 0);
        return {
          key,
          label: monthLabel(key),
          rows: sorted,
          paidCount: paid.length,
          paidTotal: sum(paid),
          pendingCount: pending.length,
          pendingTotal: sum(pending),
          cancelledCount: cancelled.length,
        };
      });
  }, [buyers]);

  const exportCsv = () => {
    const head = ["Mes", "Nome", "Telefone", "Data", "Valor", "Status", "Coach vendedor", "Coach responsavel"];
    const lines = months.flatMap((m) =>
      m.rows.map((b) => [
        m.label,
        b.name,
        b.phone || "",
        fmtDate(b.purchasedAt),
        b.amount.toFixed(2).replace(".", ","),
        b.status === "paid" ? "pago" : isCancelled(b.status) ? "cancelado" : b.status,
        b.coachName || "",
        b.responsibleCoachName || "",
      ]),
    );
    const csv = [head, ...lines]
      .map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(";"))
      .join("\n");
    const url = URL.createObjectURL(new Blob(["\ufeff" + csv], { type: "text/csv;charset=utf-8" }));
    const a = document.createElement("a");
    a.href = url;
    a.download = `compradores-${(data?.productName || "produto").replace(/\s+/g, "-").toLowerCase()}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };


  return (
    <ModalShell
      className="max-w-2xl"
      zIndex={60}
      header={
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="flex items-center gap-2 text-base font-bold text-white">
              <Users className="h-4 w-4 text-primary" /> Compradores
            </h3>
            <p className="truncate text-[11px] text-white/50">{data?.productName || productName || ""}</p>
          </div>
          <button onClick={onClose} className="rounded-lg bg-white/5 p-1.5 text-white/70 hover:bg-white/10">
            <X className="h-4 w-4" />
          </button>
        </div>
      }
      footer={
        <button onClick={onClose} className="w-full rounded-lg bg-white/10 px-4 py-2 text-sm font-medium text-white">
          Fechar
        </button>
      }
    >
      {!data && !error && (
        <div className="flex items-center justify-center py-10 text-white/50">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      )}
      {error && <p className="py-6 text-center text-sm text-red-400">{error}</p>}

      {data && (
        <>
          <div className="mb-3 grid grid-cols-4 gap-2 text-center">
            <button
              onClick={() => setFilter("paid")}
              className={`rounded-xl p-2 transition ${filter === "paid" ? "bg-primary/20 ring-1 ring-primary/60" : "bg-white/5"}`}
            >
              <p className="text-lg font-bold text-primary">{data.paidCount}</p>
              <p className="text-[10px] text-white/50">Pagas</p>
            </button>
            <button
              onClick={() => setFilter("pending")}
              className={`rounded-xl p-2 transition ${filter === "pending" ? "bg-yellow-500/20 ring-1 ring-yellow-500/60" : "bg-white/5"}`}
            >
              <p className="text-lg font-bold text-yellow-400">{data.pendingCount}</p>
              <p className="text-[10px] text-white/50">Pendentes</p>
            </button>
            <button
              onClick={() => setFilter("cancelled")}
              className={`rounded-xl p-2 transition ${filter === "cancelled" ? "bg-red-500/20 ring-1 ring-red-500/60" : "bg-white/5"}`}
            >
              <p className="text-lg font-bold text-red-400">{data.cancelledCount}</p>
              <p className="text-[10px] text-white/50">Canceladas</p>
            </button>
            <button
              onClick={() => setFilter("all")}
              className={`rounded-xl p-2 transition ${filter === "all" ? "bg-white/15 ring-1 ring-white/40" : "bg-white/5"}`}
            >
              <p className="text-lg font-bold text-white">{data.remaining === null ? "∞" : data.remaining}</p>
              <p className="text-[10px] text-white/50">Vagas restantes</p>
            </button>
          </div>


          <div className="mb-3 flex gap-2">
            <input
              value={q}
              onChange={(e) => setQ(e.target.value)}
              placeholder="Buscar por nome..."
              className="w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
            />
            <button
              onClick={exportCsv}
              disabled={buyers.length === 0}
              className="flex shrink-0 items-center gap-1 rounded-lg bg-white/10 px-3 py-2 text-xs font-semibold text-white disabled:opacity-40"
            >
              <Download className="h-3.5 w-3.5" /> CSV
            </button>
          </div>

          {buyers.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/40">Nenhuma compra registrada ainda.</p>
          ) : (
            <div className="space-y-4">
              {months.map((m) => (
                <div key={m.key}>
                  <div className="mb-2 flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1 border-b border-white/10 pb-1">
                    <p className="text-sm font-bold text-white">{m.label}</p>
                    <p className="text-[10px] text-white/50">
                      <span className="text-green-400">{m.paidCount} pagas · R$ {m.paidTotal.toFixed(2)}</span>
                      {" · "}
                      <span className="text-yellow-400">{m.pendingCount} pend. · R$ {m.pendingTotal.toFixed(2)}</span>
                      {" · "}
                      <span className="text-red-400">{m.cancelledCount} canc.</span>
                    </p>
                  </div>
                  <div className="space-y-2">
                    {m.rows.map((b) => (
                      <div key={b.orderId} className="rounded-xl bg-white/5 p-3">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="truncate text-sm font-semibold text-white">{b.name}</p>
                            <p className="text-[11px] text-white/50">
                              {fmtDate(b.purchasedAt)} · R$ {b.amount.toFixed(2)}
                            </p>
                            <p className="text-[11px] text-white/50">
                              Coach responsável: <span className="text-white/80">{b.responsibleCoachName || "—"}</span>
                            </p>
                            <p className="text-[11px] text-white/50">
                              Coach vendedor: <span className="text-white/80">{b.coachName || "—"}</span>
                            </p>
                          </div>
                          <div className="flex shrink-0 flex-col items-end gap-1">
                            <span
                              className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                                b.status === "paid"
                                  ? "bg-green-500/15 text-green-400"
                                  : isCancelled(b.status)
                                    ? "bg-red-500/15 text-red-400"
                                    : "bg-yellow-500/15 text-yellow-400"
                              }`}
                            >
                              {b.status === "paid" ? "pago" : isCancelled(b.status) ? "cancelado" : b.status}
                            </span>

                            {b.phone ? (
                              <a
                                href={`https://wa.me/55${onlyDigits(b.phone)}`}
                                target="_blank"
                                rel="noreferrer"
                                className="inline-flex items-center gap-1 text-[11px] text-primary hover:text-primary/80"
                              >
                                <MessageCircle className="h-3 w-3" /> {b.phone}
                              </a>
                            ) : (
                              <span className="text-[11px] text-white/30">sem telefone</span>
                            )}
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          )}

        </>
      )}
    </ModalShell>
  );
}

export default ProductBuyersModal;
