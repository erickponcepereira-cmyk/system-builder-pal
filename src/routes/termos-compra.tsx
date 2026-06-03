import { createFileRoute } from "@tanstack/react-router";
import html from "@/content/legal/termos-compra.html?raw";
import { LegalPage } from "@/components/legal/LegalPage";

export const Route = createFileRoute("/termos-compra")({
  head: () => ({
    meta: [
      { title: "Termos de Compra — FitMind Club" },
      { name: "description", content: "Termos e Condições de Pedidos e Compras da Plataforma FitMind Club." },
    ],
  }),
  component: () => <LegalPage title="Termos de Compra" html={html} />,
});
