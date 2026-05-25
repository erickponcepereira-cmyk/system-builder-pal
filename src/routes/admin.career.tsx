import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import {
  Trophy, Gift, Plus, Save, Trash2, X, Loader2, Award, Check,
  Medal, Star, Shield, Gem, Crown, Settings, Plane, UtensilsCrossed,
  RefreshCw, ImageIcon, PackageCheck, Clock
} from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useServerFn } from "@tanstack/react-start";
import {
  listCoachesWithBadges,
  assignBadge,
  revokeBadge,
  BADGE_KEYS,
  type BadgeKey,
} from "@/lib/coach-badges.functions";
import { PatentBadge, type PatentLevel, PATENT_LEVELS } from "@/components/coach/PatentBadge";

export const Route = createFileRoute("/admin/career")({
  head: () => ({ meta: [{ title: "Carreira — Admin" }] }),
  component: AdminCareerPage,
});

type Tab = "plans" | "patents" | "medals" | "challenges" | "deliveries";

function AdminCareerPage() {
  const [tab, setTab] = useState<Tab>("plans");
  const [backfilling, setBackfilling] = useState(false);

  async function handleBackfill() {
    if (!confirm("Recalcular TODO o histórico de pontos a partir das vendas pagas?\n\nIsso vai zerar pontos atuais, rankings mensais e progresso de carreira, e reprocessar tudo. Pode levar alguns segundos.")) return;
    setBackfilling(true);
    try {
      const { data, error } = await supabase.rpc("backfill_career_points" as any);
      if (error) throw error;
      const d = data as { processed?: number; skipped?: number } | null;
      toast.success(`Backfill concluído: ${d?.processed ?? 0} vendas processadas, ${d?.skipped ?? 0} ignoradas.`);
    } catch (e: any) {
      toast.error(e.message || "Falha no backfill");
    } finally {
      setBackfilling(false);
    }
  }

  return (
    <div className="space-y-4">
      <div className="flex items-start justify-between gap-4 flex-wrap">
        <div>
          <h1 className="text-xl font-bold text-white">Carreira</h1>
          <p className="text-xs text-white/50">Planos de pontos, patentes, medalhas, desafios e entregas de recompensas.</p>
        </div>
        <button
          onClick={handleBackfill}
          disabled={backfilling}
          className="flex items-center gap-2 px-3 py-2 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-sm text-white disabled:opacity-50"
          title="Recalcula pontos, rankings e progresso a partir das vendas pagas existentes"
        >
          {backfilling ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          Recalcular histórico
        </button>
      </div>
      <div className="flex flex-wrap gap-1 border-b border-white/10">
        <TabBtn active={tab === "plans"}      onClick={() => setTab("plans")}      icon={Plane}        label="Planos de Carreira" />
        <TabBtn active={tab === "patents"}    onClick={() => setTab("patents")}    icon={Award}        label="Patentes" />
        <TabBtn active={tab === "medals"}     onClick={() => setTab("medals")}     icon={Medal}        label="Medalhas" />
        <TabBtn active={tab === "challenges"} onClick={() => setTab("challenges")} icon={Trophy}       label="Desafios" />
        <TabBtn active={tab === "deliveries"} onClick={() => setTab("deliveries")} icon={PackageCheck} label="Entregas" />
      </div>
      {tab === "plans"      && <PlansTab />}
      {tab === "patents"    && <PatentsTab />}
      {tab === "medals"     && <MedalsTab />}
      {tab === "challenges" && <ChallengesTab />}
      {tab === "deliveries" && <DeliveriesTab />}
    </div>
  );
}

function TabBtn({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Trophy; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-2 px-3 py-2 text-sm border-b-2 -mb-px transition ${
        active ? "border-[#E24B4A] text-white" : "border-transparent text-white/50 hover:text-white"
      }`}>
      <Icon className="h-4 w-4" /> {label}
    </button>
  );
}

// ═══════════════════════════════════════════════════════════
// PLANS TAB — Planos de Carreira (Jantar + Viagem)
// ═══════════════════════════════════════════════════════════
type CareerPlan = {
  id: string;
  name: string;
  description: string | null;
  plan_type: "period" | "monthly_challenge";
  duration_months: number | null;
  min_monthly_points: number;
  required_period_points: number;
  reward_description: string | null;
  reward_details: string | null;
  reward_image_url: string | null;
  reward_value: number | null;
  is_active: boolean | null;
  product_id: string | null;
};

type Product = { id: string; name: string; points_per_sale: number };

function PlansTab() {
  const [plans, setPlans]     = useState<CareerPlan[] | null>(null);
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing]   = useState<CareerPlan | null>(null);
  const [saving, setSaving]     = useState(false);

  const load = async () => {
    const { data } = await supabase
      .from("career_plan_config")
      .select("*")
      .order("created_at");
    setPlans((data as CareerPlan[]) || []);
    const { data: prods } = await supabase
      .from("products")
      .select("id, name, points_per_sale")
      .eq("is_active", true)
      .order("name");
    setProducts((prods as Product[]) || []);
  };

  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.name.trim()) return toast.error("Informe o nome do plano.");
    setSaving(true);
    const { id, ...rest } = editing;
    const payload = { ...rest };
    const { error } = id
      ? await supabase.from("career_plan_config").update(payload as any).eq("id", id)
      : await supabase.from("career_plan_config").insert(payload as any);
    setSaving(false);
    if (error) toast.error(error.message);
    else { toast.success("Plano salvo com sucesso!"); setEditing(null); load(); }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir este plano de carreira?")) return;
    await supabase.from("career_plan_config").delete().eq("id", id);
    load();
  };

  const blankPlan = (type: "period" | "monthly_challenge"): CareerPlan => ({
    id: "", name: type === "monthly_challenge" ? "Novo Desafio Mensal" : "Novo Plano de Período",
    description: "", plan_type: type,
    duration_months: type === "monthly_challenge" ? 1 : 8,
    min_monthly_points: type === "monthly_challenge" ? 300 : 0,
    required_period_points: type === "monthly_challenge" ? 300 : 6000,
    reward_description: "", reward_details: "", reward_image_url: "",
    reward_value: null, is_active: true, product_id: null,
  });

  if (editing) return (
    <PlanForm
      value={editing}
      products={products}
      onChange={setEditing}
      onSave={save}
      onCancel={() => setEditing(null)}
      saving={saving}
    />
  );

  return (
    <div className="space-y-6">
      {/* Contextual info */}
      <div className="rounded-xl p-4 border border-white/10 bg-white/2 text-xs text-white/60 space-y-1">
        <p><strong className="text-white">Como funciona:</strong> Cada produto tem um campo "pontos por venda". Quando uma venda é paga, os pontos vão automaticamente para o coach vendedor.</p>
        <p>Os planos abaixo definem as metas e recompensas. Os dois planos acumulam pontos <strong className="text-white">simultaneamente</strong> — um não cancela o outro.</p>
        <p>Para o <strong className="text-[#E24B4A]">Plano de Período</strong>: se o coach não atingir a meta no tempo definido, os pontos acumulados são zerados e o ciclo reinicia.</p>
      </div>

      {!plans ? (
        <Loader2 className="h-5 w-5 animate-spin text-white/50" />
      ) : (
        <div className="grid gap-4 lg:grid-cols-2">
          {plans.map((plan) => (
            <PlanCard
              key={plan.id}
              plan={plan}
              onEdit={() => setEditing(plan)}
              onDelete={() => del(plan.id)}
            />
          ))}
        </div>
      )}

      <div className="flex gap-2">
        <button
          onClick={() => setEditing(blankPlan("monthly_challenge"))}
          className="flex items-center gap-1.5 rounded-lg bg-white/5 border border-white/10 hover:bg-white/10 px-3 py-2 text-sm text-white"
        >
          <UtensilsCrossed className="h-4 w-4" /> Novo desafio mensal
        </button>
        <button
          onClick={() => setEditing(blankPlan("period"))}
          className="flex items-center gap-1.5 rounded-lg bg-[#E24B4A] px-3 py-2 text-sm font-bold text-white"
        >
          <Plus className="h-4 w-4" /> Novo plano de período
        </button>
      </div>
    </div>
  );
}

function PlanCard({ plan, onEdit, onDelete }: {
  plan: CareerPlan;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const isMonthly = plan.plan_type === "monthly_challenge";
  const icon = isMonthly ? UtensilsCrossed : Plane;
  const IconComp = icon;
  const color = isMonthly ? "#F59E0B" : "#E24B4A";
  const target = isMonthly
    ? `${plan.required_period_points} pts/mês`
    : `${plan.required_period_points} pts em ${plan.duration_months} meses`;

  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-3" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-start gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl flex-shrink-0"
          style={{ backgroundColor: `${color}20` }}>
          <IconComp className="h-5 w-5" style={{ color }} />
        </div>
        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2">
            <h3 className="text-sm font-bold text-white truncate">{plan.name}</h3>
            <span className={`text-[10px] px-2 py-0.5 rounded-full flex-shrink-0 ${plan.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-white/5 text-white/40"}`}>
              {plan.is_active ? "Ativo" : "Inativo"}
            </span>
          </div>
          <p className="text-[11px] text-white/50 mt-0.5">
            {isMonthly ? "Desafio Mensal" : `Plano de ${plan.duration_months} meses`}
          </p>
        </div>
      </div>

      {plan.reward_image_url && (
        <img src={plan.reward_image_url} alt="Prêmio" className="w-full h-32 object-cover rounded-lg" />
      )}

      <div className="space-y-1.5 text-xs">
        <div className="flex items-center justify-between">
          <span className="text-white/50">Meta</span>
          <span className="font-bold" style={{ color }}>{target}</span>
        </div>
        {plan.reward_description && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Prêmio</span>
            <span className="text-white/70 text-right max-w-[60%] truncate">{plan.reward_description}</span>
          </div>
        )}
        {plan.reward_value && (
          <div className="flex items-center justify-between">
            <span className="text-white/50">Valor estimado</span>
            <span className="text-white/70">R$ {Number(plan.reward_value).toLocaleString("pt-BR")}</span>
          </div>
        )}
        {plan.plan_type === "period" && (
          <p className="text-[10px] text-amber-400/70 bg-amber-900/20 rounded-lg px-2 py-1 mt-1">
            ⚠ Pontos zerados se não atingir a meta em {plan.duration_months} meses
          </p>
        )}
      </div>

      <div className="flex gap-2 pt-1">
        <button onClick={onEdit} className="flex-1 rounded-md bg-white/5 hover:bg-white/10 px-3 py-1.5 text-xs text-white">
          Editar
        </button>
        <button onClick={onDelete} className="rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-300 px-3 py-1.5 text-xs text-white/50">
          <Trash2 className="h-3.5 w-3.5" />
        </button>
      </div>
    </div>
  );
}

function PlanForm({ value, products, onChange, onSave, onCancel, saving }: {
  value: CareerPlan;
  products: Product[];
  onChange: (v: CareerPlan) => void;
  onSave: () => void;
  onCancel: () => void;
  saving: boolean;
}) {
  const f = (k: keyof CareerPlan, v: any) => onChange({ ...value, [k]: v });
  const isMonthly = value.plan_type === "monthly_challenge";

  return (
    <div className="rounded-xl border border-white/10 p-5 space-y-4" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-white">{value.id ? "Editar" : "Novo"} plano de carreira</h2>
        <button onClick={onCancel} className="text-white/60 hover:text-white"><X className="h-4 w-4" /></button>
      </div>

      {/* Tipo */}
      <div className="flex gap-2">
        {(["monthly_challenge", "period"] as const).map((t) => (
          <button
            key={t}
            onClick={() => f("plan_type", t)}
            className={`flex-1 rounded-lg border py-2 text-xs font-medium transition ${
              value.plan_type === t
                ? "border-[#E24B4A] bg-[#E24B4A]/10 text-white"
                : "border-white/10 bg-white/5 text-white/50 hover:text-white"
            }`}
          >
            {t === "monthly_challenge" ? "🍽 Desafio Mensal" : "✈ Plano de Período"}
          </button>
        ))}
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FInput label="Nome do plano" value={value.name} onChange={(v) => f("name", v)} className="sm:col-span-2" />

        {isMonthly ? (
          <FInput label="Pontos necessários no mês" type="number" value={value.required_period_points}
            onChange={(v) => f("required_period_points", Number(v))} />
        ) : (
          <>
            <FInput label="Meta de pontos (total no período)" type="number" value={value.required_period_points}
              onChange={(v) => f("required_period_points", Number(v))} />
            <FInput label="Duração (meses)" type="number" value={value.duration_months ?? 8}
              onChange={(v) => f("duration_months", Number(v))} />
          </>
        )}

        <FInput label="Prêmio (descrição curta)" value={value.reward_description || ""}
          onChange={(v) => f("reward_description", v)} className="sm:col-span-2" />

        <FInput label="Valor estimado do prêmio (R$)" type="number" value={value.reward_value ?? ""}
          onChange={(v) => f("reward_value", v === "" ? null : Number(v))} />

        <FInput label="Imagem do prêmio (URL)" value={value.reward_image_url || ""}
          onChange={(v) => f("reward_image_url", v)} />

        {/* Produto vinculado */}
        <label className="block">
          <span className="block text-xs text-white/60 mb-1">Produto vinculado (opcional)</span>
          <select
            value={value.product_id || ""}
            onChange={(e) => f("product_id", e.target.value || null)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A]"
          >
            <option value="">— Sem produto vinculado —</option>
            {products.map((p) => (
              <option key={p.id} value={p.id}>
                {p.name} ({p.points_per_sale} pts/venda)
              </option>
            ))}
          </select>
        </label>

        <label className="flex items-center gap-2 text-sm text-white/70">
          <input type="checkbox" checked={!!value.is_active} onChange={(e) => f("is_active", e.target.checked)} />
          Plano ativo
        </label>

        <label className="block sm:col-span-2">
          <span className="block text-xs text-white/60 mb-1">Descrição completa do plano</span>
          <textarea rows={3} value={value.description || ""} onChange={(e) => f("description", e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white resize-none" />
        </label>

        <label className="block sm:col-span-2">
          <span className="block text-xs text-white/60 mb-1">Detalhes do prêmio (o que está incluso)</span>
          <textarea rows={3} value={value.reward_details || ""} onChange={(e) => f("reward_details", e.target.value)}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white resize-none" />
        </label>
      </div>

      {/* Preview da imagem */}
      {value.reward_image_url && (
        <div className="rounded-xl overflow-hidden border border-white/10">
          <img src={value.reward_image_url} alt="Preview" className="w-full h-40 object-cover" />
        </div>
      )}

      <div className="flex justify-end gap-2 pt-1">
        <button onClick={onCancel} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white">Cancelar</button>
        <button onClick={onSave} disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] px-4 py-1.5 text-sm font-bold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar plano
        </button>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// PATENTS TAB
// ═══════════════════════════════════════════════════════════
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

function PatentsTab() {
  const [rules, setRules]   = useState<PatentRule[]>([]);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      const { data } = await supabase.from("patent_rules").select("*").order("sort_order");
      const existing = (data as PatentRule[]) || [];
      const filled: PatentRule[] = PATENT_LEVELS.map((p) => {
        const found = existing.find((r) => r.patent === p);
        return found || {
          id: "",
          patent: p,
          display_name: p,
          min_direct_students: null,
          min_network_students: null,
          min_monthly_revenue: null,
          min_consecutive_months: null,
          benefits: "",
        };
      });
      setRules(filled);
      setLoading(false);
    })();
  }, []);

  const update = (i: number, patch: Partial<PatentRule>) => {
    setRules((prev) => prev.map((r, idx) => idx === i ? { ...r, ...patch } : r));
  };

  const save = async () => {
    setSaving(true);
    for (let i = 0; i < rules.length; i++) {
      const r = rules[i];
      const payload = {
        patent: r.patent,
        display_name: r.display_name || r.patent,
        badge_color: "#E24B4A",
        badge_icon: "award",
        min_direct_students: r.min_direct_students || null,
        min_network_students: r.min_network_students || null,
        min_monthly_revenue: r.min_monthly_revenue || null,
        min_consecutive_months: r.min_consecutive_months || null,
        benefits: r.benefits || null,
        sort_order: i,
      };
      if (r.id) {
        await supabase.from("patent_rules").update(payload as any).eq("id", r.id);
      } else {
        const { data } = await supabase.from("patent_rules").insert(payload as any).select().single();
        if (data) rules[i].id = (data as any).id;
      }
    }
    setSaving(false);
    toast.success("Patentes salvas com sucesso!");
  };

  if (loading) return <Loader2 className="h-5 w-5 animate-spin text-white/50" />;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">Configure as metas de cada patente. Os benefícios poderão ser adicionados futuramente.</p>
        <button onClick={save} disabled={saving}
          className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] px-4 py-2 text-sm font-bold text-white disabled:opacity-60">
          {saving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Save className="h-3.5 w-3.5" />}
          Salvar patentes
        </button>
      </div>

      <div className="space-y-3">
        {rules.map((rule, i) => (
          <div key={rule.patent} className="rounded-xl border border-white/10 p-4 space-y-3" style={{ backgroundColor: "#161616" }}>
            <div className="flex items-center gap-3">
              <PatentBadge patent={rule.patent} size="md" showName />
            </div>
            <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
              <FInput label="Alunos diretos (mín.)" type="number" value={rule.min_direct_students ?? ""}
                onChange={(v) => update(i, { min_direct_students: v === "" ? null : Number(v) })} />
              <FInput label="Alunos na rede (mín.)" type="number" value={rule.min_network_students ?? ""}
                onChange={(v) => update(i, { min_network_students: v === "" ? null : Number(v) })} />
              <FInput label="Receita mensal mín. (R$)" type="number" value={rule.min_monthly_revenue ?? ""}
                onChange={(v) => update(i, { min_monthly_revenue: v === "" ? null : Number(v) })} />
              <FInput label="Meses consecutivos (mín.)" type="number" value={rule.min_consecutive_months ?? ""}
                onChange={(v) => update(i, { min_consecutive_months: v === "" ? null : Number(v) })} />
            </div>
            <label className="block">
              <span className="block text-xs text-white/60 mb-1">Benefícios (futuramente)</span>
              <textarea rows={2} value={rule.benefits || ""} onChange={(e) => update(i, { benefits: e.target.value })}
                placeholder="Descreva os benefícios desta patente..."
                className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white resize-none" />
            </label>
          </div>
        ))}
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// MEDALS TAB
// ═══════════════════════════════════════════════════════════
const BADGE_META: Record<BadgeKey, { label: string; color: string; description: string; icon: string }> = {
  master_coach:         { label: "Master Coach",          color: "bg-amber-500/20 text-amber-300 border-amber-500/40",    description: "Recebe 10% de comissão cruzada em vendas autorizadas",       icon: "👑" },
  coach_hbl_42:         { label: "Coach HBL 42%",         color: "bg-blue-500/20 text-blue-300 border-blue-500/40",       description: "Acesso aos produtos HBL com margem 42%",                      icon: "💙" },
  coach_hbl_50:         { label: "Coach HBL 50%",         color: "bg-violet-500/20 text-violet-300 border-violet-500/40", description: "Acesso aos produtos HBL com margem 50%",                      icon: "💜" },
  nutritionist_partner: { label: "Nutricionista Parceiro", color: "bg-emerald-500/20 text-emerald-300 border-emerald-500/40", description: "Recebe atribuições automáticas de planos nutricionais", icon: "🥗" },
  council:              { label: "Conselho",               color: "bg-rose-500/20 text-rose-300 border-rose-500/40",       description: "Acesso gratuito a produtos liberados pelo conselho",         icon: "🛡" },
};

