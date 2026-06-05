import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, RefreshCw, Save, Trash2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/patents")({
  component: AdminPatents,
});

interface PatentRule {
  id: string;
  key: string;
  display_name: string;
  description: string | null;
  badge_color: string | null;
  badge_icon: string | null;
  image_url: string | null;
  required_revenue: number;
  time_window_months: number;
  min_own_sales_pct: number;
  max_team_sales_pct: number;
  vp_max_pct: number | null;
  ve_max_pct: number | null;
  phase: number | null;
  level: number;
  sort_order: number;
  benefits: string | null;
  is_active: boolean;
}

const blank = (): PatentRule => ({
  id: "",
  key: `coach_custom_${Date.now()}`,
  display_name: "Nova patente",
  description: "",
  badge_color: "#FF4230",
  badge_icon: "trophy",
  image_url: null,
  required_revenue: 0,
  time_window_months: 1,
  min_own_sales_pct: 100,
  max_team_sales_pct: 0,
  vp_max_pct: 100,
  ve_max_pct: 0,
  phase: 1,
  level: 99,
  sort_order: 999,
  benefits: "",
  is_active: true,
});


function AdminPatents() {
  const [rules, setRules] = useState<PatentRule[]>([]);
  const [loading, setLoading] = useState(true);

  const reload = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("patent_rules")
      .select("id,key,display_name,description,badge_color,badge_icon,image_url,required_revenue,time_window_months,min_own_sales_pct,max_team_sales_pct,vp_max_pct,ve_max_pct,phase,level,sort_order,benefits,is_active" as never)
      .not("key", "is", null)
      .eq("is_active", true)
      .order("level");
    setRules(((data as unknown as PatentRule[]) || []).map((r) => ({
      ...r,
      required_revenue: Number(r.required_revenue) || 0,
      time_window_months: Number(r.time_window_months) || 1,
      min_own_sales_pct: Number(r.min_own_sales_pct) || 0,
      max_team_sales_pct: Number(r.max_team_sales_pct) || 0,
      vp_max_pct: r.vp_max_pct == null ? null : Number(r.vp_max_pct),
      ve_max_pct: r.ve_max_pct == null ? null : Number(r.ve_max_pct),
      phase: r.phase == null ? null : Number(r.phase),
      level: Number(r.level) || 0,
      sort_order: Number(r.sort_order) || 0,
    })));
    setLoading(false);
  };


  useEffect(() => { reload(); }, []);

  const update = (i: number, patch: Partial<PatentRule>) => {
    const next = [...rules];
    next[i] = { ...next[i], ...patch };
    setRules(next);
  };

  const add = () => setRules([...rules, blank()]);

  const removeRow = async (r: PatentRule, i: number) => {
    if (!confirm(`Remover patente "${r.display_name}"?`)) return;
    if (r.id) {
      const { error } = await supabase.from("patent_rules").update({ is_active: false }).eq("id", r.id);
      if (error) { toast.error(error.message); return; }
    }
    setRules(rules.filter((_, idx) => idx !== i));
    toast.success("Patente removida");
  };

  const saveAll = async () => {
    for (const r of rules) {
      const payload = {
        key: r.key,
        display_name: r.display_name,
        description: r.description ?? "",
        badge_color: r.badge_color ?? "#FF4230",
        badge_icon: r.badge_icon ?? "trophy",
        required_revenue: r.required_revenue,
        time_window_months: r.time_window_months,
        min_own_sales_pct: r.min_own_sales_pct,
        max_team_sales_pct: r.max_team_sales_pct,
        level: r.level,
        sort_order: r.sort_order,
        benefits: r.benefits ?? "",
        is_active: r.is_active,
      };
      if (r.id) {
        await supabase.from("patent_rules").update(payload).eq("id", r.id);
      } else {
        await supabase.from("patent_rules").insert(payload);
      }
    }
    toast.success("Regras salvas!");
    reload();
  };

  if (loading) return <p className="text-white/50">Carregando...</p>;

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Sistema de Carreira</h1>
          <p className="text-sm text-white/50">Configure as 12 patentes oficiais ou crie novas ilimitadamente</p>
        </div>
        <div className="flex gap-2">
          <button onClick={add} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
            <Plus className="h-4 w-4" /> Nova patente
          </button>
          <button onClick={reload} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm font-bold text-white hover:bg-white/15">
            <RefreshCw className="h-4 w-4" /> Recarregar
          </button>
          <button onClick={saveAll} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
            <Save className="h-4 w-4" /> Salvar todas
          </button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((r, i) => (
          <div key={r.id || i} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-center gap-3 mb-4">
              <div className="flex h-10 w-10 items-center justify-center rounded-xl"
                style={{ backgroundColor: `${r.badge_color || "#FF4230"}25`, border: `1px solid ${r.badge_color || "#FF4230"}55` }}>
                <span className="text-xs font-bold" style={{ color: r.badge_color || "#FF4230" }}>N{r.level}</span>
              </div>
              <input
                type="text"
                value={r.display_name}
                onChange={(e) => update(i, { display_name: e.target.value })}
                className="text-base font-bold text-white bg-transparent outline-none border-b border-white/10 focus:border-primary flex-1"
              />
              <button onClick={() => removeRow(r, i)} className="text-white/40 hover:text-red-400">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3 mb-3">
              <TextField label="Chave (única)" value={r.key} onChange={(v) => update(i, { key: v })} />
              <TextField label="Cor (#hex)" value={r.badge_color || ""} onChange={(v) => update(i, { badge_color: v })} />
            </div>

            <div className="mb-3">
              <label className="block text-[11px] text-white/60 mb-1.5">Descrição / requisito</label>
              <textarea
                value={r.description || ""}
                onChange={(e) => update(i, { description: e.target.value })}
                rows={2}
                className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                style={{ backgroundColor: "#0F0F0F" }}
              />
            </div>

            <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
              <NumField label="Nível (ordem)" value={r.level} onChange={(v) => update(i, { level: v, sort_order: 100 + v })} />
              <NumField label="Faturamento alvo (R$)" value={r.required_revenue} onChange={(v) => update(i, { required_revenue: v })} step={100} />
              <NumField label="Prazo (meses)" value={r.time_window_months} onChange={(v) => update(i, { time_window_months: v })} />
              <NumField label="% mín. próprias" value={r.min_own_sales_pct} onChange={(v) => update(i, { min_own_sales_pct: v, max_team_sales_pct: 100 - v })} />
            </div>

            <div className="mt-2 text-[11px] text-white/40">
              Máximo de {(100 - r.min_own_sales_pct).toFixed(0)}% vindo da equipe (calculado automaticamente)
            </div>

            <div className="mt-3">
              <label className="block text-[11px] text-white/60 mb-1.5">Benefícios</label>
              <textarea
                value={r.benefits || ""}
                onChange={(e) => update(i, { benefits: e.target.value })}
                rows={2}
                placeholder="Cadastrado manualmente pelo administrador"
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

function NumField({ label, value, onChange, step = 1 }: { label: string; value: number | null; onChange: (v: number) => void; step?: number }) {
  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5">{label}</label>
      <input
        type="number"
        step={step}
        value={value ?? 0}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
        style={{ backgroundColor: "#0F0F0F" }}
      />
    </div>
  );
}

function TextField({ label, value, onChange }: { label: string; value: string; onChange: (v: string) => void }) {
  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
        style={{ backgroundColor: "#0F0F0F" }}
      />
    </div>
  );
}
