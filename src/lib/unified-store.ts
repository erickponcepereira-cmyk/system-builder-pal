import { supabase } from "@/integrations/supabase/client";
import { computePartnerProductBenefits } from "@/lib/partner-product-benefits";
import { comAbsolutosReais, type ComissaoBruta, type GanhoReal } from "@/lib/store-earnings";

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
 *  1. Coluna financeira só entra no `select` quando `paraCoach` é verdadeiro.
 *     A vitrine do aluno nunca vê custo, taxa ou comissão — e a garantia é
 *     esta consulta, não uma checagem de papel lá na tela. A policy de
 *     `products` é `USING (true) TO authenticated`: qualquer logado leria as
 *     colunas se pedisse. Quem não pede, não recebe.
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
  /** Todas as imagens, para a galeria do detalhe. A primeira é a `imageUrl`. */
  imageUrls: string[];
  price: number;
  originalPrice: number | null;
  /**
   * Produto de preço variável ("de X a Y"). Só o catálogo legado tem, e é o
   * caso de serviço cujo valor depende do que a pessoa contrata.
   */
  isPriceRange: boolean;
  minPrice: number | null;
  maxPrice: number | null;
  /** Quem vende: "FitMind", o nome fantasia do parceiro ou o nome do profissional. */
  sellerName: string;
  /** Coach dono do produto — é o que casa com o coach do aluno e com a rede dele. */
  sellerCoachId: string | null;
  /** Cidade do parceiro, para o bloco de proximidade. */
  sellerCity: string | null;
  /** Id do vendedor: partner_id para parceiro, coach_id para profissional.
   *  E a chave que descobre a cidade sem consultar produto a produto. */
  sellerId: string | null;
  /** Marcado como destaque no admin. Alimenta o banner da loja. */
  isFeatured: boolean;
  /** Coach que criou o produto. Isenta o proprio criador do filtro de rede. */
  creatorCoachId: string | null;
  /** Publicos que podem ver. Vazio ou nulo = todos. */
  visibilityAudiences: string[] | null;
  /** Produto restrito a redes especificas. */
  restrictToNetworks: boolean;
  allowedCoachIds: string[];
  subcategoryId: string | null;
  sectionId: string | null;
  categoryId: string | null;
  cardDays: number;
  challengeTickets: number;
  stock: number | null;
  isSchedulable: boolean;
  /**
   * Benefício gratuito do parceiro. Aparece na vitrine para TODO MUNDO — o que
   * a carteirinha decide é o resgate, não a visibilidade. Esconder de quem não
   * tem carteirinha é esconder justamente o argumento de tirar uma.
   */
  isFreebie: boolean;
  /** Duração do atendimento agendável, em minutos. Alimenta o seletor de horário. */
  durationMinutes: number;
  /** Pontos de carreira do coach por venda. Só faz sentido em modo coach. */
  pointsPerSale: number;
  /**
   * Colunas financeiras. **Só vêm preenchidas em modo coach** — a consulta é
   * que decide, e é assim de propósito: sem os dados, nenhuma tela consegue
   * mostrar comissão para aluno, nem por engano.
   */
  comissao: ComissaoBruta | null;
  /** Texto já normalizado (sem acento, minúsculo) usado pela busca. */
  haystack: string;
  /** Palavras do título — o campo de maior peso na busca. */
  titleWords: string[];
  /** Palavras do nome do vendedor. */
  sellerWords: string[];
  /** Palavras do índice inteiro: descrição, seção, categoria, cidade, tipo. */
  haystackWords: string[];
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
    .replace(/[\u0300-\u036f]/g, "")
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

/** Quebra em palavras já normalizadas, sem pontuação e sem vazio. */
export function palavras(text: string): string[] {
  return foldText(text)
    .replace(/[^a-z0-9]+/g, " ")
    .split(" ")
    .filter(Boolean);
}

/**
 * Distância de edição limitada a 1.
 *
 * Não é Levenshtein completo de propósito: só precisamos saber se "dunamys" é
 * "dunamis" com uma letra trocada. Parar em 1 mantém a busca barata mesmo com
 * mil e quinhentos produtos e evita o efeito colateral clássico da tolerância
 * generosa — "top" casar com "loja".
 */
