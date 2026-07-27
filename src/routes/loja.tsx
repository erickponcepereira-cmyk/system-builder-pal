import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import {
  Gift, Lock, Minus, Plus, Search, ShoppingBag, Ticket, Trash2, X,
} from "lucide-react";
import { Logo } from "@/components/Logo";
import {
  fetchPublicBenefits, fetchPublicCatalog, fetchPublicTaxonomy, readPublicCart,
  readReferralContext, writePublicCart, PUBLIC_STORE_IS_MOCKED,
  type PublicBenefit, type PublicCartLine, type PublicProduct,
  type PublicTaxonomy,
} from "@/lib/public-store";


/**
 * Loja pública — navegação sem login (modelo Mercado Livre / Amazon).
 *
 * Fica FORA de `_authenticated` de propósito. Não reaproveita a
 * `StorePage` (1666 linhas, acoplada a sessão e a colunas de margem):
 * ela continua intacta para a área logada. Zero risco de regressão.
 *
 * Contexto do coach vem de sessionStorage, gravado por `/r/{code}`.
 */
export const Route = createFileRoute("/loja")({
  head: () => ({
    meta: [
      { title: "Loja — FitMind Club" },
      { name: "description", content: "Conheça os planos, cursos e benefícios do FitMind Club." },
    ],
  }),
  component: PublicStorePage,
});

const fmt = (n: number) =>
  n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

const KIND_LABEL: Record<string, string> = {
  challenge: "Plano", digital: "Curso", store: "Loja",
  item: "Serviço", partner: "Parceiro", professional: "Profissional",
};

type Aba = "produtos" | "parceiros" | "profissionais" | "beneficios";

const ABAS: { id: Aba; label: string }[] = [
  { id: "produtos", label: "Produtos" },
  { id: "parceiros", label: "Parceiros" },
  { id: "profissionais", label: "Profissionais" },
  { id: "beneficios", label: "Benefícios" },
];

