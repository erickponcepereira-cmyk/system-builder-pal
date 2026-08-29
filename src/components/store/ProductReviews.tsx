import { useEffect, useState } from "react";
import { Loader2, MessageSquare } from "lucide-react";
import { StarRating } from "@/components/store/StarRating";
import {
  avaliacoesDoProduto,
  origemDoProduto,
  resumoDeNotas,
  type Avaliacao,
  type ResumoDeNotas,
} from "@/lib/store-reviews";

const quando = (d: string) =>
  new Date(d).toLocaleDateString("pt-BR", { day: "2-digit", month: "short", year: "numeric" });

/**
 * O que os outros acharam, dentro do detalhe do produto.
 *
 * Carrega só quando o detalhe abre — são 1904 produtos, e trazer nota de todos
 * na montagem da vitrine seria pagar por informação que quase ninguém olha.
 * Aqui alguém já escolheu um produto e está decidindo.
 */
export function ProductReviews({
  origin,
  kind,
  sourceId,
}: {
  origin: string;
  kind: string;
  sourceId: string;
}) {
  const origem = origemDoProduto(origin, kind);
  const [resumo, setResumo] = useState<ResumoDeNotas | null>(null);
  const [lista, setLista] = useState<Avaliacao[]>([]);
  const [carregando, setCarregando] = useState(true);
  const [mostrarTudo, setMostrarTudo] = useState(false);

  useEffect(() => {
    let vivo = true;
    setCarregando(true);
    void Promise.all([
      resumoDeNotas([{ origem, produtoId: sourceId }]),
      avaliacoesDoProduto(origem, sourceId),
    ]).then(([mapa, avs]) => {
      if (!vivo) return;
      setResumo(mapa.get(`${origem}:${sourceId}`) ?? null);
      setLista(avs);
      setCarregando(false);
    });
    return () => { vivo = false; };
  }, [origem, sourceId]);

  if (carregando) {
    return (
      <div className="flex justify-center py-4">
        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
      </div>
    );
  }

  // Sem avaliação, o silêncio diz mais que um bloco vazio — mas some por
  // completo esconderia que o canal existe. Uma linha basta.
  if (!resumo || resumo.total === 0) {
    return (
      <p className="mt-4 flex items-center gap-2 border-t border-white/10 pt-3 text-[11px] text-muted-foreground">
        <MessageSquare className="h-3.5 w-3.5" />
        Ainda sem avaliações. Quem comprar pode avaliar em “Minhas compras”.
      </p>
    );
  }

  const visiveis = mostrarTudo ? lista : lista.slice(0, 3);

  return (
    <section className="mt-4 border-t border-white/10 pt-3">
      <div className="flex items-center gap-2">
        <span className="text-xl font-bold text-foreground">
          {resumo.media.toFixed(1).replace(".", ",")}
        </span>
        <div>
          <StarRating nota={resumo.media} rotulo={`Nota média ${resumo.media} de 5`} />
          <p className="text-[11px] text-muted-foreground">
            {resumo.total} {resumo.total === 1 ? "avaliação" : "avaliações"}
          </p>
        </div>
      </div>

      <ul className="mt-3 flex flex-col gap-3">
        {visiveis.map((a) => (
          <li key={a.id} className="border-t border-white/5 pt-3 first:border-0 first:pt-0">
            <div className="flex items-center gap-2">
              <StarRating nota={a.rating} />
              <span className="text-[11px] font-bold text-foreground">
                {a.profiles?.name || "Cliente"}
              </span>
              <span className="text-[11px] text-muted-foreground">{quando(a.created_at)}</span>
            </div>
            {a.comment && (
              <p className="mt-1 whitespace-pre-wrap text-[13px] leading-relaxed text-muted-foreground">
                {a.comment}
              </p>
            )}
            {a.seller_reply && (
              <div className="mt-2 rounded-lg border-l-2 border-primary/40 bg-muted/20 py-2 pl-3">
                <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                  Resposta do vendedor
                </p>
                <p className="mt-0.5 whitespace-pre-wrap text-[12px] leading-relaxed text-muted-foreground">
                  {a.seller_reply}
                </p>
              </div>
            )}
          </li>
        ))}
      </ul>

      {lista.length > 3 && !mostrarTudo && (
        <button
          type="button"
          onClick={() => setMostrarTudo(true)}
          className="mt-3 text-[11px] font-bold text-primary"
        >
          Ver as {lista.length} avaliações →
        </button>
      )}
    </section>
  );
}

export default ProductReviews;
