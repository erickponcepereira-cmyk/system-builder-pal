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
  // Valores R$ absolutos calculados pelo motor de slots (preferidos quando presentes)
  commissionCoachAbsolute?: number | null;       // PIX — sobra real do coach
  commissionLevel1Absolute?: number | null;      // PIX
  commissionLevel2Absolute?: number | null;      // PIX
  commissionLevel3Absolute?: number | null;      // PIX
  commissionCoachAbsoluteCard?: number | null;   // Cartão — sobra real do coach
  commissionLevel1AbsoluteCard?: number | null;
  commissionLevel2AbsoluteCard?: number | null;
  commissionLevel3AbsoluteCard?: number | null;

  // Custos / taxas para cálculo realista da comissão líquida
  appFee?: number | null;
  appFeePercentage?: number | null;
  cardFeePercentage?: number | null;
  taxPercentage?: number | null;
  cost?: number | null;
  otherCosts?: number | null;
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
  professional,
}: Props) {
  const hasCommissionData =
    showCommissions &&
    (product.commissionCoach != null ||
      product.commissionCoachAbsolute != null ||
      product.commissionLevel1 != null ||
      product.commissionLevel2 != null ||
      product.commissionLevel3 != null);

  const price = Number(product.price || 0);
  const appFeeFlat = Number(product.appFee || 0);
  const appFeePerc = Number(product.appFeePercentage || 0);
  const cardPerc = Number(product.cardFeePercentage || 0);
  const taxPerc = Number(product.taxPercentage || 0);
  const costFlat = Number(product.cost || 0) + Number(product.otherCosts || 0);
  const feesValueCard = appFeeFlat + (price * (appFeePerc + cardPerc + taxPerc)) / 100 + costFlat;
  const feesValuePix = appFeeFlat + (price * (appFeePerc + taxPerc)) / 100 + costFlat;
  const baseAmountCard = Math.max(0, price - feesValueCard);
  const baseAmountPix = Math.max(0, price - feesValuePix);
  const coachPct = Number(product.commissionCoach || 0);
  const lvl1 = Number(product.commissionLevel1 || 0);
  const lvl2 = Number(product.commissionLevel2 || 0);
  const lvl3 = Number(product.commissionLevel3 || 0);
  // Escala para converter valores absolutos (calculados sobre base cartão) em base pix
  const pixScale = baseAmountCard > 0 ? baseAmountPix / baseAmountCard : 1;
  const calc = (abs: number | null | undefined, pct: number, base: number, scale = 1) =>
    abs != null ? Number(abs) * scale : (base * pct) / 100;
  const coachGainCard = calc(product.commissionCoachAbsolute, coachPct, baseAmountCard);
  const coachGainPix = calc(product.commissionCoachAbsolute, coachPct, baseAmountPix, pixScale);
  const l1Card = calc(product.commissionLevel1Absolute, lvl1, baseAmountCard);
  const l2Card = calc(product.commissionLevel2Absolute, lvl2, baseAmountCard);
  const l3Card = calc(product.commissionLevel3Absolute, lvl3, baseAmountCard);
  const l1Pix = calc(product.commissionLevel1Absolute, lvl1, baseAmountPix, pixScale);
  const l2Pix = calc(product.commissionLevel2Absolute, lvl2, baseAmountPix, pixScale);
  const l3Pix = calc(product.commissionLevel3Absolute, lvl3, baseAmountPix, pixScale);
  // Defaults para os cards de níveis (mostra cartão como referência)
  const coachGain = coachGainCard;
  const l1Abs = l1Card;
  const l2Abs = l2Card;
  const l3Abs = l3Card;
  const extraGainCard = !hasUpline ? l1Card + l2Card + l3Card : 0;
  const extraGainPix = !hasUpline ? l1Pix + l2Pix + l3Pix : 0;
  const extraGain = extraGainCard;
  const totalEstimatedCard = coachGainCard + extraGainCard;
  const totalEstimatedPix = coachGainPix + extraGainPix;

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
                {[
                  { label: "Você", pix: coachGainPix, card: coachGainCard },
                  { label: "Nível 1", pix: l1Pix, card: l1Card },
                  { label: "Nível 2", pix: l2Pix, card: l2Card },
                  { label: "Nível 3", pix: l3Pix, card: l3Card },
                ].map((c) => (
                  <div key={c.label} className="rounded-lg bg-card p-2">
                    <p className="text-muted-foreground">{c.label}</p>
                    <div className="mt-1 space-y-0.5">
                      <p className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="text-muted-foreground">PIX</span>
                        <span className="font-bold text-foreground">{fmt(c.pix)}</span>
                      </p>
                      <p className="flex items-center justify-between gap-1 text-[10px]">
                        <span className="text-muted-foreground">Cartão</span>
                        <span className="font-bold text-foreground">{fmt(c.card)}</span>
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <div className="mt-3 rounded-lg bg-card p-3">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sua comissão estimada (PIX)</span>
                  <span className="font-bold text-primary">{fmt(coachGainPix)}</span>
                </div>
                <div className="mt-1 flex items-center justify-between text-sm">
                  <span className="text-muted-foreground">Sua comissão estimada (Cartão)</span>
                  <span className="font-bold text-primary">{fmt(coachGainCard)}</span>
                </div>
                {!hasUpline && (extraGainPix > 0 || extraGainCard > 0) && (
                  <>
                    <div className="mt-2 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">+ Níveis (sem upline) — PIX</span>
                      <span className="font-bold text-foreground">{fmt(extraGainPix)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-xs">
                      <span className="text-muted-foreground">+ Níveis (sem upline) — Cartão</span>
                      <span className="font-bold text-foreground">{fmt(extraGainCard)}</span>
                    </div>
                    <div className="mt-2 flex items-center justify-between border-t border-border pt-2 text-sm">
                      <span className="text-foreground">Total estimado (PIX)</span>
                      <span className="font-bold text-primary">{fmt(totalEstimatedPix)}</span>
                    </div>
                    <div className="mt-1 flex items-center justify-between text-sm">
                      <span className="text-foreground">Total estimado (Cartão)</span>
                      <span className="font-bold text-primary">{fmt(totalEstimatedCard)}</span>
                    </div>
                  </>
                )}
                <p className="mt-2 text-[10px] text-muted-foreground">
                  Cálculo sobre o valor líquido (preço − taxas do app, cartão/pix, impostos e custos). PIX não tem taxa de cartão, por isso a comissão é maior.
                </p>
              </div>
            </div>
          )}

          {professional && (
            <div className="rounded-xl border border-border bg-muted/30 p-4">
              <p className="mb-3 text-xs font-bold uppercase tracking-wider text-muted-foreground">
                Sobre o profissional
              </p>
              <div className="flex items-start gap-3">
                <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-full bg-primary/10">
                  {professional.avatarUrl ? (
                    <img src={professional.avatarUrl} alt={professional.name} className="h-full w-full object-cover" />
                  ) : (
                    <UserRound className="h-6 w-6 text-primary" />
                  )}
                </div>
                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-bold text-foreground">{professional.name}</p>
                  {professional.headline && (
                    <p className="truncate text-xs text-muted-foreground">{professional.headline}</p>
                  )}
                </div>
              </div>
              {professional.bioLong && (
                <p className="mt-3 whitespace-pre-line text-xs text-foreground/90">{professional.bioLong}</p>
              )}
              {professional.services && (
                <div className="mt-3">
                  <p className="text-[10px] font-bold uppercase tracking-wider text-muted-foreground">
                    Serviços
                  </p>
                  <p className="mt-1 whitespace-pre-line text-xs text-foreground/90">{professional.services}</p>
                </div>
              )}
              {(professional.instagram || professional.website || (professional.socialLinks?.length ?? 0) > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {professional.instagram && (
                    <a
                      href={professional.instagram.startsWith("http") ? professional.instagram : `https://instagram.com/${professional.instagram.replace(/^@/, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      <Instagram className="h-3 w-3" /> Instagram
                    </a>
                  )}
                  {professional.website && (
                    <a
                      href={professional.website.startsWith("http") ? professional.website : `https://${professional.website}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      <Globe className="h-3 w-3" /> Site
                    </a>
                  )}
                  {(professional.socialLinks || []).map((link, i) => (
                    <a
                      key={i}
                      href={link.url.startsWith("http") ? link.url : `https://${link.url}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-border bg-card px-3 py-1 text-[11px] font-medium text-foreground hover:border-primary hover:text-primary"
                    >
                      <LinkIcon className="h-3 w-3" /> {link.label || "Link"}
                    </a>
                  ))}
                </div>
              )}
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
