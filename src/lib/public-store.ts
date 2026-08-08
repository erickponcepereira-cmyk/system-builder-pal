/**
 * Camada de leitura pública da loja (Entrega 1).
 *
 * Contrato definido em `docs/CONTRATO-LOJA-PUBLICA.md`.
 *
 * Enquanto as RPCs `public_store_catalog` / `public_store_benefits` não
 * existem no banco (são escopo do chat financeiro), este módulo devolve
 * mock. A UI consome só os tipos abaixo — quando as RPCs subirem, troca-se
 * o corpo de `fetchPublicCatalog` / `fetchPublicBenefits` e nada mais.
 *
 * REGRA: nenhum campo de custo, margem, comissão ou cupom trafega aqui.
 * Se você for adicionar um campo neste arquivo, confira a lista de colunas
 * proibidas no contrato antes.
 *
 * COLUNAS PROIBIDAS (verificadas em produção em 26/07 — estavam vazando):
 *   cost, other_costs, app_fee, app_fee_percentage, card_fee_percentage,
 *   credit_fee_percentage, tax_percentage, commission_coach,
 *   commission_level1, commission_level2, commission_level3, coupon_code
 */

import { supabase } from "@/integrations/supabase/client";
import { capturarAtribuicaoDaUrl, lerAtribuicao } from "@/lib/atribuicao";

export type PublicProductKind =
  | "challenge"
  | "digital"
  | "store"
  | "item"
  | "partner"
  | "professional";

/** Origem da vitrine — controla as abas da loja pública. */
export type PublicProductSource = "fitmind" | "partner" | "professional";

/** Espelha 1:1 as colunas de `public_store_catalog`. */
export interface PublicProduct {
  id: string;
  kind: PublicProductKind;
  source: PublicProductSource;
  title: string;
  subtitle: string | null;
  /** Truncado no servidor (~180 chars). Descrição completa exige conta. */
  shortDescription: string | null;
  price: number;
  originalPrice: number | null;
  isPriceRange: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  badgeLabel: string | null;
  imageUrl: string | null;
  sectionId: string | null;
  sectionName: string | null;
  categoryId: string | null;
  categoryName: string | null;
  subcategoryId: string | null;
  /** Booleano de propósito — quantidade exata não é pública. */
  inStock: boolean;
}

/** Card de navegação da vitrine (seção, categoria ou subcategoria). */
export interface PublicTaxonomyCard {
  id: string;
  name: string;
  imageUrl: string | null;
  cardWidth: number | null;
  cardHeight: number | null;
}

/** Seção/categoria da loja, para os filtros públicos. */
export interface PublicTaxonomy {
  sections: PublicTaxonomyCard[];
  categories: (PublicTaxonomyCard & { sectionId: string })[];
  subcategories: (PublicTaxonomyCard & { categoryId: string })[];
}



/** Espelha 1:1 as colunas de `public_store_benefits`. */
export interface PublicBenefit {
  id: string;
  name: string;
  description: string | null;
  category: string | null;
  discountInfo: string | null;
  websiteUrl: string | null;
  /** Booleano. O código do cupom nunca sai sem sessão. */
  hasCoupon: boolean;
}

export interface PublicStoreContext {
  /** Código de `/r/{code}`, quando a loja foi aberta pelo link de um coach. */
  referralCode: string | null;
  sponsorName: string | null;
}

/** Chave já usada por `r.$code.tsx`. Reaproveitada, não substituída. */
const REFERRAL_STORAGE_KEY = "fitmind_referral";

/**
 * Lê a indicação vigente.
 *
 * Passou a delegar para `@/lib/atribuicao`, que resolve três coisas que
 * faltavam aqui: captura de `?ref=` em qualquer rota pública, regra de
 * PRIMEIRO TOQUE (o coach que trouxe não é sobrescrito por um link genérico
 * depois) e persistência em localStorage — sessionStorage não sobrevive ao
 * redirect de volta do OAuth do Google.
 */
