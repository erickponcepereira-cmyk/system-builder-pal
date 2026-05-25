import { useEffect, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { Target, TrendingUp, Users, Phone, Pencil, X, Save, Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { getCoachGoals, saveCoachGoals } from "@/lib/coach-goals.functions";

type GoalsRow = {
  new_students: number;
  renewals: number;
  prospections: number;
  revenue: number;
};

const DEFAULTS: GoalsRow = { new_students: 0, renewals: 0, prospections: 0, revenue: 0 };

interface Props {
  coachId?: string;
  /** Progresso real passado pelo pai (OverviewTab). Se omitido, mostra zero. */
  progress?: GoalsRow;
}

export function GoalsCard({ coachId, progress }: Props) {
  const fetchGoals = useServerFn(getCoachGoals);
  const submitGoals = useServerFn(saveCoachGoals);
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<GoalsRow>(DEFAULTS);
  const [visible, setVisible] = useState(false);

  const currentProgress: GoalsRow = progress ?? { new_students: 0, renewals: 0, prospections: 0, revenue: 0 };

  useEffect(() => {
    let cancelled = false;
    fetchGoals({ data: coachId ? { coachId } : {} })
      .then((r) => {
        if (cancelled) return;
        if (r.goals) setGoals(r.goals as GoalsRow);
      })
      .catch(() => {});
    return () => { cancelled = true; };
  }, [coachId, fetchGoals]);

  async function save() {
    setSaving(true);
    try {
      await submitGoals({ data: { ...goals, ...(coachId ? { coachId } : {}) } });
      toast.success("Metas atualizadas");
      setEditing(false);
    } catch (e: any) {
      console.error("[GoalsCard] save error:", e);
      toast.error(`Não foi possível salvar: ${e?.message || "erro desconhecido"}`);
    } finally {
      setSaving(false);
    }
  }

  const items = [
    { key: "new_students" as const, label: "Novos alunos", current: currentProgress.new_students, target: goals.new_students, icon: Users },
    { key: "renewals" as const, label: "Renovações", current: currentProgress.renewals, target: goals.renewals, icon: TrendingUp },
    { key: "prospections" as const, label: "Prospecções", current: currentProgress.prospections, target: goals.prospections, icon: Phone },
    { key: "revenue" as const, label: "Receita (R$)", current: currentProgress.revenue, target: goals.revenue, icon: Target, money: true },
  ];

  const overallPercent = Math.round(
    (items.reduce((s, g) => s + Math.min(g.current / Math.max(1, g.target), 1), 0) / items.length) * 100,
  );

  const mask = (val: number, money?: boolean) => {
    if (!visible) return "••••";
    return money
      ? val.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
      : val.toString();
  };

  return (
    <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-center justify-between mb-4">
        <div>
          <h3 className="text-sm font-bold text-white">Metas do mês</h3>
          <p className="text-[11px] text-white/50">
            {new Date().toLocaleDateString("pt-BR", { month: "long", year: "numeric" })}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <span className="rounded-full bg-primary/15 px-2.5 py-1 text-[10px] font-bold text-primary">
            {visible ? `${overallPercent}% concluído` : "••% concluído"}
          </span>
          <button
            onClick={() => setVisible((v) => !v)}
            className="rounded-lg bg-white/5 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            title={visible ? "Ocultar valores" : "Mostrar valores"}
          >
            {visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>
          <button
            onClick={() => setEditing((v) => !v)}
            className="rounded-lg bg-white/5 p-1.5 text-white/60 hover:bg-white/10 hover:text-white"
            title={editing ? "Cancelar" : "Editar metas"}
          >
            {editing ? <X className="h-3.5 w-3.5" /> : <Pencil className="h-3.5 w-3.5" />}
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {items.map((g) => {
          const percent = Math.min((g.current / Math.max(1, g.target)) * 100, 100);
          const Icon = g.icon;
          return (
            <div key={g.label}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-1.5">
                  <Icon className="h-3.5 w-3.5 text-white/50" />
                  <span className="text-xs text-white/70">{g.label}</span>
                </div>
                {editing ? (
                  <input
                    type="number"
                    min={0}
                    value={goals[g.key]}
                    onChange={(e) =>
                      setGoals((p) => ({ ...p, [g.key]: Number(e.target.value) || 0 }))
                    }
                    className="w-24 rounded bg-black/40 border border-white/10 px-2 py-0.5 text-right text-xs font-bold text-white"
                  />
                ) : (
                  <span className="text-xs font-bold text-white font-mono">
                    {mask(g.current, g.money)} <span className="text-white/40">/ {mask(g.target, g.money)}</span>
                  </span>
                )}
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

      {editing && (
        <button
          onClick={save}
          disabled={saving}
          className="mt-4 w-full inline-flex items-center justify-center gap-1.5 rounded-lg bg-primary px-3 py-2 text-xs font-bold text-primary-foreground disabled:opacity-50"
        >
          <Save className="h-3.5 w-3.5" />
          {saving ? "Salvando..." : "Salvar metas"}
        </button>
      )}
    </div>
  );
}
