import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";
import { canAccess, type AdminPerms } from "@/lib/admin-permissions";
import type { Database } from "@/integrations/supabase/types";

/**
 * Anamneses para o admin: as que o aluno preenche no app (`anamnesis_forms`) e
 * as que o profissional preenche para um cliente dele
 * (`professional_anamnesis_external`).
 */

type Db = { from: (t: string) => any };

/** PostgREST devolve no máximo mil linhas por consulta; acima disso, pagina. */
const PAGINA = 1000;

/**
 * Anamnese é dado de saúde. Esconder a aba no menu não basta — a função é uma
 * rota que se chama direto —, então o servidor confere a mesma regra do menu.
 */
async function exigirPermissao(userId: string): Promise<Db> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const db = supabaseAdmin as unknown as Db;
  const { data } = await db
    .from("profiles")
    .select("role, is_master_admin, admin_permissions")
    .eq("user_id", userId)
    .maybeSingle();
  const perfil = data as { role: string; is_master_admin: boolean | null; admin_permissions: AdminPerms | null } | null;
  const pode = perfil?.role === "admin" && canAccess(perfil.admin_permissions, !!perfil.is_master_admin, "anamneses");
  if (!pode) throw new Error("Sem permissão para ver anamneses");
  return db;
}

async function lerTodas<T>(pagina: (de: number, ate: number) => PromiseLike<{ data: unknown; error: { message: string } | null }>) {
  const linhas: T[] = [];
  for (let de = 0; ; de += PAGINA) {
    const { data, error } = await pagina(de, de + PAGINA - 1);
    if (error) throw new Error(error.message);
    const lote = (data ?? []) as T[];
    linhas.push(...lote);
    if (lote.length < PAGINA) return linhas;
  }
}

export type TipoAnamnese = "aluno" | "profissional";

export type AnamneseResumo = {
  tipo: TipoAnamnese;
  id: string;
  nome: string;
  contato: string | null;
  preenchidaEm: string;
  /** Só a do aluno tem assinatura. */
  assinada: boolean;
  /** Quem preencheu, na anamnese de profissional. */
  profissional: string | null;
  /** Condições que pedem atenção antes de prescrever. */
  alertas: string[];
};

type LinhaAluno = {
  id: string;
  filled_at: string;
  confirmed_at: string | null;
  student_signature_confirmed: boolean | null;
  has_diabetes: boolean | null;
  has_hypertension: boolean | null;
  has_cardiopathy: boolean | null;
  students: { profiles: { name: string | null; email: string | null; phone: string | null } | null } | null;
};

async function resumosDoAluno(db: Db): Promise<AnamneseResumo[]> {
  const linhas = await lerTodas<LinhaAluno>((de, ate) =>
    db
      .from("anamnesis_forms")
      .select(
        "id, filled_at, confirmed_at, student_signature_confirmed, has_diabetes, has_hypertension, has_cardiopathy, students(profiles(name, email, phone))",
      )
      .order("filled_at", { ascending: false })
      .range(de, ate),
  );
  return linhas.map((l) => {
    const perfil = l.students?.profiles;
    return {
      tipo: "aluno",
      id: l.id,
      nome: perfil?.name?.trim() || "Aluno sem nome",
      contato: perfil?.phone || perfil?.email || null,
      preenchidaEm: l.filled_at,
      assinada: Boolean(l.confirmed_at || l.student_signature_confirmed),
      profissional: null,
      alertas: [
        l.has_hypertension ? "Hipertensão" : null,
        l.has_diabetes ? "Diabetes" : null,
        l.has_cardiopathy ? "Cardiopatia" : null,
      ].filter((a): a is string => a !== null),
    };
  });
}

type LinhaProfissional = {
  id: string;
  created_at: string;
  updated_at: string | null;
  answers: Record<string, unknown> | null;
  coach_evaluation_clients: { name: string | null; email: string | null; whatsapp: string | null } | null;
  coaches: { profiles: { name: string | null } | null } | null;
};

