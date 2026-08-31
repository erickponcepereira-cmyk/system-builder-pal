import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * O caixa da academia.
 *
 * O dinheiro que ENTRA já está registrado em mensalidade, day-use e evento — o
 * caixa lê essas três em vez de recadastrar. O que ele acrescenta é o que
 * faltava: saída, retirada, aporte e o fechamento do período.
 *
 * Toda régua mora no banco. Este arquivo só chama e converte número: se a tela
 * recalculasse qualquer coisa aqui, ela e o banco poderiam discordar, e a
 * recepção acreditaria no que está na tela.
 */

export type TipoLancamento = "saida" | "entrada" | "retirada" | "aporte" | "transferencia";

export const TIPOS_LANCAMENTO: { value: TipoLancamento; label: string; ajuda: string }[] = [
  { value: "saida", label: "Despesa", ajuda: "aluguel, energia, equipamento" },
  { value: "retirada", label: "Retirada", ajuda: "dinheiro que saiu para o dono" },
  { value: "entrada", label: "Entrada avulsa", ajuda: "dinheiro que entrou fora das vendas" },
  { value: "aporte", label: "Aporte", ajuda: "dinheiro que o dono colocou" },
  { value: "transferencia", label: "Transferência", ajuda: "de uma conta para outra" },
];

export type ContaDoCaixa = {
  conta_id: string;
  nome: string;
  tipo: string;
  posicao: number;
  saldo: number;
  saldo_inicial: number;
  partida: number;
  entradas: number;
  saidas: number;
  fechado_ate: string | null;
  formas_pagamento: string[];
};

export type CategoriaDoCaixa = {
  id: string;
  nome: string;
  tipo: "saida" | "entrada";
  cor: string | null;
};

export type MovimentoDoCaixa = {
  id: string;
  data: string;
  direcao: "entrada" | "saida";
  origem: "venda" | "lancamento";
  fonte: string;
  descricao: string;
  bruto: number;
  taxa: number;
  liquido: number;
  pago: boolean;
  pago_em: string | null;
  conta_id: string | null;
  conta_nome: string | null;
  categoria_id: string | null;
  categoria_nome: string | null;
  categoria_cor: string | null;
  forma_pagamento: string | null;
};

export type DiaDoCaixa = {
  data: string;
  entradas: number;
  saidas: number;
  saldo: number;
  acumulado: number;
  previsto_entradas: number;
  previsto_saidas: number;
};

export type FatiaDaCategoria = {
  categoria_id: string | null;
  nome: string;
  cor: string | null;
  total: number;
  quantidade: number;
};

export type ResumoDoCaixa = {
  entradas: { total: number; vendas: number; avulsas: number; aportes: number };
  saidas: { total: number; despesas: number; retiradas: number };
  vendas: {
    bruto: number; taxas: number; liquido: number; quantidade: number;
    mensalidades: number; dayuse: number; eventos: number;
  };
  pendentes: { total: number; entradas: number; saidas: number; quantidade: number };
  vencidas: { total: number; quantidade: number };
  previsto: { entradas: number; saidas: number };
  realizado: { entradas: number; saidas: number };
  saldo: number;
  lucro: number;
  periodo: { de: string; ate: string; hoje: string; timezone: string };
};

/** O que as funcoes de escrita devolvem: o que fizeram, para a tela contar. */
export type RelatoDoCaixa = {
  ok: boolean;
  id?: string;
  saldo_apurado?: number;
  fechamento_id?: string;
  erro?: string;
};

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

/**
 * A régua de quem pode ver a academia vive em `academia-acesso.server`, e é a
 * mesma que o resto do painel usa. Reimplementar aqui é como um lado aprende
 * sobre membro e o outro não.
 */
async function autorizar(userId: string, partnerId: string): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { perfilComAcessoAcademia } = await import("./academia-acesso.server");

  const profileId = await perfilComAcessoAcademia(userId, partnerId);
  if (!profileId) throw new Error("Sem acesso a esta academia.");
  return supabaseAdmin as Admin;
}

async function chamar<T>(admin: Admin, fn: string, args: Record<string, unknown>): Promise<T> {
  const { data, error } = await admin.rpc(fn as never, args as never);
  if (error) throw new Error(error.message);
  return data as T;
}

