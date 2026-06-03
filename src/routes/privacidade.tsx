import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/privacidade.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/privacidade")({
  head: () => ({
    meta: [
      { title: "Política de Privacidade — FitMind Club" },
      { name: "description", content: "Política de Privacidade e Proteção de Dados Pessoais da Plataforma FitMind Club." },
    ],
  }),
  component: () => <LegalPage title="Política de Privacidade" html={html} />,
});
