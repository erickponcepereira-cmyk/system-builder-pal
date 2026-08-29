import { supabase } from "@/integrations/supabase/client";
import type { PurchaseSource } from "@/lib/student-purchases.functions";

/**
 * Pedido de estorno, do lado de quem compra.
 *
 * A tabela `return_requests` existe desde julho, com RLS completa, e nunca
 * teve uma tela. Isto liga os fios: o aluno pede, acompanha e pode desistir
 * enquanto ninguém decidiu. Quem aprova, rejeita ou marca como estornado é o
 * admin — e é o banco que garante isso, não este arquivo (a policy de UPDATE
 * só aceita `status = 'cancelled'`).
 *
 * Não escreve `refund_amount` de propósito. O valor a devolver é decisão de
 * quem analisa, não do formulário: pode ter havido entrega parcial, uso, ou
 * taxa que não volta. O pedido carrega o VALOR DA COMPRA como referência, no
 * `metadata`, e mais nada.
 */

export const ESTORNO_ABERTO = ["requested", "under_review", "approved"] as const;

export type StatusEstorno =
  | "requested" | "under_review" | "approved"
  | "rejected" | "refunded" | "cancelled";

export type PedidoDeEstorno = {
  id: string;
  order_id: string;
  order_type: string;
  reason: string;
  description: string | null;
  status: StatusEstorno;
  requested_at: string;
  resolved_at: string | null;
  refund_amount: number | null;
  admin_notes: string | null;
};

/**
 * Motivos prontos, na linguagem de quem compra.
 *
 * Lista curta de propósito: motivo demais vira formulário, e formulário longo
 * faz a pessoa desistir e abrir reclamação em outro lugar. O campo livre
 * embaixo cobre o resto.
 */
export const MOTIVOS: Array<{ valor: string; rotulo: string; pedeDetalhe?: boolean }> = [
  { valor: "nao_recebi", rotulo: "Não recebi o produto" },
  { valor: "diferente", rotulo: "Veio diferente do anunciado", pedeDetalhe: true },
  { valor: "defeito", rotulo: "Chegou com defeito", pedeDetalhe: true },
  { valor: "nao_usei", rotulo: "Comprei sem querer / não vou usar" },
  { valor: "cobranca", rotulo: "Cobrança errada ou duplicada", pedeDetalhe: true },
  { valor: "outro", rotulo: "Outro motivo", pedeDetalhe: true },
];

export const ROTULO_MOTIVO = (v: string): string =>
  MOTIVOS.find((m) => m.valor === v)?.rotulo ?? v;

export const ROTULO_STATUS: Record<StatusEstorno, string> = {
  requested: "Pedido enviado",
  under_review: "Em análise",
  approved: "Aprovado",
  rejected: "Recusado",
  refunded: "Estornado",
  cancelled: "Cancelado por você",
};

/** A compra e o pedido de estorno vivem em tabelas diferentes por origem. */
export const tipoDoPedido = (source: PurchaseSource): string =>
  source === "partner" || source === "professional" ? "partner_product_order" : "store_order";

async function meuProfileId(): Promise<string | null> {
  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao?.user?.id;
  if (!userId) return null;
  const { data } = await supabase
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  return (data?.id as string) ?? null;
}

/** Os pedidos de estorno desta pessoa, indexados pelo id da compra. */
export async function meusEstornos(): Promise<Map<string, PedidoDeEstorno>> {
  const { data, error } = await supabase
    .from("return_requests" as never)
    .select("id,order_id,order_type,reason,description,status,requested_at,resolved_at,refund_amount,admin_notes" as never)
    .order("requested_at" as never, { ascending: false } as never);

  if (error) {
    console.warn("[estorno] não foi possível ler os pedidos", error);
    return new Map();
  }

  const mapa = new Map<string, PedidoDeEstorno>();
  for (const linha of ((data as unknown as PedidoDeEstorno[]) || [])) {
    // O mais recente manda: a consulta já vem ordenada, então o primeiro de
    // cada compra é o que vale, e os anteriores (cancelados, recusados) ficam
    // como histórico que a tela não precisa mostrar.
    if (!mapa.has(linha.order_id)) mapa.set(linha.order_id, linha);
  }
  return mapa;
}

export async function pedirEstorno(entrada: {
  orderId: string;
  source: PurchaseSource;
  motivo: string;
  detalhe: string;
  valorDaCompra: number;
  nomeDoProduto: string;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  const profileId = await meuProfileId();
  if (!profileId) return { ok: false, erro: "Não consegui identificar sua conta. Entre de novo e tente." };

  const { error } = await supabase.from("return_requests" as never).insert({
    order_id: entrada.orderId,
    order_type: tipoDoPedido(entrada.source),
    requested_by: profileId,
    reason: entrada.motivo,
    description: entrada.detalhe.trim() || null,
    status: "requested",
    // Trava o repasse enquanto o pedido está de pé: dinheiro que já saiu para
    // a rede não volta. É a mesma razão de existir da coluna.
    blocks_settlement: true,
    metadata: {
      valor_da_compra: entrada.valorDaCompra,
      produto: entrada.nomeDoProduto,
      origem: entrada.source,
    },
  } as never);

  if (error) {
    // 23505 = o índice parcial que garante um pedido aberto por compra.
    if ((error as { code?: string }).code === "23505") {
      return { ok: false, erro: "Já existe um pedido de estorno em andamento para esta compra." };
    }
    console.error("[estorno] falha ao abrir o pedido", error);
    return { ok: false, erro: "Não consegui enviar seu pedido agora. Tente de novo em instantes." };
  }
  return { ok: true };
}

export async function cancelarEstorno(id: string): Promise<{ ok: boolean; erro?: string }> {
  const { error } = await supabase
    .from("return_requests" as never)
    .update({ status: "cancelled", blocks_settlement: false } as never)
    .eq("id" as never, id as never);

  if (error) {
    console.error("[estorno] falha ao cancelar", error);
    return { ok: false, erro: "Não consegui cancelar agora. Tente de novo." };
  }
  return { ok: true };
}
