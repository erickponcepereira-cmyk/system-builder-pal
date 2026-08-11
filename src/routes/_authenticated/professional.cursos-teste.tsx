import { createFileRoute } from "@tanstack/react-router";
import { CreatorCoursesPanel } from "@/components/store/CreatorCoursesPanel";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

export const Route = createFileRoute("/_authenticated/professional/cursos-teste")({
  component: ProfessionalCoursesTest,
});

function ProfessionalCoursesTest() {
  return (
    <TestSurfaceGate>
      <CreatorCoursesPanel role="professional" />
    </TestSurfaceGate>
  );
}
