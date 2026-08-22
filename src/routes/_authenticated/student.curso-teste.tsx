import { createFileRoute } from "@tanstack/react-router";
import { CoursePlayer } from "@/components/store/CoursePlayer";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

/** Curso semeado por docs/propostas/2026-08-22-curso-formacao-coach.sql */
const CURSO_FORMACAO_COACH = "c0a5e000-0000-4000-a000-000000000001";

export const Route = createFileRoute("/_authenticated/student/curso-teste")({
  validateSearch: (s: Record<string, unknown>): { curso?: string } =>
    typeof s.curso === "string" ? { curso: s.curso } : {},
  component: StudentCourseTest,
});

function StudentCourseTest() {
  const { curso } = Route.useSearch();
  return (
    <TestSurfaceGate>
      <CoursePlayer productId={curso || CURSO_FORMACAO_COACH} />
    </TestSurfaceGate>
  );
}
