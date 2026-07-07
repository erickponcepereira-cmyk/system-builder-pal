import { useState } from "react";
import { ShoppingBag, X, Plus, TrendingUp, Instagram, Globe, UserRound, Link as LinkIcon, Eye, EyeOff, ChevronLeft, ChevronRight, MessageCircle } from "lucide-react";
import { AvailabilityPicker } from "@/components/professional/AvailabilityPicker";

export interface ProductDetail {
  id: string;
  title: string;
  subtitle?: string | null;
  description?: string | null;
  price: number;
  originalPrice?: number | null;
  imageUrl?: string | null;
  imageUrls?: string[] | null;
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
  // Pontos para carreira do coach (gameficação)
  pointsPerSale?: number | null;
  // Indica se a compra/venda libera acesso ao Desafio
  hasChallenge?: boolean | null;
  // Quantos tickets do desafio o comprador recebe por esta compra
  challengeTokens?: number | null;
  // Dias de validade da carteirinha de benefícios concedidos pela compra
  cardDays?: number | null;
  // Agendamento (produtos de profissionais agendáveis)
  isSchedulable?: boolean | null;
  defaultDurationMinutes?: number | null;
  professionalCoachId?: string | null;
  scheduledSlot?: string | null;
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
  publicWhatsapp?: string | null;
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
  const [slot, setSlot] = useState<string | null>(product.scheduledSlot || null);
  const needsSlot = !!(product.isSchedulable && product.professionalCoachId);
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
  // Quando o motor de slots fornecer os valores absolutos (sobra real),
  // usamos diretamente os valores PIX e Cartão; caso contrário, caímos no fallback por %.
  const pickAbs = (abs: number | null | undefined, pct: number, base: number) =>
    abs != null ? Number(abs) : (base * pct) / 100;
  const coachGainPix = pickAbs(product.commissionCoachAbsolute, coachPct, baseAmountPix);
  const coachGainCard = pickAbs(product.commissionCoachAbsoluteCard, coachPct, baseAmountCard);
  const l1Pix = pickAbs(product.commissionLevel1Absolute, lvl1, baseAmountPix);
  const l2Pix = pickAbs(product.commissionLevel2Absolute, lvl2, baseAmountPix);
  const l3Pix = pickAbs(product.commissionLevel3Absolute, lvl3, baseAmountPix);
  const l1Card = pickAbs(product.commissionLevel1AbsoluteCard, lvl1, baseAmountCard);
  const l2Card = pickAbs(product.commissionLevel2AbsoluteCard, lvl2, baseAmountCard);
  const l3Card = pickAbs(product.commissionLevel3AbsoluteCard, lvl3, baseAmountCard);
  const extraGainCard = !hasUpline ? l1Card + l2Card + l3Card : 0;
  const extraGainPix = !hasUpline ? l1Pix + l2Pix + l3Pix : 0;
  const totalEstimatedCard = coachGainCard + extraGainCard;
  const totalEstimatedPix = coachGainPix + extraGainPix;
  const [revealCommissions, setRevealCommissions] = useState(false);
  const gallery = (product.imageUrls && product.imageUrls.length > 0)
    ? product.imageUrls
    : (product.imageUrl ? [product.imageUrl] : []);
  const [imgIdx, setImgIdx] = useState(0);
  const currentImage = gallery[Math.min(imgIdx, Math.max(0, gallery.length - 1))] || null;
  const prevImage = () => setImgIdx((i) => (gallery.length ? (i - 1 + gallery.length) % gallery.length : 0));
  const nextImage = () => setImgIdx((i) => (gallery.length ? (i + 1) % gallery.length : 0));


  return (
    <div
      className="fixed inset-0 z-[100] flex items-stretch sm:items-center justify-center bg-background/90 p-0 sm:p-4 backdrop-blur-sm"
      style={{ height: "100dvh" }}
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="relative flex h-full sm:h-auto w-full max-w-lg flex-col overflow-hidden rounded-none sm:rounded-2xl border-0 sm:border sm:border-border bg-card sm:max-h-[92vh]"
        style={{ maxHeight: "100dvh" }}
      >
        {/* Barra fixa com botão de fechar — sempre visível */}
        <div
          className="flex items-center justify-end border-b border-border/40 bg-card/95 px-3 py-2 backdrop-blur shrink-0"
          style={{ paddingTop: "max(0.5rem, env(safe-area-inset-top))" }}
        >
          <button
            type="button"
            onClick={onClose}
            aria-label="Fechar"
            className="flex h-9 w-9 items-center justify-center rounded-full bg-muted text-foreground hover:bg-muted/80"
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto overscroll-contain" style={{ WebkitOverflowScrolling: "touch" }}>

        <div className="relative mx-auto mt-4 aspect-square w-full max-w-[300px] overflow-hidden rounded-2xl bg-muted">
          {currentImage ? (
            <img src={currentImage} alt={product.title} className="h-full w-full object-cover transition-opacity" />
          ) : (
            <div className="flex h-full w-full items-center justify-center">
              <ShoppingBag className="h-16 w-16 text-muted-foreground" />
            </div>
          )}
          {gallery.length > 1 && (
            <>
              <button
                type="button"
                onClick={prevImage}
                aria-label="Imagem anterior"
                className="absolute left-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
              >
                <ChevronLeft className="h-5 w-5" />
              </button>
              <button
                type="button"
                onClick={nextImage}
                aria-label="Próxima imagem"
                className="absolute right-2 top-1/2 -translate-y-1/2 flex h-9 w-9 items-center justify-center rounded-full bg-background/80 text-foreground backdrop-blur-sm hover:bg-background"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
              <div className="absolute bottom-2 left-1/2 -translate-x-1/2 flex gap-1.5 rounded-full bg-background/70 px-2 py-1 backdrop-blur-sm">
                {gallery.map((_, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => setImgIdx(i)}
                    aria-label={`Ir para imagem ${i + 1}`}
                    className={`h-1.5 rounded-full transition-all ${i === imgIdx ? "w-4 bg-primary" : "w-1.5 bg-foreground/40"}`}
                  />
                ))}
              </div>
            </>
          )}
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

