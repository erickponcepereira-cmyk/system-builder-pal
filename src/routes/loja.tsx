import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { Gift, Search, ShoppingBag } from "lucide-react";
import { PublicProductModal } from "@/components/store/public/PublicProductModal";
import {
  fetchPublicBenefits, fetchPublicCatalog, fetchPublicTaxonomy,
  readReferralContext,
  type PublicBenefit, type PublicProduct, type PublicTaxonomy,
  type PublicTaxonomyCard,
} from "@/lib/public-store";

/**
 * Loja pública — mesma navegação da loja logada (`StorePage`), porém sem
 * sessão: sem carrinho, sem checkout e sem campo sensível.
 *
 * Não reaproveita a `StorePage` de propósito: aquele componente é acoplado
 * a sessão, carteira e comissões. Aqui só entra o que `public-store.ts`
 * expõe, que é a camada auditada de colunas de vitrine.
 */
export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Loja — FitMind Club" },
      { name: "description", content: "Conheça os planos, cursos, produtos de parceiros e serviços de profissionais do FitMind Club." },
      { property: "og:title", content: "Loja — FitMind Club" },
      { property: "og:description", content: "Planos, cursos, parceiros e profissionais do FitMind Club." },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  /**
   * `?produto={id}` abre a vitrine já com aquele produto aberto.
   *
   * É o destino dos links compartilhados de produto de parceiro e de
   * profissional, que não têm permalink próprio. Antes esses links caíam
   * no cadastro: em `/r/{code}` eles tinham `productKind` preenchido e
   * diferente de "challenge", escapavam das duas condições de destino e
   * batiam no `/register` que era o padrão da cadeia.
   */
  validateSearch: (search: Record<string, unknown>) => ({
    produto: typeof search.produto === "string" ? search.produto : undefined,
  }),
  component: PublicStorePage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const priceLabel = (p: PublicProduct) =>
  p.isPriceRange && p.minPrice != null ? `a partir de ${fmt(p.minPrice)}` : fmt(p.price);

type StoreTab = "fitmind" | "market";

const TABS: { id: StoreTab; label: string }[] = [
  { id: "fitmind", label: "FitMind" },
  { id: "market", label: "Parceiros & Profissionais" },
];

const TAXONOMIA_VAZIA: PublicTaxonomy = { sections: [], categories: [], subcategories: [] };

