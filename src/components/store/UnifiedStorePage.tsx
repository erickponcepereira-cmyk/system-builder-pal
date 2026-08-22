import { useEffect, useMemo, useState, type ReactNode } from "react";
import { useNavigate } from "@tanstack/react-router";
import { StoreBanner, StorePopup } from "@/components/store/StoreBanner";
import { loadBanners, type StoreBanner as BannerRow } from "@/lib/store-banners";
import { AlertTriangle, IdCard, Loader2, MapPin, Search, ShoppingBag, Ticket, Timer, X } from "lucide-react";

import {
  foldText,
  groupBySeller,
  loadUnifiedCatalog,
  matchesQuery,
  type UnifiedCatalog,
  type UnifiedOrigin,
  type UnifiedProduct,
} from "@/lib/unified-store";
import {
  aplicarLocal,
  type CidadeComLoja,
  chaveCidade,
  contarLocais,
  EMPTY_LOCATION,
  loadStoreLocation,
  type LocalSelecionado,
  type StoreLocation,
} from "@/lib/store-location";
import {
  buildNetwork,
  buildRecommendations,
  buildScarcity,
  EMPTY_CONTEXT,
  loadStockStatus,
  loadStoreContext,
  sortShowcase,
  type StoreContext,
} from "@/lib/store-personalization";

const fmt = (v: number) => v.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const ORIGIN_LABEL: Record<UnifiedOrigin, string> = {
  fitmind: "FitMind",
  partner: "Parceiro",
  professional: "Profissional",
};

type StockMap = Record<string, { stock: number; remaining: number }>;

/**
 * Vitrine unificada — superfície de teste.
 *
 * A ordem dos blocos é a sequência de conversão, não estética: carteirinha,
 * escassez e renovação acima; exploração por seção no fim. Cada bloco some
 * sozinho quando não tem dado — vitrine sem "Perto de você" é melhor que
 * "Perto de você" vazio.
 */
