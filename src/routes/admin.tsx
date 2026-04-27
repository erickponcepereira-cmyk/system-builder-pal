import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FitMind Club" },
      { name: "description", content: "Painel administrativo FitMind Club." },
    ],
  }),
  component: AdminShell,
});
