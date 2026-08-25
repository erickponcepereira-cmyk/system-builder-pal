import { supabase } from "@/integrations/supabase/client";

/**
 * Motor de aulas — escrita (painel do criador).
 *
 * Toda operação passa pela RLS: `can_manage_digital_product` cobre coach,
 * profissional e parceiro. Se a pessoa não é dona do curso, o banco recusa —
 * não há verificação de permissão duplicada aqui no cliente, que seria uma
 * segunda fonte de verdade fadada a divergir.
 *
 * Convenção de caminho no storage: `<digital_product_id>/<arquivo>`. É o que
 * permite a policy do bucket descobrir de qual curso é o objeto.
 */

export type CursoAdmin = {
  id: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  price: number;
  status: string | null;
  incluidoNaMensalidade: boolean;
};

export type ModuloAdmin = {
  id: string;
  title: string;
  sortOrder: number;
};

export type AulaAdmin = {
  id: string;
  moduleId: string;
  title: string;
  kind: string;
  sortOrder: number;
  unlockRule: string;
  unlockDays: number | null;
  /** Só a regra "date" usa. Sem ele a aula fica liberada em silêncio. */
  unlockAt: string | null;
  durationSeconds: number | null;
  videoKey: string | null;
  /** Aula de degustação: abre para quem ainda não comprou. É a isca. */
  isPreview: boolean;
  /** Ebook / material. Fica em `file_path`, no mesmo bucket privado. */
  filePath: string | null;
  thumbnailKey: string | null;
  requireWatermark: boolean;
  allowDownload: boolean;
};

/** Cursos que a pessoa pode administrar. Usa a RLS de escrita como filtro. */
export async function listarCursosGeridos(): Promise<CursoAdmin[]> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return [];

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return [];

  // Coach/profissional criador e empresa parceira criadora.
  const [coachRes, partnerRes] = await Promise.all([
    supabase
      .from("coach_created_courses" as never)
      .select("digital_product_id,coaches!inner(profile_id)" as never)
      .eq("coaches.profile_id" as never, profile.id as never),
    supabase
      .from("partner_created_courses" as never)
      .select("digital_product_id,partners!inner(profile_id)" as never)
      .eq("partners.profile_id" as never, profile.id as never),
  ]);

  const ids = new Set<string>();
  for (const r of (coachRes.data as unknown as Array<Record<string, unknown>>) || []) {
    if (r.digital_product_id) ids.add(String(r.digital_product_id));
  }
  for (const r of (partnerRes.data as unknown as Array<Record<string, unknown>>) || []) {
    if (r.digital_product_id) ids.add(String(r.digital_product_id));
  }
  if (!ids.size) return [];

  const { data, error } = await supabase
    .from("digital_products")
    .select("id,title,description,cover_url,price,status")
    .in("id", Array.from(ids));
  if (error) { console.error("[course-admin] cursos", error); return []; }

  return ((data as Array<Record<string, unknown>>) || []).map((p) => ({
    id: String(p.id),
    title: String(p.title || ""),
    description: (p.description as string) || null,
    coverUrl: (p.cover_url as string) || null,
    price: Number(p.price || 0),
    status: (p.status as string) || null,
    incluidoNaMensalidade: false,
  }));
}

export async function listarModulos(productId: string): Promise<ModuloAdmin[]> {
  const { data, error } = await supabase
    .from("digital_product_modules" as never)
    .select("id,title,sort_order" as never)
    .eq("digital_product_id" as never, productId as never)
    .order("sort_order" as never);
  if (error) { console.error("[course-admin] modulos", error); return []; }
  return ((data as unknown as Array<Record<string, unknown>>) || []).map((m) => ({
    id: String(m.id),
    title: String(m.title || ""),
    sortOrder: Number(m.sort_order || 0),
  }));
}

