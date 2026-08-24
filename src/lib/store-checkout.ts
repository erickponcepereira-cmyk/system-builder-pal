/**
 * Checkout da loja unificada — criação do pedido.
 *
 * Cópia de `checkoutAsStudent` (`StorePage.tsx`), mantida fora do componente
 * para caber num teste e para a vitrine nova não crescer 200 linhas.
 *
 * A regra que dita a forma disto: **um pedido por vendedor**. Cada RPC de
 * parceiro/profissional cria um pedido para UM produto, porque cada pedido
 * carrega a própria cadeia de comissão. Os itens FitMind entram todos num
 * `create_store_order` só. Por isso esta função cria **um** pedido por
 * chamada — o primeiro passo de `planOrderSteps` — e a tela chama de novo
 * depois que aquele for pago. Não existe "juntar tudo numa cobrança" sem
 * refazer o rateio, e refazer o rateio não é decisão de tela.
 */

import { supabase } from "@/integrations/supabase/client";
import { ensureOrderNumber } from "@/lib/order-number";
import { ehDeVendedor, type CartItem } from "@/lib/store-cart";
import type { SaleClient } from "@/lib/store-coach";

export type PaymentMethod = "pix" | "credit_card" | "debit_card";

export type ShippingForm = {
  name: string;
  phone: string;
  zip: string;
  address: string;
  city: string;
  state: string;
  number: string;
  reference: string;
  location_url: string;
};

export const SHIPPING_VAZIO: ShippingForm = {
  name: "", phone: "", zip: "", address: "", city: "", state: "", number: "", reference: "", location_url: "",
};

/** Pedido criado, pronto para cobrar. É o que a tela de pagamento consome. */
export type PayOrder = {
  id: string;
  total: number;
  number: string;
  email: string;
  name: string;
  sourceKind: "store_order" | "partner_product_order";
  /** Ids de carrinho que este pedido cobre — some do carrinho quando pagar. */
  paidItemIds: string[];
};

/** Assinatura do `attachShippingToOrder` já embrulhado por `useServerFn`. */
type AttachShipping = (args: { data: Record<string, unknown> }) => Promise<unknown>;

/**
 * Erro de criação de pedido em português de gente.
 *
 * Falha de coluna/cache do PostgREST é problema nosso, não do comprador —
 * mostrar `upline_l2_coach_id does not exist` para quem está comprando não
 * ajuda ninguém. O erro original vai inteiro para o console.
 */
export function limparErroDeCheckout(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error || "");
  console.error("[loja nova] erro ao criar pedido", error);
  if (/upline_l\d+_coach_id|column .* does not exist|schema cache|PGRST/i.test(message)) {
    return "Não foi possível preparar este pedido agora. Atualize a tela e tente novamente.";
  }
  return message || "Erro ao criar pedido";
}

/** O que ainda falta para o pedido com entrega poder sair, ou `null`. */
export function faltaParaEntrega(
  shipping: ShippingForm,
  aceitouPrazo: boolean,
  aceitouEndereco: boolean,
): string | null {
  const obrigatorios: Array<keyof ShippingForm> = ["name", "phone", "zip", "address", "city", "state", "number", "reference"];
  if (obrigatorios.some((campo) => !String(shipping[campo] || "").trim())) {
    return "Preencha todos os dados de entrega.";
  }
  if (!aceitouPrazo || !aceitouEndereco) {
    return "Aceite os termos de entrega antes de finalizar.";
  }
  return null;
}

const partnerRpcPaymentMethod = (method: PaymentMethod) => (method === "pix" ? "pix" : "card");

type CriarPedidoParams = {
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  shipping: ShippingForm;
  /** `students.id` do comprador — a RPC de produto de empresa exige. */
  studentId: string | null;
  /**
   * Aluno que indicou. Ainda não é capturado nesta vitrine (o link de
   * indicação é passo à parte); enquanto for `null`, a comissão de indicação
   * simplesmente não existe neste pedido — não é erro, é ausência.
   */
  referrerStudentId?: string | null;
  attachShipping: AttachShipping;
};

/**
 * Cria o próximo pedido do carrinho e devolve o que cobrar.
 *
 * Ordem idêntica à da loja atual e à de `planOrderSteps`: produto de
 * parceiro/profissional primeiro, um por vez; os itens FitMind por último,
 * todos num pedido.
 */