type Janela = { partnerId: string; de?: string; ate?: string };

export const caixaResumo = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Janela) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    return chamar<ResumoDoCaixa>(admin, "academia_caixa_resumo", {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
    });
  });

export const caixaPorDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Janela) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    const r = await chamar<DiaDoCaixa[]>(admin, "academia_caixa_por_dia", {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
    });
    return Array.isArray(r) ? r : [];
  });

export const caixaPorCategoria = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Janela) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    return chamar<{
      saida: { itens: FatiaDaCategoria[]; total: number };
      entrada: { itens: FatiaDaCategoria[]; total: number };
    }>(admin, "academia_caixa_por_categoria", {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
    });
  });

export const caixaExtrato = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: Janela & { contaId?: string | null; limite?: number }) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    const r = await chamar<MovimentoDoCaixa[]>(admin, "academia_caixa_extrato", {
      p_partner_id: data.partnerId,
      p_de: data.de ?? null,
      p_ate: data.ate ?? null,
      p_conta_id: data.contaId ?? null,
      p_limite: data.limite ?? 100,
    });
    return Array.isArray(r) ? r : [];
  });

/**
 * Contas com saldo e as categorias, numa chamada só.
 *
 * A tela precisa das três coisas ao mesmo tempo — o cartão de contas, o filtro
 * e o formulário de lançamento. Três idas ao servidor para montar uma tela é
 * três chances de uma delas chegar atrasada e a tela piscar.
 */
export const caixaContasECategorias = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; ate?: string }) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);

    const contas = await chamar<ContaDoCaixa[]>(admin, "academia_caixa_saldo_contas", {
      p_partner_id: data.partnerId,
      p_ate: data.ate ?? null,
    });

    const { data: cats, error } = await admin
      .from("academia_caixa_categorias")
      .select("id, nome, tipo, cor")
      .eq("partner_id", data.partnerId)
      .eq("ativo", true)
      .order("tipo")
      .order("nome");
    if (error) throw new Error(error.message);

    return {
      contas: Array.isArray(contas) ? contas : [],
      categorias: (cats ?? []) as CategoriaDoCaixa[],
    };
  });

export const caixaLancar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator(
    (d: {
      partnerId: string;
      contaId: string;
      tipo: TipoLancamento;
      valor: number;
      descricao: string;
      competencia?: string | null;
      categoriaId?: string | null;
      pago?: boolean;
      pagoEm?: string | null;
      contaDestinoId?: string | null;
      observacao?: string | null;
    }) => d,
  )
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    return chamar<RelatoDoCaixa>(admin, "academia_caixa_lancar", {
      p_partner_id: data.partnerId,
      p_conta_id: data.contaId,
      p_tipo: data.tipo,
      p_valor: data.valor,
      p_descricao: data.descricao,
      p_competencia: data.competencia ?? null,
      p_categoria_id: data.categoriaId ?? null,
      p_pago: data.pago ?? true,
      p_pago_em: data.pagoEm ?? null,
      p_conta_destino_id: data.contaDestinoId ?? null,
      p_observacao: data.observacao ?? null,
    });
  });

/** Dar baixa é marcar como pago. Desmarcar volta para pendente. */
export const caixaBaixar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; lancamentoId: string; pago?: boolean; pagoEm?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    return chamar<RelatoDoCaixa>(admin, "academia_caixa_baixar", {
      p_partner_id: data.partnerId,
      p_lancamento_id: data.lancamentoId,
      p_pago: data.pago ?? true,
      p_pago_em: data.pagoEm ?? null,
    });
  });

/**
 * Fechar o caixa. NÃO apaga nada: grava um marco, e os saldos passam a contar
 * dali para frente. Apagar histórico para "zerar" seria destruir o dado.
 */
export const caixaFechar = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; contaId: string; ate?: string | null; observacao?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    return chamar<RelatoDoCaixa>(admin, "academia_caixa_fechar", {
      p_partner_id: data.partnerId,
      p_conta_id: data.contaId,
      p_ate: data.ate ?? null,
      p_observacao: data.observacao ?? null,
    });
  });