export function readReferralContext(): PublicStoreContext {
  const empty: PublicStoreContext = { referralCode: null, sponsorName: null };
  if (typeof window === "undefined") return empty;

  // captura ?ref= se houver; senão devolve o que já estava gravado
  const a = capturarAtribuicaoDaUrl() ?? lerAtribuicao();
  if (a) {
    return { referralCode: a.codigo, sponsorName: a.coachNome };
  }


  // retrocompatibilidade: links antigos que só gravaram em sessionStorage
  try {
    const raw = window.sessionStorage.getItem(REFERRAL_STORAGE_KEY);
    if (!raw) return empty;
    const parsed = JSON.parse(raw) as { code?: string; sponsorName?: string };
    return {
      referralCode: parsed?.code || null,
      sponsorName: parsed?.sponsorName || null,
    };
  } catch {
    return empty;
  }
}

/* ------------------------------------------------------------------ *
 * Adaptadores. Estes dois corpos são a ÚNICA coisa que muda quando as  *
 * RPCs subirem. A assinatura fica.                                     *
 * ------------------------------------------------------------------ */

/** Colunas de vitrine. Conferidas contra types.ts — nenhuma é de custo. */
const COLUNAS_VITRINE =
  "id,name,subtitle,short_description,price,original_price,is_price_range," +
  "min_price,max_price,badge_label,image_url,section_id,category_id," +
  "subcategory_id,stock,kind,is_featured,sort_order";

/** Parceiro/profissional têm um subconjunto menor — sem faixa de preço. */
const COLUNAS_VITRINE_TERCEIROS =
  "id,name,description,price,original_price,image_url,section_id,category_id," +
  "subcategory_id,stock,sort_order,restrict_to_networks,allowed_coach_ids";

const KINDS_VALIDOS: PublicProductKind[] = [
  "challenge",
  "digital",
  "store",
  "item",
  "partner",
  "professional",
];

function normalizarKind(v: unknown): PublicProductKind {
  return KINDS_VALIDOS.includes(v as PublicProductKind)
    ? (v as PublicProductKind)
    : "store";
}

function truncar(v: unknown, max = 180): string | null {
  if (typeof v !== "string" || !v.length) return null;
  return v.length <= max ? v : `${v.slice(0, max - 1).trimEnd()}…`;
}

function numeroOuNulo(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : null;
  return n === null || Number.isNaN(n) ? null : n;
}

type Linha = Record<string, unknown>;

/** Taxonomia resolvida de uma vez para toda a vitrine. */
interface Taxonomia {
  secoes: Map<string, PublicTaxonomyCard>;
  categorias: Map<string, PublicTaxonomyCard & { sectionId: string }>;
  subcategorias: Map<string, PublicTaxonomyCard & { categoryId: string }>;
}

const TAXONOMIA_VAZIA: Taxonomia = {
  secoes: new Map(),
  categorias: new Map(),
  subcategorias: new Map(),
};

function mapearProduto(
  r: Linha,
  tax: Taxonomia,
  source: PublicProductSource = "fitmind",
): PublicProduct {
  // Duas formas de linha chegam aqui: a tabela `products`, com colunas em
  // ingles, e a RPC `catalogo_publico()`, que devolve em portugues (nome,
  // preco, imagem_url, secao_id...). Sem aceitar as duas, tudo que vem da
  // RPC vira "Sem nome" com preco zero — e a RPC virou o caminho principal
  // quando `products` fechou para anon em 28/07.
  const txt = (...chaves: string[]): string | null => {
    for (const k of chaves) {
      const v = r[k];
      if (typeof v === "string" && v.length) return v;
    }
    return null;
  };
  const nmb = (...chaves: string[]): number | null => {
    for (const k of chaves) {
      const v = numeroOuNulo(r[k]);
      if (v !== null) return v;
    }
    return null;
  };

  const secaoId = txt("section_id", "secao_id");
  const categoriaId = txt("category_id", "categoria_id");
  const categoria = categoriaId ? tax.categorias.get(categoriaId) : undefined;
  const estoque = nmb("stock");
  const kind =
    source === "partner"
      ? "partner"
      : source === "professional"
        ? "professional"
        : normalizarKind(r.kind);
  return {
    id: String(r.id),
    kind,
    source,
    title: txt("name", "nome") ?? "Sem nome",
    subtitle: txt("subtitle", "subtitulo"),
    shortDescription: truncar(
      txt("short_description", "description", "descricao"),
    ),
    price: nmb("price", "preco") ?? 0,
    originalPrice: nmb("original_price", "preco_original"),
    isPriceRange: r.is_price_range === true,
    minPrice: nmb("min_price"),
    maxPrice: nmb("max_price"),
    badgeLabel: txt("badge_label", "badge"),
    imageUrl: txt("image_url", "imagem_url"),
    sectionId: secaoId ?? categoria?.sectionId ?? null,
    sectionName: (() => {
      const id = secaoId ?? categoria?.sectionId ?? null;
      return id ? (tax.secoes.get(id)?.name ?? null) : null;
    })(),
    categoryId: categoriaId,
    categoryName: categoria?.name ?? null,
    subcategoryId: txt("subcategory_id", "subcategoria_id"),
    // quantidade exata não é pública — só o booleano de propósito
    inStock: estoque === null ? true : estoque > 0,
  };
}

