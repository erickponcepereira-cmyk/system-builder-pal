import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

// ---------------------------------------------------------------------------
// Histórico unificado de compras do aluno:
// - transactions (assinaturas / produtos digitais via gateway)
// - store_orders + store_order_items (loja FitMind, físicos/digitais)
// - partner_product_orders (parceiros e profissionais)
// Inclui canal de venda (store|coach), tickets de desafio concedidos e
// dias de carteirinha vinculados ao produto.
// ---------------------------------------------------------------------------

export type PurchaseSource = "fitmind_store" | "fitmind_subscription" | "partner" | "professional";

export type PurchaseReviewTarget = {
  product_id: string;
  product_origin: "fitmind" | "partner" | "professional" | "course";
  product_name: string;
};

export type StudentPurchaseRow = {
  id: string;
  /** UUID real da tabela de origem. `id` acima continua sendo a chave única da UI. */
  source_order_id: string;
  source_order_type: "transaction" | "store_order" | "partner_product_order";
  source: PurchaseSource;
  source_label: string;
  order_number: string | null;
  product_name: string;
  product_description: string | null;
  product_id: string | null;
  product_origin: "fitmind" | "partner" | "professional" | "course";
  /** Um pedido pode conter vários itens; cada item possui sua própria avaliação. */
  review_targets: PurchaseReviewTarget[];
  amount: number;
  status: string;
  payment_method: string | null;
  sale_channel: "store" | "coach" | null;
  created_at: string;
  paid_at: string | null;
  challenge_tokens_granted: number;
  card_days_granted: number;
  duration_days: number | null;
  metadata?: Record<string, any> | null;
};

async function assertCanViewStudent(viewerUserId: string, studentId: string): Promise<{ ok: true } | never> {
  // viewer must be: admin, the student's coach, or the student themselves.
  const { data: viewer } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", viewerUserId)
    .maybeSingle();
  if (!viewer) throw new Error("Perfil não encontrado");
  if ((viewer as any).role === "admin") return { ok: true };

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, profile_id, coach_id, profiles!students_profile_id_fkey(user_id)")
    .eq("id", studentId)
    .maybeSingle();
  if (!student) throw new Error("Aluno não encontrado");

  // Same user (student viewing themselves)
  const studentUserId = (student as any).profiles?.user_id;
  if (studentUserId && studentUserId === viewerUserId) return { ok: true };

  // Coach of the student
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", (viewer as any).id)
    .maybeSingle();
  if (coach && (student as any).coach_id === (coach as any).id) return { ok: true };

  throw new Error("Acesso negado a este histórico");
}

async function loadCardDaysMap(productIds: string[]): Promise<Map<string, { tokens: number; cardDays: number; duration: number | null; description: string | null }>> {
  const map = new Map<string, { tokens: number; cardDays: number; duration: number | null; description: string | null }>();
  if (!productIds.length) return map;
  const { data } = await (supabaseAdmin as any)
    .from("products")
    .select("id, challenge_tokens_amount, card_access_days, duration_days, description")
    .in("id", productIds);
  ((data as any[]) || []).forEach((p) => {
    map.set(p.id, {
      tokens: Number(p.challenge_tokens_amount || 0),
      cardDays: Number(p.card_access_days || 0),
      duration: p.duration_days != null ? Number(p.duration_days) : null,
      description: p.description ?? null,
    });
  });
  return map;
}

