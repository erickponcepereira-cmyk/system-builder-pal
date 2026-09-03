import { createFileRoute } from "@tanstack/react-router";
import { useCallback, useEffect, useState } from "react";
import { Loader2, Undo2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import {
  ROTULO_MOTIVO,
  ROTULO_STATUS,
  type StatusEstorno,
  type StoreOrderType,
} from "@/lib/store-returns";

export const Route = createFileRoute("/_authenticated/admin/estornos")({ component: AdminEstornos });

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (d: string | null) =>
  d ? new Date(d).toLocaleString("pt-BR", { day: "2-digit", month: "2-digit", year: "2-digit", hour: "2-digit", minute: "2-digit" }) : "—";

type Linha = {
  id: string;
  order_id: string;
  order_type: StoreOrderType;
  reason: string;
  description: string | null;
  status: StatusEstorno;
  requested_at: string;
  resolved_at: string | null;
  refund_amount: number | null;
  admin_notes: string | null;
  blocks_settlement: boolean;
  metadata: {
    valor_da_compra?: number;
    produto?: string;
    origem?: StoreOrderType;
    is_test?: boolean;
  } | null;
  profiles: { name: string | null; email: string | null } | null;
};

const ABERTOS: StatusEstorno[] = ["requested", "under_review", "approved"];
const PROXIMOS: Partial<Record<StatusEstorno, StatusEstorno[]>> = {
  requested: ["under_review", "approved", "rejected"],
  under_review: ["approved", "rejected"],
  approved: ["refunded"],
};

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

  const decidir = async (l: Linha, novo: StatusEstorno) => {
    const r = rascunho[l.id] ?? { valor: "", nota: "" };
    const temValorInformado = r.valor.trim().length > 0;
    const valorInformado = temValorInformado ? Number(r.valor.replace(",", ".")) : null;
    const valorEfetivo = valorInformado ?? l.refund_amount;

    if (temValorInformado && (
      valorInformado == null || !Number.isFinite(valorInformado) || valorInformado <= 0
    )) {
      toast.error("Informe um valor de estorno válido.");
      return;
    }
    if (["approved", "refunded"].includes(novo) && (
      valorEfetivo == null || !Number.isFinite(valorEfetivo) || valorEfetivo <= 0
    )) {
      toast.error("Informe o valor a devolver antes de aprovar o estorno.");
      return;
    }
    const valorDaCompra = l.metadata?.valor_da_compra;
    if (valorEfetivo != null && valorDaCompra != null && valorEfetivo > Number(valorDaCompra)) {
      toast.error("O estorno não pode ser maior que o valor da compra.");
      return;
    }
    if (novo === "rejected" && !r.nota.trim()) {
      toast.error("Escreva o motivo da recusa — o aluno vê essa resposta.");
      return;
    }
    if (novo === "refunded" && !r.nota.trim()) {
      toast.error("Registre a confirmação do estorno já executado no gateway.");
      return;
    }

    setSalvando(l.id);
    const { error } = await supabase.rpc("admin_decide_return_request" as never, {
      _request_id: l.id,
      _new_status: novo,
      _refund_amount: valorInformado,
      _admin_notes: r.nota.trim() || null,
    } as never);
    setSalvando(null);

    if (error) {
      console.error("[admin-estornos] decidir", error);
      toast.error(error.message || "Não consegui salvar. Tente de novo.");
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
            {abertos} em aberto. Não confirme “Estornado” antes de concluir a operação no gateway.
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
            const proximos = PROXIMOS[l.status] ?? [];

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
                      {l.metadata?.is_test && <> · <strong className="text-amber-300">ambiente de teste</strong></>}
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
                        maxLength={3000}
                        placeholder="Resposta / confirmação do gateway (o aluno vê)"
                        className="min-w-[12rem] flex-1 rounded-lg border border-white/10 bg-background px-3 py-2 text-sm text-foreground"
                      />
                    </div>
                    <div className="flex flex-wrap gap-2">
                      {proximos.map((s) => (
                        <button
                          key={s}
                          type="button"
                          disabled={salvando === l.id}
                          onClick={() => decidir(l, s)}
                          className="rounded-lg border border-white/15 bg-background px-3 py-2 text-[11px] font-bold text-foreground disabled:opacity-40"
                        >
                          {salvando === l.id
                            ? "..."
                            : s === "refunded"
                              ? "Confirmar estorno executado"
                              : ROTULO_STATUS[s]}
                        </button>
                      ))}
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
