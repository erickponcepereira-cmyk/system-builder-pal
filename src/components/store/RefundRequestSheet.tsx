import { useState } from "react";
import { Loader2, X, AlertTriangle } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { useFecharComEscape, Z_MODAL_DA_LOJA } from "@/hooks/use-fechar-com-escape";
import {
  MOTIVOS,
  pedirEstorno,
  type PedidoDeEstorno,
  ROTULO_MOTIVO,
  ROTULO_STATUS,
  cancelarEstorno,
} from "@/lib/store-returns";
import type { PurchaseSource } from "@/lib/student-purchases.functions";

const dinheiro = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
const quando = (d: string | null) =>
  d ? new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", year: "numeric" }) : "—";

export type CompraParaEstorno = {
  id: string;
  source: PurchaseSource;
  produto: string;
  valor: number;
  quando: string | null;
};

/**
 * Pedir estorno, e acompanhar o que foi pedido.
 *
 * O mesmo painel serve os dois momentos porque são o mesmo assunto: quem já
 * pediu volta aqui para saber em que pé está, e quem ainda não pediu precisa
 * ver o que vai acontecer antes de pedir. Separar em duas telas faria a pessoa
 * procurar.
 *
 * Fecha por Escape e por clique fora — a loja tem oito overlays escritos à mão
 * e nenhum deles fecha por Escape; este não repete o costume.
 */
