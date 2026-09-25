import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * Estorno de venda, do lado do dinheiro.
 *
 * A tela do admin só sabia mudar o status do pedido: o cliente recebia de
 * volta e a comissão continuava na carteira de todo mundo. Aqui a venda é
 * desfeita em todas as pontas.
 *
 * **O dinheiro não é subtraído na mão.** `financial_ledger_events` é a fonte
 * única das carteiras, e `recalc_wallets_for_owner` as recalcula a partir
 * dela. Então estornar é desfazer o FATO na origem — comissão vira
 * `cancelled`, pedido de parceiro sai de `paid` — e mandar recalcular. Quem
 * já sacou fica com `overpaid` no extrato, que os próximos ganhos cobrem;
 * é a mesma conta que o `wallet_statement` já fazia.
 *
 * Nada é apagado: a linha continua no histórico com o motivo do cliente.
 */

const SLOT_ESTORNO = "Estorno solicitado pelo cliente";

type Origem = "store_order" | "partner_product_order" | "transaction" | "subscription_invoice";

type Linha = { id: string; product_id: string | null; student_id: string | null };

export type ResultadoDoEstorno = {
  comissoes_canceladas: number;
  pessoas_recalculadas: number;
  sistema_debitado: number;
  tickets_revogados: number;
  tickets_ja_usados: number;
  dias_de_carteirinha_retirados: number;
  bloqueios_cancelados: number;
};

async function exigirAdmin(userId: string): Promise<string> {
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  const perfil = me as { id: string; role?: string } | null;
  if (!perfil || perfil.role !== "admin") {
    throw new Error("Apenas administradores podem estornar uma venda.");
  }
  return perfil.id;
}

/**
 * As transações do gateway que carregam o dinheiro deste pedido.
 *
 * O histórico do aluno tem quatro origens e o pedido de estorno guarda qual
 * é: `store_order` tem transação ligada por `metadata->>store_order_id`,
 * enquanto `transaction` (assinatura e compra direta) já É a transação.
 */
async function transacoesDoPedido(orderId: string, tipo: Origem): Promise<Linha[]> {
  if (tipo === "partner_product_order") return [];
  const consulta = supabaseAdmin.from("transactions").select("id, product_id, student_id");
  const { data } = tipo === "transaction"
    ? await consulta.eq("id", orderId)
    : await consulta.filter("metadata->>store_order_id", "eq", orderId);
  return ((data as Linha[]) || []);
}

/**
 * Comissões viram `cancelled` e somem do razão.
 *
 * O motivo não é gravado aqui: `commissions` não tem campo de texto livre, e
 * mexer no `slot_label` quebraria a deduplicação do razão. O motivo vive no
 * pedido de estorno, no `admin_audit_log` e na nota do pedido.
 */
async function cancelarComissoes(
  txIds: string[],
  partnerOrderId: string | null,
): Promise<{ quantidade: number; perfis: string[] }> {
  const alvo = supabaseAdmin.from("commissions").update({ status: "cancelled" } as never);
  const { data, error } = await (partnerOrderId
    ? alvo.eq("partner_order_id", partnerOrderId)
    : alvo.in("transaction_id", txIds))
    .neq("status", "cancelled")
    .select("beneficiary_profile_id");
  if (error) throw new Error(`Não consegui cancelar as comissões: ${error.message}`);

  const linhas = ((data as Array<{ beneficiary_profile_id: string | null }>) || []);
  const perfis = Array.from(
    new Set(linhas.map((c) => c.beneficiary_profile_id).filter((id): id is string => !!id)),
  );
  return { quantidade: linhas.length, perfis };
}

