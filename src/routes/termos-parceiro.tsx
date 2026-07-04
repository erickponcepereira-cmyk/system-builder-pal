import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termo-parceiro.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";
import { TERMS_PDF_URL, TERMS_TITLE, TERMS_VERSION } from "@/lib/terms";

export const Route = createFileRoute("/termos-parceiro")({
  head: () => ({
    meta: [
      { title: "Termo de Adesão — Empresa Parceira FitMind" },
      { name: "description", content: "Termo de Adesão, Parceria Comercial, Uso da Plataforma, Marketplace, SaaS, ERP Fiscal, Carteira Interna, Repasses, Responsabilidade Operacional e Participação no Ecossistema FitMind." },
    ],
  }),
  component: () => (
    <LegalPage
      title={TERMS_TITLE.parceiro}
      html={html}
      pdfUrl={TERMS_PDF_URL.parceiro}
      version={TERMS_VERSION.parceiro}
    />
  ),
});