export function UnifiedStorePage({ audience = "student" }: { audience?: "student" | "coach" }) {
  const [catalog, setCatalog] = useState<UnifiedCatalog | null>(null);
  const [ctx, setCtx] = useState<StoreContext>(EMPTY_CONTEXT);
  const [stock, setStock] = useState<StockMap>({});
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [detail, setDetail] = useState<UnifiedProduct | null>(null);
  const [local, setLocal] = useState<StoreLocation>(EMPTY_LOCATION);
  const [ondeEstou, setOndeEstou] = useState<LocalSelecionado>({ modo: "todas" });
  const [seletorAberto, setSeletorAberto] = useState(false);
  const navigate = useNavigate();
  const [banners, setBanners] = useState<BannerRow[]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const data = await loadUnifiedCatalog();
        if (!active) return;
        setCatalog(data);

        const partnerIds = data.products
          .filter((p) => p.origin === "partner")
          .map((p) => p.sourceId);

        const [context, stockMap, loc, bs] = await Promise.all([
          loadStoreContext(data),
          loadStockStatus(partnerIds),
          loadStoreLocation(),
          loadBanners(),
        ]);
        if (!active) return;
        setCtx(context);
        setStock(stockMap);
        setLocal(loc);
        setBanners(bs);

        // "Minha localizacao" vem do cadastro, que o ComplianceGate ja exige.
        // So entra se a cidade do perfil tiver loja - senao abriria vazio.
        const minha = chaveCidade(context.currentCity);
        const achou = minha ? loc.cidades.find((c) => c.chave === minha) : undefined;
        if (achou) setOndeEstou({ modo: "cidade", chave: achou.chave, nome: achou.nome, uf: achou.uf });
      } catch (error) {
        console.error("[unified-store] carga", error);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => { active = false; };
  }, []);

  const products = catalog?.products ?? [];

  const usableSections = useMemo(() => {
    const used = new Set(products.map((p) => p.sectionId).filter(Boolean) as string[]);
    return (catalog?.sections ?? []).filter((s) => used.has(s.id));
  }, [catalog, products]);

  const noLocal = useMemo(() => aplicarLocal(products, local, ondeEstou), [products, local, ondeEstou]);

  const filtered = useMemo(
    () => noLocal.filter((p) => (!sectionId || p.sectionId === sectionId) && matchesQuery(p, query)),
    [noLocal, query, sectionId],
  );

  /** Acabaram os vendedores locais: sobrou so o catalogo nacional. */
  const semLojaLocal =
    ondeEstou.modo === "cidade" && contarLocais(products, local, ondeEstou.chave) === 0;

  const searching = foldText(query).length > 0;
  const browsing = !searching && !sectionId;

  const scarcity = useMemo(() => buildScarcity(filtered, stock), [filtered, stock]);
  const recommendations = useMemo(() => buildRecommendations(filtered, ctx), [filtered, ctx]);
  const network = useMemo(() => buildNetwork(filtered, ctx), [filtered, ctx]);
  const showcase = useMemo(() => sortShowcase(filtered, ctx, stock), [filtered, ctx, stock]);

  const byOrigin = useMemo(() => {
    return (["fitmind", "partner", "professional"] as UnifiedOrigin[])
      .map((origin) => ({ origin, items: showcase.filter((p) => p.origin === origin) }))
      .filter((group) => group.items.length > 0);
  }, [showcase]);

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

      {/* Barra de local. Fica no topo como no iFood: o que muda o catalogo
          inteiro precisa estar visivel antes do catalogo. */}
      {local.cidades.length > 0 && (
        <button
          type="button"
          onClick={() => setSeletorAberto(true)}
          className="flex items-center gap-2 rounded-2xl border border-border bg-card px-4 py-3 text-left"
        >
          <MapPin className="h-4 w-4 shrink-0 text-primary" />
          <span className="min-w-0 flex-1">
            <span className="block text-[10px] uppercase tracking-wider text-muted-foreground">
              Mostrando lojas de
            </span>
            <span className="block truncate text-sm font-semibold text-foreground">
              {ondeEstou.modo === "cidade" ? `${ondeEstou.nome} · ${ondeEstou.uf}` : "Todas as cidades"}
            </span>
          </span>
          <span className="shrink-0 text-[11px] font-bold text-primary">Trocar</span>
        </button>
      )}

      {catalog?.errors.length ? (
        <div className="rounded-2xl border border-destructive/30 bg-destructive/10 p-3">
          <p className="text-[11px] text-destructive">
            Não carregou: {catalog.errors.join(", ")}. O resto da vitrine está completo.
          </p>
        </div>
      ) : null}

      {/* 1. Carteirinha — o argumento de compra mais forte, e o número já está no banco. */}
      {browsing && !ctx.cardActive && ctx.freebiesValue > 0 && (
        <section className="rounded-2xl border border-primary/30 bg-primary/10 p-4">
          <div className="flex items-baseline gap-2">
            <span className="text-2xl font-bold text-primary">{fmt(ctx.freebiesValue)}</span>
            <span className="text-[11px] leading-tight text-muted-foreground">
              em {ctx.freebiesCount} gratuitos<br />esperando você
            </span>
          </div>
          <p className="mt-2 text-[11px] leading-relaxed text-muted-foreground">
            Sua carteirinha está inativa. Ela ativa na primeira compra e libera o resgate dos
            gratuitos dos parceiros — cadastrar-se sozinho não basta.
          </p>
        </section>
      )}

      {browsing && ctx.cardActive && ctx.freebiesValue > 0 && (
        <section className="rounded-2xl border border-emerald-500/30 bg-emerald-500/10 p-3">
          <p className="text-[11px] leading-relaxed text-emerald-500">
            <b>Carteirinha ativa</b> até {new Date(ctx.cardValidUntil as string).toLocaleDateString("pt-BR")} ·
            {" "}{fmt(ctx.freebiesValue)} em gratuitos disponíveis para resgate.
          </p>
        </section>
      )}

      {/* Banner: quem abre a loja sem intencao definida nao clica em
          categoria. Precisa de algo na frente. */}
      {browsing && (
        <StoreBanner
          produtos={products}
          banners={banners}
          onAbrir={setDetail}
          onNavegar={(url) => navigate({ to: url })}
        />
      )}

      {/* 2. Busca */}
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

      {/* 3. Taxonomia como filtro, não como pasta */}
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
            <Block key={group.origin} title={ORIGIN_LABEL[group.origin]} hint={`${group.items.length}`}>
              <Grid items={group.items} stock={stock} onOpen={setDetail} />
            </Block>
          ))}
        </>
      ) : (
        <>
          {/* 4. Escassez verdadeira — só produto com vaga contada */}
          {scarcity.length > 0 && (
            <Block title="Acaba em breve" hint="vagas reais">
              <Rail>
                {scarcity.map(({ product, remaining, stock: total }) => (
                  <Card
                    key={product.id}
                    product={product}
                    onOpen={setDetail}
                    variant="rail"
                    flag={`${remaining} de ${total} vagas`}
                  />
                ))}
              </Rail>
            </Block>
          )}

          {/* 5. Recomendação por regra, com o motivo escrito no card */}
          {recommendations.length > 0 && (
            <Block title="Para você" hint="por regra, não por palpite">
              <Rail>
                {recommendations.map(({ product, reason }) => (
                  <Card key={product.id} product={product} onOpen={setDetail} reason={reason} variant="rail" />
                ))}
              </Rail>
            </Block>
          )}

          {/* 6. A rede do aluno */}
          {network.length > 0 && (
            <Block title="Da sua rede" hint="seu coach e a rede dele">
              <Rail>
                {network.map((product) => (
                  <Card key={product.id} product={product} onOpen={setDetail} variant="rail" />
                ))}
              </Rail>
            </Block>
          )}

          {/* Acabaram os vendedores locais. O catalogo FitMind e nacional,
              entao a loja nunca fica vazia — mas precisa dizer o que houve. */}
          {semLojaLocal && (
            <section className="rounded-2xl border border-amber-500/30 bg-amber-500/10 p-4">
              <p className="text-sm font-bold text-amber-500">
                Ainda não há lojas em {ondeEstou.modo === "cidade" ? ondeEstou.nome : "sua cidade"}
              </p>
              <p className="mt-1 text-[11px] leading-relaxed text-amber-500/80">
                Você está vendo o catálogo FitMind, que vale para todo o Brasil. Quer olhar as
                lojas de outra cidade?
              </p>
              <div className="mt-3 flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => setSeletorAberto(true)}
                  className="rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground"
                >
                  Explorar outras cidades
                </button>
                <button
                  type="button"
                  onClick={() => setOndeEstou({ modo: "todas" })}
                  className="rounded-xl border border-amber-500/40 px-3 py-2 text-xs font-bold text-amber-500"
                >
                  Ver tudo
                </button>
              </div>
            </section>
          )}

          {/* 7. Vitrine ordenada por score, empate em ordem alfabética */}
          <Block title="Vitrine" hint={`${showcase.length} itens`}>
            <Grid items={showcase} stock={stock} onOpen={setDetail} />
          </Block>

          {/* 8. A navegação de hoje, preservada para quem já sabe usar */}
          {browsing && usableSections.length > 0 && (
            <Block title="Explorar por seção" hint="navegação de hoje">
              <div className="grid grid-cols-2 gap-3">
                {usableSections.map((s) => (
                  <button
                    key={s.id}
                    type="button"
                    onClick={() => setSectionId(s.id)}
                    className="overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent"
                  >
                    {s.imageUrl ? (
                      <img src={s.imageUrl} alt="" className="h-24 w-full object-cover" loading="lazy" />
                    ) : (
                      <div className="flex h-24 w-full items-center justify-center bg-muted">
                        <ShoppingBag className="h-6 w-6 text-muted-foreground opacity-50" />
                      </div>
                    )}
                    <p className="px-3 py-2 text-sm font-bold text-foreground">{s.name}</p>
                  </button>
                ))}
              </div>
            </Block>
          )}
        </>
      )}

      {seletorAberto && (
        <CitySheet
          cidades={local.cidades}
          atual={ondeEstou}
          minhaCidade={chaveCidade(ctx.currentCity)}
          onPick={(sel) => { setOndeEstou(sel); setSeletorAberto(false); }}
          onClose={() => setSeletorAberto(false)}
        />
      )}

      <StorePopup banners={banners} onNavegar={(url) => navigate({ to: url })} />

      {detail && <DetailSheet product={detail} onClose={() => setDetail(null)} />}
    </div>
  );
}

