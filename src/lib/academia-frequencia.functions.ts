import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Constância e faltas.
 *
 * A régua inteira já mora no banco — `academia_padrao_do_aluno`,
 * `academia_constancia` e `academia_faltas`, da migration
 * `20260829110000_turma_com_aluno_e_constancia`. Aqui não se recalcula nada:
 * duas telas que discordam sobre a turma habitual da mesma pessoa não têm
 * conserto depois.
 *
 * O que este arquivo acrescenta é uma coisa só, e ela importa: **quantos dias
 * de catraca existem**. Sem isso a tela não sabe a diferença entre "ninguém
 * está faltando" e "a catraca é nova demais para saber", e as duas se parecem
 * na tela — uma lista vazia. Hoje, na Estação, é o segundo caso.
 */

export type SituacaoConstancia = "sumiu" | "sumindo" | "caindo" | "novo" | "constante";

export type LinhaConstancia = {
  credencial_id: string | null;
  student_id: string | null;
  nome: string;
  telefone: string | null;
  meta_semanal: number | null;
  meta_origem: string | null;
  treinos_por_semana: number;
  treinos_semana_atual: number;
  aderencia: number | null;
  semanas_avaliadas: number;
  semanas_abaixo: number;
  dias_sem_treinar: number;
  ultimo_treino: string | null;
  turma_id: string | null;
  turma: string | null;
  mudou_horario: boolean;
  situacao: SituacaoConstancia;
  situacao_ordem: number;
};

/** O hábito aprendido: horário de costume, dias de costume, e a troca de turma. */
export type PadraoDoAluno = {
  credencial_id: string | null;
  student_id: string | null;
  treinos: number;
  dias_treinados: number;
  semanas_ativas: number;
  turma_pct: number | null;
  hora_media: string | null;
  hora_desvio_min: number | null;
  dias_rotulo: string | null;
  turma_anterior: string | null;
  primeiro_treino: string | null;
};

export type Historico = { desde: string | null; dias: number; passagens: number };

export type Constancia = {
  linhas: LinhaConstancia[];
  padroes: PadraoDoAluno[];
  historico: Historico;
};

export type RegimeTurma = "livre" | "marcado" | "reserva";

export type LinhaFalta = {
  credencial_id: string | null;
  student_id: string | null;
  nome: string;
  telefone: string | null;
  regime: RegimeTurma;
  referencia: string;
  dia_semana: number | null;
  turma_id: string | null;
  turma: string | null;
  horario: string | null;
  faltas: number;
  meta_semanal: number | null;
  treinos: number | null;
};

export type Faltas = { regime: RegimeTurma; linhas: LinhaFalta[]; historico: Historico };

type Admin = Awaited<typeof import("@/integrations/supabase/client.server")>["supabaseAdmin"];

async function autorizar(userId: string, partnerId: string): Promise<Admin> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { perfilComAcessoAcademia } = await import("./academia-acesso.server");

  const profileId = await perfilComAcessoAcademia(userId, partnerId);
  if (!profileId) throw new Error("Sem acesso a esta academia.");
  return supabaseAdmin as Admin;
}

/**
 * Quantos dias de catraca a academia tem.
 *
 * `academia_constancia` já usa esse número por dentro para não acusar ninguém
 * de sumido num histórico de três dias. A tela precisa dele pelo mesmo motivo,
 * só que para dizer isso em voz alta.
 */
async function medirHistorico(admin: Admin, partnerId: string): Promise<Historico> {
  const { data, count } = await admin
    .from("academia_frequencias")
    .select("entrada_em", { count: "exact" })
    .eq("partner_id", partnerId)
    .order("entrada_em", { ascending: true })
    .limit(1);

  const primeira = (data as Array<{ entrada_em: string }> | null)?.[0]?.entrada_em ?? null;
  if (!primeira) return { desde: null, dias: 0, passagens: 0 };

  const dias = Math.floor((Date.now() - new Date(primeira).getTime()) / 86_400_000);
  return { desde: primeira.slice(0, 10), dias, passagens: count ?? 0 };
}

export const obterConstancia = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; semanas?: number }) => d)
  .handler(async ({ data, context }): Promise<Constancia> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const semanas = data.semanas ?? 8;

    const [constancia, padrao, historico] = await Promise.all([
      admin.rpc("academia_constancia" as never, {
        p_partner_id: data.partnerId,
        p_semanas: semanas,
      } as never),
      admin.rpc("academia_padrao_do_aluno" as never, {
        p_partner_id: data.partnerId,
        p_semanas: semanas,
      } as never),
      medirHistorico(admin, data.partnerId),
    ]);

    if (constancia.error) throw new Error(constancia.error.message);
    if (padrao.error) throw new Error(padrao.error.message);

    return {
      linhas: (Array.isArray(constancia.data) ? constancia.data : []) as unknown as LinhaConstancia[],
      padroes: (Array.isArray(padrao.data) ? padrao.data : []) as unknown as PadraoDoAluno[],
      historico,
    };
  });

/**
 * O regime vem junto porque a tela precisa dele mesmo quando não há uma falta
 * sequer: "nenhuma falta esta semana" e "esta academia não mede falta assim"
 * são frases diferentes, e sem o regime as duas viram a mesma lista vazia.
 */
export const obterFaltas = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; de?: string | null; ate?: string | null }) => d)
  .handler(async ({ data, context }): Promise<Faltas> => {
    const admin = await autorizar(context.userId, data.partnerId);

    const [faltas, config, historico] = await Promise.all([
      admin.rpc("academia_faltas" as never, {
        p_partner_id: data.partnerId,
        p_de: data.de ?? null,
        p_ate: data.ate ?? null,
      } as never),
      admin
        .from("partner_acesso_config")
        .select("regime_turma")
        .eq("partner_id", data.partnerId)
        .maybeSingle(),
      medirHistorico(admin, data.partnerId),
    ]);

    if (faltas.error) throw new Error(faltas.error.message);

    const regime = ((config.data as { regime_turma?: string } | null)?.regime_turma
      ?? "livre") as RegimeTurma;

    return {
      regime,
      linhas: (Array.isArray(faltas.data) ? faltas.data : []) as unknown as LinhaFalta[],
      historico,
    };
  });
