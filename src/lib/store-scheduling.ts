/**
 * Agendamento de atendimento na loja unificada.
 *
 * O que este arquivo resolve não é escolher horário — isso o
 * `AvailabilityPicker` já faz. É o que acontece quando a pessoa escolhe um
 * horário **tendo outro pendente para o mesmo atendimento**.
 *
 * Sem este cuidado, o aluno que trocou de ideia fica com duas reservas e dois
 * pedidos em aberto; o profissional vê dois horários bloqueados na agenda e um
 * deles nunca será pago. É a mesma regra da loja atual
 * (`StorePage.tsx:998-1030`), trazida para cá com o comportamento intacto.
 *
 * Só mexe em pedido `pending`. Agendamento de pedido PAGO não se cancela por
 * troca de horário na loja — isso é remarcação, e remarcação é conversa com o
 * profissional, não efeito colateral de um clique no carrinho.
 */

import { supabase } from "@/integrations/supabase/client";

export type ResultadoDoPreflight = {
  /** Ids de carrinho que deixaram de valer e devem sair junto. */
  removerDoCarrinho: string[];
  /** Quantos agendamentos pendentes foram cancelados. */
  cancelados: number;
};

const VAZIO: ResultadoDoPreflight = { removerDoCarrinho: [], cancelados: 0 };

/**
 * Confere agendamentos pendentes do mesmo atendimento antes de reservar outro.
 *
 * Regra de decisão, herdada da loja atual:
 *
 * - **Mesmo dia** → cancela o anterior sem perguntar. Duas reservas no mesmo
 *   dia para o mesmo atendimento é sempre engano de horário, nunca intenção.
 * - **Dia diferente** → pergunta. Pode ser que a pessoa queira mesmo dois
 *   encontros, e cancelar sozinho apagaria uma compra que ela pretendia fazer.
 *
 * @param baseCartId id do item no carrinho SEM o sufixo de horário — é ele que
 *        compõe a chave da reserva antiga que precisa sair.
 */
export async function preflightDeAgendamento(params: {
  professionalProductId: string;
  studentId: string | null;
  novoHorarioISO: string;
  baseCartId: string;
}): Promise<ResultadoDoPreflight> {
  const { professionalProductId, studentId, novoHorarioISO, baseCartId } = params;
  if (!studentId || !novoHorarioISO) return VAZIO;

  try {
    const { data, error } = await supabase
      .from("professional_appointments" as never)
      .select("id, starts_at, order_id, partner_product_orders!inner(status)" as never)
      .eq("student_id" as never, studentId as never)
      .eq("product_id" as never, professionalProductId as never)
      .eq("status" as never, "scheduled" as never);

    if (error) {
      // Falhar aqui não pode impedir a reserva nova: no pior caso a pessoa
      // fica com duas, o que é recuperável. Impedir a compra não é.
      console.error("[agendamento] preflight", error);
      return VAZIO;
    }

    const lista = (data as unknown as Array<{
      id: string;
      starts_at: string;
      order_id: string | null;
      partner_product_orders: { status: string } | null;
    }>) || [];

    const pendentes = lista.filter((a) => (a.partner_product_orders?.status || "") === "pending");
    if (!pendentes.length) return VAZIO;

    const diaNovo = new Date(novoHorarioISO).toDateString();
    const remover: string[] = [];
    let cancelados = 0;

    for (const ap of pendentes) {
      const mesmoDia = new Date(ap.starts_at).toDateString() === diaNovo;
      let cancelar = mesmoDia;

      if (!mesmoDia) {
        cancelar = window.confirm(
          `Você já tem um agendamento em ${new Date(ap.starts_at).toLocaleString("pt-BR")} `
          + "para este atendimento.\n\n"
          + "OK = REMARCAR (cancela o agendamento anterior)\n"
          + "Cancelar = MANTER AMBOS os dias",
        );
      }

      if (!cancelar) continue;

      await supabase
        .from("professional_appointments" as never)
        .update({ status: "cancelled", cancelled_at: new Date().toISOString() } as never)
        .eq("id" as never, ap.id as never);

      if (ap.order_id) {
        await supabase
          .from("partner_product_orders" as never)
          .update({ status: "cancelled" } as never)
          .eq("id" as never, ap.order_id as never);
      }

      // O id no carrinho carrega o horário — é assim que dois horários do
      // mesmo atendimento convivem como duas linhas.
      remover.push(`${baseCartId}-${ap.starts_at}`);
      cancelados += 1;
    }

    return { removerDoCarrinho: remover, cancelados };
  } catch (erro) {
    console.error("[agendamento] preflight", erro);
    return VAZIO;
  }
}