function ateUmErro(a: string, b: string): boolean {
  if (a === b) return true;
  const da = a.length - b.length;
  if (da > 1 || da < -1) return false;
  let i = 0;
  let j = 0;
  let erros = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { i++; j++; continue; }
    if (++erros > 1) return false;
    if (a.length > b.length) i++;
    else if (a.length < b.length) j++;
    else { i++; j++; }
  }
  return true;
}

/**
 * Quanto um termo casa com uma lista de palavras.
 *
 * 3 = a palavra inteira, 2 = começo da palavra (é o que faz "dunam" achar
 * "Dunamis" enquanto a pessoa ainda digita), 1 = uma letra errada. Zero é não
 * casou, e um termo que não casa em lugar nenhum descarta o produto — busca
 * de marketplace é E, não OU.
 */
function pontoDoTermo(term: string, words: string[]): number {
  let melhor = 0;
  for (const w of words) {
    if (w === term) return 3;
    if (w.startsWith(term)) { melhor = Math.max(melhor, 2); continue; }
    if (term.length >= 5 && w.length >= 4 && ateUmErro(term, w)) melhor = Math.max(melhor, 1);
  }
  return melhor;
}

const PESO = { titulo: 6, vendedor: 3, resto: 1 } as const;

/**
 * Pontuação do produto para a busca. `-1` quer dizer "não casa".
 *
 * O peso por campo é o que separa uma busca útil de uma lista aleatória: quem
 * digita "dunamis" quer o produto que se chama Dunamis antes de qualquer
 * produto cuja descrição menciona Dunamis.
 */
export function scoreQuery(product: UnifiedProduct, query: string): number {
  const termos = palavras(query);
  if (termos.length === 0) return 0;
  let total = 0;
  for (const termo of termos) {
    const noTitulo = pontoDoTermo(termo, product.titleWords);
    const noVendedor = pontoDoTermo(termo, product.sellerWords);
    const noResto = pontoDoTermo(termo, product.haystackWords);
    const melhor =
      noTitulo * PESO.titulo
      + noVendedor * PESO.vendedor
      + noResto * PESO.resto;
    if (melhor === 0) return -1;
    total += melhor;
  }
  // Título que começa com a busca inteira vai para a frente: é o caso do
  // "Desafio Team Dunamis 30 dias" quando se digita "desafio team".
  if (foldText(product.title).startsWith(foldText(query))) total += 20;
  return total;
}

/** Um produto casa a busca se todos os termos digitados casarem em algum campo. */
export function matchesQuery(product: UnifiedProduct, query: string): boolean {
  if (!foldText(query)) return true;
  return scoreQuery(product, query) >= 0;
}

/** Filtra e já devolve na ordem de relevância. Vazio devolve a ordem original. */
export function buscar(produtos: UnifiedProduct[], query: string): UnifiedProduct[] {
  if (!foldText(query)) return produtos;
  return produtos
    .map((p) => ({ p, s: scoreQuery(p, query) }))
    .filter((x) => x.s >= 0)
    .sort((a, b) => b.s - a.s)
    .map((x) => x.p);
}


const num = (v: unknown): number => Number(v ?? 0) || 0;
const numOrNull = (v: unknown): number | null => (v === null || v === undefined ? null : Number(v) || 0);

/** Lista de imagens sem repetição e sem buraco, começando pela principal. */
function galeria(imageUrl: unknown, imageUrls: unknown): string[] {
  const out: string[] = [];
  if (typeof imageUrl === "string" && imageUrl) out.push(imageUrl);
  if (Array.isArray(imageUrls)) {
    for (const u of imageUrls) {
      if (typeof u === "string" && u && !out.includes(u)) out.push(u);
    }
  }
  return out;
}

function firstImage(imageUrl: unknown, imageUrls: unknown): string | null {
  if (typeof imageUrl === "string" && imageUrl) return imageUrl;
  if (Array.isArray(imageUrls) && imageUrls.length && typeof imageUrls[0] === "string") return imageUrls[0];
  return null;
}

/**
 * Carrega tudo em paralelo. Cada fonte falha isolada: uma tabela indisponível
 * derruba a própria seção, não a vitrine inteira.
 */