/** A parte do sistema sai da carteira do admin, com lançamento no extrato. */
async function debitarSistema(txIds: string[], partnerOrderId: string | null, motivo: string): Promise<number> {
  const consulta = supabaseAdmin.from("admin_system_wallet_entries").select("amount, kind");
  const { data } = partnerOrderId
    ? await consulta.eq("partner_order_id", partnerOrderId)
    : await consulta.in("transaction_id", txIds);

  const entradas = ((data as Array<{ amount: number | string; kind: string | null }>) || [])
    .filter((e) => e.kind !== "debit");
  const total = entradas.reduce((s, e) => s + Number(e.amount || 0), 0);
  if (total <= 0) return 0;

  await supabaseAdmin.from("admin_system_wallet_entries").insert({
    transaction_id: partnerOrderId ? null : (txIds[0] ?? null),
    partner_order_id: partnerOrderId,
    slot_label: SLOT_ESTORNO,
    amount: total,
    kind: "debit",
    notes: motivo,
  } as never);

  const { data: carteira } = await supabaseAdmin
    .from("admin_system_wallet")
    .select("available_balance, total_earned")
    .eq("id", true)
    .maybeSingle();
  const atual = carteira as { available_balance: number | string; total_earned: number | string } | null;
  if (atual) {
    await supabaseAdmin
      .from("admin_system_wallet")
      .update({
        available_balance: Number(atual.available_balance || 0) - total,
        total_earned: Number(atual.total_earned || 0) - total,
        updated_at: new Date().toISOString(),
      } as never)
      .eq("id", true);
  }
  return total;
}

/** Nutricionista e professor guardam a parte deles em tabela própria. */
async function cancelarBloqueios(txIds: string[], motivo: string): Promise<number> {
  if (!txIds.length) return 0;
  let cancelados = 0;
  for (const tabela of ["nutritionist_blocked_entries", "professor_blocked_entries"] as const) {
    const { data } = await supabaseAdmin
      .from(tabela as never)
      .select("id, status" as never)
      .in("transaction_id" as never, txIds as never);
    const abertos = ((data as unknown as Array<{ id: string; status: string }>) || [])
      .filter((e) => e.status !== "cancelled");
    const rpc = tabela === "nutritionist_blocked_entries"
      ? "cancel_nutritionist_blocked_entry"
      : "cancel_professor_blocked_entry";
    for (const entrada of abertos) {
      const { error } = await supabaseAdmin.rpc(rpc as never, { _entry_id: entrada.id, _notes: motivo } as never);
      if (!error) cancelados += 1;
    }
  }
  if (cancelados) await supabaseAdmin.rpc("recalc_nutritionist_wallets" as never).then(() => {}, () => {});
  return cancelados;
}

/** Ticket de desafio ainda não usado volta; o que já virou inscrição, não. */
async function revogarTickets(txIds: string[]): Promise<{ revogados: number; jaUsados: number }> {
  if (!txIds.length) return { revogados: 0, jaUsados: 0 };
  const { data } = await supabaseAdmin
    .from("student_challenge_tokens" as never)
    .select("id, consumed_at" as never)
    .in("source_transaction_id" as never, txIds as never);
  const tokens = ((data as unknown as Array<{ id: string; consumed_at: string | null }>) || []);
  const livres = tokens.filter((t) => !t.consumed_at).map((t) => t.id);
  if (livres.length) {
    await supabaseAdmin.from("student_challenge_tokens" as never).delete().in("id" as never, livres as never);
  }
  return { revogados: livres.length, jaUsados: tokens.length - livres.length };
}

/** Os dias de carteirinha que o produto deu saem da validade do aluno. */
async function retirarDiasDeCarteirinha(
  linhas: Array<{ product_id: string | null; student_id: string | null }>,
): Promise<number> {
  const productIds = Array.from(new Set(linhas.map((t) => t.product_id).filter((id): id is string => !!id)));
  if (!productIds.length) return 0;

  const { data: produtos } = await supabaseAdmin
    .from("products")
    .select("id, card_access_days")
    .in("id", productIds);
  const diasPorProduto = new Map(
    ((produtos as Array<{ id: string; card_access_days: number | null }>) || [])
      .map((p) => [p.id, Number(p.card_access_days || 0)]),
  );

  let retirados = 0;
  const alunos = Array.from(new Set(linhas.map((t) => t.student_id).filter((id): id is string => !!id)));
  for (const studentId of alunos) {
    const dias = linhas
      .filter((t) => t.student_id === studentId && t.product_id)
      .reduce((s, t) => s + (diasPorProduto.get(t.product_id as string) || 0), 0);
    if (dias <= 0) continue;
    const { data: aluno } = await supabaseAdmin
      .from("students")
      .select("card_valid_until")
      .eq("id", studentId)
      .maybeSingle();
    const validade = (aluno as { card_valid_until: string | null } | null)?.card_valid_until;
    if (!validade) continue;
    const nova = new Date(new Date(validade).getTime() - dias * 86400000);
    await supabaseAdmin
      .from("students")
      .update({ card_valid_until: nova.toISOString() } as never)
      .eq("id", studentId);
    retirados += dias;
  }
  return retirados;
}

