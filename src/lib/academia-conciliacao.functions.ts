import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Conciliar as credenciais do leitor com as contas da plataforma.
 *
 * Toda a régua já mora no banco: `academia_credenciais_sugerir_vinculo` casa
 * por telefone e por nome e classifica a confiança, e
 * `academia_credencial_vincular` liga um par e ainda religa as mensalidades
 * que a pessoa tinha pago como ALUNO para a credencial recém-ligada. Nenhuma
 * das duas tinha tela — este arquivo é a ponte que faltava.
 *
 * O NÚMERO QUE A TELA PRECISA MOSTRAR não é quantos pares existem: é quantas
 * pessoas ficaram DE FORA. Na Estação são 413 credenciais sem vínculo e ~26
 * com algum candidato. As outras ~387 não têm com quem casar porque **não têm
 * conta na FitMind** — e sem conta não há QR, não há reserva e não há
 * aplicativo. Uma tela que mostrasse só os 26 pares faria a conciliação
 * parecer quase pronta quando ela mal começou. Por isso `sem_candidato` sai
 * daqui como número de primeira classe, e não como uma subtração que a
 * interface faz de cabeça.
 */

export type Confianca = "alta" | "media" | "baixa";

export type ParaLigar = {
  credencial_id: string;
  nome: string | null;
  telefone: string | null;
  student_id: string;
  aluno: string;
  aluno_telefone: string | null;
  confianca: Confianca;
  motivo: string;
};

export type Conciliacao = {
  sugestoes: ParaLigar[];
  /** Credenciais ativas ligadas a um aluno da plataforma. */
  ligadas: number;
  /** Credenciais ativas ainda sem aluno. */
  sem_vinculo: number;
  /** Destas, quantas nem candidato têm — o trabalho que sobra depois da tela. */
  sem_candidato: number;
};

export type Ligacao = {
  ok: boolean;
  mudou: boolean;
  credencial_id: string;
  credencial_nome?: string | null;
  student_id: string;
  mensalidades_religadas: number;
  relato: string;
};

/** Uma tentativa do lote: ou ligou, ou não — com o motivo em português. */
export type ResultadoDoLote = {
  credencial_id: string;
  nome: string | null;
  ok: boolean;
  mensalidades_religadas: number;
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

export const obterConciliacao = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string }) => d)
  .handler(async ({ data, context }): Promise<Conciliacao> => {
    const admin = await autorizar(context.userId, data.partnerId);

    const [sugeridas, semVinculo, ligadas] = await Promise.all([
      admin.rpc("academia_credenciais_sugerir_vinculo" as never, {
        p_partner_id: data.partnerId,
      } as never),
      admin
        .from("academia_credenciais")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", data.partnerId)
        .eq("ativo", true)
        .is("student_id", null),
      admin
        .from("academia_credenciais")
        .select("id", { count: "exact", head: true })
        .eq("partner_id", data.partnerId)
        .eq("ativo", true)
        .not("student_id", "is", null),
    ]);

    if (sugeridas.error) throw new Error(sugeridas.error.message);

    const sugestoes = (Array.isArray(sugeridas.data) ? sugeridas.data : []) as unknown as ParaLigar[];
    const comCandidato = new Set(sugestoes.map((s) => s.credencial_id)).size;
    const pendentes = semVinculo.count ?? 0;

    return {
      sugestoes,
      ligadas: ligadas.count ?? 0,
      sem_vinculo: pendentes,
      sem_candidato: Math.max(0, pendentes - comCandidato),
    };
  });

export const ligarCredencial = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; credencialId: string; studentId: string }) => d)
  .handler(async ({ data, context }): Promise<Ligacao> => {
    const admin = await autorizar(context.userId, data.partnerId);
    const { data: r, error } = await admin.rpc("academia_credencial_vincular" as never, {
      p_credencial_id: data.credencialId,
      p_student_id: data.studentId,
    } as never);
    if (error) throw new Error(error.message);
    return r as unknown as Ligacao;
  });

/**
 * O lote das de confiança alta.
 *
 * Uma a uma, e não numa transação só, de propósito: `academia_credencial_vincular`
 * levanta exceção quando o par colide — credencial que ganhou dono no meio do
 * caminho, aluno que já tem outra credencial. Em transação única, uma colisão
 * derrubaria as 19 ligações boas junto com a ruim. Aqui a que colide devolve o
 * motivo e as outras seguem.
 */
export const ligarLote = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { partnerId: string; pares: Array<{ credencialId: string; studentId: string; nome: string | null }> }) => d)
  .handler(async ({ data, context }): Promise<ResultadoDoLote[]> => {
    const admin = await autorizar(context.userId, data.partnerId);

    const feitos: ResultadoDoLote[] = [];
    for (const par of data.pares) {
      const { data: r, error } = await admin.rpc("academia_credencial_vincular" as never, {
        p_credencial_id: par.credencialId,
        p_student_id: par.studentId,
      } as never);

      if (error) {
        feitos.push({ credencial_id: par.credencialId, nome: par.nome, ok: false, mensalidades_religadas: 0, erro: error.message });
        continue;
      }

      const feito = r as unknown as Ligacao;
      feitos.push({
        credencial_id: par.credencialId,
        nome: par.nome,
        ok: true,
        mensalidades_religadas: feito.mensalidades_religadas ?? 0,
      });
    }

    return feitos;
  });
