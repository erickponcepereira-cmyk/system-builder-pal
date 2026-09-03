import { arteDaTaxonomia } from "@/lib/store-arte-padrao";

/**
 * O que aparece no lugar da foto quando o produto não tem foto.
 *
 * Preenche o contêiner com `h-full w-full` em vez de `absolute`, porque os três
 * lugares que usam isto (card, carrinho, prateleira de seção) já são caixas
 * flex de tamanho definido, e nem todas são `relative`.
 */
export function ArteDoProduto({
  taxonomia,
  titulo,
  className = "h-7 w-7",
}: {
  /** Trilha da taxonomia, do específico ao genérico. Ver `UnifiedProduct.taxonomyPath`. */
  taxonomia?: string | null;
  /** Cai no título quando a taxonomia não resolve — "Consulta cardiologista" já diz muito. */
  titulo?: string | null;
  /** Tamanho do ícone. */
  className?: string;
}) {
  const { Icone, fundo, traco } = arteDaTaxonomia(taxonomia, titulo);
  return (
    <div className={`flex h-full w-full items-center justify-center ${fundo}`}>
      <Icone className={`${className} ${traco} opacity-80`} aria-hidden />
    </div>
  );
}