/** O dono do produto vendido: é ele quem perde o líquido da criação. */
async function donoDoPedidoDeParceiro(orderId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("partner_product_orders" as never)
    .select("partner_id, professional_coach_id" as never)
    .eq("id" as never, orderId as never)
    .maybeSingle();
  const pedido = data as unknown as { partner_id: string | null; professional_coach_id: string | null } | null;
  if (!pedido) return [];

  const perfis: string[] = [];
  if (pedido.partner_id) {
    const { data: p } = await supabaseAdmin
      .from("partners" as never)
      .select("profile_id" as never)
      .eq("id" as never, pedido.partner_id as never)
      .maybeSingle();
    const dono = (p as unknown as { profile_id: string } | null)?.profile_id;
    if (dono) perfis.push(dono);
  }
  if (pedido.professional_coach_id) {
    const { data: c } = await supabaseAdmin
      .from("coaches")
      .select("profile_id")
      .eq("id", pedido.professional_coach_id)
      .maybeSingle();
    const dono = (c as { profile_id: string } | null)?.profile_id;
    if (dono) perfis.push(dono);
  }
  return perfis;
}

/**
 * Os co-produtores do pedido: perdem o crédito de co-produção junto com a venda.
 *
 * Não têm comissão nem são donos do produto, então nenhuma das outras listas os
 * alcança — e a tabela de carteira deles ficava com o crédito estornado até o
 * próximo recálculo (Jean, 24/09/2026: R$ 44,24 de quatro ingressos).
 */
async function coprodutoresDoPedido(orderId: string): Promise<string[]> {
  const { data } = await supabaseAdmin
    .from("product_coproduction_credits" as never)
    .select("collaborator_type, collaborator_id" as never)
    .eq("order_id" as never, orderId as never);
  const creditos = (data as unknown as Array<{ collaborator_type: string; collaborator_id: string }>) || [];

  const parceiros = creditos.filter((c) => c.collaborator_type === "partner").map((c) => c.collaborator_id);
  const profissionais = creditos.filter((c) => c.collaborator_type === "professional").map((c) => c.collaborator_id);

  const perfis: string[] = [];
  if (parceiros.length) {
    const { data: p } = await supabaseAdmin
      .from("partners" as never)
      .select("profile_id" as never)
      .in("id" as never, parceiros as never);
    const linhas = (p as unknown as Array<{ profile_id: string | null }>) || [];
    perfis.push(...linhas.map((r) => r.profile_id).filter((id): id is string => !!id));
  }
  if (profissionais.length) {
    const { data: c } = await supabaseAdmin
      .from("coaches")
      .select("profile_id")
      .in("id", profissionais);
    const linhas = (c as Array<{ profile_id: string | null }>) || [];
    perfis.push(...linhas.map((r) => r.profile_id).filter((id): id is string => !!id));
  }
  return perfis;
}

const entradaSchema = z.object({
  returnRequestId: z.string().uuid(),
  valorDevolvido: z.number().positive(),
  nota: z.string().max(500).optional(),
});

/**
 * Executa o estorno de um pedido já aprovado pelo admin.
 *
 * Só roda em pedido `approved`: aprovar é a autorização, estornar é o
 * dinheiro voltando. Devolver parte do valor não muda a comissão — a venda
 * deixou de valer, e a comissão sai inteira (decisão do Erick, 22/09/2026).
 */
