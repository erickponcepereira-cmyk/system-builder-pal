import { ShoppingBag, X, Plus, TrendingUp, Instagram, Globe, UserRound, Link as LinkIcon } from "lucide-react";

export interface ProductDetail {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  category?: string;
  tag?: string;
  stock?: number | null;
  // Comissões (opcionais — só presentes em produtos challenge/item)
  commissionCoach?: number | null;
  commissionLevel1?: number | null;
  commissionLevel2?: number | null;
  commissionLevel3?: number | null;
  appFee?: number | null;
}

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export interface ProfessionalCard {
  name: string;
  avatarUrl?: string | null;
  headline?: string | null;
  bioLong?: string | null;
  instagram?: string | null;
  website?: string | null;
  services?: string | null;
  socialLinks?: Array<{ label?: string; url: string }> | null;
}

interface Props {
  product: ProductDetail;
  onClose: () => void;
  onAdd: (p: ProductDetail) => void;
  /** Quando true, mostra a tabela de comissões para coach. */
  showCommissions?: boolean;
  /** Se o coach tem upline (afeta o que ele ganha de níveis). */
  hasUpline?: boolean;
  addLabel?: string;
  /** Profissional vinculado a este produto (nutricionista/profissional da saúde). */
  professional?: ProfessionalCard | null;
}

export function ProductDetailModal({
  product,
  onClose,
  onAdd,
  showCommissions,
  hasUpline,
  addLabel,
}: Props) {
  const hasCommissionData =
    showCommissions &&
    (product.commissionCoach != null ||
      product.commissionLevel1 != null ||
      product.commissionLevel2 != null ||
      product.commissionLevel3 != null);

  const baseAmount = Math.max(0, product.price - (product.appFee || 0));
  const coachPct = Number(product.commissionCoach || 0);
  const lvl1 = Number(product.commissionLevel1 || 0);
  const lvl2 = Number(product.commissionLevel2 || 0);
  const lvl3 = Number(product.commissionLevel3 || 0);
  const coachGain = (baseAmount * coachPct) / 100;
  // Sem upline: o próprio coach pode receber também os níveis (regra MLM comum)
  const extraGain = !hasUpline ? (baseAmount * (lvl1 + lvl2 + lvl3)) / 100 : 0;
  const totalEstimated = coachGain + extraGain;

  return (
    <div
      className="fixed inset-0 z-[60] flex items-center justify-center bg-background/80 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-border bg-card"
      >
        <div className="relative aspect-[4/3] w-full overflow-hidden rounded-t-2xl bg-muted">
          {product.imageUrl ? (
            <img src={product.imageUrl} alt={product.title} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
          >
            <X className="h-4 w-4" />
          </button>
          {product.tag && (
            <span className="absolute left-3 top-3 rounded-full bg-primary px-3 py-1 text-[10px] font-bold text-primary-foreground">
              {product.tag}
            </span>
          )}
        </div>

        <div className="space-y-4 p-5">
          <div>
            {product.category && (
              <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
                {product.category}
              </p>
            )}
            <h2 className="mt-1 text-xl font-bold text-foreground">{product.title}</h2>
            {product.subtitle && (
              <p className="mt-1 text-sm text-muted-foreground">{product.subtitle}</p>
            )}
          </div>

          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{fmt(product.price)}</span>
            {product.originalPrice && (
              <span className="text-sm text-muted-foreground line-through">
                {fmt(product.originalPrice)}
              </span>
            )}
          </div>

          {product.description && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Descrição
              </p>
              <p className="mt-1 whitespace-pre-line text-sm text-foreground">
                {product.description}
              </p>
            </div>
          )}

          {product.stock != null && (
            <p className="text-xs text-muted-foreground">Estoque disponível: {product.stock}</p>
          )}

          {hasCommissionData && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <div className="mb-3 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-primary" />
                <p className="text-xs font-bold uppercase tracking-wider text-primary">
                  Comissões deste produto
                </p>
              </div>
              <div className="grid grid-cols-4 gap-2 text-center text-xs">
                <div className="rounded-lg bg-card p-2">
                  <p className="text-muted-foreground">Você</p>
                  <p className="font-bold text-foreground">{coachPct}%</p>
                </div>
                <div className="rounded-lg bg-card p-2">
                  <p className="text-muted-foreground">Nível 1</p>
                  <p className="font-bold text-foreground">{lvl1}%</p>
                </div>
                <div className="rounded-lg bg-card p-2">
                  <p className="text-muted-foreground">Nível 2</p>
                  <p className="font-bold text-foreground">{lvl2}%</p>
                </div>
                <div className="rounded-lg bg-card p-2">
                  <p className="text-muted-foreground">Nível 3</p>
                  <p className="font-bold text-foreground">{lvl3}%</p>
                </div>
              </div>
              <div className="mt-3 rounded-lg bg-card p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sua comissão estimada</span>
                  <span className="font-bold text-primary">{fmt(coachGain)}</span>
                </div>
                {!hasUpline && extraGain > 0 && (
                  <>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">+ Níveis (sem upline)</span>
                      <span className="font-bold text-foreground">{fmt(extraGain)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                      <span className="text-foreground">Total estimado</span>
                      <span className="font-bold text-primary">{fmt(totalEstimated)}</span>
                    </div>
                  </>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Cálculo sobre o valor líquido (preço − taxa do app). Valores podem variar conforme
                  método de pagamento.
                </p>
              </div>
            </div>
          )}

          <button
            onClick={() => onAdd(product)}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90"
          >
            <Plus className="h-4 w-4" /> {addLabel || "Adicionar ao carrinho"}
          </button>
        </div>
      </div>
    </div>
  );
}
