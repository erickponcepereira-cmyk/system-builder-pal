/**
 * Provas e certificado do curso.
 *
 * A regra que organiza este arquivo inteiro: **o gabarito nunca chega aqui.**
 *
 * O aluno não tem SELECT nas tabelas de prova. Ele alcança três funções
 * security-definer, e só:
 *
 *   `prova_para_responder`  → perguntas e alternativas, SEM `is_correct`
 *   `submeter_prova`        → corrige no banco e devolve a nota
 *   `gabarito_da_prova`     → só depois de existir uma tentativa registrada
 *
 * É o erro mais comum em área de membros: mandar as alternativas com um campo
 * `correta: true` e conferir no navegador. Quem abre o inspetor passa em
 * qualquer prova, e o certificado vira enfeite. Aqui a correção acontece num
 * lugar onde o aluno não chega.
 *
 * SQL: `docs/propostas/2026-08-24-provas-e-certificado.sql`.
 */

import { supabase } from "@/integrations/supabase/client";

export type Prova = {
  id: string;
  digitalProductId: string;
  /** Nulo = prova final do curso. Preenchido = prova daquele módulo. */
  moduleId: string | null;
  title: string;
  description: string | null;
  passingScore: number;
  maxAttempts: number | null;
  isActive: boolean;
};

export type PerguntaDaProva = {
  id: string;
  prompt: string;
  alternativas: Array<{ id: string; label: string }>;
};

export type Tentativa = {
  id: string;
  examId: string;
  score: number;
  passed: boolean;
  createdAt: string;
};

export type ResultadoDaProva = {
  score: number;
  passed: boolean;
  acertos: number;
  total: number;
};

export type Certificado = {
  code: string;
  issuedAt: string;
};

/** Traduz a falta do SQL em português, como em `course-admin`. */
function erroDeProva(error: { message: string; code?: string }): Error {
  if (error.code === "PGRST202" || /schema cache|does not exist|não existe/i.test(error.message)) {
    return new Error("As provas ainda não foram liberadas neste ambiente. Avise a FitMind.");
  }
  return new Error(error.message);
}

// ─── Leitura (criador e aluno) ─────────────────────────────────────────────

/** Provas do curso. A RLS decide: criador vê as dele, aluno vê as do curso. */
export async function listarProvas(digitalProductId: string): Promise<Prova[]> {
  const { data, error } = await supabase
    .from("course_exams" as never)
    .select("id,digital_product_id,module_id,title,description,passing_score,max_attempts,is_active" as never)
    .eq("digital_product_id" as never, digitalProductId as never);
  if (error) { console.error("[provas] listar", error); return []; }
  return ((data as unknown as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    digitalProductId: String(r.digital_product_id),
    moduleId: (r.module_id as string) || null,
    title: String(r.title || ""),
    description: (r.description as string) || null,
    passingScore: Number(r.passing_score || 70),
    maxAttempts: r.max_attempts == null ? null : Number(r.max_attempts),
    isActive: r.is_active !== false,
  }));
}

/** Tentativas do próprio aluno. A RLS já filtra por dono. */
export async function minhasTentativas(examIds: string[]): Promise<Tentativa[]> {
  if (!examIds.length) return [];
  const { data, error } = await supabase
    .from("course_exam_attempts" as never)
    .select("id,exam_id,score,passed,created_at" as never)
    .in("exam_id" as never, examIds as never)
    .order("created_at" as never, { ascending: false });
  if (error) { console.error("[provas] tentativas", error); return []; }
  return ((data as unknown as Array<Record<string, unknown>>) || []).map((r) => ({
    id: String(r.id),
    examId: String(r.exam_id),
    score: Number(r.score || 0),
    passed: r.passed === true,
    createdAt: String(r.created_at || ""),
  }));
}