          {product.hasChallenge && (product.challengeTokens ?? 1) > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-primary/30 bg-primary/5 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/20 text-base">🎟️</span>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-primary/80">Tickets do desafio</p>
                  <p className="text-xs text-foreground">
                    Você recebe {product.challengeTokens ?? 1} ticket{(product.challengeTokens ?? 1) > 1 ? "s" : ""} para entrar no desafio
                  </p>
                </div>
              </div>
              <span className="rounded-full bg-primary/20 px-3 py-1 text-sm font-bold text-primary">
                {product.challengeTokens ?? 1}× ticket{(product.challengeTokens ?? 1) > 1 ? "s" : ""}
              </span>
            </div>
          )}

          {(product.cardDays ?? 0) > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-emerald-500/30 bg-emerald-500/5 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-emerald-500/20 text-base">🪪</span>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-emerald-500/80">Carteirinha de benefícios</p>
                  <p className="text-xs text-foreground">Acesso ao portal de benefícios e gratuitos</p>
                </div>
              </div>
              <span className="rounded-full bg-emerald-500/20 px-3 py-1 text-sm font-bold text-emerald-500">
                {product.cardDays} dias
              </span>
            </div>
          )}

          {showCommissions && (product.pointsPerSale ?? 0) > 0 && (
            <div className="flex items-center justify-between rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
              <div className="flex items-center gap-2">
                <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-amber-500/20 text-base">🏆</span>
                <div>
                  <p className="text-[10px] uppercase tracking-wider font-bold text-amber-500/80">Carreira do coach</p>
                  <p className="text-xs text-foreground">Pontos para premiações (jantar / viagem)</p>
                </div>
              </div>
              <span className="rounded-full bg-amber-500/20 px-3 py-1 text-sm font-bold text-amber-500">
                +{product.pointsPerSale} pts
              </span>
            </div>
          )}

          {hasCommissionData && (
            <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
              <button
                type="button"
                onClick={() => setRevealCommissions((v) => !v)}
                className="mb-3 flex w-full items-center justify-between gap-2"
              >
                <div className="flex items-center gap-2">
                  <TrendingUp className="h-4 w-4 text-primary" />
                  <p className="text-xs font-bold uppercase tracking-wider text-primary">
                    Comissões deste produto
                  </p>
                </div>
                {revealCommissions ? (
                  <EyeOff className="h-4 w-4 text-primary" />
                ) : (
                  <Eye className="h-4 w-4 text-primary" />
                )}
              </button>
              {revealCommissions && (
              <>

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
                  Cálculo sobre o valor líquido (preço − taxas do app, cartão/pix, reserva fiscal e custos). PIX não tem taxa de cartão, por isso a comissão é maior.
                </p>
              </div>
              </>
              )}
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
              {(professional.instagram || professional.website || professional.publicWhatsapp || (professional.socialLinks?.length ?? 0) > 0) && (
                <div className="mt-3 flex flex-wrap gap-2">
                  {professional.publicWhatsapp && (
                    <a
                      href={`https://wa.me/55${professional.publicWhatsapp.replace(/\D/g, "")}`}
                      target="_blank" rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 rounded-full border border-green-500/40 bg-green-500/10 px-3 py-1 text-[11px] font-medium text-green-300 hover:bg-green-500/20"
                    >
                      <MessageCircle className="h-3 w-3" /> WhatsApp
                    </a>
                  )}
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


          {needsSlot && (
            <AvailabilityPicker
              professionalCoachId={product.professionalCoachId!}
              durationMinutes={product.defaultDurationMinutes || 30}
              value={slot}
              onChange={setSlot}
            />
          )}

          <button
            onClick={() => onAdd({ ...product, scheduledSlot: slot })}
            disabled={needsSlot && !slot}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-primary px-4 py-3 text-sm font-bold text-primary-foreground hover:opacity-90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Plus className="h-4 w-4" /> {needsSlot && !slot ? "Escolha um horário" : (addLabel || "Adicionar ao carrinho")}
          </button>
        </div>
        </div>
      </div>
    </div>
  );
}

