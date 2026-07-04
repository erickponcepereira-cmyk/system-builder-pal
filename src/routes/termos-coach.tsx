import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termo-coach.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_PDF_URL, TERMS_TITLE, TERMS_VERSION } from "@/lib/terms";

export const Route = createFileRoute("/termos-coach")({
  head: () => ({
    meta: [
      { title: "Termo de Adesão — Coach FitMind" },
      { name: "description", content: "Termo de Adesão, Participação, Uso da Plataforma, Conduta Comercial, Comissionamento, Mensalidade, Pontuação, Reconhecimentos, Sucessão, Cancelamento e Atuação como Coach FitMind." },
    ],
  }),
  component: () => (
    <LegalPage
      title={TERMS_TITLE.coach}
      html={html}
      pdfUrl={TERMS_PDF_URL.coach}
      version={TERMS_VERSION.coach}
    />
  ),
});
