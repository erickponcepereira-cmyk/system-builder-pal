import { createFileRoute } from "@tanstack/react-router";
import { CreatorCoursesPanel } from "@/components/store/CreatorCoursesPanel";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

export const Route = createFileRoute("/_authenticated/partner_/cursos-teste")({
  component: PartnerCoursesTest,
});

function PartnerCoursesTest() {
  return (
    <TestSurfaceGate>
      <CreatorCoursesPanel role="partner" />
    </TestSurfaceGate>
  );
}
