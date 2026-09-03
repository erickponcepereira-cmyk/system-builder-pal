import { useCallback, useEffect, useState } from "react";
import { Loader2, MessageSquare, Star } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { StarRating } from "@/components/store/StarRating";

const quando = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

type Linha = {
  id: string;
  produto: string;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  created_at: string;
  autor: string;
};

/**
 * As avaliações dos produtos deste vendedor, para ele responder.
 *
 * Serve parceiro e profissional sem ramificar: quem decide quais produtos são
 * seus é a função no banco, subindo de `partners` ou `coaches` pelo
 * `profile_id`. A tela só pergunta "quais são as minhas".
 *
 * A ordem é a que exige ação: sem resposta primeiro. Uma crítica sem resposta é
 * o que custa a venda seguinte, e ela não pode ficar no fim da lista.
 */
export function SellerReviewsPanel() {
  const [linhas, setLinhas] = useState<Linha[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [rascunho, setRascunho] = useState<Record<string, string>>({});
  const [salvando, setSalvando] = useState<string | null>(null);

  const carregar = useCallback(() => {
    setCarregando(true);
    void supabase.rpc("avaliacoes_dos_meus_produtos" as never, {} as never).then(({ data, error }) => {
      if (error) {
        console.error("[avaliacoes-vendedor]", error);
        toast.error("Não consegui carregar as avaliações.");
      }
      setLinhas(((data as unknown as Linha[]) || []));
      setCarregando(false);
    });
  }, []);

  useEffect(() => { carregar(); }, [carregar]);

  const responder = async (l: Linha) => {
    const texto = (rascunho[l.id] || "").trim();
    if (!texto) { toast.error("Escreva a resposta."); return; }
    setSalvando(l.id);
    const { error } = await supabase.rpc("responder_avaliacao" as never, {
      _id: l.id, _resposta: texto,
    } as never);
    setSalvando(null);
    if (error) { toast.error(error.message); return; }
    toast.success("Resposta publicada. Ela aparece junto da avaliação, na loja.");
    setRascunho((d) => ({ ...d, [l.id]: "" }));
    carregar();
  };

  const semResposta = linhas.filter((l) => !l.seller_reply).length;
  const media = linhas.length
    ? linhas.reduce((s, l) => s + l.rating, 0) / linhas.length
    : 0;

  if (carregando) {
    return (
      <div className="flex justify-center py-10">
        <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!linhas.length) {
    return (
      <div className="rounded-2xl border border-white/10 bg-card p-6 text-center">
        <Star className="mx-auto mb-2 h-5 w-5 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">
          Nenhum cliente avaliou seus produtos ainda.
        </p>
        <p className="mt-1 text-[11px] text-muted-foreground">
          Só quem comprou pode avaliar, e o convite aparece para o cliente em “Minhas compras”.
        </p>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-white/10 bg-card p-4">
        <span className="text-2xl font-bold text-foreground">
          {media.toFixed(1).replace(".", ",")}
        </span>
        <div>
          <StarRating nota={media} rotulo={`Nota média ${media.toFixed(1)} de 5`} />
          <p className="text-[11px] text-muted-foreground">
            {linhas.length} {linhas.length === 1 ? "avaliação" : "avaliações"}
            {semResposta > 0 && (
              <> · <strong className="text-primary">{semResposta} sem resposta</strong></>
            )}
          </p>
        </div>
      </div>

      {linhas.map((l) => (
        <article
          key={l.id}
          className={`rounded-2xl border p-4 ${l.seller_reply ? "border-white/10 bg-card" : "border-primary/30 bg-primary/5"}`}
        >
          <div className="flex flex-wrap items-start justify-between gap-2">
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground">{l.produto}</p>
              <p className="text-[11px] text-muted-foreground">
                {l.autor} · {quando(l.created_at)}
              </p>
            </div>
            <StarRating nota={l.rating} />
          </div>

          {l.comment && (
            <p className="mt-2 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
              {l.comment}
            </p>
          )}

          {l.seller_reply ? (
            <div className="mt-3 rounded-lg border-l-2 border-primary/40 bg-muted/20 py-2 pl-3">
              <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                Sua resposta
              </p>
              <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                {l.seller_reply}
              </p>
            </div>
          ) : (
            <div className="mt-3 flex flex-col gap-2">
              <textarea
                value={rascunho[l.id] || ""}
                onChange={(e) => setRascunho((d) => ({ ...d, [l.id]: e.target.value }))}
                rows={3}
                maxLength={2000}
                placeholder="Responda como vendedor. Quem estiver vendo este produto lê a sua resposta junto da avaliação."
                className="w-full rounded-xl border border-white/10 bg-background p-3 text-sm text-foreground placeholder:text-muted-foreground"
              />
              <button
                type="button"
                onClick={() => responder(l)}
                disabled={salvando === l.id}
                className="inline-flex w-fit items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
              >
                {salvando === l.id
                  ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  : <MessageSquare className="h-3.5 w-3.5" />}
                Publicar resposta
              </button>
            </div>
          )}
        </article>
      ))}
    </div>
  );
}

export default SellerReviewsPanel;
