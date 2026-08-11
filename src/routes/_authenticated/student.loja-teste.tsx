import { createFileRoute } from "@tanstack/react-router";
import { UnifiedStorePage } from "@/components/store/UnifiedStorePage";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

export const Route = createFileRoute("/_authenticated/student/loja-teste")({
  component: StudentTestStore,
});

function StudentTestStore() {
  return (
    <TestSurfaceGate>
      <UnifiedStorePage audience="student" />
    </TestSurfaceGate>
  );
}
