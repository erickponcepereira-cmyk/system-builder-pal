import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, ShoppingBag, Store, Stethoscope, Handshake, CreditCard, Ticket, IdCard } from "lucide-react";
import { getStudentPurchaseHistory, type StudentPurchaseRow } from "@/lib/student-purchases.functions";
import { SaleChannelBadge } from "@/components/ui/SaleChannelBadge";
import { RefundRequestSheet, type CompraParaEstorno } from "@/components/store/RefundRequestSheet";
import { meusEstornos, ROTULO_STATUS, tipoDoPedido, type PedidoDeEstorno } from "@/lib/store-returns";
import { ReviewSheet } from "@/components/store/ReviewSheet";
import { StarRating } from "@/components/store/StarRating";
import { minhasAvaliacoes, type Avaliacao, type OrigemDoProduto } from "@/lib/store-reviews";

const fmt = (d: string | null | undefined) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" }) : "—";
const money = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

type StatusFilter = "all" | "paid" | "pending" | "cancelled";
const normalize = (s: string): StatusFilter => {
  const v = (s || "").toLowerCase();
  if (v === "paid" || v === "pago" || v === "approved" || v === "completed") return "paid";
  if (v === "cancelled" || v === "canceled" || v === "cancelado" || v === "refused" || v === "failed" || v === "rejected") return "cancelled";
  return "pending";
};

/** A origem da compra, no vocabulário de `product_reviews`. */
const origemDaCompra = (s: StudentPurchaseRow["source"]): OrigemDoProduto => {
  if (s === "partner") return "partner";
  if (s === "professional") return "professional";
  return "fitmind";
};

const sourceIcon = (s: StudentPurchaseRow["source"]) => {
  if (s === "professional") return <Stethoscope className="h-3.5 w-3.5" />;
  if (s === "partner") return <Handshake className="h-3.5 w-3.5" />;
  if (s === "fitmind_subscription") return <CreditCard className="h-3.5 w-3.5" />;
  return <Store className="h-3.5 w-3.5" />;
};