/**
 * A prova como o aluno a vê: perguntas e alternativas, sem gabarito.
 *
 * A RPC devolve linhas planas (uma por alternativa) porque é mais barato no
 * Postgres que montar JSON aninhado. O agrupamento acontece aqui, e preserva
 * a ordem que veio — que já é a ordem de exibição.
 */
export async function carregarProva(examId: string): Promise<PerguntaDaProva[]> {
  const { data, error } = await supabase.rpc("prova_para_responder" as never, {
    _exam_id: examId,
  } as never);
  if (error) throw erroDeProva(error);

  const linhas = (data as unknown as Array<Record<string, unknown>>) || [];
  const porPergunta = new Map<string, PerguntaDaProva>();
  for (const l of linhas) {
    const qid = String(l.question_id);
    if (!porPergunta.has(qid)) {
      porPergunta.set(qid, { id: qid, prompt: String(l.prompt || ""), alternativas: [] });
    }
    porPergunta.get(qid)!.alternativas.push({
      id: String(l.option_id),
      label: String(l.label || ""),
    });
  }
  return Array.from(porPergunta.values());
}

/** Entrega a prova. A nota vem do banco — o cliente não calcula nada. */
export async function submeterProva(
  examId: string,
  respostas: Array<{ question_id: string; option_id: string }>,
): Promise<ResultadoDaProva> {
  const { data, error } = await supabase.rpc("submeter_prova" as never, {
    _exam_id: examId,
    _respostas: respostas,
  } as never);
  if (error) throw erroDeProva(error);

  // Os nomes vêm da RPC: `nota`/`aprovado`/`total_perguntas`, e não
  // `score`/`passed`. A função usa nomes próprios de propósito — parâmetro
  // OUT homônimo de coluna vira "column reference is ambiguous" no Postgres.
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  return {
    score: Number(linha?.nota || 0),
    passed: linha?.aprovado === true,
    acertos: Number(linha?.acertos || 0),
    total: Number(linha?.total_perguntas || 0),
  };
}

export type LinhaDoGabarito = {
  perguntaId: string;
  prompt: string;
  explicacao: string | null;
  alternativas: Array<{ id: string; label: string; correta: boolean }>;
};

/** Gabarito comentado. O banco só devolve depois de existir uma tentativa. */
export async function carregarGabarito(examId: string): Promise<LinhaDoGabarito[]> {
  const { data, error } = await supabase.rpc("gabarito_da_prova" as never, {
    _exam_id: examId,
  } as never);
  if (error) throw erroDeProva(error);

  const linhas = (data as unknown as Array<Record<string, unknown>>) || [];
  const porPergunta = new Map<string, LinhaDoGabarito>();
  for (const l of linhas) {
    const qid = String(l.question_id);
    if (!porPergunta.has(qid)) {
      porPergunta.set(qid, {
        perguntaId: qid,
        prompt: String(l.prompt || ""),
        explicacao: (l.explanation as string) || null,
        alternativas: [],
      });
    }
    porPergunta.get(qid)!.alternativas.push({
      id: String(l.option_id),
      label: String(l.label || ""),
      correta: l.is_correct === true,
    });
  }
  return Array.from(porPergunta.values());
}

// ─── Certificado ───────────────────────────────────────────────────────────

/**
 * Certificado já emitido para este curso, ou `null`.
 *
 * Filtra por aluno E por curso, e o filtro do aluno não é redundância: a
 * policy `cc_criador` deixa quem ADMINISTRA o curso ler os certificados da
 * turma. Sem o `student_id`, o criador abrindo o próprio curso receberia o
 * certificado de um aluno qualquer — ou um erro de "múltiplas linhas".
 */
export async function meuCertificado(
  digitalProductId: string,
  studentId: string | null,
): Promise<Certificado | null> {
  if (!studentId) return null;
  const { data, error } = await supabase
    .from("course_certificates" as never)
    .select("code,issued_at" as never)
    .eq("digital_product_id" as never, digitalProductId as never)
    .eq("student_id" as never, studentId as never)
    .maybeSingle();
  if (error) { console.error("[certificado] leitura", error); return null; }
  const r = data as unknown as { code?: string; issued_at?: string } | null;
  return r?.code ? { code: r.code, issuedAt: String(r.issued_at || "") } : null;
}

