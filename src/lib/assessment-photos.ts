/**
 * Fotos da avaliação corporal.
 *
 * Antes as fotos eram gravadas como base64 dentro da coluna `photos` (jsonb) da
 * tabela coach_body_assessments. Com celulares novos isso gerava linhas de vários
 * MB, estourando o statement timeout do banco ("Could not query the database for
 * the schema cache").
 *
 * Agora a foto é reduzida, enviada para o bucket privado `evolution-photos` e
 * apenas o CAMINHO do arquivo é gravado no banco. Registros antigos em base64
 * continuam funcionando na exibição.
 */
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export const ASSESSMENT_PHOTO_KEYS = ["front", "back", "rightSide", "leftSide"] as const;
export type AssessmentPhotoKey = (typeof ASSESSMENT_PHOTO_KEYS)[number];
export type AssessmentPhotos = Partial<Record<AssessmentPhotoKey, string | undefined>>;

const BUCKET = "evolution-photos";
const MAX_SIDE = 1080;
const QUALITY = 0.75;
/** Limite de segurança para o campo `photos` (texto) antes de salvar. */
export const MAX_PHOTOS_JSON_BYTES = 200 * 1024;

export type PhotoProgress = "compressing" | "uploading";

const signedCache = new Map<string, { url: string; exp: number }>();

export function isInlinePhoto(value?: string | null): boolean {
  return !!value && (value.startsWith("data:") || value.startsWith("blob:") || value.startsWith("http"));
}

function targetSize(w: number, h: number) {
  const scale = Math.min(1, MAX_SIDE / Math.max(w, h));
  return { w: Math.max(1, Math.round(w * scale)), h: Math.max(1, Math.round(h * scale)) };
}

async function encode(source: CanvasImageSource, w: number, h: number): Promise<Blob> {
  const canvas = document.createElement("canvas");
  canvas.width = w;
  canvas.height = h;
  const ctx = canvas.getContext("2d");
  if (!ctx) throw new Error("Não foi possível processar a imagem neste navegador.");
  ctx.drawImage(source, 0, 0, w, h);
  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob((b) => resolve(b), "image/jpeg", QUALITY),
  );
  if (!blob || blob.size === 0) throw new Error("Falha ao processar a imagem. Tente outra foto.");
  return blob;
}

/**
 * Reduz a imagem para no máximo 1080px no maior lado e comprime em JPEG.
 * Usa o redimensionamento nativo do decodificador (createImageBitmap com
 * resizeWidth/resizeHeight) para não carregar fotos de 50MP inteiras na memória
 * de celulares mais fracos.
 */
export async function downscaleImage(file: File | Blob): Promise<Blob> {
  if (typeof createImageBitmap === "function") {
    try {
      const probe = await createImageBitmap(file);
      const { w, h } = targetSize(probe.width, probe.height);
      probe.close?.();
      let bitmap: ImageBitmap;
      try {
        bitmap = await createImageBitmap(file, {
          resizeWidth: w,
          resizeHeight: h,
          resizeQuality: "medium",
        });
      } catch {
        bitmap = await createImageBitmap(file);
      }
      try {
        return await encode(bitmap, w, h);
      } finally {
        bitmap.close?.();
      }
    } catch {
      /* fallback abaixo */
    }
  }
  const img = await loadImageElement(file);
  const { w, h } = targetSize(img.naturalWidth || img.width, img.naturalHeight || img.height);
  return encode(img, w, h);
}

async function loadImageElement(file: File | Blob): Promise<HTMLImageElement> {
  const url = URL.createObjectURL(file);
  try {
    return await new Promise<HTMLImageElement>((resolve, reject) => {
      const img = new Image();
      img.onload = () => resolve(img);
      img.onerror = () => reject(new Error("Não foi possível ler a imagem."));
      img.src = url;
    });
  } finally {
    setTimeout(() => URL.revokeObjectURL(url), 10_000);
  }
}

/** Envia a foto para o storage e devolve o caminho gravável no banco. */
export async function uploadAssessmentPhoto(
  file: File | Blob,
  onProgress?: (stage: PhotoProgress) => void,
): Promise<string> {
  onProgress?.("compressing");
  const blob = await downscaleImage(file);
  const { data: userData } = await supabase.auth.getUser();
  const uid = userData.user?.id;
  if (!uid) throw new Error("Sessão expirada. Entre novamente para anexar fotos.");
  onProgress?.("uploading");
  let lastError: string | null = null;
  for (let attempt = 0; attempt < 3; attempt++) {
    const path = `${uid}/assessments/${crypto.randomUUID()}.jpg`;
    const { error } = await supabase.storage
      .from(BUCKET)
      .upload(path, blob, { contentType: "image/jpeg", upsert: false });
    if (!error) return path;
    lastError = error.message;
    await new Promise((r) => setTimeout(r, 600 * (attempt + 1)));
  }
  throw new Error(lastError || "Não foi possível enviar a foto. Verifique sua conexão.");
}


/** Gera URL exibível: base64/HTTP passam direto, caminhos viram URL assinada. */
export async function resolveAssessmentPhotoUrl(value?: string | null): Promise<string | null> {
  if (!value) return null;
  if (isInlinePhoto(value)) return value;
  const cached = signedCache.get(value);
  if (cached && cached.exp > Date.now()) return cached.url;
  const { data, error } = await supabase.storage.from(BUCKET).createSignedUrl(value, 60 * 60);
  if (error || !data?.signedUrl) return null;
  signedCache.set(value, { url: data.signedUrl, exp: Date.now() + 50 * 60 * 1000 });
  return data.signedUrl;
}

/** Hook: resolve todas as fotos de uma avaliação para URLs exibíveis. */
export function useAssessmentPhotoUrls(photos?: AssessmentPhotos | null): AssessmentPhotos {
  const [urls, setUrls] = useState<AssessmentPhotos>({});
  const signature = ASSESSMENT_PHOTO_KEYS.map((k) => photos?.[k] || "").join("|");

  useEffect(() => {
    let active = true;
    (async () => {
      const out: AssessmentPhotos = {};
      await Promise.all(
        ASSESSMENT_PHOTO_KEYS.map(async (k) => {
          const resolved = await resolveAssessmentPhotoUrl(photos?.[k]);
          if (resolved) out[k] = resolved;
        }),
      );
      if (active) setUrls(out);
    })();
    return () => {
      active = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature]);

  return urls;
}

/** Impede o salvamento de payloads gigantes de foto (causa de timeout no banco). */
export function assertPhotosPayloadSize(photos: unknown): void {
  if (!photos) return;
  const size = JSON.stringify(photos).length;
  if (size > MAX_PHOTOS_JSON_BYTES) {
    throw new Error(
      "As fotos desta avaliação estão em formato antigo e muito pesadas. Remova e anexe novamente as fotos antes de salvar.",
    );
  }
}
