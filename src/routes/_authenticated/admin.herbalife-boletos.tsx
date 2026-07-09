import { createFileRoute, Link } from "@tanstack/react-router";
import { AdminHerbalifeBoletosPanel } from "@/components/shipping/HerbalifeBoletosPanel";
import { ArrowLeft } from "lucide-react";

export const Route = createFileRoute("/_authenticated/admin/herbalife-boletos")({
  component: Page,
  head: () => ({ meta: [{ title: "Boletos Herbalife — Admin" }] }),
});

function Page() {
  return (
    <div className="min-h-screen bg-background pb-20 pt-4">
      <div className="mx-auto max-w-5xl px-4">
        <div className="mb-4 flex items-center gap-3">
          <Link to="/admin" className="rounded-full bg-white/5 p-2 text-white/70 hover:text-white"><ArrowLeft className="h-4 w-4" /></Link>
          <div>
            <h1 className="text-lg font-bold text-white">Boletos Herbalife</h1>
            <p className="text-xs text-white/60">Confirme o pagamento dos boletos enviados pelos parceiros e profissionais.</p>
          </div>
        </div>
        <AdminHerbalifeBoletosPanel />
      </div>
    </div>
  );
}
