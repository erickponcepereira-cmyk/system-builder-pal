import { supabase } from "@/integrations/supabase/client";

/**
 * Motor de aulas — leitura.
 *
 * As tabelas (digital_product_modules, digital_product_lessons,
 * digital_lesson_progress) existem no banco mas ainda não estão em types.ts.
 * Por isso os `as never`: são dívida conhecida, somem quando os tipos forem
 * regenerados. Cada um fica na borda da consulta e não vaza para o resto.
 */

export type LessonKind = "video" | "ebook" | "live" | "download";
export type UnlockRule = "none" | "sequential" | "drip" | "date";

export type Lesson = {
  id: string;
  moduleId: string;
  title: string;
  description: string | null;
  kind: LessonKind;
  durationSeconds: number | null;
  unlockRule: UnlockRule;
  unlockDays: number | null;
  unlockAt: string | null;
  allowDownload: boolean;
  requireWatermark: boolean;
  countsForCertificate: boolean;
  sortOrder: number;
  /** video_key e file_path nunca vão para a tela: só o servidor os usa. */
  hasVideo: boolean;
  hasFile: boolean;
};

export type Module = {
  id: string;
  title: string;
  description: string | null;
  sortOrder: number;
  lessons: Lesson[];
};

export type LessonProgress = {
  completedAt: string | null;
  lastPositionSeconds: number;
};

export type Course = {
  productId: string;
  title: string;
  description: string | null;
  coverUrl: string | null;
  modules: Module[];
  progress: Map<string, LessonProgress>;
};

/** Estado de uma aula para quem está assistindo. */
export type LessonState =
  | { estado: "concluida" }
  | { estado: "atual" }
  | { estado: "disponivel" }
  | { estado: "travada"; motivo: string };

const num = (v: unknown): number | null =>
  v === null || v === undefined ? null : Number(v) || 0;

export async function loadCourse(productId: string, studentId: string | null): Promise<Course | null> {
  const [prodRes, modRes] = await Promise.all([
    supabase
      .from("digital_products")
      .select("id,title,description,cover_url")
      .eq("id", productId)
      .maybeSingle(),
    supabase
      .from("digital_product_modules" as never)
      .select("id,title,description,sort_order" as never)
      .eq("digital_product_id" as never, productId as never)
      .eq("is_active" as never, true as never)
      .order("sort_order" as never),
  ]);

  if (prodRes.error || !prodRes.data) {
    if (prodRes.error) console.error("[course-engine] produto", prodRes.error);
    return null;
  }
  if (modRes.error) {
    console.error("[course-engine] modulos", modRes.error);
    return null;
  }

  const modRows = (modRes.data as unknown as Array<Record<string, unknown>>) || [];
  const moduleIds = modRows.map((m) => String(m.id));

  const lessonsRes = moduleIds.length
    ? await supabase
        .from("digital_product_lessons" as never)
        .select(
          "id,module_id,title,description,kind,duration_seconds,unlock_rule,unlock_days,unlock_at,allow_download,require_watermark,counts_for_certificate,sort_order,video_key,file_path" as never,
        )
        .in("module_id" as never, moduleIds as never)
        .eq("is_active" as never, true as never)
        .order("sort_order" as never)
    : { data: [] as unknown, error: null };

  if (lessonsRes.error) {
    console.error("[course-engine] aulas", lessonsRes.error);
    return null;
  }

  const lessonRows = (lessonsRes.data as unknown as Array<Record<string, unknown>>) || [];
  const byModule = new Map<string, Lesson[]>();
  for (const r of lessonRows) {
    const lesson: Lesson = {
      id: String(r.id),
      moduleId: String(r.module_id),
      title: String(r.title || ""),
      description: (r.description as string) || null,
      kind: String(r.kind || "video") as LessonKind,
      durationSeconds: num(r.duration_seconds),
      unlockRule: String(r.unlock_rule || "none") as UnlockRule,
      unlockDays: num(r.unlock_days),
      unlockAt: (r.unlock_at as string) || null,
      allowDownload: r.allow_download !== false,
      requireWatermark: r.require_watermark === true,
      countsForCertificate: r.counts_for_certificate !== false,
      sortOrder: Number(r.sort_order || 0),
      hasVideo: !!r.video_key,
      hasFile: !!r.file_path,
    };
    const arr = byModule.get(lesson.moduleId) || [];
    arr.push(lesson);
    byModule.set(lesson.moduleId, arr);
  }

  const progress = new Map<string, LessonProgress>();
  if (studentId && lessonRows.length) {
    const { data, error } = await supabase
      .from("digital_lesson_progress" as never)
      .select("lesson_id,completed_at,last_position_seconds" as never)
      .eq("student_id" as never, studentId as never)
      .in("lesson_id" as never, lessonRows.map((r) => String(r.id)) as never);
    if (error) console.error("[course-engine] progresso", error);
    for (const r of (data as unknown as Array<Record<string, unknown>>) || []) {
      progress.set(String(r.lesson_id), {
        completedAt: (r.completed_at as string) || null,
        lastPositionSeconds: Number(r.last_position_seconds || 0),
      });
    }
  }

  const prod = prodRes.data as Record<string, unknown>;
  return {
    productId: String(prod.id),
    title: String(prod.title || ""),
    description: (prod.description as string) || null,
    coverUrl: (prod.cover_url as string) || null,
    progress,
    modules: modRows.map((m) => ({
      id: String(m.id),
      title: String(m.title || ""),
      description: (m.description as string) || null,
      sortOrder: Number(m.sort_order || 0),
      lessons: byModule.get(String(m.id)) || [],
    })),
  };
}

