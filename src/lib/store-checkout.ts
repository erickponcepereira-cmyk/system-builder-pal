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
    const { data, error } = await supabase.rpc("create_partner_product_order" as never, {
      _professional_product_id: item.sourceId,
      _payment_method: metodo,
      _referred_by_student_id: indicador,
    } as never);
    if (error) throw new Error(error.message);
    pedidoId = data as unknown as string;
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
