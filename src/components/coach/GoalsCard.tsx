import { Target, TrendingUp, Users, Phone } from "lucide-react";

interface Goal {
  label: string;
  current: number;
  target: number;
  unit?: string;
  icon: typeof Target;
}

export function GoalsCard() {
  const goals: Goal[] = [
    { label: "Novos alunos", current: 8, target: 15, icon: Users },
    { label: "Renovações", current: 12, target: 18, icon: TrendingUp },
    { label: "Prospecções", current: 24, target: 50, icon: Phone },
    { label: "Receita (R$)", current: 3680, target: 6000, unit: "R$", icon: Target },
  ];

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Metas do mês</h3>
          <p className="text-[11px] text-white/50">Abril • 18 dias restantes</p>
        </div>
        <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">
          53% concluído
        </span>
      </div>

      <div className="space-y-3">
        {goals.map((g) => {
          const percent = Math.min((g.current / g.target) * 100, 100);
          const Icon = g.icon;
          const fmt = (n: number) =>
            g.unit === "R$"
              ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
              : n.toString();
          return (
            <div key={g.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-white/50" />
                  <span className="text-xs text-white/70">{g.label}</span>
                </div>
                <span className="text-xs font-bold text-white">
                  {fmt(g.current)} <span className="text-white/40">/ {fmt(g.target)}</span>
                </span>
              </div>
              <div className="h-2 rounded-full overflow-hidden" style={{ backgroundColor: "#252525" }}>
                <div
                  className={`h-full transition-all ${percent >= 100 ? "bg-success" : "bg-primary"}`}
                  style={{ width: `${percent}%` }}
                />
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