export async function criarProximoPedido({
  cart,
  paymentMethod,
  shipping,
  studentId,
  referrerStudentId = null,
  attachShipping,
}: CriarPedidoParams): Promise<PayOrder | null> {
  if (cart.length === 0) return null;

  const deVendedor = cart.filter((item) => ehDeVendedor(item.kind));
  const daFitMind = cart.filter((item) => !ehDeVendedor(item.kind));

  const { data: userData } = await supabase.auth.getUser();
  const email = userData.user?.email || "";
  const nome = (userData.user?.user_metadata?.name as string) || "";

  if (deVendedor.length > 0) {
    return criarPedidoDeVendedor(deVendedor[0], { paymentMethod, studentId, referrerStudentId, email, nome });
  }

  return criarPedidoFitMind(daFitMind, { paymentMethod, shipping, referrerStudentId, email, nome, attachShipping });
}

async function criarPedidoDeVendedor(
  item: CartItem,
  ctx: {
    paymentMethod: PaymentMethod;
    studentId: string | null;
    referrerStudentId: string | null;
    email: string;
    nome: string;
  },
): Promise<PayOrder> {
  const metodo = partnerRpcPaymentMethod(ctx.paymentMethod);
  // Indicar a si mesmo não é indicação.
  const indicador = ctx.referrerStudentId && ctx.referrerStudentId !== ctx.studentId ? ctx.referrerStudentId : null;

  let pedidoId: string | null = null;

  if (item.kind === "partner_company") {
    if (!ctx.studentId) throw new Error("Conta de aluno não encontrada.");
    const { data, error } = await supabase.rpc("create_partner_company_order" as never, {
      _partner_product_id: item.sourceId,
      _student_id: ctx.studentId,
      _payment_method: metodo,
      _referred_by_student_id: indicador,
    } as never);
    if (error) throw new Error(error.message);
    pedidoId = data as unknown as string;
  } else if (item.isSchedulable && item.scheduledSlot) {
    const { data, error } = await supabase.rpc("create_scheduled_professional_order" as never, {
      _professional_product_id: item.sourceId,
      _starts_at: item.scheduledSlot,
      _payment_method: metodo,
      _referred_by_student_id: indicador,
    } as never);
    if (error) throw new Error(error.message);
    pedidoId = data as unknown as string;
  } else if (item.isSchedulable) {
    throw new Error("Selecione um horário para este atendimento.");
  } else {
    // `_checkout` e nao a função crua: ele CHAMA `create_partner_product_order`
    // por dentro — mesmo pedido, mesma cadeia de comissão — e ainda confere se
    // o número do pedido saiu no formato certo, estourando quando não saiu.
    //
    // Sem essa conferência o pedido nasce sem número, o link `/pay/<número>`
    // fica quebrado e ninguém descobre até o comprador reclamar. É a mesma RPC
    // que a aba de parceiros da loja atual já usa em produção.
    const { data, error } = await supabase.rpc("create_partner_product_order_checkout" as never, {
      _professional_product_id: item.sourceId,
      _payment_method: metodo,
      _referred_by_student_id: indicador,
    } as never);
    if (error) throw new Error(error.message);
    const r = data as unknown as { order_id?: string } | null;
    pedidoId = r?.order_id ?? null;
  }

  if (!pedidoId) throw new Error("Pedido não retornado");

  const { data: linha } = await supabase
    .from("partner_product_orders" as never)
    .select("id,order_number,gross_amount" as never)
    .eq("id" as never, pedidoId as never)
    .maybeSingle();
  const pedido = linha as unknown as { id: string; order_number: string; gross_amount: number } | null;

  return {
    id: pedido?.id || String(pedidoId),
    total: Number(pedido?.gross_amount || item.price),
    number: (await ensureOrderNumber("partner_product_order", String(pedidoId), pedido?.order_number)) || "",
    email: ctx.email,
    name: ctx.nome,
    sourceKind: "partner_product_order",
    paidItemIds: [item.id],
  };
}

