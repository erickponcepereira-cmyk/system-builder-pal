import type { ReactNode } from "react";
import { Loader2, Lock } from "lucide-react";
import { useTestPanelAccess } from "@/lib/test-access";

/**
 * Envoltório das superfícies de teste. Só renderiza os filhos para master
 * admin; para qualquer outra pessoa mostra uma tela neutra, sem revelar o que
 * existe do outro lado.
 */
export function TestSurfaceGate({ children }: { children: ReactNode }) {
  const { allowed, loading } = useTestPanelAccess();

  if (loading) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin" />
      </div>
    );
  }

  if (!allowed) {
    return (
      <div className="flex min-h-[60vh] flex-col items-center justify-center gap-3 p-8 text-center">
        <Lock className="h-6 w-6 text-muted-foreground opacity-50" />
        <p className="text-sm text-muted-foreground">Esta página não está disponível.</p>
      </div>
    );
  }

  return <>{children}</>;
}

export default TestSurfaceGate;
