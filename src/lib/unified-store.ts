import { supabase } from "@/integrations/supabase/client";
import { computePartnerProductBenefits } from "@/lib/partner-product-benefits";

/**
 * Camada de leitura da vitrine unificada (superfície de teste).
 *
 * Junta em uma lista só os quatro catálogos que hoje vivem separados em duas
 * abas: FitMind (`products` legado, `products` do modelo novo, `digital_products`,
 * `store_products`), parceiros (`partner_products`) e profissionais
 * (`professional_products`).
 *
 * Duas coisas que não podem mudar aqui:
 *
 *  1. Nenhuma coluna financeira entra no `select`. A vitrine do aluno nunca vê
 *     custo, taxa ou comissão — isso só existe no modo coach da tela antiga.
 *  2. A taxonomia (`store_sections` / `store_categories`) é compartilhada pelos
 *     dois lados; é justamente por isso que dá para fundir as abas sem tocar no
 *     modelo de dados. Aqui ela é carregada uma vez e serve todo mundo.
 */

export type UnifiedOrigin = "fitmind" | "partner" | "professional";

export type UnifiedKind =
  | "challenge" | "digital" | "store" | "item" | "partner" | "partner_company";

export type UnifiedProduct = {
  /** Chave única na vitrine (a origem entra no id para não colidir entre tabelas). */
  id: string;
  /** Id na tabela de origem — é o que vai para o carrinho e para as RPCs. */
  sourceId: string;
  origin: UnifiedOrigin;
  kind: UnifiedKind;
  title: string;
  description: string | null;
  imageUrl: string | null;
  price: number;
  originalPrice: number | null;
  /** Quem vende: "FitMind", o nome fantasia do parceiro ou o nome do profissional. */
  sellerName: string;
  /** Coach dono do produto — é o que casa com o coach do aluno e com a rede dele. */
  sellerCoachId: string | null;
  /** Cidade do parceiro, para o bloco de proximidade. */
  sellerCity: string | null;
  sectionId: string | null;
  categoryId: string | null;
  cardDays: number;
  challengeTickets: number;
  stock: number | null;
  isSchedulable: boolean;
  /** Texto já normalizado (sem acento, minúsculo) usado pela busca. */
  haystack: string;
};

export type UnifiedSection = { id: string; name: string; imageUrl: string | null };
export type UnifiedCategory = { id: string; sectionId: string; name: string; imageUrl: string | null };

export type UnifiedCatalog = {
  products: UnifiedProduct[];
  sections: UnifiedSection[];
  categories: UnifiedCategory[];
  /** Erros por fonte, para a tela dizer o que faltou em vez de mostrar catálogo torto. */
  errors: string[];
};

/** Remove acento e caixa. "Aulões" e "aulao" precisam bater. */
export function foldText(value: string): string {
  return String(value || "")
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .trim();
}

/**
 * Sinônimos por termo de busca. Sem isto, "aulão" não encontra "Aulões" e a
 * busca nova parece quebrada logo no primeiro teste — que é exatamente a
 * impressão que não podemos dar depois de consertar a busca.
 */
const SYNONYMS: Record<string, string> = {
  aulao: "aula coletiva turma treino em grupo",
  auloes: "aulao aula coletiva turma",
  desafio: "challenge ticket emagrecimento",
  protocolo: "plano programa",
  suplemento: "whey proteina shake vitamina",
  proteina: "whey shake protein",
  academia: "musculacao treino gym",
  personal: "personal trainer treinador",
  nutricao: "nutricionista dieta alimentar",
  medicina: "medico consulta clinica exame",
};

function expand(text: string): string {
  const base = foldText(text);
  const extra = Object.keys(SYNONYMS)
    .filter((k) => base.includes(k))
    .map((k) => SYNONYMS[k])
    .join(" ");
  return extra ? `${base} ${extra}` : base;
}

/** Um produto casa a busca se todos os termos digitados aparecerem no índice. */
export function matchesQuery(product: UnifiedProduct, query: string): boolean {
  const q = foldText(query);
  if (!q) return true;
  return q.split(/\s+/).every((term) => product.haystack.includes(term));
}

const num = (v: unknown): number => Number(v ?? 0) || 0;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v) || 0);

function firstImage(imageUrl: unknown, imageUrls: unknown): string | null {
  if (typeof imageUrl === "string" && imageUrl) return imageUrl;
  if (Array.isArray(imageUrls) && imageUrls.length && typeof imageUrls[0] === "string") return imageUrls[0];
  return null;
}

