import { supabase } from "@/integrations/supabase/client";
import { computePartnerProductBenefits } from "@/lib/partner-product-benefits";
import type { UnifiedCatalog, UnifiedProduct } from "@/lib/unified-store";

/**
 * Personalização da vitrine unificada.
 *
 * Recomendação por REGRA, não por estatística. Com a base atual, "quem comprou
 * X também comprou Y" produz correlação de acaso: duas pessoas comprando os
 * mesmos dois itens por coincidência viram "recomendado", e uma recomendação
 * obviamente errada custa mais confiança do que a ausência da seção.
 *
 * Por isso cada sugestão carrega o motivo escrito. Motivo visível é o que
 * separa recomendação de anúncio: quem discorda entende o critério em vez de
 * achar que a loja está empurrando.
 */

export type StoreContext = {
  studentId: string | null;
  /** Cidade do perfil. E a base de "minha localizacao" na loja: o
   *  ComplianceGate ja a exige, entao nao precisamos pedir GPS. */
  currentCity: string | null;
  currentState: string | null;
  cardValidUntil: string | null;
  cardActive: boolean;
  coachId: string | null;
  /** Coach do aluno + uplines. Vem da RPC que a loja de parceiros já usa. */
  coachChain: string[];
  /** Soma do que os gratuitos ativos valem — o argumento da carteirinha. */
  freebiesValue: number;
  freebiesCount: number;
  /** Ids de produto já comprados: nada aqui pode voltar como recomendação. */
  purchasedProductIds: Set<string>;
  /** Seções em que o aluno já comprou, para afinidade de conteúdo. */
  purchasedSectionIds: Set<string>;
  /** Renovações próximas: produto -> dias restantes (negativo = já venceu). */
  expiring: Array<{ productId: string; title: string; daysLeft: number }>;
};

export const EMPTY_CONTEXT: StoreContext = {
  studentId: null,
  currentCity: null,
  currentState: null,
  cardValidUntil: null,
  cardActive: false,
  coachId: null,
  coachChain: [],
  freebiesValue: 0,
  freebiesCount: 0,
  purchasedProductIds: new Set(),
  purchasedSectionIds: new Set(),
  expiring: [],
};

const DAY_MS = 24 * 60 * 60 * 1000;

