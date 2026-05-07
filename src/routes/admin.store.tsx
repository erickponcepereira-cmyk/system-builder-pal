import { createFileRoute } from "@tanstack/react-router";
import { StoreManager } from "@/components/admin/StoreManager";

export const Route = createFileRoute("/admin/store")({
  head: () => ({
    meta: [{ title: "Loja — Admin FitMind Club" }],
  }),
  component: StoreManager,
});
