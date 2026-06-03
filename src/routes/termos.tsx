import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termos.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/termos")({
  head: () => ({
    meta: [
      { title: "Termos de Uso — FitMind Club" },
      { name: "description", content: "Termos de Uso da Plataforma FitMind Club." },
    ],
  }),
  component: () => <LegalPage title="Termos de Uso" html={html} />,
});
