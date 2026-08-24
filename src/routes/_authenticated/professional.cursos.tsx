import { createFileRoute } from "@tanstack/react-router";
import { CreatorCoursesPanel } from "@/components/store/CreatorCoursesPanel";

/** Cursos do profissional. Mesma tela do parceiro; a RLS separa os dois. */
export const Route = createFileRoute("/_authenticated/professional/cursos")({
  component: ProfessionalCourses,
});

function ProfessionalCourses() {
  return <CreatorCoursesPanel role="professional" />;
}
