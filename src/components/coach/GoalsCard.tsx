import { useEffect, useState } from "react";
import { Target, TrendingUp, Users, Phone, Pencil, X, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

type GoalsRow = {
  new_students: number;
  renewals: number;
  prospections: number;
  revenue: number;
};

const DEFAULTS: GoalsRow = { new_students: 15, renewals: 18, prospections: 50, revenue: 6000 };

interface Props {
  coachId?: string;
}

export function GoalsCard({ coachId }: Props) {
  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [goals, setGoals] = useState<GoalsRow>(DEFAULTS);
  // Current month progress (placeholder values for now — wire to real metrics later)
  const [progress] = useState({ new_students: 8, renewals: 12, prospections: 24, revenue: 3680 });

  const monthIso = new Date().toISOString().slice(0, 7) + "-01";

  useEffect(() => {
    if (!coachId) return;
    (async () => {
      const { data } = await supabase
        .from("coach_goals" as never)
        .select("new_students,renewals,prospections,revenue")
        .eq("coach_id" as never, coachId as never)
        .eq("reference_month" as never, monthIso as never)
        .maybeSingle();
      if (data) setGoals(data as GoalsRow);
    })();
  }, [coachId, monthIso]);

  async function save() {
    if (!coachId) {
      toast.error("Coach não identificado — recarregue a página e tente novamente.");
      return;
    }
    setSaving(true);
    const { error } = await supabase
      .from("coach_goals" as never)
      .upsert({
        coach_id: coachId,
        reference_month: monthIso,
        ...goals,
      } as never, { onConflict: "coach_id,reference_month" } as never);
    setSaving(false);
    if (error) {
      console.error("[GoalsCard] save error:", error);
      toast.error(`Não foi possível salvar: ${error.message || "erro desconhecido"}`);
      return;
    }
    toast.success("Metas atualizadas");
    setEditing(false);
  }


  const items = [
    { key: "new_students" as const, label: "Novos alunos", current: progress.new_students, target: goals.new_students, icon: Users },
    { key: "renewals" as const, label: "Renovações", current: progress.renewals, target: goals.renewals, icon: TrendingUp },
    { key: "prospections" as const, label: "Prospecções", current: progress.prospections, target: goals.prospections, icon: Phone },
    { key: "revenue" as const, label: "Receita (R$)", current: progress.revenue, target: goals.revenue, icon: Target, money: true },
  ];

  const overallPercent = Math.round(
    (items.reduce((s, g) => s + Math.min(g.current / Math.max(1, g.target), 1), 0) / items.length) * 100,
  );

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
            {overallPercent}% concluído
          </span>
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
          const fmt = (n: number) =>
            g.money
              ? n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 0 })
              : n.toString();
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
                  <span className="text-xs font-bold text-white">
                    {fmt(g.current)} <span className="text-white/40">/ {fmt(g.target)}</span>
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
