import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { ArrowLeft } from "lucide-react";
import { UnifiedStorePage } from "@/components/store/UnifiedStorePage";
import { TestSurfaceGate } from "@/components/store/TestSurfaceGate";

export const Route = createFileRoute("/_authenticated/coach/loja-teste")({
  component: CoachTestStore,
});

function CoachTestStore() {
  const navigate = useNavigate();
  return (
    <TestSurfaceGate>
      <div className="mx-auto flex min-h-screen w-full max-w-[430px] flex-col bg-background">
        <header className="sticky top-0 z-30 flex items-center gap-2 border-b border-border bg-sidebar/95 px-4 py-3 backdrop-blur-xl">
          <button
            type="button"
            onClick={() => navigate({ to: "/coach" })}
            className="inline-flex items-center gap-1.5 text-xs font-semibold text-sidebar-foreground"
          >
            <ArrowLeft className="h-4 w-4" /> Painel do coach
          </button>
        </header>
        <UnifiedStorePage audience="coach" />
      </div>
    </TestSurfaceGate>
  );
}
