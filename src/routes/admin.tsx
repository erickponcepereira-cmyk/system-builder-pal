import { createFileRoute } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";

export const Route = createFileRoute("/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FitChain" },
      { name: "description", content: "Painel administrativo FitChain." },
    ],
  }),
  component: AdminShell,
});