/**
 * Carrega tudo em paralelo. Cada fonte falha isolada: uma tabela indisponível
 * derruba a própria seção, não a vitrine inteira.
 */
export async function loadUnifiedCatalog(): Promise<UnifiedCatalog> {
  const errors: string[] = [];
  const note = (label: string, error: unknown) => {
    if (error) {
      console.error(`[unified-store] ${label}`, error);
      errors.push(label);
    }
  };

  const [
    legacyRes,
    modelRes,
    digitalRes,
    storeRes,
    sectionsRes,
    categoriesRes,
    partnerRes,
    professionalRes,
  ] = await Promise.all([
    supabase
      .from("products")
      .select("id,name,subtitle,description,price,original_price,type,image_url,image_urls,duration_days,card_access_days,challenge_tokens_amount,has_challenge_access")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("products" as never)
      .select("id,section_id,category_id,name,short_description,description,image_url,image_urls,price,original_price,kind,stock,card_access_days,challenge_tokens_amount" as never)
      .not("kind" as never, "is", null)
      .eq("is_active" as never, true as never)
      .order("sort_order" as never),
    supabase
      .from("digital_products")
      .select("id,title,description,price,original_price,cover_url")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("store_products")
      .select("id,name,description,price,original_price,category,stock,image_url")
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("store_sections")
      .select("id,name,image_url")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("store_categories")
      .select("id,section_id,name,image_url")
      .eq("is_active", true)
      .order("sort_order"),
    supabase
      .from("partner_products" as never)
      .select("id,name,description,image_url,image_urls,price,original_price,section_id,category_id,perk_card_days_override,perk_challenge_tickets_override,partners(fantasy_name,city,upline_coach_id)" as never)
      .eq("status" as never, "approved" as never)
      .eq("kind" as never, "paid" as never)
      .eq("is_active_by_partner" as never, true as never)
      .eq("is_ready_for_sale" as never, true as never)
      .is("deleted_at" as never, null as never)
      .order("sort_order" as never)
      .limit(1000),
    supabase
      .from("professional_products" as never)
      .select("id,name,description,image_url,image_urls,price,original_price,section_id,category_id,coach_id,is_schedulable,perk_card_days_override,perk_challenge_tickets_override,coaches!professional_products_coach_id_fkey(profile:profiles!coaches_profile_id_fkey(name))" as never)
      .eq("status" as never, "approved" as never)
      .eq("is_active_by_professional" as never, true as never)
      .eq("is_ready_for_sale" as never, true as never)
      .neq("kind" as never, "free" as never)
      .order("sort_order" as never)
      .limit(1000),
  ]);

  note("catálogo FitMind", legacyRes.error);
  note("produtos do modelo novo", modelRes.error);
  note("cursos", digitalRes.error);
  note("loja física", storeRes.error);
  note("seções", sectionsRes.error);
  note("categorias", categoriesRes.error);
  note("produtos de parceiros", partnerRes.error);
  note("produtos de profissionais", professionalRes.error);

  const products: UnifiedProduct[] = [];
  const push = (p: Omit<UnifiedProduct, "haystack">) => {
    products.push({ ...p, haystack: expand(`${p.title} ${p.sellerName} ${p.description || ""}`) });
  };

  // --- FitMind: catálogo legado ---
  for (const r of (legacyRes.data as Array<Record<string, unknown>>) || []) {
    push({
      id: `challenge-${r.id}`,
      sourceId: String(r.id),
      origin: "fitmind",
      kind: "challenge",
      title: String(r.name || ""),
      description: (r.subtitle as string) || (r.description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls),
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sectionId: null,
      categoryId: null,
      cardDays: num(r.card_access_days),
      challengeTickets: r.has_challenge_access ? num(r.challenge_tokens_amount) : 0,
      stock: null,
      isSchedulable: false,
    });
  }

  // --- FitMind: modelo novo (já nasce com seção/categoria) ---
  for (const r of (modelRes.data as unknown as Array<Record<string, unknown>>) || []) {
    push({
      id: `item-${r.id}`,
      sourceId: String(r.id),
      origin: "fitmind",
      kind: "item",
      title: String(r.name || ""),
      description: (r.short_description as string) || (r.description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls),
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: num(r.card_access_days),
      challengeTickets: num(r.challenge_tokens_amount),
      stock: numOrNull(r.stock),
      isSchedulable: false,
    });
  }

  // --- FitMind: cursos ---
  for (const r of (digitalRes.data as Array<Record<string, unknown>>) || []) {
    push({
      id: `digital-${r.id}`,
      sourceId: String(r.id),
      origin: "fitmind",
      kind: "digital",
      title: String(r.title || ""),
      description: (r.description as string) || null,
      imageUrl: (r.cover_url as string) || null,
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sectionId: null,
      categoryId: null,
      cardDays: 0,
      challengeTickets: 0,
      stock: null,
      isSchedulable: false,
    });
  }

  // --- FitMind: loja física ---
  for (const r of (storeRes.data as Array<Record<string, unknown>>) || []) {
    push({
      id: `store-${r.id}`,
      sourceId: String(r.id),
      origin: "fitmind",
      kind: "store",
      title: String(r.name || ""),
      description: (r.description as string) || null,
      imageUrl: (r.image_url as string) || null,
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sectionId: null,
      categoryId: null,
      cardDays: 0,
      challengeTickets: 0,
      stock: numOrNull(r.stock),
      isSchedulable: false,
    });
  }

  // --- Parceiros ---
  for (const r of (partnerRes.data as unknown as Array<Record<string, unknown>>) || []) {
    const price = num(r.price);
    const base = computePartnerProductBenefits(price);
    const partner = r.partners as { fantasy_name?: string | null; city?: string | null; upline_coach_id?: string | null } | null;
    push({
      id: `partner_company-${r.id}`,
      sourceId: String(r.id),
      origin: "partner",
      kind: "partner_company",
      title: String(r.name || ""),
      description: (r.description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls),
      price,
      originalPrice: numOrNull(r.original_price),
      sellerName: partner?.fantasy_name || "Parceiro",
      sellerCoachId: partner?.upline_coach_id ?? null,
      sellerCity: partner?.city ?? null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: r.perk_card_days_override != null ? num(r.perk_card_days_override) : base.cardDays,
      challengeTickets: r.perk_challenge_tickets_override != null ? num(r.perk_challenge_tickets_override) : base.challengeTickets,
      stock: null,
      isSchedulable: false,
    });
  }

  // --- Profissionais ---
  for (const r of (professionalRes.data as unknown as Array<Record<string, unknown>>) || []) {
    const price = num(r.price);
    const base = computePartnerProductBenefits(price);
    const coach = r.coaches as { profile?: { name?: string | null } | null } | null;
    push({
      id: `partner-${r.id}`,
      sourceId: String(r.id),
      origin: "professional",
      kind: "partner",
      title: String(r.name || ""),
      description: (r.description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls),
      price,
      originalPrice: numOrNull(r.original_price),
      sellerName: coach?.profile?.name || "Profissional",
      sellerCoachId: (r.coach_id as string) || null,
      sellerCity: null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: r.perk_card_days_override != null ? num(r.perk_card_days_override) : base.cardDays,
      challengeTickets: r.perk_challenge_tickets_override != null ? num(r.perk_challenge_tickets_override) : base.challengeTickets,
      stock: null,
      isSchedulable: !!r.is_schedulable,
    });
  }

  const sections: UnifiedSection[] = ((sectionsRes.data as Array<Record<string, unknown>>) || []).map((s) => ({
    id: String(s.id),
    name: String(s.name || ""),
    imageUrl: (s.image_url as string) || null,
  }));

  const categories: UnifiedCategory[] = ((categoriesRes.data as Array<Record<string, unknown>>) || []).map((c) => ({
    id: String(c.id),
    sectionId: String(c.section_id || ""),
    name: String(c.name || ""),
    imageUrl: (c.image_url as string) || null,
  }));

  return { products, sections, categories, errors };
}

/**
 * Agrupa o carrinho por vendedor. É a leitura que o checkout já impõe na
 * prática: cada vendedor vira um pedido próprio, com o repasse dele.
 */
export function groupBySeller<T extends { sellerName: string }>(items: T[]): Array<{ seller: string; items: T[] }> {
  const order: string[] = [];
  const bucket = new Map<string, T[]>();
  for (const item of items) {
    if (!bucket.has(item.sellerName)) {
      bucket.set(item.sellerName, []);
      order.push(item.sellerName);
    }
    bucket.get(item.sellerName)!.push(item);
  }
  return order.map((seller) => ({ seller, items: bucket.get(seller)! }));
}
