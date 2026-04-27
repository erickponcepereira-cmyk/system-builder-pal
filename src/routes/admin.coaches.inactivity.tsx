import { createFileRoute } from "@tanstack/react-router";
import { AlertTriangle, Ban, Clock, Search, UserCheck } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";

export const Route = createFileRoute("/admin/coaches/inactivity")({
  component: CoachInactivityPage,
});

const riskyCoaches = [
  { name: "Ricardo Mendes", days: 68, students: 23, coaches: 4, upline: "Carlos Souza", status: "critical" },
  { name: "Marina Rocha", days: 34, students: 12, coaches: 1, upline: "Patrícia Lima", status: "attention" },
];

function CoachInactivityPage() {
  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Gestão de Inatividade</h1>
        <p className="text-sm text-white/50">Acompanhe coaches em atenção, críticos e bloqueados</p>
      </div>

      <div className="mb-5 grid gap-3 sm:grid-cols-3">
        {[
          { label: "Em atenção", value: 1, icon: Clock, color: "text-yellow-400" },
          { label: "Críticos", value: 1, icon: AlertTriangle, color: "text-orange-400" },
          { label: "Bloqueados", value: 0, icon: Ban, color: "text-red-400" },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center justify-between">
              <p className="text-xs text-white/50">{card.label}</p>
              <card.icon className={`h-5 w-5 ${card.color}`} />
            </div>
            <p className="mt-2 text-3xl font-bold text-white">{card.value}</p>
          </div>
        ))}
      </div>

      <div className="space-y-4">
        {riskyCoaches.map((coach) => (
          <article key={coach.name} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex flex-col gap-4 lg:flex-row lg:items-start lg:justify-between">
              <div className="flex gap-3">
                <div className="flex h-12 w-12 items-center justify-center rounded-full bg-primary/20 text-lg font-bold text-primary">
                  {coach.name.charAt(0)}
                </div>
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <h2 className="font-bold text-white">{coach.name}</h2>
                    <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${coach.status === "critical" ? "bg-red-500/15 text-red-300" : "bg-yellow-500/15 text-yellow-300"}`}>
                      {coach.days} dias inativo
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-white/50">
                    Alunos diretos: {coach.students} | Coaches na equipe: {coach.coaches}
                  </p>
                  <p className="text-xs text-white/40">Upline natural: {coach.upline}</p>
                </div>
              </div>

              <div className="w-full lg:max-w-md">
                <label className="text-xs text-white/50">Transferir equipe para</label>
                <div className="mt-2 flex gap-2">
                  <div className="relative flex-1">
                    <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-white/30" />
                    <Input placeholder="Buscar coach..." className="border-white/10 bg-white/5 pl-9 text-white" />
                  </div>
                  <Button>
                    <UserCheck className="mr-2 h-4 w-4" /> Transferir
                  </Button>
                </div>
                <p className="mt-2 text-[11px] text-primary">Sugestão: {coach.upline} ✓</p>
              </div>
            </div>

            <div className="mt-4 flex flex-wrap gap-2 border-t border-white/5 pt-4">
              <Button size="sm" variant="outline" className="border-white/10 text-white/70">Transferir para {coach.upline}</Button>
              <Button size="sm" variant="outline" className="border-white/10 text-white/70">Dar mais 30 dias</Button>
              <Button size="sm" variant="destructive">Bloquear conta agora</Button>
            </div>
          </article>
        ))}
      </div>
    </>
  );
}