export async function loadStoreContext(catalog: UnifiedCatalog): Promise<StoreContext> {
  const ctx: StoreContext = {
    ...EMPTY_CONTEXT,
    purchasedProductIds: new Set(),
    purchasedSectionIds: new Set(),
    expiring: [],
    coachChain: [],
  };

  try {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return ctx;

    const { data: profile } = await supabase
      .from("profiles").select("id, city, state").eq("user_id", user.id).maybeSingle();
    if (!profile?.id) return ctx;

    const { data: student } = await supabase
      .from("students")
      .select("id, card_valid_until, coach_id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    const stu = student as { id?: string; card_valid_until?: string | null; coach_id?: string | null } | null;
    ctx.studentId = stu?.id ?? null;
    ctx.currentCity = (profile as { city?: string | null }).city ?? null;
    ctx.currentState = (profile as { state?: string | null }).state ?? null;
    ctx.cardValidUntil = stu?.card_valid_until ?? null;
    ctx.cardActive = !!stu?.card_valid_until && new Date(stu.card_valid_until).getTime() > Date.now();
    ctx.coachId = stu?.coach_id ?? null;

    const [chainRes, ordersRes] = await Promise.all([
      supabase.rpc("minha_cadeia_coaches" as never),
      ctx.studentId
        ? supabase
            .from("store_orders" as never)
            .select("id,status,paid_at,store_order_items(product_id,store_product_id,digital_product_id,title)" as never)
            .eq("student_id" as never, ctx.studentId as never)
            .eq("status" as never, "paid" as never)
            .order("paid_at" as never, { ascending: false } as never)
            .limit(200)
        : Promise.resolve({ data: null, error: null }),
    ]);

    ctx.coachChain = ((chainRes.data as unknown as string[]) || []).filter(Boolean);

    // freebiesValue/freebiesCount NÃO são calculados aqui de propósito.
    // Quem sabe quantos gratuitos esta pessoa alcança é a vitrine, depois de
    // aplicar visibilidade e cidade — e é lá que a conta é feita. Aqui só se
    // enxergam as tabelas cruas, e somá-las dava o país inteiro.

    // Compras pagas: alimentam exclusão, afinidade de seção e renovação.
    const orders = (ordersRes.data as unknown as Array<{
      paid_at: string | null;
      store_order_items: Array<{ product_id: string | null; store_product_id: string | null; digital_product_id: string | null; title: string | null }> | null;
    }>) || [];

    const bySourceId = new Map(catalog.products.map((p) => [p.sourceId, p]));
    const durationById = new Map<string, number>();
    for (const product of catalog.products) {
      if (product.cardDays > 0) durationById.set(product.sourceId, product.cardDays);
    }

    for (const order of orders) {
      for (const item of order.store_order_items || []) {
        const id = item.product_id || item.store_product_id || item.digital_product_id;
        if (!id) continue;
        ctx.purchasedProductIds.add(id);

        const match = bySourceId.get(id);
        if (match?.sectionId) ctx.purchasedSectionIds.add(match.sectionId);

        // Renovação: só faz sentido para o que tem prazo.
        const days = durationById.get(id);
        if (days && order.paid_at) {
          const expiresAt = new Date(order.paid_at).getTime() + days * DAY_MS;
          const daysLeft = Math.round((expiresAt - Date.now()) / DAY_MS);
          if (daysLeft <= 21) {
            ctx.expiring.push({ productId: id, title: match?.title || item.title || "seu acesso", daysLeft });
          }
        }
      }
    }
  } catch (error) {
    console.error("[store-personalization] contexto", error);
  }

  return ctx;
}

/** Vagas restantes dos produtos de parceiro. Reusa a RPC que a loja atual já chama. */
export async function loadStockStatus(partnerProductIds: string[]): Promise<Record<string, { stock: number; remaining: number }>> {
  if (!partnerProductIds.length) return {};
  try {
    const { data, error } = await supabase.rpc("partner_products_stock_status" as never, { _ids: partnerProductIds } as never);
    if (error) throw error;
    const map: Record<string, { stock: number; remaining: number }> = {};
    ((data as unknown as Array<{ product_id: string; stock: number; remaining: number }>) || []).forEach((r) => {
      map[r.product_id] = { stock: Number(r.stock), remaining: Number(r.remaining) };
    });
    return map;
  } catch (error) {
    console.error("[store-personalization] vagas", error);
    return {};
  }
}

export type Recommendation = { product: UnifiedProduct; reason: string };

/**
 * As cinco regras, em ordem de conversão. Param quando enchem a fileira, e
 * nunca repetem produto entre si.
 */
export function buildRecommendations(
  products: UnifiedProduct[],
  ctx: StoreContext,
  limit = 8,
  excluir?: Set<string>,
): Recommendation[] {
  const out: Recommendation[] = [];
  // Já nasce com o que os trilhos anteriores levaram: o `used` sempre impediu
  // repetição DENTRO deste trilho, mas nascia vazio e não sabia de nada fora.
  const used = new Set<string>(excluir ?? []);

  const add = (product: UnifiedProduct, reason: string) => {
    if (out.length >= limit) return;
    if (used.has(product.id)) return;
    used.add(product.id);
    out.push({ product, reason });
  };

  // 1. Renovação e recompra — maior conversão, menor risco de errar.
  for (const item of [...ctx.expiring].sort((a, b) => a.daysLeft - b.daysLeft)) {
    const product = products.find((p) => p.sourceId === item.productId);
    if (!product) continue;
    add(product, item.daysLeft < 0
      ? `Venceu há ${Math.abs(item.daysLeft)} ${Math.abs(item.daysLeft) === 1 ? "dia" : "dias"}`
      : item.daysLeft === 0
        ? "Vence hoje"
        : `Vence em ${item.daysLeft} ${item.daysLeft === 1 ? "dia" : "dias"}`);
  }

  // 2. Mesmo coach — a relação já existe fora do app.
  if (ctx.coachId) {
    for (const product of products) {
      if (product.sellerCoachId === ctx.coachId && !ctx.purchasedProductIds.has(product.sourceId)) {
        add(product, `Do seu coach, ${product.sellerName}`);
      }
    }
  }

  // 3. Mesma seção do que já comprou — afinidade de conteúdo.
  if (ctx.purchasedSectionIds.size > 0) {
    for (const product of products) {
      if (product.sectionId && ctx.purchasedSectionIds.has(product.sectionId) && !ctx.purchasedProductIds.has(product.sourceId)) {
        add(product, "Parecido com o que você já comprou");
      }
    }
  }

  // 4. Complementar por tipo — mapa fixo, revisável à mão.
  const boughtFitmind = products.some((p) => p.origin === "fitmind" && ctx.purchasedProductIds.has(p.sourceId));
  if (boughtFitmind) {
    for (const product of products) {
      if (product.origin !== "fitmind" && !ctx.purchasedProductIds.has(product.sourceId) && product.cardDays > 0) {
        add(product, "Combina com seu plano FitMind");
      }
    }
  }

  return out;
}

/**
 * Escassez real: produto de parceiro com vaga contada e pouca sobrando.
 * Nada de urgência inventada — se não há estoque configurado, não entra.
 */
export function buildScarcity(
  products: UnifiedProduct[],
  stock: Record<string, { stock: number; remaining: number }>,
  limit = 8,
  excluir?: Set<string>,
): Array<{ product: UnifiedProduct; remaining: number; stock: number }> {
  return products
    .filter((p) => !excluir?.has(p.id))
    .map((product) => ({ product, info: stock[product.sourceId] }))
    .filter((row) => row.info && row.info.stock > 0 && row.info.remaining > 0)
    .sort((a, b) => a.info!.remaining - b.info!.remaining)
    .slice(0, limit)
    .map((row) => ({ product: row.product, remaining: row.info!.remaining, stock: row.info!.stock }));
}

/** Produtos do coach do aluno e da cadeia acima dele. */
export function buildNetwork(
  products: UnifiedProduct[],
  ctx: StoreContext,
  limit = 10,
  excluir?: Set<string>,
): UnifiedProduct[] {
  if (!ctx.coachChain.length && !ctx.coachId) return [];
  const chain = new Set([...ctx.coachChain, ...(ctx.coachId ? [ctx.coachId] : [])]);
  return products
    .filter((p) => !excluir?.has(p.id))
    .filter((p) => p.sellerCoachId && chain.has(p.sellerCoachId))
    .slice(0, limit);
}

/**
 * Ordenação da vitrine. Determinística e explicável — nada de aleatório.
 * Empate resolve por ordem alfabética, para a lista ficar previsível entre
 * uma visita e outra.
 */
export function scoreProduct(
  product: UnifiedProduct,
  ctx: StoreContext,
  stock: Record<string, { stock: number; remaining: number }>,
): number {
  let score = 0;
  const chain = new Set([...ctx.coachChain, ...(ctx.coachId ? [ctx.coachId] : [])]);

  if (product.sellerCoachId && chain.has(product.sellerCoachId)) score += 4;
  if (product.sectionId && ctx.purchasedSectionIds.has(product.sectionId)) score += 3;

  const info = stock[product.sourceId];
  if (info && info.stock > 0 && info.remaining > 0 && info.remaining <= 3) score += 3;

  if (product.originalPrice && product.originalPrice > product.price) score += 2;
  if (product.cardDays > 0) score += 1;
  if (product.challengeTickets > 0) score += 1;
  if (!product.imageUrl) score -= 2; // card sem imagem afunda a leitura da grade

  return score;
}

/**
 * Ordena a grade.
 *
 * `jaNosTrilhos` não tira ninguém da grade — só tira do TOPO dela quem a
 * pessoa acabou de ver num trilho logo acima. Sem isso o mesmo produto
 * aparecia duas vezes na mesma dobra: `scoreProduct` dá +4 a "é da minha
 * rede", que é literalmente o mesmo predicado de `buildNetwork`, então o item
 * do trilho da rede era também o primeiro da grade. O sinal contava duas
 * vezes: uma para escolher o trilho, outra para ordenar a grade.
 *
 * A penalidade é branda de propósito. O produto da rede continua bem
 * ranqueado — só perde o direito de ocupar a melhor vaga da grade sendo uma
 * repetição do que está 200 pixels acima.
 */
export function sortShowcase(
  products: UnifiedProduct[],
  ctx: StoreContext,
  stock: Record<string, { stock: number; remaining: number }>,
  jaNosTrilhos?: Set<string>,
): UnifiedProduct[] {
  const nota = (p: UnifiedProduct) =>
    scoreProduct(p, ctx, stock) - (jaNosTrilhos?.has(p.id) ? 5 : 0);
  return [...products].sort((a, b) => {
    const diff = nota(b) - nota(a);
    if (diff !== 0) return diff;
    return a.title.localeCompare(b.title, "pt-BR", { sensitivity: "base" });
  });
}

/** Benefícios de um produto de parceiro quando não há override. */
export { computePartnerProductBenefits };