export function RefundRequestSheet({
  compra,
  existente,
  onFechar,
  onMudou,
}: {
  compra: CompraParaEstorno;
  existente: PedidoDeEstorno | null;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [motivo, setMotivo] = useState<string>("");
  const [detalhe, setDetalhe] = useState("");
  const [enviando, setEnviando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);

  useFecharComEscape(onFechar);

  const escolhido = MOTIVOS.find((m) => m.valor === motivo);
  const faltaDetalhe = !!escolhido?.pedeDetalhe && detalhe.trim().length < 10;
  const podeEnviar = !!motivo && !faltaDetalhe && !enviando;

  const enviar = async () => {
    if (!podeEnviar) return;
    setEnviando(true);
    setErro(null);
    const r = await pedirEstorno({
      orderId: compra.id,
      source: compra.source,
      motivo,
      detalhe,
      valorDaCompra: compra.valor,
      nomeDoProduto: compra.produto,
    });
    setEnviando(false);
    if (!r.ok) { setErro(r.erro); return; }
    onMudou();
    onFechar();
  };

  const desistir = async () => {
    if (!existente) return;
    setEnviando(true);
    const r = await cancelarEstorno(existente.id);
    setEnviando(false);
    if (!r.ok) { setErro(r.erro ?? "Não consegui cancelar."); return; }
    onMudou();
    onFechar();
  };

  const emAndamento = existente && ["requested", "under_review", "approved"].includes(existente.status);
  const podeDesistir = existente && ["requested", "under_review"].includes(existente.status);

  const cabecalho = (
    <div className="flex items-start justify-between gap-3">
      <div className="min-w-0">
        <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
          {existente ? "Pedido de estorno" : "Pedir estorno"}
        </p>
        <p className="truncate text-sm font-bold text-foreground">{compra.produto}</p>
        <p className="text-[11px] text-muted-foreground">
          {dinheiro(compra.valor)} · comprado em {quando(compra.quando)}
        </p>
      </div>
      <button
        type="button"
        onClick={onFechar}
        aria-label="Fechar"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-muted/40 text-foreground"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );

  // ---- já existe pedido: a tela vira acompanhamento ----
  if (existente) {
    return (
      <>
        <button type="button" aria-label="Fechar" onClick={onFechar} className="fixed inset-0 z-[79] cursor-default" />
        <ModalShell
          zIndex={Z_MODAL_DA_LOJA}
          header={cabecalho}
          footer={
            podeDesistir ? (
              <button
                type="button"
                onClick={desistir}
                disabled={enviando}
                className="w-full rounded-xl border border-white/15 bg-card px-4 py-3 text-sm font-bold text-foreground disabled:opacity-50"
              >
                {enviando ? "Cancelando..." : "Desistir do pedido"}
              </button>
            ) : (
              <button
                type="button"
                onClick={onFechar}
                className="w-full rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground"
              >
                Entendi
              </button>
            )
          }
        >
          <div className="flex flex-col gap-3">
            <div className="rounded-xl border border-primary/30 bg-primary/10 p-3">
              <p className="text-sm font-bold text-primary">{ROTULO_STATUS[existente.status]}</p>
              <p className="mt-1 text-[11px] text-muted-foreground">
                Enviado em {quando(existente.requested_at)}
                {existente.resolved_at ? ` · respondido em ${quando(existente.resolved_at)}` : ""}
              </p>
            </div>

            <div>
              <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">Motivo</p>
              <p className="text-sm text-foreground">{ROTULO_MOTIVO(existente.reason)}</p>
              {existente.description && (
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                  {existente.description}
                </p>
              )}
            </div>

            {existente.admin_notes && (
              <div className="rounded-xl border border-white/10 bg-muted/20 p-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                  Resposta da FitMind
                </p>
                <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-foreground">
                  {existente.admin_notes}
                </p>
              </div>
            )}

            {existente.refund_amount != null && (
              <p className="text-sm text-foreground">
                Valor a devolver: <strong>{dinheiro(Number(existente.refund_amount))}</strong>
              </p>
            )}

            {emAndamento && (
              <p className="text-[11px] leading-relaxed text-muted-foreground">
                Enquanto o pedido estiver em análise, o repasse desta venda fica retido.
              </p>
            )}
            {erro && <p className="text-[12px] font-semibold text-destructive">{erro}</p>}
          </div>
        </ModalShell>
      </>
    );
  }

  // ---- ainda não pediu: o formulário ----
  return (
    <>
      <button type="button" aria-label="Fechar" onClick={onFechar} className="fixed inset-0 z-[79] cursor-default" />
      <ModalShell
        zIndex={Z_MODAL_DA_LOJA}
        header={cabecalho}
        footer={
          <button
            type="button"
            onClick={enviar}
            disabled={!podeEnviar}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {enviando && <Loader2 className="h-4 w-4 animate-spin" />}
            {enviando ? "Enviando..." : "Enviar pedido"}
          </button>
        }
      >
        <div className="flex flex-col gap-4">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              O que aconteceu?
            </legend>
            {MOTIVOS.map((m) => (
              <label
                key={m.valor}
                className={`flex cursor-pointer items-center gap-3 rounded-xl border px-3 py-3 text-sm ${
                  motivo === m.valor
                    ? "border-primary bg-primary/10 font-bold text-foreground"
                    : "border-white/10 bg-card text-muted-foreground"
                }`}
              >
                <input
                  type="radio"
                  name="motivo-do-estorno"
                  value={m.valor}
                  checked={motivo === m.valor}
                  onChange={() => setMotivo(m.valor)}
                  className="h-4 w-4 shrink-0 accent-[var(--color-primary)]"
                />
                {m.rotulo}
              </label>
            ))}
          </fieldset>

          <div>
            <label htmlFor="detalhe-do-estorno" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
              Conte o que houve {escolhido?.pedeDetalhe ? "" : "(opcional)"}
            </label>
            <textarea
              id="detalhe-do-estorno"
              value={detalhe}
              onChange={(e) => setDetalhe(e.target.value)}
              rows={4}
              maxLength={1000}
              placeholder="Quanto mais claro, mais rápido a gente resolve."
              className="mt-1 w-full rounded-xl border border-white/10 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground"
            />
            {faltaDetalhe && (
              <p className="mt-1 text-[11px] text-muted-foreground">
                Para este motivo, escreva pelo menos uma frase — é o que permite decidir sem ficar
                perguntando de volta.
              </p>
            )}
          </div>

          <div className="flex gap-2 rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-500" />
            <p className="text-[11px] leading-relaxed text-muted-foreground">
              O pedido vai para análise da FitMind. Enquanto ele estiver aberto, o repasse desta venda
              fica retido — inclusive a parte do coach e da rede. Você pode desistir enquanto ninguém
              tiver decidido.
            </p>
          </div>

          {erro && <p className="text-[12px] font-semibold text-destructive">{erro}</p>}
        </div>
      </ModalShell>
    </>
  );
}