async function criarPedidoFitMind(
  itens: CartItem[],
  ctx: {
    paymentMethod: PaymentMethod;
    shipping: ShippingForm;
    referrerStudentId: string | null;
    email: string;
    nome: string;
    attachShipping: AttachShipping;
  },
): Promise<PayOrder> {
  const payload = itens.map((item) => ({ kind: item.kind, sourceId: item.sourceId, quantity: item.quantity }));
  const { data: pedidoId, error } = await supabase.rpc("create_store_order" as never, {
    _items: payload,
    _payment_method: ctx.paymentMethod,
    _shipping: ctx.shipping,
    _notes: null,
    _referrer_student_id: ctx.referrerStudentId,
  } as never);
  if (error) throw new Error(error.message);
  if (!pedidoId) throw new Error("Pedido não retornado");

  const { data: linha } = await supabase
    .from("store_orders" as never)
    .select("id,order_number,total_amount" as never)
    .eq("id" as never, pedidoId as never)
    .maybeSingle();
  const pedido = linha as unknown as { id: string; order_number: string; total_amount: number } | null;

  const precisaEntrega = itens.some((item) =>
    item.kind === "store" || (item.kind === "item" && item.stock !== null && item.stock !== undefined));

  if (precisaEntrega && pedido?.id) {
    // O endereço é um anexo do pedido, não parte dele: se falhar, o pedido
    // continua de pé e o dono resolve a entrega pelo painel. Derrubar uma
    // compra paga por causa do anexo seria pior que a falha.
    try {
      await anexarEntrega(pedido.id, itens, ctx.shipping, ctx.attachShipping);
    } catch (e) {
      console.warn("[loja nova] anexo de entrega", e);
    }
  }

  return {
    id: pedido?.id || String(pedidoId),
    total: Number(pedido?.total_amount || itens.reduce((soma, item) => soma + item.price * item.quantity, 0)),
    number: (await ensureOrderNumber("store_order", String(pedidoId), pedido?.order_number)) || "",
    email: ctx.email,
    name: ctx.nome,
    sourceKind: "store_order",
    paidItemIds: itens.map((item) => item.id),
  };
}

/** Prazo do pedido é o maior prazo entre os produtos físicos que ele leva. */
async function anexarEntrega(
  orderId: string,
  itens: CartItem[],
  shipping: ShippingForm,
  attachShipping: AttachShipping,
): Promise<void> {
  const productIds = itens.map((item) => item.sourceId).filter(Boolean);
  let prazo: number | null = null;
  if (productIds.length) {
    const { data } = await supabase.from("products").select("id,delivery_days").in("id", productIds as never);
    const dias = ((data as Array<{ delivery_days: number | null }>) || [])
      .map((linha) => Number(linha.delivery_days || 0))
      .filter((n) => n > 0);
    prazo = dias.length ? Math.max(...dias) : null;
  }

  await attachShipping({
    data: {
      kind: "store_order",
      order_id: orderId,
      save_to_profile: true,
      delivery_days: prazo,
      shipping_zip: shipping.zip,
      shipping_address: `${shipping.address}${shipping.city ? `, ${shipping.city}` : ""}${shipping.state ? ` - ${shipping.state}` : ""}`,
      shipping_number: shipping.number,
      shipping_reference: shipping.reference,
      shipping_location_url: shipping.location_url || undefined,
    },
  });
}

// ─── Modo coach: o coach não compra, ele vende ────────────────────────────

type CriarVendaParams = {
  cart: CartItem[];
  paymentMethod: PaymentMethod;
  /** Aluno em nome de quem a venda sai. Sem ele não existe pedido. */
  client: SaleClient;
};

/**
 * Cria o próximo pedido de uma venda feita pelo coach.
 *
 * Mesma ordem do checkout do aluno — parceiro/profissional um por vez, FitMind
 * por último — mas com três diferenças que não são cosméticas:
 *
 * 1. Os itens FitMind vão para `create_coach_sale`, não para
 *    `create_store_order`. É outra RPC porque é outro fato: uma venda tem
 *    vendedor, e o vendedor entra na cadeia de comissão.
 * 2. Cada RPC de parceiro recebe o aluno num parâmetro **de nome diferente**
 *    (`_student_id` numa, `_buyer_student_id` na outra). Trocar um pelo outro
 *    não dá erro de compilação e cria o pedido no nome errado.
 * 3. Não há indicação aluno→aluno numa venda do coach: `_referred_by_student_id`
 *    vai explícito como `null` para o Postgres não ficar em dúvida de assinatura.
 */
export async function criarProximaVendaDoCoach({
  cart,
  paymentMethod,
  client,
}: CriarVendaParams): Promise<PayOrder | null> {
  if (cart.length === 0) return null;

  const deVendedor = cart.filter((item) => ehDeVendedor(item.kind));
  const daFitMind = cart.filter((item) => !ehDeVendedor(item.kind));

  if (deVendedor.length > 0) {
    return criarPedidoDeVendedorPeloCoach(deVendedor[0], paymentMethod, client);
  }

  return criarVendaFitMind(daFitMind, paymentMethod, client);
}

