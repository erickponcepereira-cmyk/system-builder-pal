import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Users, X, MessageCircle } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { listProductBuyers, type ProductBuyersResult } from "@/lib/product-buyers.functions";
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
          <div className="mb-3 grid grid-cols-3 gap-2 text-center">
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-lg font-bold text-primary">{data.paidCount}</p>
              <p className="text-[10px] text-white/50">Vendas pagas</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-lg font-bold text-white">{data.pendingCount}</p>
              <p className="text-[10px] text-white/50">Pendentes</p>
            </div>
            <div className="rounded-xl bg-white/5 p-2">
              <p className="text-lg font-bold text-white">{data.stock === null ? "∞" : data.stock}</p>
              <p className="text-[10px] text-white/50">Vagas restantes</p>
            </div>
          </div>

          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Buscar por nome..."
            className="mb-3 w-full rounded-lg bg-white/5 px-3 py-2 text-sm text-white placeholder:text-white/30 outline-none"
          />

          {buyers.length === 0 ? (
            <p className="py-8 text-center text-sm text-white/40">Nenhuma compra registrada ainda.</p>
          ) : (
            <div className="space-y-2">
              {buyers.map((b) => (
                <div key={b.orderId} className="rounded-xl bg-white/5 p-3">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate text-sm font-semibold text-white">{b.name}</p>
                      <p className="text-[11px] text-white/50">
                        {fmtDate(b.purchasedAt)} · R$ {b.amount.toFixed(2)}
                      </p>
                      <p className="text-[11px] text-white/50">
                        Coach vendedor: <span className="text-white/80">{b.coachName || "—"}</span>
                      </p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1">
                      <span
                        className={`rounded px-1.5 py-0.5 text-[9px] font-semibold ${
                          b.status === "paid" ? "bg-green-500/15 text-green-400" : "bg-yellow-500/15 text-yellow-400"
                        }`}
                      >
                        {b.status === "paid" ? "pago" : b.status}
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
          )}
        </>
      )}
    </ModalShell>
  );
}

export default ProductBuyersModal;