/** Todas as aulas do curso, na ordem em que devem ser assistidas. */
export function flatten(course: Course): Lesson[] {
  return course.modules.flatMap((m) => m.lessons);
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Estado de cada aula. Aula travada sempre carrega o motivo — cadeado mudo
 * vira chamado no suporte.
 *
 * `drip` sem data de compra (caso do curso incluso na mensalidade, onde não há
 * linha de compra) libera: melhor abrir demais do que trancar quem pagou.
 */
export function lessonStates(
  course: Course,
  purchasedAt: string | null,
): Map<string, LessonState> {
  const out = new Map<string, LessonState>();
  const ordem = flatten(course);
  let primeiraAberta = true;

  for (let i = 0; i < ordem.length; i++) {
    const l = ordem[i];
    const p = course.progress.get(l.id);

    if (p?.completedAt) {
      out.set(l.id, { estado: "concluida" });
      continue;
    }

    let travada: string | null = null;

    if (l.unlockRule === "sequential" && i > 0) {
      const anterior = ordem[i - 1];
      if (!course.progress.get(anterior.id)?.completedAt) {
        travada = "Conclua a aula anterior";
      }
    } else if (l.unlockRule === "drip" && l.unlockDays && purchasedAt) {
      const abre = new Date(purchasedAt).getTime() + l.unlockDays * DAY_MS;
      const faltam = Math.ceil((abre - Date.now()) / DAY_MS);
      if (faltam > 0) travada = "Libera em " + faltam + (faltam === 1 ? " dia" : " dias");
    } else if (l.unlockRule === "date" && l.unlockAt) {
      if (new Date(l.unlockAt).getTime() > Date.now()) {
        travada = new Date(l.unlockAt).toLocaleString("pt-BR", {
          day: "2-digit",
          month: "2-digit",
          hour: "2-digit",
          minute: "2-digit",
        });
      }
    }

    if (travada) {
      out.set(l.id, { estado: "travada", motivo: travada });
      continue;
    }

    // A primeira aula liberada e não concluída é onde a pessoa está.
    out.set(l.id, primeiraAberta ? { estado: "atual" } : { estado: "disponivel" });
    primeiraAberta = false;
  }

  return out;
}

/** Aula a retomar: a "atual". É o que o botão "Continuar" abre. */
export function proximaAula(course: Course, purchasedAt: string | null): Lesson | null {
  const estados = lessonStates(course, purchasedAt);
  return flatten(course).find((l) => estados.get(l.id)?.estado === "atual") ?? null;
}

export function percentual(course: Course): number {
  const todas = flatten(course);
  if (!todas.length) return 0;
  const feitas = todas.filter((l) => course.progress.get(l.id)?.completedAt).length;
  return Math.round((feitas / todas.length) * 100);
}

/** Marca conclusão e guarda a posição. Escreve só na própria linha (RLS). */
export async function salvarProgresso(
  studentId: string,
  lessonId: string,
  dados: { concluida?: boolean; posicaoSegundos?: number },
): Promise<void> {
  const payload: Record<string, unknown> = {
    student_id: studentId,
    lesson_id: lessonId,
    updated_at: new Date().toISOString(),
  };
  if (dados.concluida !== undefined) {
    payload.completed_at = dados.concluida ? new Date().toISOString() : null;
  }
  if (dados.posicaoSegundos !== undefined) {
    payload.last_position_seconds = Math.max(0, Math.floor(dados.posicaoSegundos));
  }

  const { error } = await supabase
    .from("digital_lesson_progress" as never)
    .upsert(payload as never, { onConflict: "student_id,lesson_id" } as never);
  if (error) throw new Error(error.message);
}
