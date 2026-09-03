import { useState } from "react";
import { Loader2, X } from "lucide-react";
import { ModalShell } from "@/components/ui/ModalShell";
import { useFecharComEscape, Z_MODAL_DA_LOJA } from "@/hooks/use-fechar-com-escape";
import { StarRating } from "@/components/store/StarRating";
import { avaliar, type Avaliacao, type OrigemDoProduto } from "@/lib/store-reviews";
import { CommunityPolicyDialog } from "@/components/ugc/CommunityPolicyDialog";
import { useCommunityPolicy } from "@/lib/ugc";

const LEGENDA: Record<number, string> = {
  1: "Muito ruim",
  2: "Ruim",
  3: "Deu para o gasto",
  4: "Bom",
  5: "Muito bom",
};

/**
 * Dar (ou corrigir) a nota de uma compra.
 *
 * O convite vive em "Minhas compras" e não na vitrine, de propósito: só
 * aparece para quem já tem a compra na mão, que é a mesma regra que o banco
 * impõe. Ninguém é convidado a fazer o que vai ser recusado.
 */
export function ReviewSheet({
  produto,
  origem,
  produtoId,
  orderId,
  orderType,
  existente,
  onFechar,
  onMudou,
}: {
  produto: string;
  origem: OrigemDoProduto;
  produtoId: string;
  orderId: string;
  orderType: string;
  existente: Avaliacao | null;
  onFechar: () => void;
  onMudou: () => void;
}) {
  const [nota, setNota] = useState(existente?.rating ?? 0);
  const [texto, setTexto] = useState(existente?.comment ?? "");
  const [salvando, setSalvando] = useState(false);
  const [erro, setErro] = useState<string | null>(null);
  const policy = useCommunityPolicy();
  const moderada = !!existente?.hidden_at;

  useFecharComEscape(onFechar);

  const salvar = async () => {
    if (nota < 1 || salvando) return;
    setSalvando(true);
    setErro(null);
    const r = await avaliar({
      origem, produtoId, orderId, orderType,
      nota, comentario: texto,
      idExistente: existente?.id ?? null,
    });
    setSalvando(false);
    if (!r.ok) { setErro(r.erro); return; }
    onMudou();
    onFechar();
  };

  const enviar = () => {
    if (moderada) return;
    if (!policy.requireAccepted()) return;
    void salvar();
  };

  return (
    <>
      <button type="button" aria-label="Fechar" onClick={onFechar} className="fixed inset-0 z-[79] cursor-default" />
      <ModalShell
        zIndex={Z_MODAL_DA_LOJA}
        header={
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                {existente ? "Sua avaliação" : "Avaliar"}
              </p>
              <p className="truncate text-sm font-bold text-foreground">{produto}</p>
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
        }
        footer={
          <button
            type="button"
            onClick={enviar}
            disabled={nota < 1 || salvando || moderada || policy.checking}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground disabled:opacity-40"
          >
            {salvando && <Loader2 className="h-4 w-4 animate-spin" />}
            {salvando
              ? "Salvando..."
              : moderada
                ? "Avaliação ocultada pela moderação"
                : existente
                  ? "Salvar alteração"
                  : "Publicar avaliação"}
          </button>
        }
      >
        <div className="flex flex-col items-center gap-2 py-2">
          <StarRating nota={nota} onEscolher={setNota} tamanho="lg" rotulo="Sua nota" />
          <p className="h-5 text-sm font-bold text-foreground">{nota ? LEGENDA[nota] : ""}</p>
        </div>

        <div className="mt-2">
          <label htmlFor="texto-da-avaliacao" className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
            Conte como foi (opcional)
          </label>
          <textarea
            id="texto-da-avaliacao"
            value={texto}
            onChange={(e) => setTexto(e.target.value)}
            rows={5}
            maxLength={2000}
            placeholder="O que funcionou, o que não funcionou, e para quem você recomendaria."
            className="mt-1 w-full rounded-xl border border-white/10 bg-card p-3 text-sm text-foreground placeholder:text-muted-foreground"
          />
          <p className="mt-1 text-[11px] text-muted-foreground">
            Sua avaliação aparece com seu nome para quem estiver vendo este produto.
          </p>
        </div>

        {erro && <p className="mt-2 text-[12px] font-semibold text-destructive">{erro}</p>}
        {moderada && (
          <p className="mt-2 text-[12px] font-semibold text-amber-500">
            Esta avaliação não está pública. Consulte a área Segurança para ver a justificativa e recorrer dentro do prazo.
          </p>
        )}
      </ModalShell>
      <CommunityPolicyDialog
        open={policy.dialogOpen}
        onOpenChange={policy.setDialogOpen}
        unavailableReason={policy.checkError}
        elevated
        onAccepted={() => {
          policy.markAccepted();
          void salvar();
        }}
      />
    </>
  );
}

export default ReviewSheet;
