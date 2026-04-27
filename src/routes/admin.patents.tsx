import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { RefreshCw, Save } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { PatentBadge, type PatentLevel, PATENT_LEVELS } from "@/components/coach/PatentBadge";

export const Route = createFileRoute("/admin/patents")({
  component: AdminPatents,
});

interface PatentRule {
  id: string;
  patent: PatentLevel;
  display_name: string;
  min_direct_students: number | null;
  min_network_students: number | null;
  min_monthly_revenue: number | null;
  min_consecutive_months: number | null;
  benefits: string | null;
}

function AdminPatents() {
  const [rules, setRules] = useState<PatentRule[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("patent_rules").select("*").order("sort_order");
      const existing = (data as PatentRule[]) || [];
      // Fill missing patents with defaults
      const filled: PatentRule[] = PATENT_LEVELS.map((p) => {
        const found = existing.find((r) => r.patent === p);
        return found || {
          id: "",
          patent: p,
          display_name: p,
          min_direct_students: 0,
          min_network_students: 0,
          min_monthly_revenue: 0,
          min_consecutive_months: 0,
          benefits: "",
        };
      });
      setRules(filled);
      setLoading(false);
    })();
  }, []);

  const update = (i: number, patch: Partial<PatentRule>) => {
    const next = [...rules];
    next[i] = { ...next[i], ...patch };
    setRules(next);
  };

  const runAutomation = async () => {
    const [rankings, patents] = await Promise.all([
      supabase.rpc("refresh_monthly_rankings" as never, {} as never),
      supabase.rpc("refresh_coach_patents" as never),
    ]);
    if (rankings.error || patents.error) toast.error(rankings.error?.message || patents.error?.message || "Erro ao recalcular");
    else toast.success(`${patents.data || 0} patente(s) atualizada(s)`);
  };

  const saveAll = async () => {
    for (const r of rules) {
      if (r.id) {
        await supabase.from("patent_rules").update({
          display_name: r.display_name,
          min_direct_students: r.min_direct_students,
          min_network_students: r.min_network_students,
          min_monthly_revenue: r.min_monthly_revenue,
          min_consecutive_months: r.min_consecutive_months,
          benefits: r.benefits,
        }).eq("id", r.id);
      } else {
        await supabase.from("patent_rules").insert({
          patent: r.patent,
          display_name: r.display_name,
          badge_color: "#FF6B00",
          badge_icon: "award",
          min_direct_students: r.min_direct_students,
          min_network_students: r.min_network_students,
          min_monthly_revenue: r.min_monthly_revenue,
          min_consecutive_months: r.min_consecutive_months,
          benefits: r.benefits,
        });
      }
    }
    toast.success("Regras salvas!");
  };

  if (loading) return <p className="text-white/50">Carregando...</p>;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Patentes</h1>
          <p className="text-sm text-white/50">Configurar requisitos e recalcular progressão automática</p>
        </div>
        <div className="flex gap-2">
          <button onClick={runAutomation} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
            <RefreshCw className="h-4 w-4" /> Recalcular
          </button>
          <button onClick={saveAll} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Save className="h-4 w-4" /> Salvar todas
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={r.patent} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center gap-3 mb-4">
              <PatentBadge patent={r.patent} size="md" showName={false} />
              <input
                type="text"
                value={r.display_name}
                onChange={(e) => update(i, { display_name: e.target.value })}
                className="text-base font-bold text-white bg-transparent outline-none border-b border-white/10 focus:border-primary"
              />
            </div>
            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <NumField label="Alunos diretos" value={r.min_direct_students} onChange={(v) => update(i, { min_direct_students: v })} />
              <NumField label="Alunos na rede" value={r.min_network_students} onChange={(v) => update(i, { min_network_students: v })} />
              <NumField label="Receita mensal (R$)" value={r.min_monthly_revenue} onChange={(v) => update(i, { min_monthly_revenue: v })} />
              <NumField label="Meses consecutivos" value={r.min_consecutive_months} onChange={(v) => update(i, { min_consecutive_months: v })} />
            </div>
            <div className="mt-3">
              <label className="block text-[11px] text-white/60 mb-1.5">Benefícios</label>
              <textarea
                value={r.benefits || ""}
                onChange={(e) => update(i, { benefits: e.target.value })}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                style={{ backgroundColor: "#0F0F0F" }}
              />
            </div>
          </div>
        ))}
      </div>
    </>
  );
}

function NumField({ label, value, onChange }: { label: string; value: number | null; onChange: (v: number) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5">{label}</label>
      <input
        type="number"
        value={value || 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
        style={{ backgroundColor: "#0F0F0F" }}
      />
    </div>
  );
}
