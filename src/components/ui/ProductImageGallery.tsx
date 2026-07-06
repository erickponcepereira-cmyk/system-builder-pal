import { useState } from "react";
import { Loader2, Upload } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  images: string[];
  onChange: (next: string[]) => void;
  folder: string; // storage path prefix under `store-images`
  bucket?: string;
  max?: number;
}

/**
 * Editor de galeria de imagens (capa + carrossel). Uploads múltiplos para o
 * bucket `store-images`. A primeira imagem é a capa exibida em cards.
 */
export function ProductImageGallery({ images, onChange, folder, bucket = "store-images", max = 8 }: Props) {
  const [uploading, setUploading] = useState(false);

  const handleUpload = async (files: FileList | File[]) => {
    const list = Array.from(files);
    if (!list.length) return;
    if (images.length + list.length > max) {
      toast.error(`Máximo de ${max} imagens.`);
      return;
    }
    setUploading(true);
    try {
      const uploaded: string[] = [];
      for (const file of list) {
        const ext = file.name.split(".").pop() || "jpg";
        const path = `${folder.replace(/\/$/, "")}/${crypto.randomUUID()}.${ext}`;
        const { error } = await supabase.storage.from(bucket).upload(path, file, { upsert: false });
        if (error) throw error;
        const { data } = supabase.storage.from(bucket).getPublicUrl(path);
        uploaded.push(data.publicUrl);
      }
      onChange([...images, ...uploaded]);
    } catch (e: unknown) {
      const msg = e instanceof Error ? e.message : String(e);
      toast.error("Erro ao enviar imagem: " + msg);
    } finally {
      setUploading(false);
    }
  };

  const removeAt = (idx: number) => {
    const next = [...images];
    next.splice(idx, 1);
    onChange(next);
  };

  const move = (idx: number, dir: -1 | 1) => {
    const j = idx + dir;
    if (j < 0 || j >= images.length) return;
    const next = [...images];
    [next[idx], next[j]] = [next[j], next[idx]];
    onChange(next);
  };

  return (
    <div>
      <label className="text-xs text-white/60 mb-1 block">
        Imagens ({images.length}) — a primeira é a capa; as demais aparecem no carrossel
      </label>
      <div className="flex flex-wrap items-start gap-2">
        {images.map((url, idx) => (
          <div key={`${url}-${idx}`} className="relative group">
            <div className="h-24 w-24 rounded-lg bg-black/40 border border-white/10 overflow-hidden">
              <img src={url} alt="" className="h-full w-full object-cover" />
            </div>
            {idx === 0 && (
              <span className="absolute left-1 top-1 rounded bg-primary px-1.5 py-0.5 text-[9px] font-bold text-primary-foreground">Capa</span>
            )}
            <div className="absolute inset-x-1 bottom-1 flex justify-between opacity-100 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
              <button type="button" onClick={() => move(idx, -1)} disabled={idx === 0}
                className="rounded bg-black/70 px-1.5 text-[10px] text-white disabled:opacity-30">◀</button>
              <button type="button" onClick={() => move(idx, 1)} disabled={idx === images.length - 1}
                className="rounded bg-black/70 px-1.5 text-[10px] text-white disabled:opacity-30">▶</button>
            </div>
            <button type="button" onClick={() => removeAt(idx)}
              className="absolute -right-1 -top-1 h-5 w-5 rounded-full bg-red-500 text-white text-[10px] font-bold flex items-center justify-center">×</button>
          </div>
        ))}
        {images.length < max && (
          <label className="h-24 w-24 rounded-lg border border-dashed border-white/20 bg-black/20 hover:bg-white/5 flex flex-col items-center justify-center gap-1 cursor-pointer text-white/60">
            {uploading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
            <span className="text-[10px]">{uploading ? "Enviando..." : "Adicionar"}</span>
            <input type="file" accept="image/*" multiple className="hidden"
              onChange={(e) => { if (e.target.files?.length) { handleUpload(e.target.files); e.target.value = ""; } }} />
          </label>
        )}
      </div>
      <p className="text-[10px] text-white/40 mt-1">Recomendado: 1080×1080px (1:1). Envie várias de uma vez.</p>
    </div>
  );
}
