import { createFileRoute, Link } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";
import { InstallAppButton } from "@/components/InstallAppButton";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMind" },
      {
        name: "description",
        content:
          "Plataforma de gestão, produtividade e integração com Google Agenda para sincronização de compromissos e eventos.",
      },
      { property: "og:title", content: "FitMind" },
      {
        property: "og:description",
        content:
          "Plataforma de gestão, produtividade e integração com Google Agenda para sincronização de compromissos e eventos.",
      },
      { property: "og:url", content: "https://fitmindclub.lovable.app/" },
      { property: "og:type", content: "website" },
    ],
    links: [{ rel: "canonical", href: "https://fitmindclub.lovable.app/" }],
  }),
  component: Index,
});

function Index() {
  console.log("[INDEX] mounted");
  useEffect(() => {
    return () => {
      console.log("[INDEX] unmounted");
    };
  }, []);
  return null;
}
