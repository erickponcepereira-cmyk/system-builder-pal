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
