import { Link } from "@tanstack/react-router";
import { Download } from "lucide-react";

export function LegalPage({
  title,
  html,
  pdfUrl,
  version,
}: {
  title: string;
  html: string;
  pdfUrl?: string;
  version?: string;
}) {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <div className="mt-4 flex flex-wrap items-start justify-between gap-3">
          <div>
            <h1 className="text-3xl font-bold">{title}</h1>
            {version && (
              <p className="mt-1 text-xs text-white/40">Versão {version}</p>
            )}
          </div>
          {pdfUrl && (
            <a
              href={pdfUrl}
              target="_blank"
              rel="noopener noreferrer"
              download
              className="inline-flex items-center gap-2 rounded-lg border border-primary/40 bg-primary/10 px-4 py-2 text-sm font-medium text-primary transition hover:bg-primary/20"
            >
              <Download className="h-4 w-4" />
              Baixar PDF
            </a>
          )}
        </div>
        <article
          className="legal-prose mt-6 text-white/85 text-[15px] leading-relaxed [&_h1]:hidden [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline [&_.list-item]:my-1 [&_.list-item]:pl-4"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
