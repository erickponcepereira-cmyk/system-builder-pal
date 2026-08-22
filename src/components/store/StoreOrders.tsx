import { useEffect, useState } from "react";
import { Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { ChevronRight, Loader2, Package } from "lucide-react";

import { getStudentPurchaseHistory, type StudentPurchaseRow } from "@/lib/student-purchases.functions";

const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const dia = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit" }) : "";

/** Mesma normalização de status usada em StudentPurchaseHistory. */
const situacao = (s: string) => {
  const v = (s || "").toLowerCase();
  if (["paid", "pago", "approved", "completed"].includes(v)) return "pago" as const;
  if (["cancelled", "canceled", "cancelado", "refused", "failed", "rejected"].includes(v)) return "cancelado" as const;
  return "pendente" as const;
};

/**
 * Últimos pedidos, dentro da loja.
 *
 * A loja antiga mostrava "Meus pedidos" na própria tela, e a nova não pode
 * perder isso: depois de comprar, o lugar onde a pessoa procura o pedido é a
 * loja, não o perfil.
 *
 * Reaproveita `getStudentPurchaseHistory`, que já unifica as quatro origens
 * (FitMind, loja, parceiro, profissional) e já tem verificação de permissão no
 * servidor. Aqui só mostro os três mais recentes; o histórico inteiro continua
 * em /student/compras.
 */
export function StoreOrders({ studentId }: { studentId: string | null }) {
  const buscar = useServerFn(getStudentPurchaseHistory);
  const [linhas, setLinhas] = useState<StudentPurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!studentId) { setLoading(false); return; }
    let vivo = true;
    buscar({ data: { studentId } })
      .then((r) => { if (vivo) setLinhas(((r as StudentPurchaseRow[]) || []).slice(0, 3)); })
      .catch((e: unknown) => console.error("[store-orders]", e))
      .finally(() => { if (vivo) setLoading(false); });
    return () => { vivo = false; };
  }, [studentId, buscar]);

  if (!studentId || loading) {
    return loading && studentId ? (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    ) : null;
  }

  if (!linhas.length) return null;

  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">Meus pedidos</h2>
        <Link to="/student/compras" className="shrink-0 text-[11px] font-bold text-primary">
          Ver todos
        </Link>
      </div>

      <div className="flex flex-col gap-2">
        {linhas.map((r) => {
          const st = situacao(r.status);
          const cor =
            st === "pago" ? "text-emerald-500" : st === "pendente" ? "text-amber-500" : "text-destructive";
          return (
            <Link
              key={r.id}
              to="/student/compras"
              className="flex items-center gap-3 rounded-2xl bg-card p-3 transition-colors hover:bg-accent"
            >
              <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-muted">
                <Package className="h-4 w-4 text-muted-foreground" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-xs font-semibold text-foreground">
                  {r.product_name}
                </span>
                <span className="block text-[10px] tabular-nums text-muted-foreground">
                  {r.source_label} · {dia(r.paid_at || r.created_at)} ·{" "}
                  <span className={cor}>
                    {st === "pago" ? "Pago" : st === "pendente" ? "Aguardando" : "Cancelado"}
                  </span>
                </span>
              </span>
              <span className="shrink-0 text-xs font-bold tabular-nums text-foreground">
                {money(r.amount)}
              </span>
              <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
            </Link>
          );
        })}
      </div>
    </section>
  );
}

export default StoreOrders;
