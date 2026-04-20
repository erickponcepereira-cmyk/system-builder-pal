import { createFileRoute } from "@tanstack/react-router";
import { BarChart3 } from "lucide-react";

export const Route = createFileRoute("/admin/reports")({
  component: AdminReports,
});

function AdminReports() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Relatórios</h1>
        <p className="text-sm text-white/50">Métricas detalhadas e exportação</p>
      </div>
      <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <BarChart3 className="h-10 w-10 text-white/20 mx-auto mb-3" />
        <p className="text-white/70 font-medium">Relatórios em desenvolvimento</p>
        <p className="text-sm text-white/40 mt-1">Em breve: exportação CSV, gráficos de evolução e DRE.</p>
      </div>
    </>
  );
}