function PublicStorePage() {
  const [products, setProducts] = useState<PublicProduct[]>([]);
  const [benefits, setBenefits] = useState<PublicBenefit[]>([]);
  const [taxonomy, setTaxonomy] = useState<PublicTaxonomy>({ sections: [], categories: [] });
  const [loading, setLoading] = useState(true);
  const [query, setQuery] = useState("");
  const [tab, setTab] = useState<Aba>("produtos");
  const [sectionId, setSectionId] = useState<string | null>(null);
  const [categoryId, setCategoryId] = useState<string | null>(null);

  const [cart, setCart] = useState<PublicCartLine[]>([]);
  const [cartOpen, setCartOpen] = useState(false);
  /** Motivo do gate, quando aberto. null = fechado. */
  const [gate, setGate] = useState<null | { title: string; reason: string }>(null);
  const [montado, setMontado] = useState(false);
  const [referral, setReferral] = useState<{
    referralCode: string | null;
    sponsorName: string | null;
  }>({ referralCode: null, sponsorName: null });

  /**
   * localStorage e a query string só existem no cliente. Esta rota renderiza
   * no servidor (é o SSR que faz o preview do link funcionar), então ler
   * storage durante o render causaria divergência de hidratação: o servidor
   * monta com carrinho vazio e o cliente com carrinho cheio. Traz o estado
   * real só depois de montar.
   */
  useEffect(() => {
    setCart(readPublicCart());
    setReferral(readReferralContext());
    setMontado(true);
  }, []);

  // Carrinho persiste na MESMA chave da loja logada — é o que faz ele
  // sobreviver ao cadastro sem código de migração. O guarda de `montado`
  // impede que o estado vazio inicial apague um carrinho já salvo.
  useEffect(() => {
    if (montado) writePublicCart(cart);
  }, [cart, montado]);

  useEffect(() => {
    if (!montado) return;
    let cancelled = false;
    (async () => {
      const [cat, ben, tax] = await Promise.all([
        fetchPublicCatalog(referral.referralCode),
        fetchPublicBenefits(referral.referralCode),
        fetchPublicTaxonomy().catch(() => ({ sections: [], categories: [] })),
      ]);
      if (cancelled) return;
      setProducts(cat);
      setBenefits(ben);
      setTaxonomy(tax);
      setLoading(false);
    })();
    return () => { cancelled = true; };
  }, [montado, referral.referralCode]);

  /** Produtos da aba atual, antes dos filtros de seção e busca. */
  const daAba = useMemo(() => {
    if (tab === "parceiros") return products.filter((p) => p.source === "partner");
    if (tab === "profissionais") return products.filter((p) => p.source === "professional");
    return products.filter((p) => p.source === "fitmind");
  }, [products, tab]);

  /** Só mostra chips de seções que realmente têm item nesta aba. */
  const secoesDaAba = useMemo(() => {
    const usadas = new Set(daAba.map((p) => p.sectionId).filter(Boolean) as string[]);
    return taxonomy.sections
      .filter((s) => usadas.has(s.id))
      .map((s) => ({
        ...s,
        count: daAba.filter((p) => p.sectionId === s.id).length,
      }));
  }, [daAba, taxonomy.sections]);

  const categoriasDaSecao = useMemo(() => {
    if (!sectionId) return [];
    const usadas = new Set(
      daAba.filter((p) => p.sectionId === sectionId).map((p) => p.categoryId).filter(Boolean) as string[],
    );
    return taxonomy.categories.filter((c) => c.sectionId === sectionId && usadas.has(c.id));
  }, [daAba, sectionId, taxonomy.categories]);

  // Trocar de aba não pode manter um filtro que não existe mais nela.
  useEffect(() => { setSectionId(null); setCategoryId(null); }, [tab]);
  useEffect(() => { setCategoryId(null); }, [sectionId]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return daAba.filter((p) => {
      if (sectionId && p.sectionId !== sectionId) return false;
      if (categoryId && p.categoryId !== categoryId) return false;
      if (!q) return true;
      return `${p.title} ${p.subtitle || ""} ${p.sectionName || ""} ${p.categoryName || ""}`
        .toLowerCase().includes(q);
    });
  }, [daAba, query, sectionId, categoryId]);


  const cartCount = cart.reduce((sum, l) => sum + l.quantity, 0);
  const cartTotal = cart.reduce((sum, l) => sum + l.price * l.quantity, 0);

  const addToCart = (p: PublicProduct) => {
    setCart((prev) => {
      const found = prev.find((l) => l.id === p.id);
      if (found) {
        return prev.map((l) =>
          l.id === p.id ? { ...l, quantity: l.quantity + 1 } : l);
      }
      return [...prev, {
        id: p.id, kind: p.kind, title: p.title,
        price: p.price, imageUrl: p.imageUrl, quantity: 1,
      }];
    });
    setCartOpen(true);
  };

  const setQty = (id: string, delta: number) => {
    setCart((prev) => prev.flatMap((l) => {
      if (l.id !== id) return [l];
      const q = l.quantity + delta;
      return q <= 0 ? [] : [{ ...l, quantity: q }];
    }));
  };

  return (
    <main className="min-h-screen pb-28" style={{ backgroundColor: "#0A0A0A" }}>
      <Header
        sponsorName={referral.sponsorName}
        cartCount={cartCount}
        onOpenCart={() => setCartOpen(true)}
      />

      {PUBLIC_STORE_IS_MOCKED && (
        <div className="mx-4 mt-3 rounded-xl border border-amber-500/25 bg-amber-500/10 px-3 py-2">
          <p className="text-[11px] font-medium text-amber-200/90">
            Vitrine em dados de exemplo — as RPCs públicas ainda não existem no banco.
          </p>
        </div>
      )}

      <div className="px-4 pt-4">
        <div className="flex items-center gap-2 rounded-xl bg-white/5 px-3 py-2.5">
          <Search className="h-4 w-4 shrink-0 text-white/35" />
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Buscar na loja"
            className="w-full bg-transparent text-sm text-white outline-none placeholder:text-white/30"
          />
        </div>
      </div>

      <div className="mt-4 flex gap-2 overflow-x-auto px-4 pb-1">
        {ABAS.map((t) => (
          <button
            key={t.id}
            onClick={() => setTab(t.id)}
            className={`shrink-0 rounded-xl px-4 py-2 text-xs font-bold transition-colors ${
              tab === t.id
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-white/55 hover:bg-white/10"
            }`}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab !== "beneficios" && secoesDaAba.length > 0 && (
        <div className="mt-3 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={!sectionId} onClick={() => setSectionId(null)}>
            Tudo
          </Chip>
          {secoesDaAba.map((s) => (
            <Chip
              key={s.id}
              active={sectionId === s.id}
              onClick={() => setSectionId(s.id)}
            >
              {s.name} <span className="opacity-50">({s.count})</span>
            </Chip>
          ))}
        </div>
      )}

      {tab !== "beneficios" && categoriasDaSecao.length > 0 && (
        <div className="mt-2 flex gap-2 overflow-x-auto px-4 pb-1">
          <Chip active={!categoryId} onClick={() => setCategoryId(null)} small>
            Todas
          </Chip>
          {categoriasDaSecao.map((c) => (
            <Chip
              key={c.id}
              active={categoryId === c.id}
              onClick={() => setCategoryId(c.id)}
              small
            >
              {c.name}
            </Chip>
          ))}
        </div>
      )}

      {loading ? (
        <div className="grid grid-cols-2 gap-3 px-4 pt-4">
          {[0, 1, 2, 3].map((i) => (
            <div key={i} className="h-56 animate-pulse rounded-2xl bg-white/5" />
          ))}
        </div>
      ) : tab !== "beneficios" ? (
        <section className="grid grid-cols-2 gap-3 px-4 pt-4">
          {visible.map((p) => (
            <ProductCard
              key={p.id}
              product={p}
              onAdd={() => addToCart(p)}
              onDetail={() => setGate({
                title: p.title,
                reason: "Ficha completa, galeria de fotos e o que está incluso ficam disponíveis para membros.",
              })}
            />
          ))}
          {visible.length === 0 && (
            <p className="col-span-2 py-10 text-center text-sm text-white/40">
              {query.trim()
                ? `Nada encontrado para “${query}”.`
                : sectionId || categoryId
                  ? "Nenhum item nesta seção por enquanto."
                  : tab === "parceiros"
                    ? "Nenhum produto de parceiro publicado ainda."
                    : tab === "profissionais"
                      ? "Nenhum produto de profissional publicado ainda."
                      : "Nenhum produto disponível no momento."}
            </p>
          )}
        </section>

      ) : (
        <section className="grid gap-3 px-4 pt-4">
          {benefits.map((b) => (
            <BenefitCard
              key={b.id}
              benefit={b}
              onUse={() => setGate({
                title: b.name,
                reason: "O código do cupom fica disponível depois que você tem um produto que libera este benefício.",
              })}
            />
          ))}
        </section>
      )}

      {cartOpen && (
        <CartDrawer
          lines={cart}
          total={cartTotal}
          onClose={() => setCartOpen(false)}
          onQty={setQty}
          onClear={() => setCart([])}
        />
      )}

      {gate && (
        <GateModal
          title={gate.title}
          reason={gate.reason}
          onClose={() => setGate(null)}
        />
      )}
    </main>
  );
}

/* ---------------------------------------------------------------- */

/** Chip de filtro (seção e categoria). */
function Chip({ active, onClick, small, children }: {
  active: boolean; onClick: () => void; small?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`shrink-0 whitespace-nowrap rounded-full font-bold transition-colors ${
        small ? "px-3 py-1 text-[10px]" : "px-3 py-1.5 text-[11px]"
      } ${
        active
          ? "bg-primary/20 text-primary"
          : "bg-white/5 text-white/50 hover:bg-white/10"
      }`}
    >
      {children}
    </button>
  );
}


