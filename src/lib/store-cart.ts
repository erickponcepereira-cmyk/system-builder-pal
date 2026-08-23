/**
 * Carrinho da loja unificada.
 *
 * Cópia deliberada do carrinho de `StorePage.tsx`, não extração: a decisão do
 * dono foi não tocar no que está vendendo enquanto a loja nova não se provar.
 * Unificar depois, quando houver uma só loja.
 *
 * Duas regras que parecem detalhe e não são:
 *
 * 1. A CHAVE DO localStorage NÃO PODE MUDAR. `fitmind_cart_student` e
 *    `fitmind_cart_coach` são as mesmas da loja atual e da loja pública. É
 *    isso que faz o carrinho montado antes do cadastro sobreviver ao login.
 *    Chave nova = carrinho perdido no meio do funil.
 *
 * 2. O FORMATO DO ITEM É COMPARTILHADO. As duas lojas leem e escrevem o mesmo
 *    array. O que está aqui é um superconjunto do que `StorePage` usa
 *    (`id`, `kind`, `sourceId`, `price`, `quantity`, `title`), então um
 *    carrinho montado aqui abre lá e vice-versa. O `id` segue a convenção da
 *    loja atual — inclusive o prefixo `plan-` para `challenge`, que é a única
 *    divergência de nome entre as duas — senão o mesmo produto viraria duas
 *    linhas ao trocar de tela.
 */

import { useCallback, useEffect, useState } from "react";
import type { UnifiedKind, UnifiedProduct } from "@/lib/unified-store";

export type CartAudience = "student" | "coach";

export type CartItem = {
  /** Identidade na tela. Mesma convenção da loja atual (ver nota 2 acima). */
  id: string;
  /** Id na tabela de origem — é o que vai para as RPCs de pedido. */
  sourceId: string;
  kind: UnifiedKind;
  title: string;
  price: number;
  quantity: number;
  imageUrl: string | null;
  originalPrice: number | null;
  sellerName: string;
  /** `tag`/`category` existem porque a loja atual rotula o vendedor por elas. */
  tag: string;
  category: string;
  stock: number | null;
  isSchedulable: boolean;
  scheduledSlot: string | null;
  creatorCoachId: string | null;
  professionalCoachId: string | null;
};

export const chaveCarrinho = (audience: CartAudience): string =>
  audience === "coach" ? "fitmind_cart_coach" : "fitmind_cart_student";

/** Parceiro e profissional são pedidos próprios; o resto é FitMind. */
export const ehDeVendedor = (kind: UnifiedKind): boolean =>
  kind === "partner" || kind === "partner_company";

/**
 * Id do item no carrinho.
 *
 * `challenge` vira `plan-` porque é assim que a loja atual chama a mesma
 * linha. Agendável carrega o horário no id: dois horários do mesmo
 * atendimento são duas reservas, não quantidade 2.
 */
export function cartIdDoProduto(product: UnifiedProduct, slot?: string | null): string {
  const prefixo = product.kind === "challenge" ? "plan" : product.kind;
  const base = `${prefixo}-${product.sourceId}`;
  return product.isSchedulable && slot ? `${base}-${slot}` : base;
}

export function itemDoProduto(product: UnifiedProduct, slot?: string | null): CartItem {
  return {
    id: cartIdDoProduto(product, slot),
    sourceId: product.sourceId,
    kind: product.kind,
    title: product.title,
    price: product.price,
    quantity: 1,
    imageUrl: product.imageUrl,
    originalPrice: product.originalPrice,
    sellerName: product.sellerName,
    tag: product.sellerName,
    category: product.sellerName,
    stock: product.stock,
    isSchedulable: product.isSchedulable,
    scheduledSlot: slot ?? null,
    creatorCoachId: product.creatorCoachId,
    professionalCoachId: product.origin === "professional" ? product.sellerCoachId : null,
  };
}

/**
 * Lê o carrinho gravado. Tolerante de propósito: o array pode ter sido escrito
 * pela loja atual ou pela loja pública, em versões diferentes do app. Item sem
 * `id`, sem `kind` ou sem preço numérico é descartado em silêncio — melhor
 * perder uma linha estranha que travar a loja inteira num `JSON.parse`.
 */
export function lerCarrinho(audience: CartAudience): CartItem[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(chaveCarrinho(audience));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return [];
    return (parsed as CartItem[])
      .filter((item) => !!item
        && typeof item.id === "string"
        && typeof item.kind === "string"
        && Number.isFinite(Number(item.price)))
      .map((item) => ({
        ...item,
        price: Number(item.price),
        quantity: Math.max(1, Number(item.quantity) || 1),
      }));
  } catch {
    return [];
  }
}

export function gravarCarrinho(audience: CartAudience, cart: CartItem[]): void {
  if (typeof window === "undefined") return;
  try {
    const chave = chaveCarrinho(audience);
    if (cart.length) window.localStorage.setItem(chave, JSON.stringify(cart));
    else window.localStorage.removeItem(chave);
  } catch {
    /* modo privado do Safari nega escrita; o carrinho vira só de memória */
  }
}

