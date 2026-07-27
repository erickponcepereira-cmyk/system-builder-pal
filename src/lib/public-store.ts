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
  /** Booleano de propósito — quantidade exata não é pública. */
  inStock: boolean;
}

/** Seção/categoria da loja, para os filtros públicos. */
export interface PublicTaxonomy {
  sections: { id: string; name: string }[];
  categories: { id: string; sectionId: string; name: string }[];
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
  if (a) return { referralCode: a.codigo, sponsorName: a.coachNome };

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
  "min_price,max_price,badge_label,image_url,section_id,category_id,stock,kind," +
  "is_featured,sort_order";

/** Parceiro/profissional têm um subconjunto menor — sem faixa de preço. */
const COLUNAS_VITRINE_TERCEIROS =
  "id,name,description,price,original_price,image_url,section_id,category_id," +
  "stock,sort_order";

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

/** Nomes de seção e categoria, resolvidos de uma vez para toda a vitrine. */
interface Taxonomia {
  secoes: Map<string, string>;
  categorias: Map<string, { name: string; sectionId: string }>;
}

const TAXONOMIA_VAZIA: Taxonomia = { secoes: new Map(), categorias: new Map() };

function mapearProduto(
  r: Linha,
  tax: Taxonomia,
  source: PublicProductSource = "fitmind",
): PublicProduct {
  const secaoId = typeof r.section_id === "string" ? r.section_id : null;
  const categoriaId = typeof r.category_id === "string" ? r.category_id : null;
  const categoria = categoriaId ? tax.categorias.get(categoriaId) : undefined;
  const estoque = numeroOuNulo(r.stock);
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
    title: typeof r.name === "string" ? r.name : "Sem nome",
    subtitle: typeof r.subtitle === "string" ? r.subtitle : null,
    shortDescription: truncar(r.short_description ?? r.description),
    price: numeroOuNulo(r.price) ?? 0,
    originalPrice: numeroOuNulo(r.original_price),
    isPriceRange: r.is_price_range === true,
    minPrice: numeroOuNulo(r.min_price),
    maxPrice: numeroOuNulo(r.max_price),
    badgeLabel: typeof r.badge_label === "string" ? r.badge_label : null,
    imageUrl: typeof r.image_url === "string" ? r.image_url : null,
    sectionId: secaoId ?? categoria?.sectionId ?? null,
    sectionName: (() => {
      const id = secaoId ?? categoria?.sectionId ?? null;
      return id ? (tax.secoes.get(id) ?? null) : null;
    })(),
    categoryId: categoriaId,
    categoryName: categoria?.name ?? null,
    // quantidade exata não é pública — só o booleano de propósito
    inStock: estoque === null ? true : estoque > 0,
  };
}

async function carregarTaxonomia(): Promise<Taxonomia> {
  const [secoes, categorias] = await Promise.all([
    supabase.from("store_sections").select("id,name").eq("is_active", true),
    supabase
      .from("store_categories")
      .select("id,name,section_id")
      .eq("is_active", true),
  ]);

  const tax: Taxonomia = { secoes: new Map(), categorias: new Map() };
  for (const r of ((secoes.data ?? []) as unknown as Linha[])) {
    if (typeof r.id === "string" && typeof r.name === "string") {
      tax.secoes.set(r.id, r.name);
    }
  }
  for (const r of ((categorias.data ?? []) as unknown as Linha[])) {
    if (typeof r.id === "string" && typeof r.name === "string") {
      tax.categorias.set(r.id, {
        name: r.name,
        sectionId: typeof r.section_id === "string" ? r.section_id : "",
      });
    }
  }
  return tax;
}

/** Seções e categorias ativas, para os chips de filtro da loja pública. */
export async function fetchPublicTaxonomy(): Promise<PublicTaxonomy> {
  const tax = await carregarTaxonomia();
  return {
    sections: [...tax.secoes.entries()].map(([id, name]) => ({ id, name })),
    categories: [...tax.categorias.entries()].map(([id, c]) => ({
      id,
      name: c.name,
      sectionId: c.sectionId,
    })),
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
): Promise<PublicProduct[]> {
  void referralCode; // ordenação por coach/parceiro entra junto com a RPC
  const tax = await carregarTaxonomia().catch(() => TAXONOMIA_VAZIA);

  const [legado, novo, parceiro, profissional] = await Promise.all([
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

  return [
    ...linhas(legado).map((r) => mapearProduto(r, tax, "fitmind")),
    ...linhas(novo).map((r) => mapearProduto(r, tax, "fitmind")),
    ...linhas(parceiro).map((r) => mapearProduto(r, tax, "partner")),
    ...linhas(profissional).map((r) => mapearProduto(r, tax, "professional")),
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

  const { data, error } = await supabase
    .from("products")
    .select(`${COLUNAS_VITRINE},status,is_active`)
    .eq("id", id)
    .limit(1);

  const linha = error ? undefined : ((data ?? []) as unknown as Linha[])[0];

  if (linha) {
    const ativo =
      linha.kind === null || linha.kind === undefined
        ? linha.status === "active"
        : linha.is_active === true;
    if (!ativo) return null;
    return mapearProduto(linha, await carregarTaxonomia(), "fitmind");
  }

  // Permalinks de parceiro e profissional usam a mesma rota `/produto/{id}`.
  const [parceiro, profissional] = await Promise.all([
    supabase
      .from("partner_products")
      .select(COLUNAS_VITRINE_TERCEIROS)
      .eq("id", id)
      .eq("status", "approved")
      .limit(1),
    supabase
      .from("professional_products")
      .select(COLUNAS_VITRINE_TERCEIROS)
      .eq("id", id)
      .eq("status", "approved")
      .eq("is_active_by_professional", true)
      .limit(1),
  ]);

  const doParceiro = ((parceiro.data ?? []) as unknown as Linha[])[0];
  if (doParceiro) {
    return mapearProduto(doParceiro, await carregarTaxonomia(), "partner");
  }
  const doProfissional = ((profissional.data ?? []) as unknown as Linha[])[0];
  if (doProfissional) {
    return mapearProduto(
      doProfissional,
      await carregarTaxonomia(),
      "professional",
    );
  }
  return null;
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
 * MESMA chave que a loja logada usa (`StorePage.tsx:96`), de propósito:
 * o carrinho montado deslogado é o mesmo objeto que a `StorePage` lê depois
 * do cadastro. É isso que faz o carrinho "continuar lá" sem código de
 * migração — desde que nada no fluxo de signup limpe o localStorage.
 *
 * PENDENTE DE VERIFICAÇÃO: auditar `register.tsx` e o `onAuthStateChange`
 * para garantir que nenhum `localStorage.clear()` roda no cadastro.
 */
export const PUBLIC_CART_STORAGE_KEY = "fitmind_cart_student";

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
    return Array.isArray(parsed) ? (parsed as PublicCartLine[]) : [];
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
