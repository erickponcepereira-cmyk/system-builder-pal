import { Link } from "@tanstack/react-router";
import { Lock, ShoppingBag, X } from "lucide-react";
import type { PublicProduct } from "@/lib/public-store";

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/**
 * Detalhe público de um produto.
 *
 * Somente campos de vitrine (os mesmos que já vêm de `public-store.ts`).
 * Nada de ficha completa, contato do vendedor, estoque exato, taxa,
 * comissão ou cupom: isso é da área logada. Comprar exige conta.
 */
export function PublicProductModal({
  product,
  onClose,
}: {
  product: PublicProduct;
  onClose: () => void;
}) {
  const p = product;
  const preco =
    p.isPriceRange && p.minPrice != null
      ? `a partir de ${fmt(p.minPrice)}`
      : fmt(p.price);

  return (
    <div className="fixed inset-0 z-50 flex items-end bg-background/80 p-0 backdrop-blur-sm sm:items-center sm:justify-center sm:p-4">
      <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-t-2xl bg-card p-4 sm:rounded-2xl">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {p.sectionName || "Loja"}
            </p>
            <h2 className="mt-1 text-lg font-bold text-foreground">{p.title}</h2>
          </div>
          <button
            onClick={onClose}
            aria-label="Fechar"
            className="rounded-lg p-1 text-muted-foreground"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
          {p.imageUrl ? (
            <img src={p.imageUrl} alt={p.title} className="h-full w-full object-contain" />
          ) : (
            <ShoppingBag className="h-10 w-10 text-muted-foreground" />
          )}
        </div>

        {p.subtitle && (
          <p className="mt-3 text-sm text-muted-foreground">{p.subtitle}</p>
        )}
        {p.shortDescription && (
          <p className="mt-2 text-xs leading-relaxed text-muted-foreground">
            {p.shortDescription}
          </p>
        )}

        <div className="mt-3 flex items-baseline gap-2">
          <span className="text-xl font-bold text-foreground">{preco}</span>
          {p.originalPrice && p.originalPrice > p.price && (
            <span className="text-xs text-muted-foreground line-through">
              {fmt(p.originalPrice)}
            </span>
          )}
        </div>

        <p className="mt-4 flex items-start gap-2 rounded-xl bg-muted px-3 py-2.5 text-[11px] leading-relaxed text-muted-foreground">
          <Lock className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          Ficha completa, condições e compra ficam disponíveis para membros do
          FitMind Club.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-muted px-4 py-3 text-sm font-bold text-foreground"
          >
            Continuar olhando
          </button>
          <Link
            to="/register"
            className="flex-1 rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
          >
            Criar conta
          </Link>
        </div>
      </div>
    </div>
  );
}
