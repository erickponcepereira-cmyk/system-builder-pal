import { createFileRoute, Link } from "@tanstack/react-router";
import { useServerFn } from "@tanstack/react-start";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Download, FileText, Loader2, Package } from "lucide-react";
import { toast } from "sonner";
import { listMyProductDownloads, getProductDownloadSignedUrl } from "@/lib/product-downloads.functions";
import { useState } from "react";

export const Route = createFileRoute("/_authenticated/student/downloads")({
  component: StudentDownloadsPage,
});

function StudentDownloadsPage() {
  const listFn = useServerFn(listMyProductDownloads);
  const signFn = useServerFn(getProductDownloadSignedUrl);
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data, isLoading } = useQuery({
    queryKey: ["my-product-downloads"],
    queryFn: () => listFn(),
  });

  const rows = data || [];
  const grouped = rows.reduce<Record<string, typeof rows>>((acc, r) => {
    const key = r.product_id;
    (acc[key] = acc[key] || []).push(r);
    return acc;
  }, {});

  const download = async (id: string) => {
    setBusyId(id);
    try {
      const { url } = await signFn({ data: { downloadId: id } });
      window.open(url, "_blank");
    } catch (e: any) {
      toast.error(e.message || "Erro ao gerar link");
    } finally {
      setBusyId(null);
    }
  };

  const fmtSize = (b: number | null) => {
    if (!b) return "";
    if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
    return `${(b / 1024 / 1024).toFixed(1)} MB`;
  };

  return (
    <div className="min-h-screen pb-24" style={{ backgroundColor: "#0B0707" }}>
      <header className="sticky top-0 z-10 border-b border-white/5 bg-[#0B0707]/90 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-3xl items-center gap-3">
          <Link to="/student" className="rounded-lg bg-white/5 p-2 text-white/70 hover:bg-white/10">
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <div>
            <h1 className="flex items-center gap-2 text-base font-bold text-white">
              <Download className="h-4 w-4" /> Meus downloads
            </h1>
            <p className="text-[11px] text-white/50">Ebooks e materiais liberados após confirmação do pagamento.</p>
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 py-5">
        {isLoading ? (
          <div className="flex items-center justify-center py-20 text-white/60"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : rows.length === 0 ? (
          <div className="rounded-2xl border border-white/5 bg-white/5 p-8 text-center text-sm text-white/60">
            <Package className="mx-auto mb-3 h-10 w-10 text-white/20" />
            Nenhum arquivo disponível ainda. Assim que você comprar um produto com material anexado, ele aparece aqui.
          </div>
        ) : (
          <div className="space-y-4">
            {Object.entries(grouped).map(([pid, files]) => (
              <section key={pid} className="rounded-2xl border border-white/5 bg-[#141010] p-4">
                <h2 className="mb-3 text-sm font-bold text-white">{files[0]?.product_name || "Produto"}</h2>
                <ul className="space-y-2">
                  {files.map((f) => (
                    <li key={f.id} className="flex items-center gap-3 rounded-xl bg-black/30 p-3">
                      <FileText className="h-5 w-5 text-primary shrink-0" />
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm text-white">{f.name}</p>
                        <p className="text-[10px] text-white/40">{fmtSize(f.size_bytes)}{f.mime_type ? ` · ${f.mime_type}` : ""}</p>
                      </div>
                      <button
                        onClick={() => download(f.id)}
                        disabled={busyId === f.id}
                        className="flex items-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-semibold text-primary-foreground hover:opacity-90 disabled:opacity-60"
                      >
                        {busyId === f.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Download className="h-3.5 w-3.5" />}
                        Baixar
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}