async function criarPedidoDeVendedorPeloCoach(
  item: CartItem,
  paymentMethod: PaymentMethod,
  client: SaleClient,
): Promise<PayOrder> {
  const metodo = partnerRpcPaymentMethod(paymentMethod);
  let pedidoId: string | null = null;

  if (item.kind === "partner_company") {
    const { data, error } = await supabase.rpc("create_partner_company_order" as never, {
      _partner_product_id: item.sourceId,
      _student_id: client.id,
      _payment_method: metodo,
      _referred_by_student_id: null,
    } as never);
    if (error) throw new Error(error.message);
    pedidoId = data as unknown as string;
  } else if (item.isSchedulable && item.scheduledSlot) {
    const { data, error } = await supabase.rpc("create_scheduled_professional_order" as never, {
      _professional_product_id: item.sourceId,
      _starts_at: item.scheduledSlot,
      _payment_method: metodo,
      _student_id: client.id,
    } as never);
    if (error) throw new Error(error.message);
    pedidoId = data as unknown as string;
  } else if (item.isSchedulable) {
    throw new Error("Selecione um horário para este atendimento.");
  } else {
    // Mesma razão do caminho do aluno: o invólucro confere o número do pedido,
    // e no modo coach o número é ainda mais crítico — é dele que sai o link
    // que o coach manda para o aluno pagar.
    const { data, error } = await supabase.rpc("create_partner_product_order_checkout" as never, {
      _professional_product_id: item.sourceId,
      _payment_method: metodo,
      _buyer_student_id: client.id,
    } as never);
    if (error) throw new Error(error.message);
    const r = data as unknown as { order_id?: string } | null;
    pedidoId = r?.order_id ?? null;
  }

  if (!pedidoId) throw new Error("Pedido não retornado");

  const { data: linha } = await supabase
    .from("partner_product_orders" as never)
    .select("id,order_number,gross_amount" as never)
    .eq("id" as never, pedidoId as never)
    .maybeSingle();
  const pedido = linha as unknown as { id: string; order_number: string; gross_amount: number } | null;

  return {
    id: pedido?.id || String(pedidoId),
    total: Number(pedido?.gross_amount || item.price),
    number: (await ensureOrderNumber("partner_product_order", String(pedidoId), pedido?.order_number)) || "",
    email: client.email || "",
    name: client.name,
    sourceKind: "partner_product_order",
    paidItemIds: [item.id],
  };
}

async function criarVendaFitMind(
  itens: CartItem[],
  paymentMethod: PaymentMethod,
  client: SaleClient,
): Promise<PayOrder> {
  const payload = itens.map((item) => ({
    productId: item.sourceId,
    kind: item.kind,
    title: item.title,
    unitPrice: item.price,
    quantity: item.quantity,
    // Só o modelo novo (`item`) distingue digital de físico, e é o estoque que
    // distingue: estoque nulo é coisa que não se entrega.
    itemKind: item.kind === "item"
      ? (item.stock === null || item.stock === undefined ? "digital" : "physical")
      : undefined,
  }));

  const { data: res, error } = await supabase.rpc("create_coach_sale" as never, {
    _client_id: client.id,
    _items: payload,
    _payment_method: paymentMethod,
    _notes: null,
  } as never);
  if (error) throw new Error(error.message);

  // A RPC devolve linha ou array de uma linha, e os nomes dos campos variam
  // entre snake_case e camelCase conforme a versão. Aceitar os dois é mais
  // barato que descobrir na produção qual chegou.
  const row = (Array.isArray(res) ? res[0] : res) as {
    order_id?: string; orderId?: string;
    order_number?: string; orderNumber?: string;
    total?: number; total_amount?: number;
  } | null;

  const pedidoId = row?.order_id || row?.orderId;
  if (!pedidoId) throw new Error("Pedido não retornado pelo servidor");

  return {
    id: String(pedidoId),
    total: Number(row?.total ?? row?.total_amount ?? itens.reduce((soma, i) => soma + i.price * i.quantity, 0)),
    number: (await ensureOrderNumber("store_order", String(pedidoId), row?.order_number || row?.orderNumber)) || "",
    email: client.email || "",
    name: client.name,
    sourceKind: "store_order",
    paidItemIds: itens.map((item) => item.id),
  };
}