/** A linha nasce no primeiro "salvar", mesmo sem nada escrito. Vazia não é anamnese preenchida. */
const temResposta = (respostas: Record<string, unknown> | null) =>
  Object.values(respostas ?? {}).some((v) => String(v ?? "").trim() !== "");

async function resumosDeProfissional(db: Db): Promise<AnamneseResumo[]> {
  const linhas = await lerTodas<LinhaProfissional>((de, ate) =>
    db
      .from("professional_anamnesis_external")
      .select(
        "id, created_at, updated_at, answers, coach_evaluation_clients(name, email, whatsapp), coaches(profiles!coaches_profile_id_fkey(name))",
      )
      .order("updated_at", { ascending: false })
      .range(de, ate),
  );
  return linhas.filter((l) => temResposta(l.answers)).map((l) => {
    const cliente = l.coach_evaluation_clients;
    return {
      tipo: "profissional",
      id: l.id,
      nome: cliente?.name?.trim() || "Cliente sem nome",
      contato: cliente?.whatsapp || cliente?.email || null,
      preenchidaEm: l.updated_at ?? l.created_at,
      assinada: false,
      profissional: l.coaches?.profiles?.name?.trim() || "Profissional",
      alertas: [],
    };
  });
}

/**
 * Lista das anamneses, sem as respostas.
 *
 * A busca por nome fica na tela: são poucas centenas de linhas, e lá dá para
 * ignorar acento e ordem das palavras — o `ilike` do banco não acharia
 * "Mariangela" em "Mariângela".
 */
export const listarAnamneses = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const db = await exigirPermissao(context.userId);
    const [doAluno, deProfissional] = await Promise.all([resumosDoAluno(db), resumosDeProfissional(db)]);
    return {
      anamneses: [...doAluno, ...deProfissional].sort((a, b) => b.preenchidaEm.localeCompare(a.preenchidaEm)),
    };
  });

export type PerguntaDoProfissional = { id: string; label: string; position: number };

type FichaDoAluno = Database["public"]["Tables"]["anamnesis_forms"]["Row"];

export type AnamneseCompleta =
  | { tipo: "aluno"; ficha: FichaDoAluno }
  | { tipo: "profissional"; respostas: Record<string, string>; perguntas: PerguntaDoProfissional[] };

async function fichaDoAluno(db: Db, id: string): Promise<AnamneseCompleta> {
  const { data, error } = await db.from("anamnesis_forms").select("*").eq("id", id).maybeSingle();
  if (error) throw new Error(error.message);
  if (!data) throw new Error("Anamnese não encontrada");
  return { tipo: "aluno", ficha: data as FichaDoAluno };
}

async function fichaDeProfissional(db: Db, id: string): Promise<AnamneseCompleta> {
  const { data, error } = await db
    .from("professional_anamnesis_external")
    .select("coach_id, answers")
    .eq("id", id)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const linha = data as { coach_id: string; answers: Record<string, unknown> | null } | null;
  if (!linha) throw new Error("Anamnese não encontrada");

  // Inclui as desativadas: a resposta continua gravada com a chave da pergunta
  // mesmo depois que o profissional tira ela do formulário.
  const { data: perguntas, error: erroPerguntas } = await db
    .from("professional_anamnesis_questions")
    .select("id, label, position")
    .eq("coach_id", linha.coach_id)
    .order("position");
  if (erroPerguntas) throw new Error(erroPerguntas.message);

  const respostas = Object.fromEntries(
    Object.entries(linha.answers ?? {}).map(([chave, valor]) => [chave, String(valor ?? "")]),
  );
  return { tipo: "profissional", respostas, perguntas: (perguntas ?? []) as PerguntaDoProfissional[] };
}

export const verAnamnese = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: unknown) =>
    z.object({ tipo: z.enum(["aluno", "profissional"]), id: z.string().uuid() }).parse(d),
  )
  .handler(async ({ context, data }) => {
    const db = await exigirPermissao(context.userId);
    return data.tipo === "aluno" ? fichaDoAluno(db, data.id) : fichaDeProfissional(db, data.id);
  });
