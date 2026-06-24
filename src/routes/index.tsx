import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";

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

  return (
    <div
      style={{
        width: "100vw",
        height: "100vh",
        background: "#0b0707",
      }}
    />
  );
}
