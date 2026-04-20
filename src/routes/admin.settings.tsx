import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Save, Plane } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/settings")({
  component: AdminSettings,
});

interface CareerPlan {
  id: string;
  name: string;
  description: string | null;
  duration_months: number | null;
  min_monthly_students: number | null;
  must_be_top_seller: boolean | null;
  reward_value: number | null;
  reward_description: string | null;
  reward_details: string | null;
  is_active: boolean | null;
}

function AdminSettings() {
  const [plan, setPlan] = useState<CareerPlan | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("career_plan_config")
        .select("*").eq("is_active", true).limit(1).maybeSingle();
      setPlan((data as CareerPlan) || {
        id: "",
        name: "Plano de Carreira",
        description: "Recompensa para coaches que mantêm rede ativa",
        duration_months: 6,
        min_monthly_students: 100,
        must_be_top_seller: true,
        reward_value: 6000,
        reward_description: "Viagem com tudo pago",
        reward_details: "Viagem ao Nordeste 🌴",
        is_active: true,
      });
      setLoading(false);
    })();
  }, []);

  const save = async () => {
    if (!plan) return;
    let error;
    if (plan.id) {
      ({ error } = await supabase.from("career_plan_config").update({
        name: plan.name,
        description: plan.description,
        duration_months: plan.duration_months,
        min_monthly_students: plan.min_monthly_students,
        must_be_top_seller: plan.must_be_top_seller,
        reward_value: plan.reward_value,
        reward_description: plan.reward_description,
        reward_details: plan.reward_details,
      }).eq("id", plan.id));
    } else {
      const { id, ...payload } = plan;
      void id;
      ({ error } = await supabase.from("career_plan_config").insert(payload as never));
    }
    if (error) toast.error("Erro: " + error.message);
    else toast.success("Plano salvo!");
  };

  if (loading || !plan) return <p className="text-white/50">Carregando...</p>;

  return (
    <>
      <div className="mb-6">
        <h1 className="text-2xl font-bold text-white">Configurações</h1>
        <p className="text-sm text-white/50">Plano de carreira e recompensas</p>
      </div>

      <div className="rounded-2xl border border-white/5 p-5 max-w-3xl" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 mb-4">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-primary/15">
            <Plane className="h-4 w-4 text-primary" />
          </div>
          <h2 className="text-base font-bold text-white">Plano de Carreira</h2>
        </div>

        <div className="space-y-3">
          <Field label="Nome">
            <input type="text" value={plan.name} onChange={(e) => setPlan({ ...plan, name: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
          </Field>
          <Field label="Descrição">
            <textarea value={plan.description || ""} onChange={(e) => setPlan({ ...plan, description: e.target.value })} rows={2} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
          </Field>
          <div className="grid grid-cols-2 gap-3">
            <Field label="Meses consecutivos exigidos">
              <input type="number" value={plan.duration_months || 6} onChange={(e) => setPlan({ ...plan, duration_months: Number(e.target.value) })} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
            </Field>
            <Field label="Mínimo de alunos/mês">
              <input type="number" value={plan.min_monthly_students || 100} onChange={(e) => setPlan({ ...plan, min_monthly_students: Number(e.target.value) })} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
            </Field>
            <Field label="Valor da recompensa (R$)">
              <input type="number" value={plan.reward_value || 0} onChange={(e) => setPlan({ ...plan, reward_value: Number(e.target.value) })} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
            </Field>
            <Field label="Descrição da recompensa">
              <input type="text" value={plan.reward_description || ""} onChange={(e) => setPlan({ ...plan, reward_description: e.target.value })} className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none" style={{ backgroundColor: "#0F0F0F" }} />
            </Field>
          </div>
          <label className="flex items-center gap-3 rounded-lg p-3 cursor-pointer" style={{ backgroundColor: "#0F0F0F" }}>
            <input type="checkbox" checked={!!plan.must_be_top_seller} onChange={(e) => setPlan({ ...plan, must_be_top_seller: e.target.checked })} className="h-4 w-4 accent-primary" />
            <span className="text-sm text-white">Exigir ser top vendedor da unidade</span>
          </label>
        </div>

        <button onClick={save} className="mt-5 flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground">
          <Save className="h-4 w-4" /> Salvar
        </button>
      </div>
    </>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block text-[11px] text-white/60 mb-1.5">{label}</label>
      {children}
    </div>
  );
}