function Header({ sponsorName, cartCount, onOpenCart }: {
  sponsorName: string | null; cartCount: number; onOpenCart: () => void;
}) {
  return (
    <header className="sticky top-0 z-30 border-b border-white/5 px-4 py-3"
      style={{ backgroundColor: "#0A0A0AF2", backdropFilter: "blur(8px)" }}>
      <div className="flex items-center gap-3">
        <Logo className="h-8 w-8 shrink-0 object-contain" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-bold text-white">
            {sponsorName ? `Loja de ${sponsorName}` : "Loja FitMind Club"}
          </p>
          <p className="text-[11px] text-white/40">
            {sponsorName ? "Você chegou por indicação" : "Navegue livre — conta só na hora de comprar"}
          </p>
        </div>
        <button
          onClick={onOpenCart}
          aria-label="Abrir carrinho"
          className="relative flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-white/5"
        >
          <ShoppingBag className="h-5 w-5 text-white" />
          {cartCount > 0 && (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-primary px-1 text-[10px] font-bold text-primary-foreground">
              {cartCount}
            </span>
          )}
        </button>
      </div>
    </header>
  );
}

function ProductCard({ product, onAdd, onDetail }: {
  product: PublicProduct; onAdd: () => void; onDetail: () => void;
}) {
  const p = product;
  return (
    <article className="flex flex-col overflow-hidden rounded-2xl"
      style={{ backgroundColor: "#1A1A1A" }}>
      <button
        onClick={onDetail}
        className="flex h-28 w-full items-center justify-center bg-white/5"
      >
        {p.imageUrl
          ? <img src={p.imageUrl} alt="" className="h-full w-full object-cover" />
          : <ShoppingBag className="h-7 w-7 text-white/20" />}
      </button>

      <div className="flex flex-1 flex-col p-3">
        <div className="flex items-center gap-1.5">
          <span className="rounded-full bg-primary/15 px-2 py-0.5 text-[9px] font-bold text-primary">
            {KIND_LABEL[p.kind] || "Loja"}
          </span>
          {p.badgeLabel && (
            <span className="truncate rounded-full bg-white/5 px-2 py-0.5 text-[9px] font-bold text-white/60">
              {p.badgeLabel}
            </span>
          )}
        </div>

        <h2 className="mt-1.5 line-clamp-2 min-h-9 text-xs font-bold text-white">
          {p.title}
        </h2>
        {p.shortDescription && (
          <p className="mt-1 line-clamp-2 text-[11px] leading-relaxed text-white/40">
            {p.shortDescription}
          </p>
        )}

        <div className="mt-2">
          {p.originalPrice && p.originalPrice > p.price && (
            <p className="text-[10px] text-white/30 line-through">{fmt(p.originalPrice)}</p>
          )}
          <p className="text-sm font-bold text-white">
            {p.isPriceRange && p.minPrice != null
              ? `a partir de ${fmt(p.minPrice)}`
              : fmt(p.price)}
          </p>
        </div>

        <div className="mt-2.5 flex flex-col gap-1.5">
          <button
            onClick={onAdd}
            disabled={!p.inStock}
            className="rounded-xl bg-primary px-3 py-2 text-[11px] font-bold text-primary-foreground disabled:opacity-40"
          >
            {p.inStock ? "Adicionar" : "Indisponível"}
          </button>
          <button
            onClick={onDetail}
            className="flex items-center justify-center gap-1 rounded-xl bg-white/5 px-3 py-2 text-[11px] font-bold text-white/60"
          >
            <Lock className="h-3 w-3" /> Ver detalhes
          </button>
        </div>
      </div>
    </article>
  );
}