/** Só colunas de vitrine — imagem e dimensão do card, nada mais. */
const COLUNAS_CARD = "id,name,image_url,card_width,card_height";

function cardDe(r: Linha): PublicTaxonomyCard {
  return {
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    imageUrl: typeof r.image_url === "string" ? r.image_url : null,
    cardWidth: numeroOuNulo(r.card_width),
    cardHeight: numeroOuNulo(r.card_height),
  };
}

async function carregarTaxonomia(): Promise<Taxonomia> {
  const [secoes, categorias, subcategorias] = await Promise.all([
    supabase
      .from("store_sections")
      .select(COLUNAS_CARD)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_categories")
      .select(`${COLUNAS_CARD},section_id`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
    supabase
      .from("store_subcategories")
      .select(`${COLUNAS_CARD},category_id`)
      .eq("is_active", true)
      .order("sort_order", { ascending: true }),
  ]);

  const tax: Taxonomia = {
    secoes: new Map(),
    categorias: new Map(),
    subcategorias: new Map(),
  };
  for (const r of ((secoes.data ?? []) as unknown as Linha[])) {
    if (typeof r.id === "string") tax.secoes.set(r.id, cardDe(r));
  }
  for (const r of ((categorias.data ?? []) as unknown as Linha[])) {
    if (typeof r.id === "string") {
      tax.categorias.set(r.id, {
        ...cardDe(r),
        sectionId: typeof r.section_id === "string" ? r.section_id : "",
      });
    }
  }
  for (const r of ((subcategorias.data ?? []) as unknown as Linha[])) {
    if (typeof r.id === "string") {
      tax.subcategorias.set(r.id, {
        ...cardDe(r),
        categoryId: typeof r.category_id === "string" ? r.category_id : "",
      });
    }
  }
  return tax;
}

/** Seções, categorias e subcategorias ativas, para a navegação pública. */
export async function fetchPublicTaxonomy(): Promise<PublicTaxonomy> {
  const tax = await carregarTaxonomia();
  return {
    sections: [...tax.secoes.values()],
    categories: [...tax.categorias.values()],
    subcategories: [...tax.subcategorias.values()],
  };
}


/**
 * Vitrine de produtos, sem sessão.
 *
 * Três fontes: catálogo FitMind (`products`), produtos de parceiros
 * aprovados e produtos de profissionais aprovados e ativos. Cada consulta
 * pede colunas explícitas — nunca `select("*")` — e cada uma degrada em
 * silêncio para a loja nunca ficar em branco por causa de uma fonte só.
 */
export async function fetchPublicCatalog(
  referralCode: string | null,
  coachId?: string | null,
): Promise<PublicProduct[]> {
  void referralCode; // ordenação por coach/parceiro entra junto com a RPC
  const tax = await carregarTaxonomia().catch(() => TAXONOMIA_VAZIA);

  const [rpc, parceiro, profissional] = await Promise.all([
    // `products` fechou para anon em 28/07 (era o vazamento de custo e
    // comissao). A vitrine FitMind passa a vir da RPC catalogo_publico(),
    // SECURITY DEFINER, que devolve apenas colunas de vitrine e ja filtra
    // por ativo. As tabelas de parceiro e profissional seguem legiveis.
    supabase.rpc("catalogo_publico"),
    supabase
      .from("partner_products")
      .select(COLUNAS_VITRINE_TERCEIROS)
      .eq("status", "approved")
      .order("sort_order", { ascending: true }),
    supabase
      .from("professional_products")
      .select(COLUNAS_VITRINE_TERCEIROS)
      .eq("status", "approved")
      .eq("is_active_by_professional", true)
      .order("sort_order", { ascending: true }),
  ]);

  const linhas = (r: { data: unknown }) => (r.data ?? []) as unknown as Linha[];

  let fitmind = linhas(rpc);
  if (rpc.error || !fitmind.length) {
    // Fallback para sessao autenticada, onde a tabela continua legivel.
    // Nunca e o caminho de um anonimo.
    const [legado, novo] = await Promise.all([
      supabase
        .from("products")
        .select(COLUNAS_VITRINE)
        .eq("status", "active")
        .is("kind", null)
        .order("sort_order", { ascending: true }),
      supabase
        .from("products")
        .select(COLUNAS_VITRINE)
        .not("kind", "is", null)
        .eq("is_active", true)
        .order("sort_order", { ascending: true }),
    ]);
    fitmind = [...linhas(legado), ...linhas(novo)];
  }

  /**
   * Produto restrito a redes só aparece quando o visitante chegou pelo link
   * de um dos coaches autorizados.
   */
  const permitido = (r: Linha) => {
    if (!r.restrict_to_networks) return true;
    const lista = Array.isArray(r.allowed_coach_ids) ? (r.allowed_coach_ids as string[]) : [];
    return !!coachId && lista.includes(coachId);
  };

  return [
    ...fitmind.map((r) => mapearProduto(r, tax, "fitmind")),
    ...linhas(parceiro).filter(permitido).map((r) => mapearProduto(r, tax, "partner")),
    ...linhas(profissional).filter(permitido).map((r) => mapearProduto(r, tax, "professional")),
  ];
}



/**
 * Um produto só, para o permalink `/produto/{id}`.
 *
 * Roda no servidor (loader da rota) para que as meta tags de Open Graph
 * saiam no HTML — é isso que faz o link ter preview no WhatsApp. Se rodasse
 * só no cliente, o crawler receberia página vazia.
 *
 * Devolve null quando o produto não existe ou não está ativo: link de
 * produto desativado não pode virar vitrine.
 */
export async function fetchPublicProduct(
  id: string,
): Promise<PublicProduct | null> {
  if (!id) return null;

  // Uma única RPC SECURITY DEFINER projeta somente campos seguros da vitrine
  // e pesquisa as três origens. Isso evita que uma política interna de
  // proprietário/admin transforme um produto válido em 401 para visitantes.
  const { data, error } = await supabase.rpc(
    "catalogo_publico_produto" as never,
    { _id: id } as never,
  );

  if (error) {
    throw new Error(`Falha ao consultar o produto público: ${error.message}`);
  }

  const linha = Array.isArray(data)
    ? (data as unknown as Linha[])[0]
    : undefined;
  if (!linha) return null;

  const fonte = linha.fonte;
  const source: PublicProductSource =
    fonte === "partner" || fonte === "professional" ? fonte : "fitmind";

  return mapearProduto(linha, await carregarTaxonomia(), source);
}


/**
 * Benefícios de parceiro, sem sessão.
 *
 * `coupon_code` NUNCA entra no select — o cupom é o benefício, e usá-lo
 * exige carteirinha ativa. A regra de negócio não muda; o que muda é que
 * ela passa a ser visível em vez de invisível.
 */
export async function fetchPublicBenefits(
  referralCode: string | null,
): Promise<PublicBenefit[]> {
  void referralCode;
  const { data } = await supabase
    .from("partner_benefits")
    .select("id,name,description,category,discount_info,website_url")
    .eq("is_active", true)
    .order("sort_order", { ascending: true });

  return ((data ?? []) as unknown as Linha[]).map((r) => ({
    id: String(r.id),
    name: typeof r.name === "string" ? r.name : "",
    description: typeof r.description === "string" ? r.description : null,
    category: typeof r.category === "string" ? r.category : null,
    discountInfo: typeof r.discount_info === "string" ? r.discount_info : null,
    websiteUrl: typeof r.website_url === "string" ? r.website_url : null,
    // TODO: booleano exato só sai da RPC, que lê coupon_code por dentro.
    hasCoupon: true,
  }));
}

/** Dados reais. A flag fica para a UI não precisar mudar de assinatura. */
export const PUBLIC_STORE_IS_MOCKED = false;

/* ------------------------------------------------------------------ *
 * Carrinho deslogado                                                   *
 * ------------------------------------------------------------------ */

/**
 * Chave PRÓPRIA do carrinho público.
 *
 * Não pode ser a mesma da loja logada: lá cada linha carrega `sourceId`,
 * `kind` interno e campos financeiros. Se as duas dividissem a chave, o
 * checkout logado leria linhas incompletas e criaria pedido inválido.
 * A migração acontece de forma explícita em `StorePage` após o login.
 */
export const PUBLIC_CART_STORAGE_KEY = "fitmind_public_cart";

export interface PublicCartLine {
  id: string;
  kind: PublicProductKind;
  title: string;
  price: number;
  imageUrl: string | null;
  quantity: number;
}

export function readPublicCart(): PublicCartLine[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(PUBLIC_CART_STORAGE_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    if (!Array.isArray(parsed)) return [];
    // Só aceita linhas no formato novo — restos do formato antigo (que dividia
    // a chave com a loja logada) são descartados em silêncio.
    return (parsed as PublicCartLine[]).filter(
      (l) => l && typeof l.id === "string" && typeof l.price === "number" && typeof l.quantity === "number",
    );
  } catch {
    return [];
  }
}

export function writePublicCart(lines: PublicCartLine[]): void {
  if (typeof window === "undefined") return;
  try {
    if (lines.length) {
      window.localStorage.setItem(PUBLIC_CART_STORAGE_KEY, JSON.stringify(lines));
    } else {
      window.localStorage.removeItem(PUBLIC_CART_STORAGE_KEY);
    }
  } catch {
    /* quota cheia ou storage bloqueado — carrinho degrada para sessão */
  }
}

/** Adiciona (ou incrementa) um produto da vitrine pública no carrinho. */
export function addPublicCartLine(product: PublicProduct, quantity = 1): PublicCartLine[] {
  const atual = readPublicCart();
  const existente = atual.find((l) => l.id === product.id);
  const proximo = existente
    ? atual.map((l) => (l.id === product.id ? { ...l, quantity: l.quantity + quantity } : l))
    : [
        ...atual,
        {
          id: product.id,
          kind: product.kind,
          title: product.title,
          // Faixa de preço: guarda o menor valor só como referência de vitrine;
          // o valor cobrado é sempre recalculado no servidor no checkout.
          price: product.isPriceRange && product.minPrice != null ? product.minPrice : product.price,
          imageUrl: product.imageUrl,
          quantity,
        },
      ];
  writePublicCart(proximo);
  return proximo;
}

export function setPublicCartQuantity(id: string, quantity: number): PublicCartLine[] {
  const proximo = readPublicCart()
    .map((l) => (l.id === id ? { ...l, quantity: Math.max(0, quantity) } : l))
    .filter((l) => l.quantity > 0);
  writePublicCart(proximo);
  return proximo;
}

export function removePublicCartLine(id: string): PublicCartLine[] {
  const proximo = readPublicCart().filter((l) => l.id !== id);
  writePublicCart(proximo);
  return proximo;
}

export function clearPublicCart(): void {
  writePublicCart([]);
}

export function publicCartCount(lines?: PublicCartLine[]): number {
  return (lines ?? readPublicCart()).reduce((s, l) => s + l.quantity, 0);
}

