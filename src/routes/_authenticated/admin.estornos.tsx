import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Loader2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { ROTULO_MOTIVO, ROTULO_STATUS, type StatusEstorno } from "@/lib/store-returns";
import { executarEstorno } from "@/lib/refunds.functions";

export const Route = createFileRoute("/_authenticated/admin/estornos")({ component: AdminEstornos });

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (d: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Linha = {
  id: string;
  order_id: string;
  order_type: string;
  reason: string;
  description: string | null;
  status: StatusEstorno;
  requested_at: string;
  resolved_at: string | null;
  refund_amount: number | null;
  admin_notes: string | null;
  blocks_settlement: boolean;
  metadata: { valor_da_compra?: number; produto?: string; origem?: string } | null;
  profiles: { name: string | null; email: string | null } | null;
};

const ABERTOS: StatusEstorno[] = ["requested", "under_review", "approved"];

/**
 * Pedidos de estorno, do lado de quem decide.
 *
 * A contraparte de `RefundRequestSheet`. Sem esta tela o aluno mandava o
 * pedido para lugar nenhum: `return_requests` existia no banco havia dois
 * meses sem nenhuma superfície, nem para pedir nem para responder.
 *
 * A ordem é por pedido mais antigo primeiro, de propósito — quem está
 * esperando há mais tempo aparece em cima, e não some no fim da lista.
 */
function AdminEstornos() {
  const estornar = useServerFn(executarEstorno);
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [soAbertos, setSoAbertos] = useState(true);
  const [salvando, setSalvando] = useState<string | null>(null);
  const [rascunho, setRascunho] = useState<Record<string, { valor: string; nota: string }>>({});

  const carregar = useCallback(() => {
    setCarregando(true);
    void supabase
      .from("return_requests" as never)
      .select("id,order_id,order_type,reason,description,status,requested_at,resolved_at,refund_amount,admin_notes,blocks_settlement,metadata,profiles!return_requests_requested_by_fkey(name,email)" as never)
      .order("requested_at" as never, { ascending: true } as never)
      .then(({ data, error }) => {
        if (error) {
          console.error("[admin-estornos]", error);
          toast.error("Não consegui carregar os pedidos de estorno.");
        }
        setLinhas(((data as unknown as Linha[]) || []));
        setCarregando(false);
      });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  /**
   * Devolve o dinheiro e desfaz a venda em todas as pontas.
   *
   * Só depois de aprovado: aprovar autoriza, estornar executa. O resumo do
   * que saiu vai no toast porque é a única confirmação de que a comissão da
   * rede caiu junto — sem isso o admin fica sem saber se pegou.
   */
  const estornarDeVerdade = async (l: Linha, valor: number, nota: string) => {
    if (l.status !== "approved") {
      toast.error("Aprove o pedido primeiro. Aprovar autoriza; estornar devolve o dinheiro.");
      return;
    }
    setSalvando(l.id);
    try {
      const res = await estornar({ data: { returnRequestId: l.id, valorDevolvido: valor, nota: nota.trim() || undefined } });
      const partes = [
        `${res.comissoes_canceladas} comissões canceladas`,
        `${res.pessoas_recalculadas} carteiras recalculadas`,
        res.sistema_debitado > 0 ? `${dinheiro(res.sistema_debitado)} retirados do sistema` : null,
        res.tickets_revogados > 0 ? `${res.tickets_revogados} tickets revogados` : null,
        res.dias_de_carteirinha_retirados > 0 ? `${res.dias_de_carteirinha_retirados} dias de carteirinha retirados` : null,
        res.bloqueios_cancelados > 0 ? `${res.bloqueios_cancelados} bloqueios de nutri/professor cancelados` : null,
      ].filter(Boolean);
      toast.success(`Estornado. ${partes.join(" · ")}.`);
      if (res.tickets_ja_usados > 0) {
        toast.warning(`${res.tickets_ja_usados} ticket(s) já tinham sido usados em inscrição e não voltaram.`);
      }
    } catch (e) {
      console.error("[admin-estornos] estornar", e);
      toast.error((e as Error).message || "Não consegui estornar. Nada foi alterado.");
    }
    setSalvando(null);
    carregar();
  };

  const decidir = async (l: Linha, novo: StatusEstorno) => {
    const r = rascunho[l.id] ?? { valor: "", nota: "" };
    const valor = r.valor.trim() ? Number(r.valor.replace(",", ".")) : null;

    if (novo === "refunded" && (valor == null || !Number.isFinite(valor) || valor <= 0)) {
      toast.error("Informe o valor devolvido antes de marcar como estornado.");
      return;
    }
    if (novo === "rejected" && !r.nota.trim()) {
      toast.error("Escreva o motivo da recusa — o aluno vê essa resposta.");
      return;
    }

    // Estornar é a única decisão que mexe em dinheiro: sai do servidor, não
    // daqui. Aprovar continua sendo só autorização.
    if (novo === "refunded") {
      await estornarDeVerdade(l, valor as number, r.nota);
      return;
    }

    setSalvando(l.id);
    const { error } = await supabase
      .from("return_requests" as never)
      .update({
        status: novo,
        admin_notes: r.nota.trim() || l.admin_notes,
        refund_amount: valor ?? l.refund_amount,
        resolved_at: novo === "under_review" ? null : new Date().toISOString(),
        // Decisão final destrava o repasse; enquanto está em análise, segura.
        blocks_settlement: novo === "requested" || novo === "under_review" || novo === "approved",
      } as never)
      .eq("id" as never, l.id as never);
    setSalvando(null);

    if (error) {
      console.error("[admin-estornos] decidir", error);
      toast.error("Não consegui salvar. Tente de novo.");
      return;
    }
    toast.success(`Pedido marcado como "${ROTULO_STATUS[novo]}".`);
    carregar();
  };

  const visiveis = soAbertos ? linhas.filter((l) => ABERTOS.includes(l.status)) : linhas;
  const abertos = linhas.filter((l) => ABERTOS.includes(l.status)).length;

  return (
    <div className="flex flex-col gap-4 p-4 pb-10 lg:p-8">
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-xl font-bold text-foreground">
            <Undo2 className="h-5 w-5 text-primary" /> Pedidos de estorno
          </h1>
          <p className="text-xs text-muted-foreground">
            {abertos} em aberto. Enquanto um pedido está de pé, o repasse da venda fica retido.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setSoAbertos((v) => !v)}
          className="rounded-full border border-white/15 bg-card px-3 py-2 text-[11px] font-bold text-foreground"
        >
          {soAbertos ? "Ver todos" : "Ver só os abertos"}
        </button>
      </header>

      {carregando ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-muted-foreground" /></div>
      ) : visiveis.length === 0 ? (
        <p className="rounded-2xl border border-white/10 bg-card p-6 text-center text-sm text-muted-foreground">
          {soAbertos ? "Nenhum pedido em aberto." : "Nenhum pedido de estorno até agora."}
        </p>
      ) : (
        <div className="flex flex-col gap-3">
          {visiveis.map((l) => {
            const r = rascunho[l.id] ?? { valor: "", nota: "" };
            const set = (campo: "valor" | "nota", v: string) =>
              setRascunho((d) => ({ ...d, [l.id]: { ...r, [campo]: v } }));
            const aberto = ABERTOS.includes(l.status);

            return (
              <article key={l.id} className="rounded-2xl border border-white/10 bg-card p-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-sm font-bold text-foreground">
                      {l.metadata?.produto || "(produto não registrado)"}
                    </p>
                    <p className="text-[11px] text-muted-foreground">
                      {l.profiles?.name || "—"}{l.profiles?.email ? ` · ${l.profiles.email}` : ""}
                    </p>
                    <p className="mt-1 text-[11px] text-muted-foreground">
                      Pedido {quando(l.requested_at)} · {l.order_type}
                      {l.metadata?.valor_da_compra != null && <> · compra de {dinheiro(Number(l.metadata.valor_da_compra))}</>}
                    </p>
                  </div>
                  <span className={`rounded-full px-2 py-1 text-[10px] font-bold ${
                    aberto ? "bg-amber-500/15 text-amber-300" : "bg-white/10 text-muted-foreground"
                  }`}>
                    {ROTULO_STATUS[l.status]}
                  </span>
                </div>

                <div className="mt-3 rounded-xl border border-white/10 bg-muted/20 p-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motivo</p>
                  <p className="text-sm text-foreground">{ROTULO_MOTIVO(l.reason)}</p>
                  {l.description && (
                    <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">{l.description}</p>
                  )}
                </div>

                {aberto && (
                  <div className="mt-3 flex flex-col gap-2">
                    <div className="flex flex-wrap gap-2">
                      <input
                        value={r.valor}
                        onChange={(e) => set("valor", e.target.value)}
                        inputMode="decimal"
                        placeholder="Valor a devolver"
                        className="w-40 rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                      />
                      <input
                        value={r.nota}
                        onChange={(e) => set("nota", e.target.value)}
                        placeholder="Resposta ao aluno (ele vê isto)"
                        className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {(["under_review", "approved", "rejected"] as StatusEstorno[]).map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={salvando === l.id || l.status === s}
                          onClick={() => decidir(l, s)}
                          className="rounded-lg border border-white/15 bg-background px-3 py-2 text-[11px] font-bold text-foreground disabled:opacity-40"
                        >
                          {salvando === l.id ? "..." : ROTULO_STATUS[s]}
                        </button>
                      ))}
                      {/* Separado dos outros: é o único que mexe em dinheiro. */}
                      <button
                        type="button"
                        disabled={salvando === l.id || l.status !== "approved"}
                        onClick={() => decidir(l, "refunded")}
                        title={l.status !== "approved" ? "Aprove o pedido primeiro" : "Devolve e retira todas as comissões"}
                        className="rounded-lg border border-red-500/40 bg-red-500/10 px-3 py-2 text-[11px] font-bold text-red-300 disabled:opacity-40"
                      >
                        {salvando === l.id ? "..." : "Estornar e retirar comissões"}
                      </button>
                    </div>
                  </div>
                )}

                {!aberto && l.admin_notes && (
                  <p className="mt-2 text-[11px] text-muted-foreground">
                    Resposta enviada: {l.admin_notes}
                    {l.refund_amount != null && <> · devolvido {dinheiro(Number(l.refund_amount))}</>}
                  </p>
                )}
              </article>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default AdminEstornos;
