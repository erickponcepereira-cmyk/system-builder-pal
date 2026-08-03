import { createFileRoute } from "@tanstack/react-router";
import { StorePage } from "@/components/student/StorePage";

export const Route = createFileRoute("/_authenticated/student/store")({
  validateSearch: (search: Record<string, unknown>): { produto?: string; checkout?: string } => ({
    ...(typeof search.produto === "string" ? { produto: search.produto } : {}),
    ...(search.checkout === "1" || search.checkout === 1 ? { checkout: "1" } : {}),
  }),
  component: StudentStorePage,
});

function StudentStorePage() {
  const { produto, checkout } = Route.useSearch();
  return <StorePage requestedProductId={produto} openCheckout={checkout === "1"} />;
}
