import { createFileRoute } from "@tanstack/react-router";
import { useEffect } from "react";
import { Logo } from "@/components/Logo";

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
        position: "fixed",
        inset: 0,
        background: "#0b0707",
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        zIndex: 9999,
      }}
    >
      <Logo className="h-32 w-auto object-contain" alt="FitMind" />
    </div>
  );
}