export function StudentPurchaseHistory({ studentId }: { studentId: string }) {
  const fetchHistory = useServerFn(getStudentPurchaseHistory);
  const [rows, setRows] = useState<StudentPurchaseRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<StatusFilter>("all");

  /**
   * Os pedidos de estorno desta pessoa, por compra.
   *
   * `return_requests` existe no banco desde julho, com RLS pronta, e nunca
   * teve tela — 0 linhas. Sem um caminho aqui, quem quisesse dinheiro de volta
   * só tinha o WhatsApp do coach.
   */
  const [estornos, setEstornos] = useState<Map<string, PedidoDeEstorno>>(new Map());
  const [pedindoPara, setPedindoPara] = useState<CompraParaEstorno | null>(null);

  const recarregarEstornos = useCallback(() => {
    void meusEstornos().then(setEstornos);
  }, []);

  useEffect(() => { recarregarEstornos(); }, [recarregarEstornos]);

  /**
   * O convite para avaliar mora aqui, e não na vitrine.
   *
   * É a mesma regra que o banco impõe — um gatilho recusa avaliação cujo
   * pedido não é de quem escreve. Convidar na vitrine seria oferecer o que vai
   * ser recusado.
   */
  const [avaliacoes, setAvaliacoes] = useState<Map<string, Avaliacao>>(new Map());
  const [avaliando, setAvaliando] = useState<StudentPurchaseRow | null>(null);

  const recarregarAvaliacoes = useCallback(() => {
    void minhasAvaliacoes().then(setAvaliacoes);
  }, []);

  useEffect(() => { recarregarAvaliacoes(); }, [recarregarAvaliacoes]);

  useEffect(() => {
    let cancel = false;
    setLoading(true);
    fetchHistory({ data: { studentId } })
      .then((data) => { if (!cancel) setRows(data || []); })
      .catch((e: any) => { console.error("[StudentPurchaseHistory]", e); })
      .finally(() => { if (!cancel) setLoading(false); });
    return () => { cancel = true; };
  }, [studentId, fetchHistory]);

  const filtered = filter === "all" ? rows : rows.filter((r) => normalize(r.status) === filter);

  const totalPaid = rows.filter((r) => normalize(r.status) === "paid").reduce((s, r) => s + r.amount, 0);
  const totalTokens = rows.filter((r) => normalize(r.status) === "paid").reduce((s, r) => s + (r.challenge_tokens_granted || 0), 0);
  const totalCardDays = rows.filter((r) => normalize(r.status) === "paid").reduce((s, r) => s + (r.card_days_granted || 0), 0);

  const chip = (id: StatusFilter, label: string) => (
    <button key={id} onClick={() => setFilter(id)} className={`rounded-lg px-3 py-1 text-[11px] font-bold ${filter === id ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:bg-white/10"}`}>{label}</button>
  );

  if (loading) {
    return <div className="flex items-center justify-center py-10 text-white/60"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-xl border border-white/5 bg-white/5 p-3">
          <p className="text-[10px] uppercase text-white/40">Total pago</p>
          <p className="text-sm font-bold text-emerald-300">{money(totalPaid)}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-3">
          <p className="text-[10px] uppercase text-white/40 flex items-center gap-1"><Ticket className="h-3 w-3" />Tickets desafio</p>
          <p className="text-sm font-bold text-amber-300">{totalTokens}</p>
        </div>
        <div className="rounded-xl border border-white/5 bg-white/5 p-3">
          <p className="text-[10px] uppercase text-white/40 flex items-center gap-1"><IdCard className="h-3 w-3" />Dias carteirinha</p>
          <p className="text-sm font-bold text-sky-300">{totalCardDays}</p>
        </div>
      </div>

      <div className="flex flex-wrap gap-1.5">
        {chip("all", "Todos")}
        {chip("paid", "Pago")}
        {chip("pending", "Pendente")}
        {chip("cancelled", "Cancelado")}
      </div>

      {filtered.length === 0 ? (
        <p className="py-6 text-center text-xs text-white/40">
          <ShoppingBag className="mx-auto mb-2 h-5 w-5 opacity-40" />
          Nenhuma compra encontrada.
        </p>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => {
            const st = normalize(r.status);
            const style = st === "paid"
              ? { border: "border-emerald-500/30", bg: "bg-emerald-500/5", text: "text-emerald-400", label: "Pago" }
              : st === "pending"
                ? { border: "border-amber-500/30", bg: "bg-amber-500/5", text: "text-amber-400", label: "Pendente" }
                : { border: "border-red-500/30", bg: "bg-red-500/5", text: "text-red-400", label: "Cancelado" };
            return (
              <div key={r.id} className={`rounded-xl border ${style.border} ${style.bg} p-3`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="inline-flex items-center gap-1 rounded-full bg-white/10 px-2 py-0.5 text-[10px] font-bold uppercase text-white/80">
                        {sourceIcon(r.source)} {r.source_label}
                      </span>
                      <SaleChannelBadge channel={r.sale_channel} compact />
                      <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${style.text}`}>{style.label}</span>
                      {r.order_number && <span className="text-[10px] text-white/40">#{r.order_number}</span>}
                    </div>
                    <p className="mt-1.5 truncate text-sm font-bold text-white">{r.product_name}</p>
                    {r.product_description && (
                      <p className="line-clamp-2 text-[11px] text-white/50">{r.product_description}</p>
                    )}
                    <p className="mt-1 text-[11px] text-white/60">
                      {fmt(r.paid_at || r.created_at)}
                      {r.payment_method && <> · {r.payment_method}</>}
                      {r.duration_days ? <> · {r.duration_days} dias</> : null}
                    </p>
                    {(r.challenge_tokens_granted > 0 || r.card_days_granted > 0) && (
                      <div className="mt-1.5 flex flex-wrap gap-1.5 text-[10px]">
                        {r.challenge_tokens_granted > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 font-bold text-amber-300">
                            <Ticket className="h-3 w-3" /> {r.challenge_tokens_granted} tickets
                          </span>
                        )}
                        {r.card_days_granted > 0 && (
                          <span className="inline-flex items-center gap-1 rounded-full bg-sky-500/15 px-2 py-0.5 font-bold text-sky-300">
                            <IdCard className="h-3 w-3" /> {r.card_days_granted} dias
                          </span>
                        )}
                      </div>
                    )}
                  </div>
                  <p className="whitespace-nowrap text-sm font-bold text-white">{money(r.amount)}</p>
                </div>

                {/* Estorno. Só faz sentido em compra paga: o que não foi pago
                    não tem o que devolver. */}
                {st === "paid" && (() => {
                  const pedido = estornos.get(r.id) ?? null;
                  const nota = avaliacoes.get(r.id) ?? null;
                  return (
                    <div className="mt-2 flex flex-wrap gap-2">
                      {/* Avaliar só faz sentido com o produto identificado: sem
                          product_id não há o que pontuar. */}
                      {r.product_id && (
                        <button
                          type="button"
                          onClick={() => setAvaliando(r)}
                          className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-white/15 bg-white/5 px-3 py-2 text-[11px] font-bold text-white/70"
                        >
                          {nota ? (
                            <>
                              <StarRating nota={nota.rating} /> <span>Sua avaliação</span>
                            </>
                          ) : "Avaliar"}
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => setPedindoPara({
                          id: r.id,
                          source: r.source,
                          produto: r.product_name,
                          valor: r.amount,
                          quando: r.paid_at || r.created_at,
                        })}
                        className={`flex-1 rounded-lg border px-3 py-2 text-[11px] font-bold ${
                          pedido
                            ? "border-amber-500/40 bg-amber-500/10 text-amber-300"
                            : "border-white/15 bg-white/5 text-white/70"
                        }`}
                      >
                        {pedido ? `Estorno: ${ROTULO_STATUS[pedido.status]}` : "Pedir estorno"}
                      </button>
                    </div>
                  );
                })()}
              </div>
            );
          })}
        </div>
      )}

      {avaliando?.product_id && (
        <ReviewSheet
          produto={avaliando.product_name}
          origem={origemDaCompra(avaliando.source)}
          produtoId={avaliando.product_id}
          orderId={avaliando.id}
          orderType={tipoDoPedido(avaliando.source)}
          existente={avaliacoes.get(avaliando.id) ?? null}
          onFechar={() => setAvaliando(null)}
          onMudou={recarregarAvaliacoes}
        />
      )}

      {pedindoPara && (
        <RefundRequestSheet
          compra={pedindoPara}
          existente={estornos.get(pedindoPara.id) ?? null}
          onFechar={() => setPedindoPara(null)}
          onMudou={recarregarEstornos}
        />
      )}
    </div>
  );
}

export default StudentPurchaseHistory;
