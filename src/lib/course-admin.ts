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
  durationSeconds: number | null;
  videoKey: string | null;
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
    .select("id,module_id,title,kind,sort_order,unlock_rule,unlock_days,duration_seconds,video_key,thumbnail_key,require_watermark,allow_download" as never)
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
    durationSeconds: l.duration_seconds == null ? null : Number(l.duration_seconds),
    videoKey: (l.video_key as string) || null,
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
    durationSeconds: number | null;
    videoKey: string | null;
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
  if (dados.durationSeconds !== undefined) payload.duration_seconds = dados.durationSeconds;
  if (dados.videoKey !== undefined) payload.video_key = dados.videoKey;
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