function BenefitCard({ benefit, onUse }: {
  benefit: PublicBenefit; onUse: () => void;
}) {
  const b = benefit;
  return (
    <article className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
          <Gift className="h-5 w-5 text-primary" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-sm font-bold text-white">{b.name}</h2>
            {b.discountInfo && (
              <span className="shrink-0 rounded-full bg-primary/15 px-2 py-0.5 text-[10px] font-bold text-primary">
                {b.discountInfo}
              </span>
            )}
          </div>
          <p className="mt-1 text-xs leading-relaxed text-white/45">
            {b.description || b.category}
          </p>
          {b.hasCoupon && (
            <button
              onClick={onUse}
              className="mt-3 flex items-center gap-1.5 rounded-xl bg-white/5 px-3 py-2 text-[11px] font-bold text-white/60"
            >
              <Ticket className="h-3.5 w-3.5" /> Ver cupom
            </button>
          )}
        </div>
      </div>
    </article>
  );
}

function GateModal({ title, reason, onClose }: {
  title: string; reason: string; onClose: () => void;
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-end bg-black/70 p-4 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="w-full max-w-md rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
            <Lock className="h-5 w-5 text-primary" />
          </div>
          <div className="min-w-0 flex-1">
            <h2 className="text-base font-bold text-white">{title}</h2>
            <p className="mt-1.5 text-xs leading-relaxed text-white/50">{reason}</p>
          </div>
        </div>

        <p className="mt-4 rounded-xl bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
          Seu carrinho fica salvo. Você cria a conta e volta exatamente de onde parou.
        </p>

        <div className="mt-4 flex gap-2">
          <button
            onClick={onClose}
            className="flex-1 rounded-xl bg-white/5 px-4 py-3 text-sm font-bold text-white/70"
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

function CartDrawer({ lines, total, onClose, onQty, onClear }: {
  lines: PublicCartLine[]; total: number; onClose: () => void;
  onQty: (id: string, delta: number) => void; onClear: () => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex items-end bg-black/70 backdrop-blur-sm sm:items-center sm:justify-center">
      <div className="max-h-[85vh] w-full max-w-md overflow-y-auto rounded-t-2xl p-5 sm:rounded-2xl"
        style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between">
          <h2 className="text-base font-bold text-white">Seu carrinho</h2>
          <button onClick={onClose} aria-label="Fechar" className="rounded-lg p-1 text-white/50">
            <X className="h-5 w-5" />
          </button>
        </div>

        {lines.length === 0 ? (
          <p className="py-10 text-center text-sm text-white/40">
            Carrinho vazio.
          </p>
        ) : (
          <>
            <div className="mt-4 grid gap-2">
              {lines.map((l) => (
                <div key={l.id} className="flex items-center gap-3 rounded-xl bg-white/5 p-3">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-xs font-bold text-white">{l.title}</p>
                    <p className="text-[11px] text-white/45">{fmt(l.price)}</p>
                  </div>
                  <div className="flex items-center gap-1.5">
                    <button onClick={() => onQty(l.id, -1)} aria-label="Diminuir"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white">
                      {l.quantity === 1 ? <Trash2 className="h-3.5 w-3.5" /> : <Minus className="h-3.5 w-3.5" />}
                    </button>
                    <span className="w-5 text-center text-xs font-bold text-white">{l.quantity}</span>
                    <button onClick={() => onQty(l.id, 1)} aria-label="Aumentar"
                      className="flex h-7 w-7 items-center justify-center rounded-lg bg-white/10 text-white">
                      <Plus className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </div>
              ))}
            </div>

            <div className="mt-4 flex items-center justify-between border-t border-white/5 pt-3">
              <span className="text-xs text-white/50">Total</span>
              <span className="text-lg font-bold text-white">{fmt(total)}</span>
            </div>

            <p className="mt-3 rounded-xl bg-white/5 px-3 py-2.5 text-[11px] leading-relaxed text-white/45">
              Para finalizar você cria a conta. O carrinho continua salvo.
            </p>

            <Link
              to="/register"
              className="mt-3 block rounded-xl bg-primary px-4 py-3 text-center text-sm font-bold text-primary-foreground"
            >
              Finalizar compra
            </Link>
            <button
              onClick={onClear}
              className="mt-2 w-full rounded-xl px-4 py-2.5 text-xs font-bold text-white/35"
            >
              Esvaziar carrinho
            </button>
          </>
        )}
      </div>
    </div>
  );
}
