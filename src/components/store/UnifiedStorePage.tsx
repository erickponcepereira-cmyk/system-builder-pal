import { useEffect, useMemo, useState } from "react";
import { AlertTriangle, IdCard, Loader2, Search, ShoppingBag, Ticket, X } from "lucide-react";

import {
  foldText,
  groupBySeller,
  loadUnifiedCatalog,
  matchesQuery,
  type UnifiedCatalog,
  type UnifiedOrigin,
  type UnifiedProduct,
} from "@/lib/unified-store";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ORIGIN_LABEL: Record<UnifiedOrigin, string> = {
  fitmind: "FitMind",
  partner: "Parceiro",
  professional: "Profissional",
};

/**
 * Vitrine unificada — superfície de teste.
 *
 * Junta os quatro catálogos numa lista só, com busca que atravessa todos eles
 * e a taxonomia virando filtro em vez de pasta. Ainda não compra: o carrinho
 * depende da extração do checkout, que é etapa própria.
 */
export function UnifiedStorePage({ audience = "student" }: { audience?: "student" | "coach" }) {
  const [catalog, setCatalog] = useState<UnifiedCatalog | null>(null);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedProduct | null>(null);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadUnifiedCatalog();
        if (active) setCatalog(data);
      } catch (error) {
        console.error("[unified-store] carga", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const products = catalog?.products ?? [];

  /** Só mostra chip de seção que tem produto — seção vazia é a pasta vazia de novo. */
  const usableSections = useMemo(() => {
    const used = new Set(products.map((p) => p.sectionId).filter(Boolean) as string[]);
    return (catalog?.sections ?? []).filter((s) => used.has(s.id));
  }, [catalog, products]);

  const filtered = useMemo(() => {
    return products.filter((p) => {
      if (sectionId && p.sectionId !== sectionId) return false;
      return matchesQuery(p, query);
    });
  }, [products, query, sectionId]);

  const searching = foldText(query).length > 0;

  /** Na busca, agrupa por origem para provar que o resultado atravessa as duas lojas. */
  const byOrigin = useMemo(() => {
    const groups: Array<{ origin: UnifiedOrigin; items: UnifiedProduct[] }> = [];
    (["fitmind", "partner", "professional"] as UnifiedOrigin[]).forEach((origin) => {
      const items = filtered.filter((p) => p.origin === origin);
      if (items.length) groups.push({ origin, items });
    });
    return groups;
  }, [filtered]);

  const sellerCount = useMemo(
    () => groupBySeller(filtered).length,
    [filtered],
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <div className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-3">
        <p className="flex items-start gap-2 text-[11px] leading-relaxed text-amber-500">
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <span>
            <b>Vitrine de teste.</b> Dados reais de produção, somente leitura — nada aqui compra
            nem altera pedido. Visível apenas para master admin.
          </span>
        </p>
      </div>

      <header className="pt-1">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">
          Loja {audience === "coach" ? "· modo coach" : ""}
        </p>
        <h1 className="text-2xl font-bold text-foreground">FitMind Club</h1>
        <p className="mt-1 text-xs text-muted-foreground">
          {products.length} produtos de {groupBySeller(products).length} vendedores, numa vitrine só.
        </p>
      </header>

      {catalog?.errors.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-[11px] text-destructive">
            Não carregou: {catalog.errors.join(", ")}. O resto da vitrine está completo.
          </p>
        </div>
      ) : null}

      <div className="flex items-center gap-2 rounded-full bg-card px-4 py-3">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Busque em toda a loja…"
          aria-label="Buscar produtos"
          className="min-w-0 flex-1 bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
        {query && (
          <button type="button" onClick={() => setQuery("")} aria-label="Limpar busca">
            <X className="h-4 w-4 text-muted-foreground" />
          </button>
        )}
      </div>

      {usableSections.length > 0 && (
        <div className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <button
            type="button"
            onClick={() => setSectionId(null)}
            aria-pressed={sectionId === null}
            className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
              sectionId === null ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
            }`}
          >
            Tudo
          </button>
          {usableSections.map((s) => (
            <button
              key={s.id}
              type="button"
              onClick={() => setSectionId(sectionId === s.id ? null : s.id)}
              aria-pressed={sectionId === s.id}
              className={`shrink-0 rounded-full px-3.5 py-2 text-xs font-semibold transition ${
                sectionId === s.id ? "bg-primary text-primary-foreground" : "bg-card text-muted-foreground"
              }`}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}

      {filtered.length === 0 ? (
        <div className="rounded-2xl bg-card p-8 text-center">
          <ShoppingBag className="mx-auto mb-3 h-7 w-7 text-muted-foreground opacity-50" />
          <p className="text-sm text-muted-foreground">
            {searching ? `Nada encontrado para "${query}".` : "Nenhum produto nesta seção."}
          </p>
        </div>
      ) : searching ? (
        <>
          <p className="text-xs text-muted-foreground">
            {filtered.length} {filtered.length === 1 ? "resultado" : "resultados"} em toda a loja.
          </p>
          {byOrigin.map((group) => (
            <section key={group.origin} className="flex flex-col gap-2">
              <div className="flex items-baseline justify-between gap-2">
                <h2 className="text-sm font-bold text-foreground">{ORIGIN_LABEL[group.origin]}</h2>
                <span className="text-[10px] text-muted-foreground">{group.items.length}</span>
              </div>
              <ProductGrid items={group.items} onOpen={setDetail} />
            </section>
          ))}
        </>
      ) : (
        <>
          <div className="flex items-baseline justify-between gap-2">
            <h2 className="text-sm font-bold text-foreground">Vitrine</h2>
            <span className="text-[10px] text-muted-foreground">
              {filtered.length} itens · {sellerCount} vendedores
            </span>
          </div>
          <ProductGrid items={filtered} onOpen={setDetail} />
        </>
      )}

      {detail && <DetailSheet product={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function ProductGrid({ items, onOpen }: { items: UnifiedProduct[]; onOpen: (p: UnifiedProduct) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => (
        <ProductCard key={item.id} product={item} onOpen={onOpen} />
      ))}
    </div>
  );
}

/**
 * Card único para as quatro origens. O selo de vendedor é o que substitui a
 * aba de parceiros: o crédito aparece dentro do fluxo principal.
 *
 * Sem largura fixa e sem breakpoint de viewport — o grid do pai manda. Foi
 * exatamente `xl:grid-cols-5` dentro do shell de 430px que espremia os cards
 * da loja de parceiros em cinco colunas na tela grande.
 */
function ProductCard({ product, onOpen }: { product: UnifiedProduct; onOpen: (p: UnifiedProduct) => void }) {
  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className="flex flex-col overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
    >
      <div className="flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingBag className="h-7 w-7 text-muted-foreground opacity-50" />
        )}
      </div>

      <div className="flex flex-1 flex-col gap-1.5 p-2.5">
        <p className="truncate text-[9px] uppercase tracking-wider text-muted-foreground">
          {product.sellerName}
        </p>
        <p className="line-clamp-2 text-xs font-semibold leading-snug text-foreground">
          {product.title}
        </p>

        {(product.cardDays > 0 || product.challengeTickets > 0) && (
          <div className="flex flex-wrap gap-1">
            {product.cardDays > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-emerald-500/15 px-1.5 py-0.5 text-[9px] font-bold text-emerald-500">
                <IdCard className="h-2.5 w-2.5" />+{product.cardDays}d
              </span>
            )}
            {product.challengeTickets > 0 && (
              <span className="inline-flex items-center gap-1 rounded bg-amber-500/15 px-1.5 py-0.5 text-[9px] font-bold text-amber-500">
                <Ticket className="h-2.5 w-2.5" />{product.challengeTickets}
              </span>
            )}
          </div>
        )}

        <div className="mt-auto flex flex-wrap items-baseline gap-1.5 pt-1">
          <span className="text-sm font-bold tabular-nums text-foreground">{fmt(product.price)}</span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-[10px] tabular-nums text-muted-foreground line-through">
              {fmt(product.originalPrice)}
            </span>
          )}
        </div>
      </div>
    </button>
  );
}

function DetailSheet({ product, onClose }: { product: UnifiedProduct; onClose: () => void }) {
  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label={product.title}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="text-[10px] uppercase tracking-wider text-muted-foreground">
              {ORIGIN_LABEL[product.origin]} · {product.sellerName}
            </p>
            <h2 className="text-base font-bold text-foreground">{product.title}</h2>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {product.imageUrl && (
          <img src={product.imageUrl} alt="" className="mb-3 max-h-56 w-full rounded-xl object-cover" />
        )}

        {product.description && (
          <p className="mb-3 whitespace-pre-line text-xs leading-relaxed text-muted-foreground">
            {product.description}
          </p>
        )}

        <div className="mb-3 flex flex-wrap items-baseline gap-2">
          <span className="text-xl font-bold tabular-nums text-foreground">{fmt(product.price)}</span>
          {product.originalPrice && product.originalPrice > product.price && (
            <span className="text-xs tabular-nums text-muted-foreground line-through">
              {fmt(product.originalPrice)}
            </span>
          )}
        </div>

        <p className="rounded-xl bg-muted p-3 text-[11px] leading-relaxed text-muted-foreground">
          Vitrine de teste: a compra continua na loja atual. Este ambiente serve para avaliar
          busca, mistura de catálogos e leitura do card.
        </p>
      </div>
    </div>
  );
}

export default UnifiedStorePage;
