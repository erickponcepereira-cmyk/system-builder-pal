import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/student/StorePage";

export const Route = createFileRoute("/_authenticated/student/store")({
  validateSearch: (search: Record<string, unknown>): { produto?: string } =>
    typeof search.produto === "string" ? { produto: search.produto } : {},
  component: StudentStorePage,
});

function StudentStorePage() {
  const { produto } = Route.useSearch();
  return <StorePage requestedProductId={produto} />;
}
