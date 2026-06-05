import { useRef, useState } from "react";
import { Upload, X, Loader2, ImageIcon } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

interface Props {
  value: string | null;
  onChange: (url: string | null) => void;
  folder: string; // e.g. "patents" or "medals"
  label?: string;
}

export function BadgeImageUploader({ value, onChange, folder, label = "Imagem" }: Props) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [uploading, setUploading] = useState(false);

  const displayUrl = (() => {
    if (!value) return null;
    if (value.startsWith("http")) return value;
    const { data } = supabase.storage.from("career-badges").getPublicUrl(value);
    return data.publicUrl;
  })();

  const handleFile = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split(".").pop() || "png";
      const path = `${folder}/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
      const { error } = await supabase.storage
        .from("career-badges")
        .upload(path, file, { upsert: true, contentType: file.type });
      if (error) throw error;
      onChange(path);
      toast.success("Imagem enviada");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao enviar imagem");
    } finally {
      setUploading(false);
    }
  };

  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5">{label}</label>
      <div className="flex items-center gap-3">
        <div
          className="flex h-16 w-16 items-center justify-center rounded-xl border border-white/10 overflow-hidden shrink-0"
          style={{ backgroundColor: "#0F0F0F" }}
        >
          {displayUrl ? (
            <img src={displayUrl} alt="" className="h-full w-full object-cover" />
          ) : (
            <ImageIcon className="h-6 w-6 text-white/30" />
          )}
        </div>
        <div className="flex flex-col gap-1.5">
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="flex items-center gap-1.5 rounded-lg bg-white/10 px-3 py-1.5 text-xs font-bold text-white hover:bg-white/15 disabled:opacity-50"
          >
            {uploading ? <Loader2 className="h-3 w-3 animate-spin" /> : <Upload className="h-3 w-3" />}
            {value ? "Trocar" : "Anexar imagem"}
          </button>
          {value && (
            <button
              type="button"
              onClick={() => onChange(null)}
              className="flex items-center gap-1 text-[11px] text-white/50 hover:text-red-400"
            >
              <X className="h-3 w-3" /> Remover
            </button>
          )}
        </div>
        <input
          ref={inputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) handleFile(f);
            e.target.value = "";
          }}
        />
      </div>
    </div>
  );
}
