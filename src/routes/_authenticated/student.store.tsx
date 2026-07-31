import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/student/StorePage";

export const Route = createFileRoute("/_authenticated/student/store")({
  validateSearch: (search: Record<string, unknown>) => ({
    produto: typeof search.produto === "string" ? search.produto : undefined,
  }),
  component: StorePage,
});