function Block({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-sm font-bold text-foreground">{title}</h2>
        {hint && <span className="shrink-0 text-[10px] text-muted-foreground">{hint}</span>}
      </div>
      {children}
    </section>
  );
}

/** Trilho horizontal: mantém o bloco curto sem esconder o que vem depois. */
function Rail({ children }: { children: ReactNode }) {
  return (
    <div className="-mx-4 flex gap-3 overflow-x-auto px-4 pb-2 [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
      {children}
    </div>
  );
}

function Grid({ items, stock, onOpen }: { items: UnifiedProduct[]; stock: StockMap; onOpen: (p: UnifiedProduct) => void }) {
  return (
    <div className="grid grid-cols-2 gap-3">
      {items.map((item) => {
        const info = stock[item.sourceId];
        const flag = info && info.stock > 0 && info.remaining > 0 && info.remaining <= 3
          ? `${info.remaining} de ${info.stock} vagas`
          : undefined;
        return <Card key={item.id} product={item} onOpen={onOpen} flag={flag} />;
      })}
    </div>
  );
}

/**
 * Card único para as quatro origens. O selo de vendedor é o que substitui a
 * aba de parceiros: o crédito aparece dentro do fluxo principal.
 *
 * Sem largura fixa e sem breakpoint de viewport — quem manda é o container.
 * Foi `xl:grid-cols-5` dentro do shell de 430px que espremia os cards da loja
 * de parceiros em cinco colunas na tela grande.
 */
