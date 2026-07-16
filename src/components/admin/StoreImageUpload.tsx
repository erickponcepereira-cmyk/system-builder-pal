import { useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Upload, Loader2, X } from "lucide-react";
import { toast } from "sonner";
import { useImageCrop } from "@/components/ui/ImageCropProvider";

interface Props {
  value: string | null | undefined;
  onChange: (url: string | null) => void;
  folder?: string;
  className?: string;
  placeholder?: string;
}

/**
 * Upload de imagem para a loja com recorte 1:1 obrigatório.
 * Bucket: store-images (público). Recomendado até 2MB.
 */
export function StoreImageUpload({ value, onChange, folder = "store", className, placeholder = "Imagem" }: Props) {
  const ref = useRef<HTMLInputElement>(null);
  const [busy, setBusy] = useState(false);
  const { cropToBlob } = useImageCrop();

  const handleFile = async (file: File) => {
    if (file.size > 5 * 1024 * 1024) {
      toast.error("Imagem muito grande (máx 5MB)");
      return;
    }
    const cropped = await cropToBlob(file, { title: "Ajustar imagem do produto" });
    if (!cropped) return;
    setBusy(true);
    try {
      const isPng = cropped.type === "image/png";
      const ext = isPng ? "png" : "jpg";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage.from("store-images").upload(path, cropped, {
        cacheControl: "3600",
        upsert: false,
        contentType: cropped.type,
      });
      if (error) throw error;
      const { data } = supabase.storage.from("store-images").getPublicUrl(path);
      onChange(data.publicUrl);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e.message || "Erro ao enviar imagem");
    } finally {
      setBusy(false);
    }
  };


  return (
    <div className={`flex items-center gap-2 ${className || ""}`}>
      <input
        ref={ref}
        type="file"
        accept="image/*"
        className="hidden"
        onChange={(e) => {
          const f = e.target.files?.[0];
          if (f) handleFile(f);
          e.target.value = "";
        }}
      />
      {value ? (
        <div className="flex items-center gap-1">
          <img src={value} alt="" className="h-10 w-10 rounded-lg object-cover border border-white/10" />
          <button
            type="button"
            onClick={() => onChange(null)}
            className="rounded p-1 text-white/60 hover:bg-white/10 hover:text-red-400"
            title="Remover"
          >
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}
      <button
        type="button"
        onClick={() => ref.current?.click()}
        disabled={busy}
        className="flex items-center gap-1.5 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-xs text-white/80 hover:bg-white/10 disabled:opacity-50"
        title="Recomendado: 400x400px, até 2MB"
      >
        {busy ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
        {value ? "Trocar" : placeholder}
      </button>
    </div>
  );
}
