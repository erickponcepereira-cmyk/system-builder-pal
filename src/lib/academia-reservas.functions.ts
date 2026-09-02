import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * O lado da recepção: ler o QR e ver quem reservou.
 *
 * O aluno reserva e mostra o QR pelo aplicativo, chamando as mesmas funções
 * direto do navegador — elas são SECURITY DEFINER e se guardam sozinhas pelo
 * `auth.uid()`. Aqui só mora o que exige ser a academia.
 */

export type PessoaNaAula = {
  reserva_id: string;
  nome: string;
  telefone: string | null;
  status: "reservada" | "presente" | "faltou";
  presente_em: string | null;
};

export type AulaDoDia = {
  turma_id: string;
  turma: string;
  hora_inicio: string;
  hora_fim: string | null;
  capacidade: number | null;
  reservados: number;
  presentes: number;
  faltas: number;
  pessoas: PessoaNaAula[];
};

/** Uma pessoa achada pela busca da recepção, já com a situação dela. */
export type PessoaNaRecepcao = {
  credencial_id: string;
  nome: string | null;
  cpf: string | null;
  referencia: string | null;
  motivo: string;
  valido_ate: string | null;
  dias_restantes: number | null;
  liberado: boolean;
  /** Para a recepção não registrar duas vezes a mesma pessoa no mesmo dia. */
  entrou_hoje: boolean;
};

export type LeituraDoQr = {
  ok: boolean;
  liberado: boolean;
  nome?: string;
  motivo?: string;
  valido_ate?: string | null;
  dias_restantes?: number | null;
  repetido?: boolean;
  reserva_marcada?: boolean;
  erro?: string;
};

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function autorizar(userId: string, partnerId: string): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { perfilComAcessoAcademia } = await import("./academia-acesso.server");

  const profileId = await perfilComAcessoAcademia(userId, partnerId);
  if (!profileId) throw new Error("Sem acesso a esta academia.");
  return supabaseAdmin as Admin;
}

export const reservasDoDia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; data?: string }) => d)
  .handler(async ({ data, context }): Promise<AulaDoDia[]> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_reservas_do_dia" as never, {
      p_partner_id: data.partnerId,
      p_data: data.data ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return (Array.isArray(r) ? r : []) as unknown as AulaDoDia[];
  });

/**
 * A recepção só mostra a agenda de aulas quando a academia tem grade.
 *
 * Sem turma nenhuma o bloco vira peso morto na tela do celular: repete
 * "cadastre a grade" para sempre, num lugar que nem é onde se cadastra. Conta a
 * grade inteira, não as aulas de hoje — senão num sábado a academia perderia a
 * navegação para segunda.
 */
export const academiaTemGrade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }): Promise<boolean> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { count, error } = await admin
      .from("academia_turmas")
      .select("id", { count: "exact", head: true })
      .eq("partner_id", data.partnerId)
      .eq("ativo", true);
    if (error) throw new Error(error.message);
    return (count ?? 0) > 0;
  });

/**
 * A leitura do QR. É esta chamada que deixa a pessoa entrar — e ela grava a
 * passagem, então nunca deve ser chamada "só para conferir".
 */
export const validarQr = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; token: string }) => d)
  .handler(async ({ data, context }): Promise<LeituraDoQr> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_qr_validar" as never, {
      p_partner_id: data.partnerId,
      p_token: data.token.trim(),
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as LeituraDoQr;
  });

/**
 * A recepção de quem não tem catraca e nem todo mundo tem o aplicativo.
 *
 * O QR resolve para quem já tem conta e credencial ligada. No Reino Muay Thai
 * isso é uma minoria por enquanto — as pessoas vieram do sistema antigo e vão
 * criando conta aos poucos. Sem este caminho a recepção não consegue nem
 * responder "esta pessoa está em dia?", que é o serviço principal do sistema
 * numa academia onde a porta é humana.
 */
export const buscarNaRecepcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; termo: string }) => d)
  .handler(async ({ data, context }): Promise<PessoaNaRecepcao[]> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_recepcao_buscar" as never, {
      p_partner_id: data.partnerId,
      p_termo: data.termo.trim(),
    } as never);
    if (error) throw new Error(error.message);
    return (r ?? []) as unknown as PessoaNaRecepcao[];
  });

/**
 * Registra a entrada escolhida na busca, com origem `manual`.
 *
 * Quem está devendo também entra, e isso é de propósito: sem catraca a porta é
 * física, a recepção vai deixar passar de qualquer jeito, e um sistema que
 * finge ter barrado produz relatório de frequência falso. A liberação fica
 * gravada na observação da frequência e como ocorrência em
 * `academia_acessos_negados`, com quem liberou.
 */
export const registrarEntradaRecepcao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; credencialId: string }) => d)
  .handler(async ({ data, context }): Promise<LeituraDoQr> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_recepcao_entrada" as never, {
      p_partner_id: data.partnerId,
      p_credencial_id: data.credencialId,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as LeituraDoQr;
  });

/** Quem reservou e não apareceu vira falta — só depois que a aula terminou. */
export const fecharFaltas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; ate?: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; faltas_marcadas: number }> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_fechar_faltas" as never, {
      p_partner_id: data.partnerId,
      p_ate: data.ate ?? null,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as { ok: boolean; faltas_marcadas: number };
  });

/** A recepção também cancela, quando o aluno avisa por telefone. */
export const cancelarReserva = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; reservaId: string }) => d)
  .handler(async ({ data, context }): Promise<{ ok: boolean; erro?: string }> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_cancelar_reserva" as never, {
      p_reserva_id: data.reservaId,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as { ok: boolean; erro?: string };
  });

/** Quantas pessoas cabem na aula. NULL apaga o limite. */
export const definirCapacidade = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; turmaId: string; capacidade: number | null }) => d)
  .handler(async ({ data, context }) => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { error } = await admin
      .from("academia_turmas")
      // Coluna nova: o types.ts gerado ainda descreve academia_turmas sem ela.
      .update({ capacidade: data.capacidade } as never)
      .eq("id", data.turmaId)
      .eq("partner_id", data.partnerId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