/**
 * Emite (ou devolve, se já existir) o certificado.
 *
 * A regra de elegibilidade mora no banco: todas as aulas que contam
 * concluídas, e aprovação na prova final quando ela existe. Repetir a regra
 * aqui criaria uma segunda fonte de verdade — e as duas divergiriam no
 * primeiro ajuste.
 */
export async function emitirCertificado(digitalProductId: string): Promise<Certificado> {
  const { data, error } = await supabase.rpc("emitir_certificado" as never, {
    _digital_product_id: digitalProductId,
  } as never);
  if (error) throw erroDeProva(error);
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha?.codigo) throw new Error("O certificado não foi emitido.");
  return { code: String(linha.codigo), issuedAt: String(linha.emitido_em || "") };
}

export type CertificadoVerificado = { aluno: string; curso: string; emitidoEm: string };

/** Confere um certificado pelo código. Aberto por desenho: é para terceiros. */
export async function verificarCertificado(code: string): Promise<CertificadoVerificado | null> {
  const { data, error } = await supabase.rpc("verificar_certificado" as never, {
    _code: code,
  } as never);
  if (error) throw erroDeProva(error);
  const linha = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | null;
  if (!linha?.aluno) return null;
  return {
    aluno: String(linha.aluno),
    curso: String(linha.curso || ""),
    emitidoEm: String(linha.emitido_em || ""),
  };
}

// ─── Escrita (criador) ─────────────────────────────────────────────────────

export async function criarProva(
  digitalProductId: string,
  title: string,
  moduleId: string | null,
): Promise<string> {
  const { data, error } = await supabase
    .from("course_exams" as never)
    .insert({ digital_product_id: digitalProductId, module_id: moduleId, title } as never)
    .select("id" as never)
    .maybeSingle();
  if (error) throw erroDeProva(error);
  const id = (data as unknown as { id?: string } | null)?.id;
  if (!id) throw new Error("A prova não foi criada.");
  return id;
}

export async function atualizarProva(
  id: string,
  campos: Partial<{ title: string; description: string | null; passingScore: number; maxAttempts: number | null; isActive: boolean }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (campos.title !== undefined) payload.title = campos.title;
  if (campos.description !== undefined) payload.description = campos.description;
  if (campos.passingScore !== undefined) payload.passing_score = campos.passingScore;
  if (campos.maxAttempts !== undefined) payload.max_attempts = campos.maxAttempts;
  if (campos.isActive !== undefined) payload.is_active = campos.isActive;
  if (!Object.keys(payload).length) return;

  const { error } = await supabase
    .from("course_exams" as never)
    .update(payload as never)
    .eq("id" as never, id as never);
  if (error) throw erroDeProva(error);
}

export async function excluirProva(id: string): Promise<void> {
  const { error } = await supabase.from("course_exams" as never).delete().eq("id" as never, id as never);
  if (error) throw erroDeProva(error);
}

/** Pergunta com as alternativas, como o CRIADOR a vê — com gabarito. */
export type PerguntaAdmin = {
  id: string;
  prompt: string;
  explanation: string | null;
  sortOrder: number;
  alternativas: Array<{ id: string; label: string; correta: boolean; sortOrder: number }>;
};