export const getStudentPurchaseHistory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { studentId: string })
  .handler(async ({ data, context }): Promise<StudentPurchaseRow[]> => {
    await assertCanViewStudent(context.userId, data.studentId);

    // 1) transactions (loja FitMind via gateway / assinaturas)
    const { data: txs } = await supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, status, paid_at, created_at, payment_method, product_id, purchase_type, metadata, store_product_id, digital_product_id")
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(300);

    const txProductIds = Array.from(new Set(((txs as any[]) || []).map((t) => t.product_id).filter(Boolean))) as string[];
    const productMeta = await loadCardDaysMap(txProductIds);

    // Tokens concedidos via student_challenge_tokens (granted_at + source_transaction_id agrupando por tx)
    const txIds = ((txs as any[]) || []).map((t) => t.id);
    const tokensByTx = new Map<string, number>();
    if (txIds.length) {
      const { data: tks } = await (supabaseAdmin as any)
        .from("student_challenge_tokens")
        .select("source_transaction_id")
        .in("source_transaction_id", txIds);
      ((tks as any[]) || []).forEach((r) => {
        const k = r.source_transaction_id as string;
        tokensByTx.set(k, (tokensByTx.get(k) || 0) + 1);
      });
    }

    // Resolve product names from `products`
    const { data: products } = txProductIds.length
      ? await (supabaseAdmin as any).from("products").select("id, name").in("id", txProductIds)
      : { data: [] as any[] };
    const productNameMap = new Map<string, string>();
    ((products as any[]) || []).forEach((p) => productNameMap.set(p.id, p.name));

    // Pedidos da loja também geram uma `transaction` financeira. Quando os
    // dois registros existem, o cartão do pedido é a fonte completa (número,
    // itens e benefícios), então a transação vinculada não deve aparecer como
    // uma segunda compra no histórico.
    const buildTxRows = (): StudentPurchaseRow[] =>
      ((txs as any[]) || []).filter((t) => {
        const linkedOrderId = typeof t.metadata?.store_order_id === "string"
          ? t.metadata.store_order_id
          : null;
        // Uma transação vinculada nunca é uma segunda compra avaliável. Mesmo
        // se o pedido estiver fora do limite desta página, o direito de
        // avaliação e estorno continua pertencendo ao store_order canônico.
        if (linkedOrderId) return false;
        return true;
      }).map((t) => {
      const meta = t.product_id ? productMeta.get(t.product_id) : null;
      const reviewProductId = t.digital_product_id || t.store_product_id || t.product_id || null;
      const isSubscription = String(t.purchase_type || "").toLowerCase().includes("subscription")
        || String(t.purchase_type || "").toLowerCase().includes("assinatura");
      const reviewProductName = (t.product_id && productNameMap.get(t.product_id)) || (isSubscription ? "Mensalidade" : "Compra");
      const reviewOrigin = t.digital_product_id ? "course" as const : "fitmind" as const;
      return {
        id: `tx-${t.id}`,
        source_order_id: t.id,
        source_order_type: "transaction",
        source: isSubscription ? "fitmind_subscription" : "fitmind_store",
        source_label: isSubscription ? "Assinatura FitMind" : "Loja FitMind",
        order_number: null,
        product_name: reviewProductName,
        product_description: meta?.description ?? null,
        product_id: reviewProductId,
        product_origin: reviewOrigin,
        review_targets: reviewProductId ? [{
          product_id: reviewProductId,
          product_origin: reviewOrigin,
          product_name: reviewProductName,
        }] : [],
        amount: Number(t.gross_amount || 0),
        status: t.status,
        payment_method: t.payment_method,
        sale_channel: "store",
        created_at: t.created_at,
        paid_at: t.paid_at,
        challenge_tokens_granted: tokensByTx.get(t.id) || meta?.tokens || 0,
        card_days_granted: meta?.cardDays || 0,
        duration_days: meta?.duration ?? null,
        metadata: t.metadata ?? null,
      };
      });

    // 2) store_orders + items
    const { data: storeOrders } = await supabaseAdmin
      .from("store_orders")
      .select("id, order_number, status, payment_method, total_amount, sale_channel, created_at, updated_at, metadata")
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(200);
    const storeOrderIds = ((storeOrders as any[]) || []).map((o) => o.id);
    const itemsByOrder = new Map<string, Array<{
      title: string;
      quantity: number;
      product_id: string | null;
      product_origin: "fitmind" | "course";
    }>>();
    if (storeOrderIds.length) {
      const { data: items } = await supabaseAdmin
        .from("store_order_items")
        .select("order_id, title, quantity, product_id, store_product_id, digital_product_id")
        .in("order_id", storeOrderIds);
      ((items as any[]) || []).forEach((it) => {
        const list = itemsByOrder.get(it.order_id) || [];
        list.push({
          title: it.title || "Item",
          quantity: Number(it.quantity || 1),
          product_id: it.digital_product_id || it.store_product_id || it.product_id || null,
          product_origin: it.digital_product_id ? "course" : "fitmind",
        });
        itemsByOrder.set(it.order_id, list);
      });
    }
    const storeRows: StudentPurchaseRow[] = ((storeOrders as any[]) || []).map((o) => {
      const items = itemsByOrder.get(o.id) || [];
      const title = items.length ? items.map((i) => `${i.quantity}× ${i.title}`).join(" + ") : `Pedido ${o.order_number}`;
      const sc = (o.sale_channel === "coach" || o.sale_channel === "store") ? o.sale_channel : "store";
      const reviewTargets = Array.from(new Map(
        items
          .filter((item) => item.product_id)
          .map((item) => [
            `${item.product_origin}:${item.product_id}`,
            {
              product_id: item.product_id as string,
              product_origin: item.product_origin,
              product_name: item.title,
            },
          ]),
      ).values());
      return {
        id: `order-${o.id}`,
        source_order_id: o.id,
        source_order_type: "store_order",
        source: "fitmind_store",
        source_label: "Loja FitMind",
        order_number: o.order_number,
        product_name: title,
        product_description: null,
        product_id: items[0]?.product_id ?? null,
        product_origin: items[0]?.product_origin ?? "fitmind",
        review_targets: reviewTargets,
        amount: Number(o.total_amount || 0),
        status: o.status,
        payment_method: o.payment_method,
        sale_channel: sc,
        created_at: o.created_at,
        paid_at: o.status === "paid" ? o.updated_at : null,
        challenge_tokens_granted: 0,
        card_days_granted: 0,
        duration_days: null,
        metadata: o.metadata ?? null,
      };
    });

    // 3) partner_product_orders (parceiros + profissionais)
    const { data: ppOrders } = await (supabaseAdmin as any)
      .from("partner_product_orders")
      .select("id, order_number, status, payment_method, gross_amount, sale_channel, created_at, paid_at, partner_id, partner_product_id, professional_product_id, professional_coach_id, metadata")
      .eq("student_id", data.studentId)
      .order("created_at", { ascending: false })
      .limit(200);

    const partnerProductIds = Array.from(new Set(((ppOrders as any[]) || []).map((o) => o.partner_product_id).filter(Boolean))) as string[];
    const professionalProductIds = Array.from(new Set(((ppOrders as any[]) || []).map((o) => o.professional_product_id).filter(Boolean))) as string[];

    const [{ data: pProds }, { data: profProds }] = await Promise.all([
      partnerProductIds.length
        ? (supabaseAdmin as any).from("partner_products").select("id, name, description").in("id", partnerProductIds)
        : Promise.resolve({ data: [] as any[] }),
      professionalProductIds.length
        ? (supabaseAdmin as any).from("professional_products").select("id, name, description").in("id", professionalProductIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const ppMap = new Map<string, { name: string; description: string | null }>();
    ((pProds as any[]) || []).forEach((p) => ppMap.set(p.id, { name: p.name, description: p.description ?? null }));
    ((profProds as any[]) || []).forEach((p) => ppMap.set(p.id, { name: p.name, description: p.description ?? null }));

    const ppRows: StudentPurchaseRow[] = ((ppOrders as any[]) || []).map((o) => {
      const isProfessional = !!o.professional_product_id;
      const prodId = o.partner_product_id || o.professional_product_id;
      const prod = prodId ? ppMap.get(prodId) : null;
      const productName = prod?.name || `Pedido ${o.order_number}`;
      const productOrigin = isProfessional ? "professional" as const : "partner" as const;
      const sc = (o.sale_channel === "coach" || o.sale_channel === "store") ? o.sale_channel : null;
      return {
        id: `pp-${o.id}`,
        source_order_id: o.id,
        source_order_type: "partner_product_order",
        source: isProfessional ? "professional" : "partner",
        source_label: isProfessional ? "Profissional" : "Parceiro",
        order_number: o.order_number,
        product_name: productName,
        product_description: prod?.description ?? null,
        product_id: prodId ?? null,
        product_origin: productOrigin,
        review_targets: prodId ? [{
          product_id: prodId,
          product_origin: productOrigin,
          product_name: productName,
        }] : [],
        amount: Number(o.gross_amount || 0),
        status: o.status,
        payment_method: o.payment_method,
        sale_channel: sc,
        created_at: o.created_at,
        paid_at: o.paid_at,
        challenge_tokens_granted: 0,
        card_days_granted: 0,
        duration_days: null,
        metadata: o.metadata ?? null,
      };
    });

    const txRows = buildTxRows();
    const all = [...txRows, ...storeRows, ...ppRows].sort((a, b) =>
      (b.paid_at || b.created_at).localeCompare(a.paid_at || a.created_at),
    );
    return all;
  });
