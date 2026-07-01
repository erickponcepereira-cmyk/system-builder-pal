import { useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Download, FileText, Loader2, Trash2, Upload } from "lucide-react";
import { listProductDownloadsForAdmin, type ProductDownloadRow } from "@/lib/product-downloads.functions";

interface Props { productId: string; }

const MAX_MB = 200;

export function ProductDownloadsManager({ productId }: Props) {
  const [rows, setRows] = useState<ProductDownloadRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const load = async () => {
    setLoading(true);
    try {
      const list = await listProductDownloadsForAdmin({ data: { productId } });
      setRows(list);
    } finally { setLoading(false); }
  };
  useEffect(() => { load(); }, [productId]);

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setUploading(true);
    try {
      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        if (file.size > MAX_MB * 1024 * 1024) {
          alert(`"${file.name}" excede ${MAX_MB}MB e foi ignorado.`);
          continue;
        }
        setProgress(`Enviando ${i + 1}/${files.length}: ${file.name}`);
        const ext = file.name.includes(".") ? file.name.split(".").pop() : "bin";
        const path = `${productId}/${crypto.randomUUID()}.${ext}`;
        const { error: upErr } = await supabase.storage
          .from("product-downloads")
          .upload(path, file, { upsert: false, contentType: file.type || undefined });
        if (upErr) throw upErr;
        const { error: insErr } = await supabase.from("product_downloads").insert({
          product_id: productId,
          name: file.name,
          file_path: path,
          mime_type: file.type || null,
          size_bytes: file.size,
          sort_order: rows.length + i,
        } as never);
        if (insErr) throw insErr;
      }
      await load();
    } catch (e: any) {
      alert("Erro no upload: " + e.message);
    } finally {
      setUploading(false);
      setProgress(null);
      if (inputRef.current) inputRef.current.value = "";
    }
  };

  const remove = async (row: ProductDownloadRow & { file_path?: string }) => {
    if (!confirm(`Excluir "${row.name}"?`)) return;
    // buscar path para deletar do storage
    const { data: full } = await supabase.from("product_downloads").select("file_path").eq("id", row.id).maybeSingle();
    const filePath = (full as any)?.file_path as string | undefined;
    if (filePath) await supabase.storage.from("product-downloads").remove([filePath]);
    await supabase.from("product_downloads").delete().eq("id", row.id);
    load();
  };

  const fmtSize = (b: number | null) => {
    if (!b) return "—";
    if (b < 1024) return `${b} B`;
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-3">
      <div className="mb-2 flex items-center justify-between">
        <span className="text-xs font-semibold text-white/80">Arquivos para download após compra</span>
        <label className={`flex items-center gap-2 rounded-lg bg-primary/20 border border-primary/30 px-3 py-1.5 text-xs text-primary hover:bg-primary/30 cursor-pointer ${uploading ? "opacity-60 pointer-events-none" : ""}`}>
          {uploading ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          {uploading ? "Enviando..." : "Adicionar arquivos"}
          <input ref={inputRef} type="file" multiple className="hidden" onChange={(e) => handleFiles(e.target.files)} />
        </label>
      </div>
      {progress && <p className="mb-2 text-[10px] text-white/50">{progress}</p>}
      <p className="mb-2 text-[10px] text-white/40">Ebooks, PDFs, ZIPs etc. Máx. {MAX_MB}MB por arquivo. O aluno vê o download em <strong>Meus Downloads</strong> após o pagamento confirmado.</p>
      {loading ? (
        <div className="py-4 text-center"><Loader2 className="mx-auto h-4 w-4 animate-spin text-white/40" /></div>
      ) : rows.length === 0 ? (
        <p className="py-3 text-center text-xs text-white/40">Nenhum arquivo anexado.</p>
      ) : (
        <ul className="space-y-1">
          {rows.map((r) => (
            <li key={r.id} className="flex items-center gap-2 rounded-md bg-black/30 px-2 py-1.5 text-xs text-white/80">
              <FileText className="h-3.5 w-3.5 text-primary shrink-0" />
              <span className="truncate flex-1">{r.name}</span>
              <span className="text-white/40 whitespace-nowrap">{fmtSize(r.size_bytes)}</span>
              <button onClick={() => remove(r)} className="rounded p-1 text-red-400 hover:bg-red-500/10" title="Excluir"><Trash2 className="h-3.5 w-3.5" /></button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

export default ProductDownloadsManager;