export async function listarAulas(moduleIds: string[]): Promise<AulaAdmin[]> {
  if (!moduleIds.length) return [];
  const { data, error } = await supabase
    .from("digital_product_lessons" as never)
    .select("id,module_id,title,kind,sort_order,unlock_rule,unlock_days,unlock_at,duration_seconds,video_key,file_path,thumbnail_key,require_watermark,allow_download,is_preview" as never)
    .in("module_id" as never, moduleIds as never)
    .order("sort_order" as never);
  if (error) { console.error("[course-admin] aulas", error); return []; }
  return ((data as unknown as Array<Record<string, unknown>>) || []).map((l) => ({
    id: String(l.id),
    moduleId: String(l.module_id),
    title: String(l.title || ""),
    kind: String(l.kind || "video"),
    sortOrder: Number(l.sort_order || 0),
    unlockRule: String(l.unlock_rule || "none"),
    unlockDays: l.unlock_days == null ? null : Number(l.unlock_days),
    unlockAt: (l.unlock_at as string) || null,
    durationSeconds: l.duration_seconds == null ? null : Number(l.duration_seconds),
    videoKey: (l.video_key as string) || null,
    isPreview: l.is_preview === true,
    filePath: (l.file_path as string) || null,
    thumbnailKey: (l.thumbnail_key as string) || null,
    requireWatermark: l.require_watermark === true,
    allowDownload: l.allow_download === true,
  }));
}

export async function criarModulo(productId: string, title: string, sortOrder: number): Promise<void> {
  const { error } = await supabase
    .from("digital_product_modules" as never)
    .insert({ digital_product_id: productId, title, sort_order: sortOrder } as never);
  if (error) throw new Error(error.message);
}

export async function renomearModulo(id: string, title: string): Promise<void> {
  const { error } = await supabase
    .from("digital_product_modules" as never)
    .update({ title } as never)
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}

export async function excluirModulo(id: string): Promise<void> {
  const { error } = await supabase
    .from("digital_product_modules" as never)
    .delete()
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}

export async function criarAula(
  moduleId: string,
  dados: { title: string; kind: string; sortOrder: number; unlockRule: string },
): Promise<string> {
  const { data, error } = await supabase
    .from("digital_product_lessons" as never)
    .insert({
      module_id: moduleId,
      title: dados.title,
      kind: dados.kind,
      sort_order: dados.sortOrder,
      unlock_rule: dados.unlockRule,
      // Aula de vídeo nunca nasce oferecendo download.
      allow_download: dados.kind !== "video",
      require_watermark: dados.kind === "video",
    } as never)
    .select("id" as never)
    .single();
  if (error) throw new Error(error.message);
  return String((data as unknown as { id: string }).id);
}

export async function atualizarAula(
  id: string,
  dados: Partial<{
    title: string;
    kind: string;
    unlockRule: string;
    unlockDays: number | null;
    unlockAt: string | null;
    durationSeconds: number | null;
    videoKey: string | null;
    isPreview: boolean;
    filePath: string | null;
    thumbnailKey: string | null;
    requireWatermark: boolean;
    allowDownload: boolean;
  }>,
): Promise<void> {
  const payload: Record<string, unknown> = {};
  if (dados.title !== undefined) payload.title = dados.title;
  if (dados.kind !== undefined) payload.kind = dados.kind;
  if (dados.unlockRule !== undefined) payload.unlock_rule = dados.unlockRule;
  if (dados.unlockDays !== undefined) payload.unlock_days = dados.unlockDays;
  // Sem isto, "Data fixa" gravava a regra e nunca a data — e
  // `course-engine.ts:209` só tranca quando `unlockAt` existe, então a aula
  // ficava liberada sem ninguém perceber. O CHECK `dpl_date_needs_at` do
  // banco recusa a regra "date" sem data, o que agora vira erro visível.
  if (dados.unlockAt !== undefined) payload.unlock_at = dados.unlockAt;
  if (dados.durationSeconds !== undefined) payload.duration_seconds = dados.durationSeconds;
  if (dados.videoKey !== undefined) payload.video_key = dados.videoKey;
  if (dados.filePath !== undefined) payload.file_path = dados.filePath;
  if (dados.isPreview !== undefined) payload.is_preview = dados.isPreview;
  if (dados.thumbnailKey !== undefined) payload.thumbnail_key = dados.thumbnailKey;
  if (dados.requireWatermark !== undefined) payload.require_watermark = dados.requireWatermark;
  if (dados.allowDownload !== undefined) payload.allow_download = dados.allowDownload;
  if (!Object.keys(payload).length) return;

  const { error } = await supabase
    .from("digital_product_lessons" as never)
    .update(payload as never)
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}

