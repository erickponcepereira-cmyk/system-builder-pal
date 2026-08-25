import { useEffect, useRef } from "react";
import { Link } from "@tanstack/react-router";
import { Sparkles, X } from "lucide-react";

import {
  dispensarOferta,
  registrarExibicao,
  textoDaOferta,
  type OfertaDeCurso,
  type PontoDaOferta,
} from "@/lib/course-upsell";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Cartão de oferta dentro do curso.
 *
 * É um cartão, não um modal, e essa é a decisão inteira: modal interrompe,
 * cartão convida. A pessoa continua vendo o curso dela com a oferta ao lado,
 * e o X está visível desde o primeiro instante — quem quer seguir estudando
 * não precisa negociar com a tela.
 *
 * O destino é a loja, no produto. A compra acontece pelo caminho normal, com
 * carrinho, indicação e comissão de sempre. Oferta que compra por dentro do
 * player seria um segundo checkout para manter.
 */
export function CourseUpsellCard({
  oferta,
  ponto,
  onDispensar,
}: {
  oferta: OfertaDeCurso;
  ponto: PontoDaOferta;
  onDispensar: () => void;
}) {
  const { titulo, apoio } = textoDaOferta(ponto);

  // Conta a exibição uma vez por oferta montada. É o denominador do teto de
  // patrocinado — contar a cada render inflaria o total e faria o teto liberar
  // anúncio demais.
  const contado = useRef(false);
  useEffect(() => {
    if (contado.current) return;
    contado.current = true;
    registrarExibicao(oferta);
  }, [oferta]);

  return (
    <section className="relative overflow-hidden rounded-2xl border border-primary/25 bg-primary/5 p-4">
      <button
        type="button"
        onClick={() => { dispensarOferta(oferta.productId); onDispensar(); }}
        aria-label="Dispensar esta sugestão"
        className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-background/70"
      >
        <X className="h-3.5 w-3.5 text-muted-foreground" />
      </button>

      <p className="flex items-center gap-1.5 pr-8 text-[10px] font-bold uppercase tracking-wider text-primary">
        <Sparkles className="h-3 w-3" />
        {titulo}
        {/* Patrocinado escrito, e não escondido. Quem confia na recomendação
            precisa saber quando ela foi paga — e quem paga também quer que
            apareça. */}
        {oferta.patrocinado && (
          <span className="ml-1 rounded bg-muted px-1.5 py-0.5 text-[9px] font-semibold text-muted-foreground">
            patrocinado
          </span>
        )}
      </p>

      <p className="mt-1 text-[11px] text-muted-foreground">{apoio}</p>

      <Link
        to="/student/store"
        search={{ produto: oferta.productId }}
        className="mt-3 flex items-center gap-3 rounded-xl bg-card p-3 transition-colors hover:bg-accent"
      >
        <span className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-lg bg-muted">
          {oferta.coverUrl ? (
            <img src={oferta.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
          ) : (
            <Sparkles className="h-4 w-4 text-muted-foreground opacity-50" />
          )}
        </span>
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-bold text-foreground">{oferta.title}</span>
          {oferta.description && (
            <span className="line-clamp-1 text-[11px] text-muted-foreground">{oferta.description}</span>
          )}
          <span className="mt-0.5 block text-xs font-bold tabular-nums text-primary">
            {oferta.price > 0 ? fmt(oferta.price) : "Incluído no seu plano"}
          </span>
        </span>
        <span className="shrink-0 text-[11px] font-bold text-primary">Ver →</span>
      </Link>
    </section>
  );
}
