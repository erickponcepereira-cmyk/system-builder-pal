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
  | "partner";

/** Espelha 1:1 as colunas de `public_store_catalog`. */
export interface PublicProduct {
  id: string;
  kind: PublicProductKind;
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
  /** Booleano de propósito — quantidade exata não é pública. */
  inStock: boolean;
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
  "min_price,max_price,badge_label,image_url,section_id,stock,kind," +
  "is_featured,sort_order";

const KINDS_VALIDOS: PublicProductKind[] = [
  "challenge",
  "digital",
  "store",
  "item",
  "partner",
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

/**
 * Aceita as DUAS formas de linha que chegam aqui:
 *
 *  - tabela `products`, com colunas em ingles (name, price, image_url...)
 *  - RPC `catalogo_publico()`, que devolve em portugues (nome, preco,
 *    imagem_url, secao_id...) conforme a assinatura aplicada em 28/07
 *
 * Sem isso, tudo que vem pela RPC vira "Sem nome" e preco 0 — que foi
 * exatamente o que aconteceu quando `products` fechou para anon e a RPC
 * passou a ser o caminho principal.
 */
function mapearProduto(r: Linha, nomesSecao: Map<string, string>): PublicProduct {
  const texto = (...chaves: string[]): string | null => {
    for (const k of chaves) {
      const v = r[k];
      if (typeof v === "string" && v.length) return v;
    }
    return null;
  };
  const num = (...chaves: string[]): number | null => {
    for (const k of chaves) {
      const v = numeroOuNulo(r[k]);
      if (v !== null) return v;
    }
    return null;
  };

  const secaoId = texto("section_id", "secao_id");
  const estoque = num("stock", "estoque");
  return {
    id: String(r.id),
    kind: normalizarKind(r.kind),
    title: texto("name", "nome") ?? "Sem nome",
    subtitle: texto("subtitle", "subtitulo"),
    shortDescription: truncar(
      texto("short_description", "subtitulo", "descricao", "description"),
    ),
    price: num("price", "preco") ?? 0,
    originalPrice: num("original_price", "preco_original"),
    isPriceRange: r.is_price_range === true,
    minPrice: num("min_price"),
    maxPrice: num("max_price"),
    badgeLabel: texto("badge_label", "badge"),
    imageUrl: texto("image_url", "imagem_url"),
    sectionId: secaoId,
    sectionName: secaoId ? (nomesSecao.get(secaoId) ?? null) : null,
    // quantidade exata não é pública — só o booleano de propósito
    inStock: estoque === null ? true : estoque > 0,
  };
}

async function nomesDeSecao(): Promise<Map<string, string>> {
  const mapa = new Map<string, string>();
  const { data } = await supabase
    .from("store_sections")
    .select("id,name")
    .eq("is_active", true);
  for (const r of (data ?? []) as Linha[]) {
    if (typeof r.id === "string" && typeof r.name === "string") {
      mapa.set(r.id, r.name);
    }
  }
  return mapa;
}

/**
 * Vitrine de produtos, sem sessão.
 *
 * Caminho preferido: RPC `catalogo_publico()`, SECURITY DEFINER, que devolve
 * só colunas de vitrine. Enquanto ela não existe, cai para leitura direta
 * das MESMAS colunas — nunca `select("*")`. Ou seja: mesmo com `products`
 * ainda aberto para anon (situação de 26/07), esta tela não puxa custo.
 */
export async function fetchPublicCatalog(
  referralCode: string | null,
): Promise<PublicProduct[]> {
  void referralCode; // ordenação por coach/parceiro entra junto com a RPC
  const secoes = await nomesDeSecao();

  const viaRpc = await supabase.rpc("catalogo_publico");
  if (!viaRpc.error && Array.isArray(viaRpc.data)) {
    return (viaRpc.data as Linha[]).map((r) => mapearProduto(r, secoes));
  }

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

  const linhas = [
    ...((legado.data ?? []) as unknown as Linha[]),
    ...((novo.data ?? []) as unknown as Linha[]),
  ];
  return linhas.map((r) => mapearProduto(r, secoes));
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

  const secoes = await nomesDeSecao();

  // Caminho principal: a RPC. Desde que `products` fechou para anon
  // (migration de 28/07), ler a tabela direto devolve 401 e a pagina de
  // produto morre para visitante deslogado — que e exatamente o publico
  // desta rota. A RPC ja filtra por ativo, entao nao precisa checar status.
  const viaRpc = await supabase
    .rpc("catalogo_publico")
    .eq("id", id)
    .limit(1);

  if (!viaRpc.error && Array.isArray(viaRpc.data) && viaRpc.data.length) {
    return mapearProduto((viaRpc.data as Linha[])[0], secoes);
  }

  // Fallback para sessao autenticada, onde a tabela continua legivel.
  // Nunca vira o caminho de um anonimo; serve para nao regredir a
  // experiencia de quem esta logado se a RPC falhar.
  const { data, error } = await supabase
    .from("products")
    .select(`${COLUNAS_VITRINE},status,is_active`)
    .eq("id", id)
    .limit(1);

  if (error) return null;
  const linha = ((data ?? []) as unknown as Linha[])[0];
  if (!linha) return null;

  const ativo =
    linha.kind === null || linha.kind === undefined
      ? linha.status === "active"
      : linha.is_active === true;
  if (!ativo) return null;

  return mapearProduto(linha, secoes);
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