export async function excluirAula(id: string): Promise<void> {
  const { error } = await supabase
    .from("digital_product_lessons" as never)
    .delete()
    .eq("id" as never, id as never);
  if (error) throw new Error(error.message);
}

/**
 * Sobe arquivo da aula no bucket privado.
 *
 * O caminho começa pelo id do curso porque é assim que a policy do bucket
 * descobre de quem é o objeto. Mudar essa convenção quebra a permissão.
 */
export async function subirArquivoDaAula(
  productId: string,
  lessonId: string,
  file: File,
  tipo: "video" | "capa",
): Promise<string> {
  const ext = (file.name.split(".").pop() || (tipo === "capa" ? "jpg" : "mp4")).toLowerCase();
  const key = `${productId}/${lessonId}-${tipo}.${ext}`;

  const { error } = await supabase.storage
    .from("course-videos")
    .upload(key, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  await atualizarAula(lessonId, tipo === "video" ? { videoKey: key } : { thumbnailKey: key });
  return key;
}

/**
 * Sobe o material de uma aula que não é vídeo (ebook, apostila, download).
 *
 * Mesmo bucket privado do vídeo, e é isso que faz o arquivo só sair por link
 * assinado. A diferença está na coluna: vídeo grava `video_key`, material
 * grava `file_path` — e é `file_path` que o servidor de entrega procura
 * quando a aula não é vídeo.
 *
 * `allow_download` decide se o aluno pode salvar o arquivo. Para ebook o
 * padrão é falso: a leitura acontece na tela, e o PDF não vira arquivo solto
 * circulando por aí. Vídeo nunca libera, independentemente da coluna.
 */
export async function subirMaterialDaAula(
  productId: string,
  lessonId: string,
  file: File,
): Promise<string> {
  const ext = (file.name.split(".").pop() || "pdf").toLowerCase();
  const key = `${productId}/${lessonId}-material.${ext}`;

  const { error } = await supabase.storage
    .from("course-videos")
    .upload(key, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error(error.message);

  await atualizarAula(lessonId, { filePath: key });
  return key;
}

/** Quantos alunos abriram e concluíram cada aula do curso. */
export type ProgressoTurma = {
  lessonId: string;
  iniciaram: number;
  concluiram: number;
};

export async function progressoDaTurma(lessonIds: string[]): Promise<Map<string, ProgressoTurma>> {
  const out = new Map<string, ProgressoTurma>();
  if (!lessonIds.length) return out;

  const { data, error } = await supabase
    .from("digital_lesson_progress" as never)
    .select("lesson_id,completed_at" as never)
    .in("lesson_id" as never, lessonIds as never);
  if (error) { console.error("[course-admin] progresso turma", error); return out; }

  for (const id of lessonIds) out.set(id, { lessonId: id, iniciaram: 0, concluiram: 0 });
  for (const r of (data as unknown as Array<Record<string, unknown>>) || []) {
    const it = out.get(String(r.lesson_id));
    if (!it) continue;
    it.iniciaram += 1;
    if (r.completed_at) it.concluiram += 1;
  }
  return out;
}

// ─── O curso em si ─────────────────────────────────────────────────────────
//
// Tudo aqui passa por RPC security-definer (`docs/propostas/2026-08-23-criar-curso.sql`),
// e não por insert/update direto, por um motivo específico: uma policy de
// UPDATE aberta no `digital_products` deixaria o criador mudar o próprio
// `status` para 'active' e se autopublicar na loja. As funções tocam só as
// colunas que ele pode mesmo mudar.
//
// O ciclo é: draft → pending_review → (admin) active. Só 'active' aparece na
// loja, e só admin chega lá.

/** Estados possíveis de um curso, na ordem em que acontecem. */
export type StatusCurso = "draft" | "pending_review" | "active" | "inactive";

export function rotuloDoStatus(status: string | null): string {
  switch (status) {
    case "draft": return "Rascunho";
    case "pending_review": return "Em análise";
    case "active": return "No ar";
    case "inactive": return "Fora do ar";
    default: return status || "—";
  }
}

/**
 * Diz em português quando o banco ainda não recebeu as funções.
 *
 * Sem isto o criador veria "Could not find the function public.criar_curso in
 * the schema cache" — mensagem que não ajuda ninguém a saber o que fazer. O
 * SQL vive em `docs/propostas/2026-08-23-criar-curso.sql` e é aplicado à mão.
 */
function erroDeCurso(error: { message: string; code?: string }): Error {
  if (error.code === "PGRST202" || /schema cache|does not exist/i.test(error.message)) {
    return new Error(
      "A criação de cursos ainda não foi liberada neste ambiente. Avise a FitMind.",
    );
  }
  return new Error(error.message);
}

/** Cria o curso e o vínculo de autoria numa transação só. Devolve o id. */
export async function criarCurso(
  title: string,
  description?: string | null,
  price = 0,
  coverUrl?: string | null,
): Promise<string> {
  const { data, error } = await supabase.rpc("criar_curso" as never, {
    _title: title,
    _description: description ?? null,
    _price: price,
    _cover_url: coverUrl ?? null,
  } as never);
  if (error) throw erroDeCurso(error);
  const id = data as unknown as string | null;
  if (!id) throw new Error("O curso não foi criado.");
  return id;
}

/**
 * Salva o que mudou. Campo não enviado é campo que não muda — a RPC trata
 * `null` como "não mexe", então dá para salvar um campo sem reenviar o resto.
 */
export async function atualizarCurso(
  digitalProductId: string,
  campos: { title?: string; description?: string | null; price?: number; coverUrl?: string | null },
): Promise<void> {
  const { error } = await supabase.rpc("atualizar_curso" as never, {
    _digital_product_id: digitalProductId,
    _title: campos.title ?? null,
    _description: campos.description ?? null,
    _price: campos.price ?? null,
    _cover_url: campos.coverUrl ?? null,
  } as never);
  if (error) throw erroDeCurso(error);
}

/** Manda para a fila do revisor. O banco recusa curso sem nenhuma aula. */
export async function enviarCursoParaAprovacao(digitalProductId: string): Promise<void> {
  const { error } = await supabase.rpc("enviar_curso_para_aprovacao" as never, {
    _digital_product_id: digitalProductId,
  } as never);
  if (error) throw erroDeCurso(error);
}

/** Tira da fila para continuar editando. Curso já no ar não volta por aqui. */
export async function voltarCursoParaRascunho(digitalProductId: string): Promise<void> {
  const { error } = await supabase.rpc("voltar_curso_para_rascunho" as never, {
    _digital_product_id: digitalProductId,
  } as never);
  if (error) throw erroDeCurso(error);
}

/**
 * Sobe a capa do curso.
 *
 * Vai para `store-images` e não para `course-videos`, e a diferença importa:
 * `course-videos` é privado — é o que faz o vídeo só abrir por link assinado.
 * Capa precisa aparecer na vitrine para quem ainda NÃO comprou, então tem que
 * ser pública. Guardar capa no bucket privado daria uma imagem quebrada na loja.
 */
export async function subirCapaDoCurso(digitalProductId: string, file: File): Promise<string> {
  const extensao = (file.name.split(".").pop() || "jpg").toLowerCase();
  const caminho = `cursos/${digitalProductId}/capa-${Date.now()}.${extensao}`;
  const { error } = await supabase.storage
    .from("store-images")
    .upload(caminho, file, { upsert: true, contentType: file.type || undefined });
  if (error) throw new Error(error.message);
  const { data } = supabase.storage.from("store-images").getPublicUrl(caminho);
  return data.publicUrl;
}