function PublicStorePage() {
  const { produto: produtoDoLink } = Route.useSearch();
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [benefits, setBenefits] = useState<PublicBenefit[]>([]);
  const [taxonomy, setTaxonomy] = useState<PublicTaxonomy>(TAXONOMIA_VAZIA);
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<StoreTab>("fitmind");

  const [activeSection, setActiveSection] = useState<PublicTaxonomyCard | null>(null);
  const [activeCategory, setActiveCategory] = useState<PublicTaxonomyCard | null>(null);
  const [activeSubcategory, setActiveSubcategory] = useState<PublicTaxonomyCard | null>(null);

  const [detail, setDetail] = useState<PublicProduct | null>(null);
  const [montado, setMontado] = useState(false);
  const [referral, setReferral] = useState<{ referralCode: string | null; sponsorName: string | null }>({
    referralCode: null, sponsorName: null,
  });

  /**
   * Storage e querystring só existem no cliente, e esta rota renderiza no
   * servidor (é o SSR que faz o preview do link funcionar). Lê o contexto
   * de indicação apenas depois de montar, para não divergir na hidratação.
   */
  useEffect(() => {
    setReferral(readReferralContext());
    setMontado(true);
  }, []);

  useEffect(() => {
    if (!montado) return;
    let cancelled = false;
    (async () => {
      const [cat, ben, tax] = await Promise.all([
        fetchPublicCatalog(referral.referralCode),
        fetchPublicBenefits(referral.referralCode),
        fetchPublicTaxonomy().catch(() => TAXONOMIA_VAZIA),
      ]);
      if (cancelled) return;
      setProducts(cat);
      setBenefits(ben);
      setTaxonomy(tax);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [montado, referral.referralCode]);

  /**
   * Abre o produto vindo de `?produto={id}` assim que o catálogo chega.
   * Também troca para a aba certa, senão o modal abre sobre uma vitrine
   * que não contém aquele item e fechar deixa a pessoa perdida.
   */
  useEffect(() => {
    if (loading || !produtoDoLink || detail) return;
    const alvo = products.find((p) => p.id === produtoDoLink);
    if (!alvo) return;
    setTab(alvo.source === "fitmind" ? "fitmind" : "market");
    setDetail(alvo);
  }, [loading, produtoDoLink, products, detail]);

  /** Trocar de aba não pode manter uma seção que não existe nela. */
  useEffect(() => {
    setActiveSection(null);
    setActiveCategory(null);
    setActiveSubcategory(null);
  }, [tab]);

  /**
   * Produtos da aba. Parceiro e profissional dividem a MESMA vitrine —
   * separar em abas distintas era o que confundia o painel.
   */
  const daAba = useMemo(
    () => products.filter((p) =>
      tab === "market" ? p.source !== "fitmind" : p.source === "fitmind"),
    [products, tab],
  );

  const visibleSections = useMemo(() => {
    const usadas = new Set(daAba.map((p) => p.sectionId).filter(Boolean) as string[]);
    return taxonomy.sections.filter((s) => usadas.has(s.id));
  }, [daAba, taxonomy.sections]);

  const catsOfActive = useMemo(() => {
    if (!activeSection) return [];
    const usadas = new Set(
      daAba.filter((p) => p.sectionId === activeSection.id)
        .map((p) => p.categoryId).filter(Boolean) as string[],
    );
    return taxonomy.categories.filter((c) => c.sectionId === activeSection.id && usadas.has(c.id));
  }, [daAba, activeSection, taxonomy.categories]);

  const subcatsOfActive = useMemo(() => {
    if (!activeCategory) return [];
    const usadas = new Set(
      daAba.filter((p) => p.categoryId === activeCategory.id)
        .map((p) => p.subcategoryId).filter(Boolean) as string[],
    );
    return taxonomy.subcategories.filter((s) => s.categoryId === activeCategory.id && usadas.has(s.id));
  }, [daAba, activeCategory, taxonomy.subcategories]);

  const buscando = query.trim().length > 0;

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return daAba.filter((p) => {
      if (q) {
        return `${p.title} ${p.subtitle || ""} ${p.shortDescription || ""} ${p.sectionName || ""} ${p.categoryName || ""}`
          .toLowerCase().includes(q);
      }
      if (activeSection && p.sectionId !== activeSection.id) return false;
      if (activeCategory && p.categoryId !== activeCategory.id) return false;
      if (activeSubcategory && p.subcategoryId !== activeSubcategory.id) return false;
      return true;
    });
  }, [daAba, query, activeSection, activeCategory, activeSubcategory]);

  /** Mostra a grade de produtos quando não há mais nível para descer. */
  const mostrarProdutos =
    buscando ||
    (!!activeSection &&
      (catsOfActive.length === 0 ||
        (!!activeCategory && (subcatsOfActive.length === 0 || !!activeSubcategory))));

  const cardStyle = (c: PublicTaxonomyCard) => ({
    width: c.cardWidth ? `${c.cardWidth}px` : undefined,
    height: c.cardHeight ? `${c.cardHeight}px` : undefined,
  });

  return (
    <main className="flex min-h-screen flex-col gap-4 bg-background p-4 pb-16">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-muted-foreground">Loja</p>
        <h1 className="text-2xl font-bold text-foreground">
          {referral.sponsorName ? `Loja de ${referral.sponsorName}` : "FitMind Club"}
        </h1>
        <p className="mt-1 text-[11px] text-muted-foreground">
          {referral.sponsorName
            ? "Você chegou por indicação — navegue à vontade."
            : "Navegue livre. A conta só é necessária na hora de comprar."}
        </p>
      </header>

      <div className="flex gap-2 rounded-full bg-card p-1">
        {TABS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`flex-1 rounded-full px-3 py-1.5 text-xs font-bold transition ${
              tab === t.id ? "bg-primary text-primary-foreground" : "text-muted-foreground"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      <div className="flex items-center gap-2 rounded-xl bg-card px-3 py-2.5">
        <Search className="h-4 w-4 shrink-0 text-muted-foreground" />
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Buscar na loja"
          className="w-full bg-transparent text-sm text-foreground outline-none placeholder:text-muted-foreground"
        />
      </div>

      {!buscando && (activeSection || activeCategory || activeSubcategory) && (
        <div className="flex flex-wrap items-center gap-2 text-xs">
          <button
            onClick={() => { setActiveSection(null); setActiveCategory(null); setActiveSubcategory(null); }}
            className="rounded-full bg-card px-3 py-1.5 font-bold text-foreground"
          >
            ← Loja
          </button>
          {activeSection && (
            <button
              onClick={() => { setActiveCategory(null); setActiveSubcategory(null); }}
              className={`rounded-full px-3 py-1.5 font-bold ${activeCategory || activeSubcategory ? "bg-primary/15 text-primary" : "bg-primary text-primary-foreground"}`}
            >
              {activeSection.name}
            </button>
          )}
          {activeCategory && (
            <button
              onClick={() => setActiveSubcategory(null)}
              className={`rounded-full px-3 py-1.5 font-bold ${activeSubcategory ? "bg-primary/15 text-primary" : "bg-primary text-primary-foreground"}`}
            >
              {activeCategory.name}
            </button>
          )}
          {activeSubcategory && (
            <span className="rounded-full bg-primary px-3 py-1.5 font-bold text-primary-foreground">
              {activeSubcategory.name}
            </span>
          )}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-40 animate-pulse rounded-2xl bg-card" />
          ))}
        </div>
      ) : (
        <>
          {!buscando && !activeSection && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {visibleSections.map((s) => (
                <button
                  key={s.id}
                  onClick={() => { setActiveSection(s); setActiveCategory(null); setActiveSubcategory(null); }}
                  className="w-full overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
                  style={cardStyle(s)}
                >
                  {s.imageUrl ? (
                    <img src={s.imageUrl} alt={s.name} className="h-32 w-full object-cover" />
                  ) : (
                    <div className="flex h-32 w-full items-center justify-center bg-muted">
                      <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                    </div>
                  )}
                  <p className="px-3 py-2 text-sm font-bold text-foreground">{s.name}</p>
                </button>
              ))}
              {visibleSections.length === 0 && (
                <p className="col-span-2 py-10 text-center text-sm text-muted-foreground sm:col-span-3">
                  Nenhum item publicado nesta vitrine por enquanto.
                </p>
              )}
            </div>
          )}

          {!buscando && activeSection && !activeCategory && catsOfActive.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {catsOfActive.map((c) => (
                <button
                  key={c.id}
                  onClick={() => { setActiveCategory(c); setActiveSubcategory(null); }}
                  className="w-full overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
                  style={cardStyle(c)}
                >
                  {c.imageUrl ? (
                    <img src={c.imageUrl} alt={c.name} className="h-28 w-full object-cover" />
                  ) : (
                    <div className="flex h-28 w-full items-center justify-center bg-muted">
                      <ShoppingBag className="h-7 w-7 text-muted-foreground" />
                    </div>
                  )}
                  <p className="px-3 py-2 text-sm font-bold text-foreground">{c.name}</p>
                </button>
              ))}
            </div>
          )}

          {!buscando && activeCategory && !activeSubcategory && subcatsOfActive.length > 0 && (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
              {subcatsOfActive.map((sc) => (
                <button
                  key={sc.id}
                  onClick={() => setActiveSubcategory(sc)}
                  className="w-full overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
                  style={cardStyle(sc)}
                >
                  {sc.imageUrl ? (
                    <img src={sc.imageUrl} alt={sc.name} className="h-24 w-full object-cover" />
                  ) : (
                    <div className="flex h-24 w-full items-center justify-center bg-muted">
                      <ShoppingBag className="h-6 w-6 text-muted-foreground" />
                    </div>
                  )}
                  <p className="px-3 py-2 text-sm font-bold text-foreground">{sc.name}</p>
                </button>
              ))}
            </div>
          )}

          {mostrarProdutos && (
            <div className="grid grid-cols-2 gap-3">
              {filtered.map((item) => (
                <button
                  key={`${item.source}-${item.id}`}
                  onClick={() => setDetail(item)}
                  className="w-full rounded-2xl bg-card p-3 text-left transition-colors hover:bg-accent"
                >
                  <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-xl bg-muted">
                    {item.imageUrl ? (
                      <img src={item.imageUrl} alt={item.title} className="h-full w-full object-contain" />
                    ) : (
                      <ShoppingBag className="h-8 w-8 text-muted-foreground" />
                    )}
                  </div>
                  {item.badgeLabel && (
                    <span className="mb-1 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                      {item.badgeLabel}
                    </span>
                  )}
                  <p className="min-h-[32px] text-xs font-medium text-foreground line-clamp-2">{item.title}</p>
                  {item.subtitle && (
                    <p className="mt-1 line-clamp-2 text-[10px] text-muted-foreground">{item.subtitle}</p>
                  )}
                  <div className="mt-1 flex flex-wrap items-baseline gap-1.5">
                    <span className="text-sm font-bold text-foreground">{priceLabel(item)}</span>
                    {item.originalPrice && item.originalPrice > item.price && (
                      <span className="text-[10px] text-muted-foreground line-through">{fmt(item.originalPrice)}</span>
                    )}
                  </div>
                  {!item.inStock && (
                    <p className="mt-1 text-[10px] text-muted-foreground">Indisponível no momento</p>
                  )}
                </button>
              ))}
              {filtered.length === 0 && (
                <p className="col-span-2 py-10 text-center text-sm text-muted-foreground">
                  {buscando ? `Nada encontrado para “${query}”.` : "Nenhum item nesta seção por enquanto."}
                </p>
              )}
            </div>
          )}

          {!buscando && tab === "market" && !activeSection && benefits.length > 0 && (
            <section className="rounded-2xl bg-card p-4">
              <h2 className="mb-3 text-sm font-bold text-foreground">Benefícios do clube</h2>
              <div className="space-y-2">
                {benefits.map((b) => (
                  <div key={b.id} className="flex items-start gap-3 rounded-xl bg-muted p-3">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-primary/15">
                      <Gift className="h-4 w-4 text-primary" />
                    </div>
                    <div className="min-w-0 flex-1">
                      <div className="flex items-start justify-between gap-2">
                        <p className="text-xs font-bold text-foreground">{b.name}</p>
                        {b.discountInfo && (
                          <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                            {b.discountInfo}
                          </span>
                        )}
                      </div>
                      <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
                        {b.description || b.category}
                      </p>
                    </div>
                  </div>
                ))}
              </div>
              <p className="mt-3 text-[11px] text-muted-foreground">
                Os cupons ficam disponíveis para membros com carteirinha ativa.
              </p>
            </section>
          )}
        </>
      )}

      <div className="mt-2 rounded-2xl bg-card p-4">
        <p className="text-sm font-bold text-foreground">Quer comprar?</p>
        <p className="mt-1 text-[11px] leading-relaxed text-muted-foreground">
          A compra acontece dentro do clube. Crie sua conta para finalizar o
          pedido e acessar todos os benefícios.
        </p>
        <Link
          to="/register"
          className="mt-3 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
        >
          Criar conta
        </Link>
      </div>

      {detail && <PublicProductModal product={detail} onClose={() => setDetail(null)} />}
    </main>
  );
}
