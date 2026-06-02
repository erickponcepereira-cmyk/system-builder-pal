import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Trash2, Plus, Save } from "lucide-react";

type Rule = {
  id: string;
  label: string;
  product_type: string | null;
  required_sales: number;
  is_active: boolean;
  sort_order: number;
  description: string | null;
};

const PRODUCT_TYPES = [
  { value: "", label: "Categoria Geral (qualquer venda)" },
  { value: "challenge", label: "Desafio" },
  { value: "plan_30", label: "Protocolo 30 dias" },
  { value: "protocol_90", label: "Protocolo 90 dias" },
  { value: "digital_course", label: "Curso Digital" },
  { value: "coach_training", label: "Treinamento de Coach" },
  { value: "health_pro_course", label: "Curso de Saúde Pro" },
  { value: "physical", label: "Produto Físico" },
  { value: "herbalife", label: "Herbalife" },
  { value: "enrollment", label: "Matrícula" },
  { value: "room_rental", label: "Aluguel de Sala" },
  { value: "live_class", label: "Aula ao Vivo" },
];

function RouteComponent() {
  const [rules, setRules] = useState<Rule[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from("network_unlock_rules")
      .select("*")
      .order("sort_order", { ascending: true });
    if (error) toast.error(error.message);
    else setRules((data as Rule[]) || []);
    setLoading(false);
  };
  useEffect(() => { load(); }, []);

  const update = (id: string, patch: Partial<Rule>) => {
    setRules((rs) => rs.map((r) => r.id === id ? { ...r, ...patch } : r));
  };

  const addRule = async () => {
    const { data, error } = await supabase
      .from("network_unlock_rules")
      .insert({ label: "Nova regra", product_type: null, required_sales: 1, sort_order: rules.length * 10 + 10 })
      .select().single();
    if (error) { toast.error(error.message); return; }
    setRules((rs) => [...rs, data as Rule]);
  };

  const removeRule = async (id: string) => {
    if (!confirm("Remover esta regra?")) return;
    const { error } = await supabase.from("network_unlock_rules").delete().eq("id", id);
    if (error) { toast.error(error.message); return; }
    setRules((rs) => rs.filter((r) => r.id !== id));
  };

  const saveAll = async () => {
    setSaving(true);
    try {
      for (const r of rules) {
        const { error } = await supabase.from("network_unlock_rules").update({
          label: r.label,
          product_type: r.product_type || null,
          required_sales: Number(r.required_sales) || 1,
          is_active: r.is_active,
          sort_order: Number(r.sort_order) || 0,
          description: r.description,
        }).eq("id", r.id);
        if (error) throw error;
      }
      toast.success("Regras salvas");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Erro ao salvar");
    } finally { setSaving(false); }
  };

  if (loading) return <div className="p-6 text-white/60">Carregando...</div>;

  return (
    <div className="p-6 max-w-5xl">
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Liberação da Rede (Gamificação Mensal)</h1>
          <p className="text-sm text-white/50 mt-1">
            Defina quais categorias e quantas vendas no mês o coach precisa fazer para liberar as comissões da rede.
            As metas são multiplicadas por patente: 1-3 (base), 4-7 (2x), 8-12 (4x). Atingir <strong>qualquer uma</strong> libera o mês inteiro.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addRule} variant="outline"><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
          <Button onClick={saveAll} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar tudo"}</Button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <div key={r.id} className="rounded-lg border border-white/10 bg-white/5 p-4 grid grid-cols-12 gap-3 items-end">
            <label className="col-span-3 text-xs text-white/60">
              <span className="block mb-1">Nome / rótulo</span>
              <input value={r.label} onChange={(e) => update(r.id, { label: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="col-span-3 text-xs text-white/60">
              <span className="block mb-1">Categoria</span>
              <select value={r.product_type ?? ""} onChange={(e) => update(r.id, { product_type: e.target.value || null })}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white">
                {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
              </select>
            </label>
            <label className="col-span-2 text-xs text-white/60">
              <span className="block mb-1">Vendas mínimas</span>
              <input type="number" min={1} value={r.required_sales}
                onChange={(e) => update(r.id, { required_sales: Number(e.target.value) || 1 })}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="col-span-1 text-xs text-white/60">
              <span className="block mb-1">Ordem</span>
              <input type="number" value={r.sort_order}
                onChange={(e) => update(r.id, { sort_order: Number(e.target.value) || 0 })}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            </label>
            <label className="col-span-2 text-xs text-white/60 flex items-center gap-2 pb-2">
              <input type="checkbox" checked={r.is_active} onChange={(e) => update(r.id, { is_active: e.target.checked })} />
              <span>Ativa</span>
            </label>
            <div className="col-span-1 flex justify-end">
              <button onClick={() => removeRule(r.id)} className="text-red-400 hover:text-red-300">
                <Trash2 className="h-4 w-4" />
              </button>
            </div>
            <label className="col-span-12 text-xs text-white/60">
              <span className="block mb-1">Descrição (opcional)</span>
              <input value={r.description ?? ""} onChange={(e) => update(r.id, { description: e.target.value })}
                className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
            </label>
          </div>
        ))}
        {rules.length === 0 && <p className="text-sm text-white/40">Nenhuma regra. Clique em "Nova regra".</p>}
      </div>

      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-white/70">
        <p className="font-bold text-white mb-1">Como funciona</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Cada coach precisa atingir <strong>pelo menos uma</strong> dessas metas dentro do mês (dia 01 até o último dia).</li>
          <li>Os valores são multiplicados pela patente do coach: nível 1-3 = base, 4-7 = 2x, 8-12 = 4x.</li>
          <li>Sem atingir nenhuma meta, as comissões da rede ficam <strong>bloqueadas</strong> para o coach até o próximo mês.</li>
          <li>"Categoria Geral" considera o total de vendas próprias, somando todas as categorias.</li>
        </ul>
      </div>
    </div>
  );
}

export const Route = createFileRoute("/admin/network-unlock")({
  head: () => ({ meta: [{ title: "Liberação da Rede — Admin" }] }),
  component: RouteComponent,
});