export const executarEstorno = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => entradaSchema.parse(d))
  .handler(async ({ data, context }): Promise<ResultadoDoEstorno> => {
    const adminProfileId = await exigirAdmin(context.userId);

    const { data: pedidoRaw } = await supabaseAdmin
      .from("return_requests" as never)
      .select("id, order_id, order_type, status, reason, description, requested_by" as never)
      .eq("id" as never, data.returnRequestId as never)
      .maybeSingle();
    const pedido = pedidoRaw as unknown as {
      id: string; order_id: string; order_type: Origem; status: string;
      reason: string; description: string | null; requested_by: string;
    } | null;
    if (!pedido) throw new Error("Pedido de estorno não encontrado.");
    if (pedido.status !== "approved") {
      throw new Error("Aprove o pedido antes de estornar — aprovar é a autorização, estornar devolve o dinheiro.");
    }

    if (pedido.order_type === "subscription_invoice") {
      throw new Error("Estorno de fatura de assinatura ainda não é automático — cancele a fatura pelo financeiro.");
    }

    const motivo = `${SLOT_ESTORNO}: ${pedido.reason}${pedido.description ? ` — ${pedido.description}` : ""}`;
    const deParceiro = pedido.order_type === "partner_product_order";
    const transacoes = await transacoesDoPedido(pedido.order_id, pedido.order_type);
    const txIds = transacoes.map((t) => t.id);

    const comissoes = await cancelarComissoes(txIds, deParceiro ? pedido.order_id : null);
    const sistema = await debitarSistema(txIds, deParceiro ? pedido.order_id : null, motivo);
    const bloqueios = await cancelarBloqueios(txIds, motivo);
    const tickets = await revogarTickets(txIds);
    const dias = await retirarDiasDeCarteirinha(transacoes);

    if (txIds.length) {
      await supabaseAdmin.from("coach_points_log").delete().in("transaction_id", txIds);
      await supabaseAdmin.from("transactions").update({ status: "refunded" } as never).in("id", txIds);
    }

    const donos = deParceiro
      ? [...await donoDoPedidoDeParceiro(pedido.order_id), ...await coprodutoresDoPedido(pedido.order_id)]
      : [];
    if (deParceiro) {
      await supabaseAdmin
        .from("partner_product_orders" as never)
        .update({ status: "refunded", cancelled_at: new Date().toISOString(), notes: motivo } as never)
        .eq("id" as never, pedido.order_id as never);
    } else if (pedido.order_type === "store_order") {
      await supabaseAdmin
        .from("store_orders")
        .update({ status: "refunded", updated_at: new Date().toISOString() } as never)
        .eq("id", pedido.order_id);
    }

    const afetados = Array.from(new Set([...comissoes.perfis, ...donos]));
    for (const profileId of afetados) {
      await supabaseAdmin.rpc("recalc_wallets_for_owner" as never, { _profile_id: profileId } as never)
        .then(() => {}, () => {});
    }

    await supabaseAdmin
      .from("return_requests" as never)
      .update({
        status: "refunded",
        refund_amount: data.valorDevolvido,
        resolved_at: new Date().toISOString(),
        resolved_by: adminProfileId,
        blocks_settlement: false,
        admin_notes: data.nota?.trim() || null,
      } as never)
      .eq("id" as never, pedido.id as never);

    await supabaseAdmin.from("admin_audit_log").insert({
      actor_profile_id: adminProfileId,
      target_profile_id: pedido.requested_by,
      action: "refund_executed",
      notes: `${motivo} · devolvido R$ ${data.valorDevolvido.toFixed(2)} · ${afetados.length} carteiras recalculadas`,
    });

    return {
      comissoes_canceladas: comissoes.quantidade,
      pessoas_recalculadas: afetados.length,
      sistema_debitado: sistema,
      tickets_revogados: tickets.revogados,
      tickets_ja_usados: tickets.jaUsados,
      dias_de_carteirinha_retirados: dias,
      bloqueios_cancelados: bloqueios,
    };
  });