export async function listarPerguntas(examId: string): Promise<PerguntaAdmin[]> {
  const { data: qs, error } = await supabase
    .from("course_exam_questions" as never)
    .select("id,prompt,explanation,sort_order" as never)
    .eq("exam_id" as never, examId as never)
    .order("sort_order" as never);
  if (error) { console.error("[provas] perguntas", error); return []; }

  const perguntas = ((qs as unknown as Array<Record<string, unknown>>) || []).map((q) => ({
    id: String(q.id),
    prompt: String(q.prompt || ""),
    explanation: (q.explanation as string) || null,
    sortOrder: Number(q.sort_order || 0),
    alternativas: [] as PerguntaAdmin["alternativas"],
  }));
  if (!perguntas.length) return perguntas;

  const { data: opts } = await supabase
    .from("course_exam_options" as never)
    .select("id,question_id,label,is_correct,sort_order" as never)
    .in("question_id" as never, perguntas.map((q) => q.id) as never)
    .order("sort_order" as never);

  const porPergunta = new Map(perguntas.map((q) => [q.id, q]));
  for (const o of ((opts as unknown as Array<Record<string, unknown>>) || [])) {
    porPergunta.get(String(o.question_id))?.alternativas.push({
      id: String(o.id),
      label: String(o.label || ""),
      correta: o.is_correct === true,
      sortOrder: Number(o.sort_order || 0),
    });
  }
  return perguntas;
}

/**
 * Cria a pergunta já com quatro alternativas vazias.
 *
 * Quatro porque é o formato que o aluno reconhece de prova, e porque pergunta
 * criada sem alternativa nenhuma é uma pergunta que o criador esquece
 * pela metade — e prova com pergunta sem alternativa não corrige.
 */
export async function criarPergunta(examId: string, prompt: string, sortOrder: number): Promise<void> {
  const { data, error } = await supabase
    .from("course_exam_questions" as never)
    .insert({ exam_id: examId, prompt, sort_order: sortOrder } as never)
    .select("id" as never)
    .maybeSingle();
  if (error) throw erroDeProva(error);
  const id = (data as unknown as { id?: string } | null)?.id;
  if (!id) return;

  const alternativas = [0, 1, 2, 3].map((i) => ({
    question_id: id,
    label: "",
    is_correct: i === 0,
    sort_order: i,
  }));
  const { error: erroOpts } = await supabase
    .from("course_exam_options" as never)
    .insert(alternativas as never);
  if (erroOpts) throw erroDeProva(erroOpts);
}

export async function atualizarPergunta(
  id: string,
  campos: Partial<{ prompt: string; explanation: string | null }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (campos.prompt !== undefined) payload.prompt = campos.prompt;
  if (campos.explanation !== undefined) payload.explanation = campos.explanation;
  if (!Object.keys(payload).length) return;
  const { error } = await supabase
    .from("course_exam_questions" as never)
    .update(payload as never)
    .eq("id" as never, id as never);
  if (error) throw erroDeProva(error);
}

export async function excluirPergunta(id: string): Promise<void> {
  const { error } = await supabase
    .from("course_exam_questions" as never)
    .delete()
    .eq("id" as never, id as never);
  if (error) throw erroDeProva(error);
}

export async function atualizarAlternativa(id: string, label: string): Promise<void> {
  const { error } = await supabase
    .from("course_exam_options" as never)
    .update({ label } as never)
    .eq("id" as never, id as never);
  if (error) throw erroDeProva(error);
}

/**
 * Marca a alternativa correta.
 *
 * Zera as outras da mesma pergunta antes de marcar esta. Sem isso o criador
 * marcaria duas corretas sem perceber, e a correção contaria acerto para as
 * duas — o aluno passaria escolhendo qualquer uma delas.
 */
export async function marcarCorreta(questionId: string, optionId: string): Promise<void> {
  const { error: erroZerar } = await supabase
    .from("course_exam_options" as never)
    .update({ is_correct: false } as never)
    .eq("question_id" as never, questionId as never);
  if (erroZerar) throw erroDeProva(erroZerar);

  const { error } = await supabase
    .from("course_exam_options" as never)
    .update({ is_correct: true } as never)
    .eq("id" as never, optionId as never);
  if (error) throw erroDeProva(error);
}
