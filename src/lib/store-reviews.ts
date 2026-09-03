import { supabase } from "@/integrations/supabase/client";

/**
 * Avaliação de produto: estrela e comentário, de quem comprou.
 *
 * A regra que sustenta tudo é do banco, não daqui: um gatilho recusa avaliação
 * cujo pedido não pertence ao autor, e um índice único garante uma avaliação
 * por compra. Este arquivo só conversa com isso.
 */

export type OrigemDoProduto = "fitmind" | "partner" | "professional" | "course";

export type AvaliacaoPublica = {
  id: string;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  seller_replied_at: string | null;
  created_at: string;
  autor: string;
  can_report: boolean;
  can_block_author: boolean;
  can_block_seller: boolean;
  can_report_seller_reply: boolean;
};

export type MinhaAvaliacao = {
  id: string;
  product_origin: OrigemDoProduto;
  product_id: string;
  order_id: string;
  order_type: "transaction" | "store_order" | "partner_product_order";
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  seller_replied_at: string | null;
  created_at: string;
  hidden_at: string | null;
  hidden_reason: string | null;
};

/** Compatibilidade do formulário de edição: ele recebe sempre a avaliação da própria conta. */
export type Avaliacao = MinhaAvaliacao;

export type ResumoDeNotas = { total: number; media: number; positivas: number };

export function chaveDaAvaliacao(input: {
  orderType: string;
  orderId: string;
  origem: OrigemDoProduto;
  produtoId: string;
}): string {
  return `${input.orderType}:${input.orderId}:${input.origem}:${input.produtoId}`;
}

/**
 * A origem, no vocabulário do catálogo unificado.
 *
 * `UnifiedProduct.origin` já é quase isto, mas curso vem como "fitmind" com
 * kind "digital" — e curso avaliado é sobre o conteúdo, não sobre a loja.
 */
export function origemDoProduto(origin: string, kind: string): OrigemDoProduto {
  if (kind === "digital") return "course";
  if (origin === "partner") return "partner";
  if (origin === "professional") return "professional";
  return "fitmind";
}

/**
 * As notas dos produtos. Sem argumento: todas.
 *
 * Uma função só, e isso é o ponto. Antes eram duas — a grade lia por
 * `todasAsNotas` e o detalhe por `resumoDeNotas`. Concordavam porque saíam da
 * mesma view, e iam divergir na primeira vez que uma ganhasse um filtro e a
 * outra não. Duas portas para o mesmo dado é uma divergência esperando data.
 *
 * Trazer TUDO não é exagero: a view só tem linha para produto que JÁ FOI
 * avaliado, então ela é uma fração minúscula dos 1.911 do catálogo. Mandar os
 * ids dos visíveis num `.in()` montaria uma URL com centenas de uuids e
 * estouraria muito antes de isso virar problema de volume.
 *
 * O teto de 5000 é rede de segurança: no dia em que houver mais avaliações que
 * isso, o certo é paginar aqui, não na tela.
 */
export async function notasDosProdutos(
  produtoIds?: string[],
): Promise<Map<string, ResumoDeNotas>> {
  if (produtoIds?.length === 0) return new Map();
  return carregarResumo(produtoIds ?? null);
}

/** Notas de vários produtos de uma vez — a vitrine pede em lote, não um a um. */
export async function resumoDeNotas(
  chaves: Array<{ origem: OrigemDoProduto; produtoId: string }>,
): Promise<Map<string, ResumoDeNotas>> {
  if (!chaves.length) return new Map();

  const ids = Array.from(new Set(chaves.map((c) => c.produtoId)));
  const resumo = await carregarResumo(ids);
  const permitidas = new Set(chaves.map((c) => `${c.origem}:${c.produtoId}`));
  return new Map(Array.from(resumo).filter(([chave]) => permitidas.has(chave)));
}