function MedalsTab() {
  const [rows, setRows]   = useState<{ id: string; name: string; email: string; badges: { badge_key: string }[] }[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState("");
  const fetchAll = useServerFn(listCoachesWithBadges);
  const grant    = useServerFn(assignBadge);
  const revoke   = useServerFn(revokeBadge);

  const load = async () => {
    setRows(null);
    setError(null);
    try {
      const data = await fetchAll();
      setRows(data as any);
    } catch (e: any) {
      const msg = e?.message || "Erro ao carregar coaches";
      toast.error(msg);
      setError(msg);
      setRows([]);
    }
  };
  useEffect(() => { load(); }, []);

  const toggle = async (coachId: string, badge: BadgeKey, has: boolean) => {
    try {
      if (has) {
        await revoke({ data: { coachId, badge } });
        toast.success("Medalha removida");
      } else {
        await grant({ data: { coachId, badge } });
        toast.success("Medalha atribuída!");
      }
      load();
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  };

  if (!rows && !error) return (
    <div className="flex items-center gap-2 text-white/50">
      <Loader2 className="h-5 w-5 animate-spin" />
      <span className="text-sm">Carregando coaches...</span>
    </div>
  );

  if (error) return (
    <div className="rounded-xl bg-red-500/10 border border-red-500/30 p-4">
      <p className="text-sm text-red-300 font-bold">Erro ao carregar</p>
      <p className="text-xs text-red-300/70 mt-1">{error}</p>
      <button onClick={load} className="mt-3 text-xs text-red-300 underline">Tentar novamente</button>
    </div>
  );

  const filtered = (rows ?? []).filter((r) => {
    const q = filter.toLowerCase().trim();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || r.email.toLowerCase().includes(q);
  });

  return (
    <div className="space-y-4">
      {/* Badge legend */}
      <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {(Object.keys(BADGE_META) as BadgeKey[]).map((k) => (
          <div key={k} className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-xs ${BADGE_META[k].color}`}>
            <span>{BADGE_META[k].icon}</span>
            <div>
              <p className="font-semibold">{BADGE_META[k].label}</p>
              <p className="text-[10px] opacity-70">{BADGE_META[k].description}</p>
            </div>
          </div>
        ))}
      </div>

      <div className="flex items-center gap-3">
        <input
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          placeholder="Buscar coach por nome ou email..."
          className="flex-1 rounded-lg bg-white/5 border border-white/10 px-3 py-2 text-sm text-white outline-none focus:border-[#E24B4A]"
        />
        <span className="text-xs text-white/50 whitespace-nowrap">{filtered.length} coaches</span>
      </div>

      {filtered.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum coach encontrado.</p>
      ) : (
        <div className="space-y-2">
          {filtered.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-3" style={{ backgroundColor: "#161616" }}>
              <div className="mb-2">
                <p className="text-sm font-semibold text-white">{c.name}</p>
                <p className="text-[11px] text-white/40">{c.email}</p>
              </div>
              <div className="flex flex-wrap gap-1.5">
                {(Object.keys(BADGE_META) as BadgeKey[]).map((b) => {
                  const has = c.badges.some((x) => x.badge_key === b);
                  return (
                    <button
                      key={b}
                      onClick={() => toggle(c.id, b, has)}
                      className={`flex items-center gap-1 px-2 py-1 rounded-md text-[11px] font-medium border transition ${
                        has ? BADGE_META[b].color : "bg-white/5 text-white/40 border-white/10 hover:border-white/30"
                      }`}
                    >
                      {has && <Check className="h-3 w-3" />}
                      {BADGE_META[b].icon} {BADGE_META[b].label}
                    </button>
                  );
                })}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// CHALLENGES TAB — Desafios de pontos
// ═══════════════════════════════════════════════════════════
type Challenge = {
  id: string; title: string; description: string | null;
  start_date: string; end_date: string; required_points: number;
  reward_label: string; reward_value: number; reward_image_url: string | null;
  is_active: boolean;
};

const blankChallenge = (): Challenge => ({
  id: "", title: "", description: "",
  start_date: new Date().toISOString().slice(0, 10),
  end_date: new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10),
  required_points: 300, reward_label: "", reward_value: 0, reward_image_url: "", is_active: true,
});

function ChallengesTab() {
  const [items, setItems]   = useState<Challenge[] | null>(null);
  const [editing, setEditing] = useState<Challenge | null>(null);

  const load = async () => {
    const { data } = await supabase.from("career_challenges").select("*").order("end_date", { ascending: false });
    setItems((data as any) || []);
  };
  useEffect(() => { load(); }, []);

  const save = async () => {
    if (!editing) return;
    if (!editing.title.trim() || !editing.reward_label.trim()) return toast.error("Informe título e prêmio.");
    const { id, ...rest } = editing;
    const { error } = id
      ? await supabase.from("career_challenges").update(rest as any).eq("id", id)
      : await supabase.from("career_challenges").insert(rest as any);
    if (error) toast.error(error.message);
    else { toast.success("Desafio salvo!"); setEditing(null); load(); }
  };

  const del = async (id: string) => {
    if (!confirm("Excluir desafio?")) return;
    await supabase.from("career_challenges").delete().eq("id", id);
    load();
  };

  if (editing) return (
    <div className="rounded-xl border border-white/10 p-5 space-y-3" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center justify-between">
        <h2 className="font-bold text-white">{editing.id ? "Editar" : "Novo"} desafio</h2>
        <button onClick={() => setEditing(null)} className="text-white/60"><X className="h-4 w-4" /></button>
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <FInput label="Título" value={editing.title} onChange={(v) => setEditing({ ...editing, title: v })} />
        <FInput label="Meta de pontos" type="number" value={editing.required_points}
          onChange={(v) => setEditing({ ...editing, required_points: Number(v) })} />
        <FInput label="Início" type="date" value={editing.start_date}
          onChange={(v) => setEditing({ ...editing, start_date: v })} />
        <FInput label="Fim" type="date" value={editing.end_date}
          onChange={(v) => setEditing({ ...editing, end_date: v })} />
        <FInput label="Prêmio (descrição)" value={editing.reward_label}
          onChange={(v) => setEditing({ ...editing, reward_label: v })} />
        <FInput label="Valor do prêmio (R$)" type="number" value={editing.reward_value}
          onChange={(v) => setEditing({ ...editing, reward_value: Number(v) })} />
        <FInput label="Imagem do prêmio (URL)" value={editing.reward_image_url || ""}
          onChange={(v) => setEditing({ ...editing, reward_image_url: v })} className="sm:col-span-2" />
        <label className="flex items-center gap-2 text-sm text-white/70 sm:col-span-2">
          <input type="checkbox" checked={editing.is_active}
            onChange={(e) => setEditing({ ...editing, is_active: e.target.checked })} /> Ativo
        </label>
        <label className="block sm:col-span-2">
          <span className="block text-xs text-white/60 mb-1">Descrição</span>
          <textarea rows={3} value={editing.description || ""}
            onChange={(e) => setEditing({ ...editing, description: e.target.value })}
            className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white resize-none" />
        </label>
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button onClick={() => setEditing(null)} className="rounded-md bg-white/5 px-3 py-1.5 text-sm text-white">Cancelar</button>
        <button onClick={save} className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] px-3 py-1.5 text-sm font-bold text-white">
          <Save className="h-3.5 w-3.5" /> Salvar
        </button>
      </div>
    </div>
  );

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <p className="text-xs text-white/50">Desafios com período definido. Os pontos acumulam automaticamente com as vendas pagas.</p>
        <button onClick={() => setEditing(blankChallenge())}
          className="flex items-center gap-1.5 rounded-lg bg-[#E24B4A] px-3 py-2 text-sm font-bold text-white">
          <Plus className="h-4 w-4" /> Novo desafio
        </button>
      </div>
      {!items ? <Loader2 className="h-5 w-5 animate-spin text-white/50" /> : items.length === 0 ? (
        <p className="text-sm text-white/50">Nenhum desafio cadastrado.</p>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {items.map((c) => (
            <div key={c.id} className="rounded-xl border border-white/10 p-4" style={{ backgroundColor: "#161616" }}>
              <div className="flex items-start justify-between">
                <h3 className="text-sm font-bold text-white">{c.title}</h3>
                <span className={`text-[10px] px-2 py-0.5 rounded-full ${c.is_active ? "bg-emerald-900/40 text-emerald-300" : "bg-white/5 text-white/40"}`}>
                  {c.is_active ? "Ativo" : "Inativo"}
                </span>
              </div>
              <p className="text-xs text-white/50 mt-1">{c.start_date} → {c.end_date}</p>
              {c.reward_image_url && (
                <img src={c.reward_image_url} alt="" className="w-full h-20 object-cover rounded-md mt-2" />
              )}
              <div className="mt-2 space-y-1 text-xs">
                <p className="text-white/70">Meta: <strong className="text-[#E24B4A]">{c.required_points} pts</strong></p>
                <p className="text-white/70">Prêmio: {c.reward_label} {c.reward_value > 0 && `· R$ ${Number(c.reward_value).toFixed(2)}`}</p>
              </div>
              <div className="mt-3 flex gap-2">
                <button onClick={() => setEditing(c)} className="flex-1 rounded-md bg-white/5 hover:bg-white/10 px-2 py-1 text-xs text-white">Editar</button>
                <button onClick={() => del(c.id)} className="rounded-md bg-white/5 hover:bg-red-500/20 hover:text-red-300 px-2 py-1 text-xs text-white/70"><Trash2 className="h-3 w-3" /></button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════
// Shared Input component
// ═══════════════════════════════════════════════════════════
function FInput({ label, value, onChange, type = "text", className = "" }: {
  label: string; value: string | number; onChange: (v: string) => void; type?: string; className?: string;
}) {
  return (
    <label className={`block ${className}`}>
      <span className="block text-xs text-white/60 mb-1">{label}</span>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A]"
      />
    </label>
  );
}

// ====================== DELIVERIES TAB ======================

type DeliveryRow = {
  id: string;
  coach_id: string;
  career_plan_id: string;
  accumulated_points: number | null;
  reward_earned_at: string | null;
  reward_delivered: boolean;
  reward_delivered_at: string | null;
  delivery_notes: string | null;
  coach_name: string;
  plan_name: string;
  reward_description: string | null;
  reward_value: number | null;
};

function DeliveriesTab() {
  const [rows, setRows] = useState<DeliveryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<"pending" | "delivered" | "all">("pending");
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notesById, setNotesById] = useState<Record<string, string>>({});

  async function load() {
    setLoading(true);
    const { data, error } = await supabase
      .from("career_plan_progress")
      .select("id, coach_id, career_plan_id, accumulated_points, reward_earned_at, reward_delivered, reward_delivered_at, delivery_notes")
      .eq("reward_earned", true)
      .order("reward_earned_at", { ascending: false });

    if (error) { toast.error("Erro ao carregar entregas"); setLoading(false); return; }
    const list = data ?? [];
    const coachIds = Array.from(new Set(list.map((r) => r.coach_id)));
    const planIds = Array.from(new Set(list.map((r) => r.career_plan_id)));

    const [{ data: coaches }, { data: plans }] = await Promise.all([
      coachIds.length
        ? supabase.from("profiles").select("user_id, name").in("user_id", coachIds)
        : Promise.resolve({ data: [] as { user_id: string; name: string }[] }),
      planIds.length
        ? supabase.from("career_plan_config").select("id, name, reward_description, reward_value").in("id", planIds)
        : Promise.resolve({ data: [] as { id: string; name: string; reward_description: string | null; reward_value: number | null }[] }),
    ]);

    const coachMap = new Map((coaches ?? []).map((c) => [c.user_id, c.name]));
    const planMap = new Map((plans ?? []).map((p) => [p.id, p]));

    setRows(list.map((r) => {
      const plan = planMap.get(r.career_plan_id);
      return {
        ...r,
        coach_name: coachMap.get(r.coach_id) ?? "Coach",
        plan_name: plan?.name ?? "—",
        reward_description: plan?.reward_description ?? null,
        reward_value: plan?.reward_value ?? null,
      };
    }));
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  async function markDelivered(id: string) {
    setBusyId(id);
    const { data: userRes } = await supabase.auth.getUser();
    const { error } = await supabase
      .from("career_plan_progress")
      .update({
        reward_delivered: true,
        reward_delivered_at: new Date().toISOString(),
        reward_delivered_by: userRes.user?.id ?? null,
        delivery_notes: notesById[id] ?? null,
      })
      .eq("id", id);
    setBusyId(null);
    if (error) { toast.error("Erro ao marcar como entregue"); return; }
    toast.success("Recompensa marcada como entregue");
    await load();
  }

  async function undoDelivered(id: string) {
    setBusyId(id);
    const { error } = await supabase
      .from("career_plan_progress")
      .update({ reward_delivered: false, reward_delivered_at: null, reward_delivered_by: null })
      .eq("id", id);
    setBusyId(null);
    if (error) { toast.error("Erro ao reverter entrega"); return; }
    toast.success("Entrega revertida");
    await load();
  }

  const filtered = rows.filter((r) =>
    filter === "all" ? true : filter === "pending" ? !r.reward_delivered : r.reward_delivered,
  );

  const pendingCount = rows.filter((r) => !r.reward_delivered).length;
  const deliveredCount = rows.length - pendingCount;

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <FilterChip active={filter === "pending"} onClick={() => setFilter("pending")} icon={Clock}
          label={`Pendentes (${pendingCount})`} />
        <FilterChip active={filter === "delivered"} onClick={() => setFilter("delivered")} icon={PackageCheck}
          label={`Entregues (${deliveredCount})`} />
        <FilterChip active={filter === "all"} onClick={() => setFilter("all")} icon={Gift}
          label={`Todas (${rows.length})`} />
        <button onClick={load} className="ml-auto flex items-center gap-1 text-xs text-white/60 hover:text-white">
          <RefreshCw className="h-3.5 w-3.5" /> Atualizar
        </button>
      </div>

      {loading ? (
        <div className="flex justify-center py-10"><Loader2 className="h-5 w-5 animate-spin text-white/50" /></div>
      ) : filtered.length === 0 ? (
        <div className="rounded-lg border border-white/10 bg-white/5 px-4 py-8 text-center text-sm text-white/50">
          Nenhuma recompensa nessa categoria.
        </div>
      ) : (
        <div className="space-y-2">
          {filtered.map((r) => (
            <div key={r.id} className="rounded-lg border border-white/10 bg-white/[0.03] p-3">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-2">
                    <span className="text-sm font-semibold text-white">{r.coach_name}</span>
                    <span className="text-xs text-white/40">·</span>
                    <span className="text-xs text-white/60">{r.plan_name}</span>
                    {r.reward_delivered ? (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-medium text-emerald-300">
                        <PackageCheck className="h-3 w-3" /> Entregue
                      </span>
                    ) : (
                      <span className="ml-2 inline-flex items-center gap-1 rounded-full bg-amber-500/15 px-2 py-0.5 text-[10px] font-medium text-amber-300">
                        <Clock className="h-3 w-3" /> Pendente
                      </span>
                    )}
                  </div>
                  <div className="mt-1 text-xs text-white/50">
                    {r.reward_description ?? "—"}
                    {r.reward_value ? <span className="ml-2 text-white/40">R$ {Number(r.reward_value).toLocaleString("pt-BR")}</span> : null}
                  </div>
                  <div className="mt-1 text-[11px] text-white/40">
                    Conquistada em {r.reward_earned_at ? new Date(r.reward_earned_at).toLocaleDateString("pt-BR") : "—"}
                    {r.reward_delivered_at && <> · Entregue em {new Date(r.reward_delivered_at).toLocaleDateString("pt-BR")}</>}
                  </div>
                  {r.delivery_notes && (
                    <div className="mt-2 rounded bg-white/5 px-2 py-1 text-xs text-white/70">
                      Notas: {r.delivery_notes}
                    </div>
                  )}
                </div>
                <div className="flex flex-col items-stretch gap-2 sm:w-72">
                  {!r.reward_delivered && (
                    <input
                      placeholder="Notas (rastreio, comprovante...)"
                      value={notesById[r.id] ?? ""}
                      onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                      className="rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-xs text-white outline-none focus:border-[#E24B4A]"
                    />
                  )}
                  {r.reward_delivered ? (
                    <button
                      onClick={() => undoDelivered(r.id)}
                      disabled={busyId === r.id}
                      className="flex items-center justify-center gap-1 rounded-md border border-white/10 px-3 py-1.5 text-xs text-white/70 hover:bg-white/5 disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <X className="h-3.5 w-3.5" />}
                      Reverter entrega
                    </button>
                  ) : (
                    <button
                      onClick={() => markDelivered(r.id)}
                      disabled={busyId === r.id}
                      className="flex items-center justify-center gap-1 rounded-md bg-[#E24B4A] px-3 py-1.5 text-xs font-semibold text-white hover:bg-[#c83d3c] disabled:opacity-50"
                    >
                      {busyId === r.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                      Marcar como entregue
                    </button>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function FilterChip({ active, onClick, icon: Icon, label }: {
  active: boolean; onClick: () => void; icon: typeof Trophy; label: string;
}) {
  return (
    <button onClick={onClick}
      className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-medium transition ${
        active ? "bg-[#E24B4A] text-white" : "bg-white/5 text-white/60 hover:text-white"
      }`}>
      <Icon className="h-3.5 w-3.5" /> {label}
    </button>
  );
}
