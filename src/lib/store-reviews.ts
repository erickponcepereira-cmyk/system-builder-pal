import { supabase } from "@/integrations/supabase/client";

/**
 * Avaliação de produto: estrela e comentário, de quem comprou.
 *
 * A regra que sustenta tudo é do banco, não daqui: um gatilho recusa avaliação
 * cujo pedido não pertence ao autor, e um índice único garante uma avaliação
 * por compra. Este arquivo só conversa com isso.
 */

export type OrigemDoProduto = "fitmind" | "partner" | "professional" | "course";

export type Avaliacao = {
  id: string;
  product_origin: OrigemDoProduto;
  product_id: string;
  order_id: string;
  rating: number;
  comment: string | null;
  seller_reply: string | null;
  seller_replied_at: string | null;
  created_at: string;
  author_id?: string;
  /** Nome abreviado de quem escreveu, como a RPC devolve. */
  autor?: string | null;
};

export type ResumoDeNotas = { total: number; media: number; positivas: number };

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
  const mapa = new Map<string, ResumoDeNotas>();
  if (produtoIds && produtoIds.length === 0) return mapa;

  let consulta = supabase
    .from("product_review_summary" as never)
    .select("product_origin,product_id,total,media,positivas" as never)
    .limit(5000);

  if (produtoIds) consulta = consulta.in("product_id" as never, produtoIds as never);

  const { data, error } = await consulta;
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
): Promise<Avaliacao[]> {
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
  return ((data as unknown as Avaliacao[]) || []);
}

/** O que esta pessoa já avaliou, por compra. Alimenta o convite pós-compra. */
export async function minhasAvaliacoes(): Promise<Map<string, Avaliacao>> {
  // O filtro por autor e EXPLICITO de proposito.
  //
  // Deixar a RLS filtrar sozinha nao funciona aqui: a policy de SELECT
  // "avaliacao visivel para todos" libera TODA avaliacao nao escondida — e o
  // ponto dela e esse, para a vitrine poder mostrar. Sem o `eq`, esta funcao
  // baixava a tabela inteira para o navegador so para achar as poucas linhas
  // de quem esta olhando. Funcionava por acidente (a busca e por `order_id`,
  // que so casa com pedido proprio) e ficava mais cara a cada avaliacao nova.
  const profileId = await meuProfileId();
  if (!profileId) return new Map();

  const { data, error } = await supabase
    .from("product_reviews" as never)
    .select("id,product_origin,product_id,order_id,rating,comment,seller_reply,seller_replied_at,created_at,author_id" as never)
    .eq("author_id" as never, profileId as never);

  if (error) {
    console.warn("[avaliacoes] não foi possível ler as minhas", error);
    return new Map();
  }
  const mapa = new Map<string, Avaliacao>();
  for (const a of ((data as unknown as Avaliacao[]) || [])) mapa.set(a.order_id, a);
  return mapa;
}

async function meuProfileId(): Promise<string | null> {
  const { data: sessao } = await supabase.auth.getUser();
  const userId = sessao?.user?.id;
  if (!userId) return null;
  const { data } = await supabase.from("profiles").select("id").eq("user_id", userId).maybeSingle();
  return (data?.id as string) ?? null;
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
    const { error } = await supabase
      .from("product_reviews" as never)
      .update({ rating: entrada.nota, comment: entrada.comentario.trim() || null } as never)
      .eq("id" as never, entrada.idExistente as never);
    if (error) {
      console.error("[avaliacoes] falha ao corrigir", error);
      return { ok: false, erro: "Não consegui salvar a alteração." };
    }
    return { ok: true };
  }

  const profileId = await meuProfileId();
  if (!profileId) return { ok: false, erro: "Não consegui identificar sua conta. Entre de novo." };

  const { error } = await supabase.from("product_reviews" as never).insert({
    product_origin: entrada.origem,
    product_id: entrada.produtoId,
    order_id: entrada.orderId,
    order_type: entrada.orderType,
    author_id: profileId,
    rating: entrada.nota,
    comment: entrada.comentario.trim() || null,
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