export const subtotalDo = (cart: CartItem[]): number =>
  cart.reduce((soma, item) => soma + item.price * item.quantity, 0);

/**
 * Carrinho tem produto físico? Então o pedido precisa de endereço.
 * Espelha `requiresShipping` da loja atual: produto FitMind com estoque
 * controlado é coisa que se entrega.
 */
export const exigeEntrega = (cart: CartItem[]): boolean =>
  cart.some((item) => item.kind === "store"
    || (item.kind === "item" && item.stock !== null && item.stock !== undefined));

export type OrderStep = { key: string; label: string; items: CartItem[] };

/**
 * Em quantos pedidos este carrinho se transforma, e em que ordem.
 *
 * Não é escolha de layout: é o que o backend já impõe. Cada RPC de
 * parceiro/profissional cria um pedido para um produto, porque cada pedido
 * carrega a própria cadeia de comissão e o próprio repasse. Os itens FitMind,
 * ao contrário, entram todos num `create_store_order` só.
 *
 * Espelha `planOrderSteps` de `StorePage.tsx`. Se a regra de rateio mudar lá,
 * muda aqui também — as duas descrevem o mesmo backend.
 */
export function planOrderSteps(cart: CartItem[]): OrderStep[] {
  const deVendedor = cart.filter((item) => ehDeVendedor(item.kind));
  const daFitMind = cart.filter((item) => !ehDeVendedor(item.kind));
  const steps: OrderStep[] = deVendedor.map((item) => ({
    key: item.id,
    label: item.sellerName || item.tag || "Parceiro",
    items: [item],
  }));
  if (daFitMind.length > 0) steps.push({ key: "fitmind", label: "FitMind", items: daFitMind });
  return steps;
}

/** Motivo pelo qual um produto não pode entrar no carrinho, ou `null`. */
export function motivoDeBloqueio(product: UnifiedProduct, slot?: string | null): string | null {
  if ((product.kind === "store" || product.kind === "item")
    && product.stock !== null && product.stock !== undefined && product.stock <= 0) {
    return "Produto sem estoque.";
  }
  // A vitrine nova ainda não tem seletor de horário. Enquanto não tiver,
  // agendável fica fora do carrinho em vez de virar pedido sem hora marcada.
  if (product.isSchedulable && !slot) {
    return "Este atendimento precisa de horário. Use a loja atual para agendar.";
  }
  return null;
}

type Carrinho = {
  cart: CartItem[];
  subtotal: number;
  quantidade: number;
  steps: OrderStep[];
  /** Devolve o motivo da recusa, ou `null` quando entrou. */
  adicionar: (product: UnifiedProduct, slot?: string | null) => string | null;
  alterarQuantidade: (id: string, delta: number) => void;
  remover: (id: string) => void;
  limpar: (ids?: string[]) => void;
};

/**
 * Estado do carrinho, já persistido.
 *
 * O `useState` inicializa lendo o storage na primeira renderização — não num
 * `useEffect` — senão o carrinho pisca vazio e o efeito de gravação apaga o
 * que estava lá antes de a leitura acontecer.
 */
export function useCarrinho(audience: CartAudience): Carrinho {
  const [cart, setCart] = useState<CartItem[]>(() => lerCarrinho(audience));

  useEffect(() => { gravarCarrinho(audience, cart); }, [audience, cart]);

  const adicionar = useCallback((product: UnifiedProduct, slot?: string | null): string | null => {
    const bloqueio = motivoDeBloqueio(product, slot);
    if (bloqueio) return bloqueio;
    const novo = itemDoProduto(product, slot);
    setCart((atual) => {
      const achou = atual.find((item) => item.id === novo.id);
      if (!achou) return [...atual, novo];
      // Agendável não acumula: uma reserva por horário.
      if (novo.isSchedulable) return atual.map((item) => (item.id === novo.id ? novo : item));
      return atual.map((item) => (item.id === novo.id ? { ...item, quantity: item.quantity + 1 } : item));
    });
    return null;
  }, []);

  const alterarQuantidade = useCallback((id: string, delta: number) => {
    setCart((atual) => atual
      .map((item) => (item.id === id ? { ...item, quantity: item.quantity + delta } : item))
      .filter((item) => item.quantity > 0));
  }, []);

  const remover = useCallback((id: string) => {
    setCart((atual) => atual.filter((item) => item.id !== id));
  }, []);

  const limpar = useCallback((ids?: string[]) => {
    setCart((atual) => (ids ? atual.filter((item) => !ids.includes(item.id)) : []));
  }, []);

  return {
    cart,
    subtotal: subtotalDo(cart),
    quantidade: cart.reduce((soma, item) => soma + item.quantity, 0),
    steps: planOrderSteps(cart),
    adicionar,
    alterarQuantidade,
    remover,
    limpar,
  };
}
