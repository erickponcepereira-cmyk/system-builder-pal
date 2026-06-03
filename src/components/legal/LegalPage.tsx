import { Link } from "@tanstack/react-router";

export function LegalPage({ title, html }: { title: string; html: string }) {
  return (
    <main className="min-h-screen bg-[#050505] text-white">
      <div className="mx-auto max-w-3xl px-5 py-10">
        <Link to="/" className="text-sm text-primary hover:underline">
          ← Voltar
        </Link>
        <h1 className="mt-4 mb-6 text-3xl font-bold">{title}</h1>
        <article
          className="legal-prose text-white/85 text-[15px] leading-relaxed [&_h1]:hidden [&_p]:my-3 [&_ul]:my-3 [&_ul]:list-disc [&_ul]:pl-6 [&_ol]:my-3 [&_ol]:list-decimal [&_ol]:pl-6 [&_strong]:text-white [&_h2]:mt-8 [&_h2]:mb-3 [&_h2]:text-xl [&_h2]:font-semibold [&_h3]:mt-6 [&_h3]:mb-2 [&_h3]:text-lg [&_h3]:font-semibold [&_a]:text-primary [&_a]:underline"
          dangerouslySetInnerHTML={{ __html: html }}
        />
      </div>
    </main>
  );
}