/**
 * As duas listas de colunas do catálogo legado.
 *
 * Escritas por extenso porque o `select` tipado do Supabase é validado em
 * tempo de compilação por um parser de tipos, e esse parser **não lida com
 * união**: passar `paraCoach ? A : B` faz o tipo virar `A | B` e ele devolve
 * `ParserError` mesmo quando as duas strings são válidas. Por isso a chamada
 * abaixo casta o argumento — a validação de coluna se perde nesta consulta,
 * como já acontece nas outras cinco.
 *
 * Consequência prática: **coluna errada aqui só aparece em runtime**, como
 * erro 400 do PostgREST. Se a vitrine ficar vazia depois de mexer nesta lista,
 * é aqui que se olha primeiro.
 *
 * A parte financeira espelha `COLUNAS_FINANCEIRAS` de `StorePage.tsx:232`.
 */
const SELECT_LEGADO =
  "id,name,subtitle,description,price,original_price,is_price_range,min_price,max_price,type,image_url,image_urls,duration_days,card_access_days,challenge_tokens_amount,has_challenge_access,points_per_sale";
const SELECT_LEGADO_COACH =
  "id,name,subtitle,description,price,original_price,is_price_range,min_price,max_price,type,image_url,image_urls,duration_days,card_access_days,challenge_tokens_amount,has_challenge_access,points_per_sale,commission_coach,commission_level1,commission_level2,commission_level3,app_fee,app_fee_percentage,card_fee_percentage,credit_fee_percentage,tax_percentage,cost,other_costs";

export type CatalogOptions = {
  /** Liga as colunas financeiras. Só a loja em modo coach passa `true`. */
  paraCoach?: boolean;
  /**
   * `listProductsWithRealEarnings` já embrulhado por `useServerFn`. Devolve a
   * sobra real calculada pelo motor de slots, que é mais confiável que o
   * percentual da linha. Opcional: sem ele o cálculo cai no fallback.
   */
  ganhosReais?: () => Promise<unknown>;
};

