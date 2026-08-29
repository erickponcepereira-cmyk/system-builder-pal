import { Star } from "lucide-react";

/**
 * Estrelas.
 *
 * Dois modos no mesmo componente porque são o mesmo desenho: ler uma nota e
 * dar uma nota. Separar em dois faria as duas divergirem no primeiro ajuste
 * de tamanho.
 */
export function StarRating({
  nota,
  onEscolher,
  tamanho = "sm",
  rotulo,
}: {
  nota: number;
  /** Presente = a pessoa pode escolher. Ausente = só leitura. */
  onEscolher?: (n: number) => void;
  tamanho?: "sm" | "lg";
  rotulo?: string;
}) {
  const px = tamanho === "lg" ? "h-8 w-8" : "h-3.5 w-3.5";
  const editavel = typeof onEscolher === "function";

  const estrela = (i: number) => {
    const cheia = i <= Math.round(nota);
    return (
      <Star
        className={`${px} ${cheia ? "fill-amber-400 text-amber-400" : "text-muted-foreground/40"}`}
        aria-hidden
      />
    );
  };

  if (!editavel) {
    return (
      <span className="inline-flex items-center gap-0.5" aria-label={rotulo ?? `${nota} de 5 estrelas`}>
        {[1, 2, 3, 4, 5].map((i) => <span key={i}>{estrela(i)}</span>)}
      </span>
    );
  }

  return (
    <div role="radiogroup" aria-label={rotulo ?? "Sua nota"} className="inline-flex items-center gap-1">
      {[1, 2, 3, 4, 5].map((i) => (
        <button
          key={i}
          type="button"
          role="radio"
          aria-checked={i === Math.round(nota)}
          aria-label={`${i} ${i === 1 ? "estrela" : "estrelas"}`}
          onClick={() => onEscolher(i)}
          className="rounded-full p-1"
        >
          {estrela(i)}
        </button>
      ))}
    </div>
  );
}

/** A nota resumida, do jeito que cabe num card: ★ 4,8 (23). */
export function NotaCompacta({ media, total }: { media: number; total: number }) {
  if (!total) return null;
  return (
    <span className="inline-flex items-center gap-1 text-[11px] text-muted-foreground">
      <Star className="h-3 w-3 fill-amber-400 text-amber-400" aria-hidden />
      <span className="font-bold text-foreground">{media.toFixed(1).replace(".", ",")}</span>
      <span>({total})</span>
    </span>
  );
}

export default StarRating;
