import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termo-profissional.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_PDF_URL, TERMS_TITLE, TERMS_VERSION } from "@/lib/terms";

export const Route = createFileRoute("/termos-profissional")({
  head: () => ({
    meta: [
      { title: "Termo de Adesão — Profissional FitMind" },
      { name: "description", content: "Termo de Adesão, Participação, Uso da Plataforma, Responsabilidade Técnica, Ética Profissional, Proteção de Dados, Atendimentos e Atuação como Profissional FitMind." },
    ],
  }),
  component: () => (
    <LegalPage
      title={TERMS_TITLE.profissional}
      html={html}
      pdfUrl={TERMS_PDF_URL.profissional}
      version={TERMS_VERSION.profissional}
    />
  ),
});