export async function loadUnifiedCatalog(opts: CatalogOptions = {}): Promise<UnifiedCatalog> {
  const paraCoach = opts.paraCoach === true;

  // Espelha `COLUNAS_FINANCEIRAS` de `StorePage.tsx:232`. Mesma lista, porque
  // é a mesma tabela e o mesmo cálculo do outro lado.
  const COLUNAS_FINANCEIRAS = paraCoach
    ? ",commission_coach,commission_level1,commission_level2,commission_level3"
      + ",app_fee,app_fee_percentage,card_fee_percentage,credit_fee_percentage"
      + ",tax_percentage,cost,other_costs"
    : "";

  const comissaoDaLinha = (r: Record<string, unknown>): ComissaoBruta | null => {
    if (!paraCoach) return null;
    return {
      commissionCoach: numOrNull(r.commission_coach),
      commissionLevel1: numOrNull(r.commission_level1),
      commissionLevel2: numOrNull(r.commission_level2),
      commissionLevel3: numOrNull(r.commission_level3),
      commissionCoachAbsolute: null,
      commissionLevel1Absolute: null,
      commissionLevel2Absolute: null,
      commissionLevel3Absolute: null,
      commissionCoachAbsoluteCard: null,
      commissionLevel1AbsoluteCard: null,
      commissionLevel2AbsoluteCard: null,
      commissionLevel3AbsoluteCard: null,
      appFee: numOrNull(r.app_fee),
      appFeePercentage: numOrNull(r.app_fee_percentage),
      cardFeePercentage: numOrNull(r.card_fee_percentage),
      taxPercentage: numOrNull(r.tax_percentage),
      cost: numOrNull(r.cost),
      otherCosts: numOrNull(r.other_costs),
    };
  };

  const errors: string[] = [];
  const note = (label: string, error: unknown) => {
    if (error) {
      console.error(`[unified-store] ${label}`, error);
      errors.push(label);
    }
  };

  // Dispara junto com o catálogo, não depois: são independentes.
  const ganhosPromise: Promise<unknown> = paraCoach && opts.ganhosReais
    ? Promise.resolve()
        .then(() => opts.ganhosReais!())
        .catch((e) => { console.warn("[unified-store] ganhos reais", e); return []; })
    : Promise.resolve([]);

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
      .select((paraCoach ? SELECT_LEGADO_COACH : SELECT_LEGADO) as never)
      .eq("status", "active")
      .order("sort_order"),
    supabase
      .from("products" as never)
      .select(`id,section_id,category_id,subcategory_id,name,short_description,description,image_url,image_urls,price,original_price,kind,stock,card_access_days,challenge_tokens_amount,visibility_audiences,creator_coach_id,points_per_sale${COLUNAS_FINANCEIRAS}` as never)
      .not("kind" as never, "is", null)
      .eq("is_active" as never, true as never)
      .order("sort_order" as never),
    supabase
      .from("digital_products")
      .select("id,title,description,price,original_price,cover_url,is_featured")
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
      .select("id,name,description,image_url,image_urls,price,original_price,kind,section_id,category_id,perk_card_days_override,perk_challenge_tickets_override,partner_id,restrict_to_networks,allowed_coach_ids,partners(fantasy_name,city,upline_coach_id)" as never)
      .eq("status" as never, "approved" as never)
      .in("kind" as never, ["paid", "free"] as never)
      .eq("is_active_by_partner" as never, true as never)
      .eq("is_ready_for_sale" as never, true as never)
      .is("deleted_at" as never, null as never)
      .order("sort_order" as never)
      .limit(5000),
    supabase
      .from("professional_products" as never)
      .select("id,name,description,image_url,image_urls,price,original_price,kind,section_id,category_id,coach_id,is_schedulable,default_duration_minutes,restrict_to_networks,allowed_coach_ids,perk_card_days_override,perk_challenge_tickets_override,coaches!professional_products_coach_id_fkey(profile:profiles!coaches_profile_id_fkey(name))" as never)
      .eq("status" as never, "approved" as never)
      .eq("is_active_by_professional" as never, true as never)
      .eq("is_ready_for_sale" as never, true as never)
      .order("sort_order" as never)
      .order("sort_order" as never)
      .limit(5000),
  ]);

  note("catálogo FitMind", legacyRes.error);
  note("produtos do modelo novo", modelRes.error);
  note("cursos", digitalRes.error);
  note("loja física", storeRes.error);
  note("seções", sectionsRes.error);
  note("categorias", categoriesRes.error);
  note("produtos de parceiros", partnerRes.error);
  note("produtos de profissionais", professionalRes.error);

  const ganhoPorId = new Map<string, GanhoReal>();
  for (const g of ((await ganhosPromise) as GanhoReal[] | null) || []) {
    if (g && g.id) ganhoPorId.set(String(g.id), g);
  }

  /** Comissão da linha, já com os absolutos do motor de slots por cima. */
  const comissaoDoProduto = (r: Record<string, unknown>): ComissaoBruta | null => {
    const bruta = comissaoDaLinha(r);
    return bruta ? comAbsolutosReais(bruta, ganhoPorId.get(String(r.id))) : null;
  };

  // Nomes da taxonomia entram no índice de busca: quem digita "suplementos"
  // procura a prateleira, não um produto que tenha essa palavra no nome.
  const nomeSecao = new Map<string, string>();
  for (const s of (sectionsRes.data as Array<Record<string, unknown>>) || []) {
    nomeSecao.set(String(s.id), String(s.name || ""));
  }
  const nomeCategoria = new Map<string, string>();
  for (const c of (categoriesRes.data as Array<Record<string, unknown>>) || []) {
    nomeCategoria.set(String(c.id), String(c.name || ""));
  }

  const ROTULO_KIND: Record<UnifiedKind, string> = {
    challenge: "desafio plano protocolo fitmind",
    item: "produto fitmind",
    digital: "curso aula digital online",
    store: "produto loja suplemento",
    partner: "profissional atendimento consulta servico",
    partner_company: "parceiro academia estudio servico",
  };

  type ProdutoCru = Omit<UnifiedProduct, "haystack" | "titleWords" | "sellerWords" | "haystackWords">;

  const products: UnifiedProduct[] = [];
  const push = (p: ProdutoCru) => {
    const taxonomia = [
      p.sectionId ? nomeSecao.get(p.sectionId) : "",
      p.categoryId ? nomeCategoria.get(p.categoryId) : "",
      p.sellerCity || "",
      ROTULO_KIND[p.kind],
      p.isFreebie ? "gratuito gratis brinde beneficio" : "",
    ].filter(Boolean).join(" ");
    const haystack = expand(`${p.title} ${p.sellerName} ${p.description || ""} ${taxonomia}`);
    products.push({
      ...p,
      haystack,
      titleWords: palavras(p.title),
      sellerWords: palavras(p.sellerName),
      haystackWords: palavras(haystack),
    });
  };

  /**
   * O catálogo FitMind mora numa tabela só, lida de dois jeitos.
   *
   * `products` é a mesma tabela nas duas consultas: a primeira traz o modelo
   * antigo (preço variável, dias de carteirinha, tickets), a segunda traz o
   * modelo novo (seção, categoria, público-alvo, estoque). Em 26/08/2026 as
   * duas devolvem exatamente as mesmas 80 linhas — e a vitrine mostrava cada
   * produto duas vezes, uma como `challenge-` e outra como `item-`.
   *
   * A correção é fundir por id, e a linha antiga é a canônica de propósito:
   * é ela que vira `plan-` no carrinho, que é o formato que o
   * `create_store_order` já entende (`kind = 'plan'`). Trocar isso mudaria o
   * tipo gravado no pedido de plano para produto físico/digital.
   */
  const modeloPorId = new Map<string, Record<string, unknown>>();
  for (const r of (modelRes.data as unknown as Array<Record<string, unknown>>) || []) {
    modeloPorId.set(String(r.id), r);
  }
  const jaEntrou = new Set<string>();

  // --- FitMind: catálogo legado (fundido com o modelo novo) ---
  for (const r of (legacyRes.data as unknown as Array<Record<string, unknown>>) || []) {
    const id = String(r.id);
    const m = modeloPorId.get(id);
    jaEntrou.add(id);
    push({
      id: `challenge-${id}`,
      sourceId: id,
      origin: "fitmind",
      kind: "challenge",
      title: String(r.name || ""),
      description: (r.subtitle as string) || (r.description as string) || (m?.short_description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls) || firstImage(m?.image_url, m?.image_urls),
      imageUrls: galeria(r.image_url, r.image_urls),
      isPriceRange: r.is_price_range === true,
      minPrice: numOrNull(r.min_price),
      maxPrice: numOrNull(r.max_price),
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sellerId: null,
      isFeatured: false,
      // Seção, categoria e público-alvo só existem no modelo novo; sem
      // aproveitá-los aqui o produto fundido sumiria das prateleiras.
      creatorCoachId: (m?.creator_coach_id as string) || null,
      visibilityAudiences: Array.isArray(m?.visibility_audiences) ? (m!.visibility_audiences as string[]) : null,
      restrictToNetworks: false,
      allowedCoachIds: [],
      subcategoryId: (m?.subcategory_id as string) || null,
      sectionId: (m?.section_id as string) || null,
      categoryId: (m?.category_id as string) || null,
      cardDays: num(r.card_access_days),
      challengeTickets: r.has_challenge_access ? num(r.challenge_tokens_amount) : 0,
      stock: m ? numOrNull(m.stock) : null,
      isSchedulable: false,
      isFreebie: false,
      durationMinutes: 30,
      pointsPerSale: num(r.points_per_sale),
      comissao: comissaoDoProduto(r),
    });
  }

  // --- FitMind: modelo novo que ainda não apareceu acima ---
  for (const r of (modelRes.data as unknown as Array<Record<string, unknown>>) || []) {
    if (jaEntrou.has(String(r.id))) continue;
    push({
      id: `item-${r.id}`,
      sourceId: String(r.id),
      origin: "fitmind",
      kind: "item",
      title: String(r.name || ""),
      description: (r.short_description as string) || (r.description as string) || null,
      imageUrl: firstImage(r.image_url, r.image_urls),
      imageUrls: galeria(r.image_url, r.image_urls),
      isPriceRange: r.is_price_range === true,
      minPrice: numOrNull(r.min_price),
      maxPrice: numOrNull(r.max_price),
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sellerId: null,
      isFeatured: false,
      creatorCoachId: (r.creator_coach_id as string) || null,
      visibilityAudiences: Array.isArray(r.visibility_audiences) ? (r.visibility_audiences as string[]) : null,
      restrictToNetworks: false,
      allowedCoachIds: [],
      subcategoryId: (r.subcategory_id as string) || null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: num(r.card_access_days),
      challengeTickets: num(r.challenge_tokens_amount),
      stock: numOrNull(r.stock),
      isSchedulable: false,
      isFreebie: false,
      durationMinutes: 30,
      pointsPerSale: num(r.points_per_sale),
      comissao: comissaoDoProduto(r),
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
      imageUrls: galeria(r.cover_url, null),
      isPriceRange: false,
      minPrice: null,
      maxPrice: null,
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sellerId: null,
      isFeatured: r.is_featured === true,
      creatorCoachId: null,
      visibilityAudiences: null,
      restrictToNetworks: false,
      allowedCoachIds: [],
      subcategoryId: null,
      sectionId: null,
      categoryId: null,
      cardDays: 0,
      challengeTickets: 0,
      stock: null,
      isSchedulable: false,
      isFreebie: false,
      durationMinutes: 30,
      pointsPerSale: 0,
      comissao: null,
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
      imageUrls: galeria(r.image_url, null),
      isPriceRange: false,
      minPrice: null,
      maxPrice: null,
      price: num(r.price),
      originalPrice: numOrNull(r.original_price),
      sellerName: "FitMind",
      sellerCoachId: null,
      sellerCity: null,
      sellerId: null,
      isFeatured: false,
      creatorCoachId: null,
      visibilityAudiences: null,
      restrictToNetworks: false,
      allowedCoachIds: [],
      subcategoryId: null,
      sectionId: null,
      categoryId: null,
      cardDays: 0,
      challengeTickets: 0,
      stock: numOrNull(r.stock),
      isSchedulable: false,
      isFreebie: false,
      durationMinutes: 30,
      pointsPerSale: 0,
      comissao: null,
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
      imageUrls: galeria(r.image_url, r.image_urls),
      isPriceRange: r.is_price_range === true,
      minPrice: numOrNull(r.min_price),
      maxPrice: numOrNull(r.max_price),
      price,
      originalPrice: numOrNull(r.original_price),
      sellerName: partner?.fantasy_name || "Parceiro",
      sellerCoachId: partner?.upline_coach_id ?? null,
      sellerId: (r.partner_id as string) || null,
      isFeatured: false,
      creatorCoachId: partner?.upline_coach_id ?? null,
      visibilityAudiences: null,
      restrictToNetworks: r.restrict_to_networks === true,
      allowedCoachIds: Array.isArray(r.allowed_coach_ids) ? (r.allowed_coach_ids as string[]) : [],
      subcategoryId: null,
      sellerCity: partner?.city ?? null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: r.perk_card_days_override != null ? num(r.perk_card_days_override) : base.cardDays,
      challengeTickets: r.perk_challenge_tickets_override != null ? num(r.perk_challenge_tickets_override) : base.challengeTickets,
      stock: null,
      isSchedulable: false,
      isFreebie: r.kind === "free",
      durationMinutes: 30,
      pointsPerSale: 0,
      comissao: null,
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
      imageUrls: galeria(r.image_url, r.image_urls),
      isPriceRange: r.is_price_range === true,
      minPrice: numOrNull(r.min_price),
      maxPrice: numOrNull(r.max_price),
      price,
      originalPrice: numOrNull(r.original_price),
      sellerName: coach?.profile?.name || "Profissional",
      sellerCoachId: (r.coach_id as string) || null,
      sellerId: (r.coach_id as string) || null,
      isFeatured: false,
      creatorCoachId: (r.coach_id as string) || null,
      visibilityAudiences: null,
      restrictToNetworks: r.restrict_to_networks === true,
      allowedCoachIds: Array.isArray(r.allowed_coach_ids) ? (r.allowed_coach_ids as string[]) : [],
      subcategoryId: null,
      sellerCity: null,
      sectionId: (r.section_id as string) || null,
      categoryId: (r.category_id as string) || null,
      cardDays: r.perk_card_days_override != null ? num(r.perk_card_days_override) : base.cardDays,
      challengeTickets: r.perk_challenge_tickets_override != null ? num(r.perk_challenge_tickets_override) : base.challengeTickets,
      stock: null,
      isSchedulable: !!r.is_schedulable,
      isFreebie: r.kind === "free",
      durationMinutes: num(r.default_duration_minutes) || 30,
      pointsPerSale: 0,
      comissao: null,
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