async function carregarResumo(produtoIds: string[] | null): Promise<Map<string, ResumoDeNotas>> {
  const mapa = new Map<string, ResumoDeNotas>();
  const { data, error } = await supabase.rpc("resumo_avaliacoes" as never, {
    _product_ids: produtoIds,
  } as never);

  if (error) {
    console.warn("[avaliacoes] não foi possível ler as notas", error);
    return mapa;
  }

  for (const r of ((data as unknown as Array<Record<string, unknown>>) || [])) {
    mapa.set(`${r.product_origin}:${r.product_id}`, {
      total: Number(r.total ?? 0),
      media: Number(r.media ?? 0),
      positivas: Number(r.positivas ?? 0),
    });
  }
  return mapa;
}

/** As avaliações de um produto, mais recentes primeiro. */
export async function avaliacoesDoProduto(
  origem: OrigemDoProduto,
  produtoId: string,
  limite = 20,
): Promise<AvaliacaoPublica[]> {
  // Por RPC, e nao por embed. A policy "profiles_public_basic_select" exige
  // que o perfil seja de um coach aprovado — o de um ALUNO comum nao e legivel
  // por outro aluno, entao o embed devolveria null e toda avaliacao apareceria
  // assinada como "Cliente". A funcao devolve o nome ja abreviado.
  const { data, error } = await supabase.rpc("avaliacoes_do_produto" as never, {
    _origem: origem,
    _produto_id: produtoId,
    _limite: limite,
  } as never);

  if (error) {
    console.warn("[avaliacoes] não foi possível ler", error);
    return [];
  }
  return ((data as unknown as AvaliacaoPublica[]) || []);
}

/** O que esta pessoa já avaliou, por compra. Alimenta o convite pós-compra. */
export async function minhasAvaliacoes(): Promise<Map<string, MinhaAvaliacao>> {
  const { data, error } = await supabase.rpc("minhas_avaliacoes" as never);

  if (error) {
    console.warn("[avaliacoes] não foi possível ler as minhas", error);
    return new Map();
  }
  const mapa = new Map<string, MinhaAvaliacao>();
  for (const a of ((data as unknown as MinhaAvaliacao[]) || [])) {
    mapa.set(chaveDaAvaliacao({
      orderType: a.order_type,
      orderId: a.order_id,
      origem: a.product_origin,
      produtoId: a.product_id,
    }), a);
  }
  return mapa;
}

export async function avaliar(entrada: {
  origem: OrigemDoProduto;
  produtoId: string;
  orderId: string;
  orderType: string;
  nota: number;
  comentario: string;
  idExistente?: string | null;
}): Promise<{ ok: true } | { ok: false; erro: string }> {
  if (entrada.nota < 1 || entrada.nota > 5) {
    return { ok: false, erro: "Escolha de 1 a 5 estrelas." };
  }

  if (entrada.idExistente) {
    const { error } = await supabase.rpc("avaliar_produto" as never, {
      _review_id: entrada.idExistente,
      _product_origin: entrada.origem,
      _product_id: entrada.produtoId,
      _order_id: entrada.orderId,
      _order_type: entrada.orderType,
      _rating: entrada.nota,
      _comment: entrada.comentario.trim() || null,
    } as never);
    if (error) {
      console.error("[avaliacoes] falha ao corrigir", error);
      return { ok: false, erro: "Não consegui salvar a alteração." };
    }
    return { ok: true };
  }

  const { error } = await supabase.rpc("avaliar_produto" as never, {
    _review_id: null,
    _product_origin: entrada.origem,
    _product_id: entrada.produtoId,
    _order_id: entrada.orderId,
    _order_type: entrada.orderType,
    _rating: entrada.nota,
    _comment: entrada.comentario.trim() || null,
  } as never);

  if (error) {
    const codigo = (error as { code?: string }).code;
    if (codigo === "23505") return { ok: false, erro: "Você já avaliou esta compra." };
    // O gatilho do banco fala em português; vale mais que uma mensagem genérica.
    const msg = (error as { message?: string }).message || "";
    if (msg.includes("so quem comprou") || msg.includes("nao e sua")) {
      return { ok: false, erro: "Só quem comprou pode avaliar este produto." };
    }
    console.error("[avaliacoes] falha ao avaliar", error);
    return { ok: false, erro: "Não consegui enviar sua avaliação agora." };
  }
  return { ok: true };
}