function Card({
  product,
  onOpen,
  reason,
  flag,
  variant = "grid",
}: {
  product: UnifiedProduct;
  onOpen: (p: UnifiedProduct) => void;
  reason?: string;
  flag?: string;
  /** "rail" tem largura própria porque rola na horizontal; "grid" obedece a célula. */
  variant?: "grid" | "rail";
}) {
  return (
    <button
      type="button"
      onClick={() => onOpen(product)}
      className={`flex flex-col overflow-hidden rounded-2xl bg-card text-left transition-colors hover:bg-accent ${
        variant === "rail" ? "w-[9.25rem] shrink-0" : "w-full"
      }`}
    >
      <div className="relative flex aspect-square w-full items-center justify-center overflow-hidden bg-muted">
        {product.imageUrl ? (
          <img src={product.imageUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <ShoppingBag className="h-7 w-7 text-muted-foreground opacity-50" />
        )}
        {flag && (
          <span className="absolute left-1.5 top-1.5 inline-flex items-center gap-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">
            <Timer className="h-2.5 w-2.5" />{flag}
          </span>
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

      {reason && (
        <p className="border-t border-border bg-primary/10 px-2.5 py-1.5 text-[9.5px] leading-snug text-primary">
          {reason}
        </p>
      )}
    </button>
  );
}

/**
 * Seletor de cidade.
 *
 * Ordena por numero de vendedores, nao alfabeticamente: a cidade com mais loja
 * e a que mais gente procura. A cidade do perfil vem marcada, para a pessoa
 * reconhecer a dela sem ler a lista toda.
 */
function CitySheet({
  cidades,
  atual,
  minhaCidade,
  onPick,
  onClose,
}: {
  cidades: CidadeComLoja[];
  atual: LocalSelecionado;
  minhaCidade: string;
  onPick: (sel: LocalSelecionado) => void;
  onClose: () => void;
}) {
  const [busca, setBusca] = useState("");
  const termo = chaveCidade(busca);
  const lista = termo ? cidades.filter((c) => c.chave.includes(termo)) : cidades;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-background/80 backdrop-blur-sm sm:items-center"
      onClick={onClose}
      role="presentation"
    >
      <div
        className="max-h-[80vh] w-full max-w-md overflow-y-auto rounded-t-2xl border border-border bg-card p-5 sm:rounded-2xl"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-label="Escolher cidade"
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-base font-bold text-foreground">Onde você quer comprar</h2>
            <p className="mt-0.5 text-[11px] text-muted-foreground">
              Cursos e protocolos da FitMind aparecem em qualquer cidade.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Fechar" className="shrink-0">
            <X className="h-5 w-5 text-muted-foreground" />
          </button>
        </div>

        {cidades.length > 6 && (
          <input
            value={busca}
            onChange={(e) => setBusca(e.target.value)}
            placeholder="Buscar cidade…"
            aria-label="Buscar cidade"
            className="mb-3 w-full rounded-xl border border-border bg-muted px-3 py-2.5 text-sm text-foreground outline-none placeholder:text-muted-foreground focus:border-primary"
          />
        )}

        <button
          type="button"
          onClick={() => onPick({ modo: "todas" })}
          className={`mb-2 flex w-full items-center justify-between rounded-xl border px-3 py-2.5 text-left ${
            atual.modo === "todas" ? "border-primary bg-primary/10" : "border-border bg-muted"
          }`}
        >
          <span className="text-sm font-semibold text-foreground">Todas as cidades</span>
          <span className="text-[10px] text-muted-foreground">sem filtro</span>
        </button>

        <div className="flex flex-col gap-1.5">
          {lista.map((c) => {
            const ativa = atual.modo === "cidade" && atual.chave === c.chave;
            return (
              <button
                key={c.chave + c.uf}
                type="button"
                onClick={() => onPick({ modo: "cidade", chave: c.chave, nome: c.nome, uf: c.uf })}
                className={`flex w-full items-center gap-2 rounded-xl border px-3 py-2.5 text-left ${
                  ativa ? "border-primary bg-primary/10" : "border-border bg-muted"
                }`}
              >
                <MapPin className="h-3.5 w-3.5 shrink-0 text-primary" />
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-semibold text-foreground">
                    {c.nome} · {c.uf}
                  </span>
                  <span className="block text-[10px] text-muted-foreground">
                    {c.vendedores} {c.vendedores === 1 ? "vendedor" : "vendedores"}
                    {c.chave === minhaCidade ? " · sua cidade" : ""}
                  </span>
                </span>
              </button>
            );
          })}
          {lista.length === 0 && (
            <p className="py-6 text-center text-xs text-muted-foreground">
              Nenhuma cidade encontrada para “{busca}”.
            </p>
          )}
        </div>
      </div>
    </div>
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
              {product.sellerCity ? ` · ${product.sellerCity}` : ""}
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
          busca, ordenação, recomendação e leitura do card.
        </p>
      </div>
    </div>
  );
}

export default UnifiedStorePage;
