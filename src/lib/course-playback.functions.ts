import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

/**
 * Entrega protegida de aula.
 *
 * Espelha `getProductDownloadSignedUrl`: a checagem de acesso acontece no
 * SERVIDOR e só depois o link é assinado. O `video_key` nunca chega ao
 * navegador — o que chega é uma URL temporária.
 *
 * Prazo curto de propósito. O link de material dura 60 minutos porque é para
 * baixar; aula é para assistir, então 4 horas cobrem a sessão mais longa sem
 * deixar um link vivo circulando por aí.
 *
 * O que isto NÃO faz, e é honesto dizer: não impede gravação de tela. Nada em
 * navegador impede. O que impede revenda é o link morrer sozinho e a marca
 * d'água identificar quem gravou — a marca é desenhada no player.
 */

const LINK_SEGUNDOS = 4 * 60 * 60;

export type LessonPlayback = {
  url: string;
  titulo: string;
  /** O que o player deve montar: player de vídeo ou leitor de documento. */
  formato: "video" | "documento";
  posicaoSegundos: number;
  duracaoSegundos: number | null;
  marcaDagua: string | null;
  permiteBaixar: boolean;
  capaUrl: string | null;
};

export const getLessonPlayback = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { lessonId: string })
  .handler(async ({ data, context }): Promise<LessonPlayback> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const admin = supabaseAdmin as unknown as {
      from: (t: string) => any;
      storage: { from: (b: string) => any };
      rpc: (f: string, a?: Record<string, unknown>) => Promise<{ data: unknown }>;
    };

    const { data: lesson } = await admin
      .from("digital_product_lessons")
      .select(
        "id, module_id, title, kind, video_key, file_path, thumbnail_key, duration_seconds, allow_download, require_watermark, digital_product_modules!inner(digital_product_id)",
      )
      .eq("id", data.lessonId)
      .maybeSingle();

    if (!lesson) throw new Error("Aula não encontrada");

    // Vídeo mora em `video_key`; ebook, material e link mora em `file_path`.
    // Antes esta função exigia `video_key` sempre, então QUALQUER aula que não
    // fosse vídeo estourava — e o aluno recebia "esta aula ainda não tem vídeo
    // publicado" numa aula que nunca teve vídeo.
    const ehVideo = lesson.kind === "video";
    const chave: string | null = ehVideo ? lesson.video_key : (lesson.file_path || lesson.video_key);
    if (!chave) {
      throw new Error(
        ehVideo
          ? "Esta aula ainda não tem vídeo publicado"
          : "Esta aula ainda não tem material publicado",
      );
    }

    const produtoId = lesson.digital_product_modules?.digital_product_id;
    if (!produtoId) throw new Error("Aula sem curso vinculado");

    const { data: profile } = await admin
      .from("profiles")
      .select("id, name, cpf, role")
      .eq("user_id", context.userId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");

    // A mesma regra que a RLS usa, avaliada aqui como o usuário chamador:
    // comprou, ou é coach adimplente num curso incluso, ou administra o curso.
    const { data: pode } = await admin.rpc("can_view_digital_product_for", {
      _digital_product_id: produtoId,
      _user_id: context.userId,
    });

    if (pode !== true) throw new Error("Você não tem acesso a esta aula");

    // Posição salva, para retomar de onde parou.
    let posicao = 0;
    const { data: student } = await admin
      .from("students")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (student?.id) {
      const { data: prog } = await admin
        .from("digital_lesson_progress")
        .select("last_position_seconds")
        .eq("student_id", student.id)
        .eq("lesson_id", lesson.id)
        .maybeSingle();
      posicao = Number(prog?.last_position_seconds || 0);
    }

    const { data: signed, error } = await admin.storage
      .from("course-videos")
      .createSignedUrl(chave, LINK_SEGUNDOS);
    if (error || !signed) throw new Error(error?.message || "Erro ao liberar a aula");

    // Marca d'água: nome + CPF mascarado. Identifica quem gravou sem expor o
    // documento inteiro na tela.
    let marca: string | null = null;
    if (lesson.require_watermark) {
      const cpf = String(profile.cpf || "").replace(/\D/g, "");
      const mascara = cpf.length === 11 ? "***." + cpf.slice(3, 6) + "." + cpf.slice(6, 9) + "-**" : "";
      marca = [profile.name, mascara].filter(Boolean).join(" · ");
    }

    // Capa da aula: mesmo bucket privado, mesmo tratamento.
    let capaUrl: string | null = null;
    if (lesson.thumbnail_key) {
      const { data: capa } = await admin.storage
        .from("course-videos")
        .createSignedUrl(lesson.thumbnail_key, LINK_SEGUNDOS);
      capaUrl = capa?.signedUrl ?? null;
    }

    return {
      url: signed.signedUrl,
      titulo: String(lesson.title || ""),
      formato: ehVideo ? "video" : "documento",
      posicaoSegundos: posicao,
      duracaoSegundos: lesson.duration_seconds ?? null,
      marcaDagua: marca,
      // Video nunca libera download, mesmo que a coluna diga o contrario.
      // A coluna serve para material de apoio, onde baixar e o objetivo.
      permiteBaixar: lesson.kind !== "video" && lesson.allow_download === true,
      capaUrl,
    };
  });
