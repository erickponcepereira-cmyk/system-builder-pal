import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termo-aluno.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_PDF_URL, TERMS_TITLE, TERMS_VERSION } from "@/lib/terms";

export const Route = createFileRoute("/termos-aluno")({
  head: () => ({
    meta: [
      { title: "Termo de Adesão — Aluno FitMind" },
      { name: "description", content: "Termo de Adesão, Uso da Plataforma, Participação, Benefícios, Desafios, Saúde, Dados Sensíveis, Aptidão Física e Responsabilidades do Aluno/Cliente FitMind." },
    ],
  }),
  component: () => (
    <LegalPage
      title={TERMS_TITLE.aluno}
      html={html}
      pdfUrl={TERMS_PDF_URL.aluno}
      version={TERMS_VERSION.aluno}
    />
  ),
});
