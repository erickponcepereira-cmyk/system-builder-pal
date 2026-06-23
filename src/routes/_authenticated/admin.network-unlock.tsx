import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
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
  product_ids: string[];
  patent_levels: number[];
};

type Product = { id: string; name: string; type: string };
type Patent = { level: number; key: string; display_name: string };

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
  const [products, setProducts] = useState<Product[]>([]);
  const [patents, setPatents] = useState<Patent[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    setLoading(true);
    const [{ data: r, error: rErr }, { data: p }, { data: pat }] = await Promise.all([
      supabase.from("network_unlock_rules").select("*").order("sort_order", { ascending: true }),
      supabase.from("products").select("id,name,type").eq("is_active", true).order("type").order("name"),
      supabase.from("patent_rules").select("level,key,display_name").eq("is_active", true).order("level"),
    ]);
    if (rErr) toast.error(rErr.message);
    setRules(((r as Rule[]) || []).map((x) => ({ ...x, product_ids: x.product_ids || [], patent_levels: x.patent_levels || [] })));
    setProducts((p as Product[]) || []);
    setPatents((pat as Patent[]) || []);
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
    setRules((rs) => [...rs, { ...(data as Rule), product_ids: [], patent_levels: [] }]);
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
          product_type: (r.product_type || null) as Rule["product_type"] as never,
          required_sales: Number(r.required_sales) || 1,
          is_active: r.is_active,
          sort_order: Number(r.sort_order) || 0,
          description: r.description,
          product_ids: r.product_ids || [],
          patent_levels: r.patent_levels || [],
        } as never).eq("id", r.id);
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
            Configure as metas mensais que o coach precisa atingir para liberar comissões da rede.
            Você pode escolher categoria, produtos específicos e quais patentes contam para cada meta.
          </p>
        </div>
        <div className="flex gap-2">
          <Button onClick={addRule} variant="outline"><Plus className="h-4 w-4 mr-1" /> Nova regra</Button>
          <Button onClick={saveAll} disabled={saving}><Save className="h-4 w-4 mr-1" /> {saving ? "Salvando..." : "Salvar tudo"}</Button>
        </div>
      </div>

      <div className="space-y-3">
        {rules.map((r) => (
          <RuleCard
            key={r.id}
            rule={r}
            products={products}
            patents={patents}
            onUpdate={(patch) => update(r.id, patch)}
            onRemove={() => removeRule(r.id)}
          />
        ))}
        {rules.length === 0 && <p className="text-sm text-white/40">Nenhuma regra. Clique em "Nova regra".</p>}
      </div>

      <div className="mt-6 rounded-lg border border-primary/20 bg-primary/5 p-4 text-xs text-white/70">
        <p className="font-bold text-white mb-1">Como funciona</p>
        <ul className="list-disc pl-5 space-y-1">
          <li>Atingir <strong>qualquer uma</strong> das metas ativas libera as comissões da rede no mês.</li>
          <li>Se você selecionar <strong>produtos específicos</strong>, apenas vendas desses produtos contam para a meta (a categoria é ignorada).</li>
          <li>Se você selecionar <strong>patentes específicas</strong>, a meta só aparece e conta para coaches dessas patentes. Vazio = vale para todas.</li>
          <li>Os valores são multiplicados pela patente do coach: nível 1-3 = base, 4-7 = 2x, 8-12 = 4x.</li>
          <li>"Categoria Geral" (sem produtos selecionados) considera o total de vendas próprias somando todas as categorias.</li>
        </ul>
      </div>
    </div>
  );
}

function RuleCard({ rule, products, patents, onUpdate, onRemove }: {
  rule: Rule;
  products: Product[];
  patents: Patent[];
  onUpdate: (patch: Partial<Rule>) => void;
  onRemove: () => void;
}) {
  const filteredProducts = useMemo(() => {
    if (!rule.product_type) return products;
    return products.filter((p) => p.type === rule.product_type);
  }, [products, rule.product_type]);

  const toggleProduct = (id: string) => {
    const set = new Set(rule.product_ids || []);
    if (set.has(id)) set.delete(id); else set.add(id);
    onUpdate({ product_ids: Array.from(set) });
  };
  const togglePatent = (level: number) => {
    const set = new Set(rule.patent_levels || []);
    if (set.has(level)) set.delete(level); else set.add(level);
    onUpdate({ patent_levels: Array.from(set).sort((a, b) => a - b) });
  };

  return (
    <div className="rounded-lg border border-white/10 bg-white/5 p-4 space-y-3">
      <div className="grid grid-cols-12 gap-3 items-end">
        <label className="col-span-3 text-xs text-white/60">
          <span className="block mb-1">Nome / rótulo</span>
          <input value={rule.label} onChange={(e) => onUpdate({ label: e.target.value })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="col-span-3 text-xs text-white/60">
          <span className="block mb-1">Categoria (filtro)</span>
          <select value={rule.product_type ?? ""} onChange={(e) => onUpdate({ product_type: e.target.value || null })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white">
            {PRODUCT_TYPES.map((p) => <option key={p.value} value={p.value}>{p.label}</option>)}
          </select>
        </label>
        <label className="col-span-2 text-xs text-white/60">
          <span className="block mb-1">Vendas mínimas</span>
          <input type="number" min={1} value={rule.required_sales}
            onChange={(e) => onUpdate({ required_sales: Number(e.target.value) || 1 })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="col-span-1 text-xs text-white/60">
          <span className="block mb-1">Ordem</span>
          <input type="number" value={rule.sort_order}
            onChange={(e) => onUpdate({ sort_order: Number(e.target.value) || 0 })}
            className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
        </label>
        <label className="col-span-2 text-xs text-white/60 flex items-center gap-2 pb-2">
          <input type="checkbox" checked={rule.is_active} onChange={(e) => onUpdate({ is_active: e.target.checked })} />
          <span>Ativa</span>
        </label>
        <div className="col-span-1 flex justify-end">
          <button onClick={onRemove} className="text-red-400 hover:text-red-300">
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-white/70 mb-1">
          Produtos específicos {rule.product_ids.length > 0 && <span className="text-primary">({rule.product_ids.length} selecionado(s))</span>}
        </p>
        <p className="text-[11px] text-white/40 mb-2">Selecione produtos reais. Se vazio, todos os produtos da categoria acima contam.</p>
        <div className="max-h-36 overflow-y-auto rounded border border-white/10 bg-black/30 p-2 grid grid-cols-2 md:grid-cols-3 gap-1">
          {filteredProducts.length === 0 ? <p className="text-xs text-white/40 col-span-full">Nenhum produto ativo.</p> : filteredProducts.map((p) => (
            <label key={p.id} className="flex items-center gap-2 text-xs text-white/80 hover:bg-white/5 rounded px-1 py-0.5 cursor-pointer">
              <input type="checkbox" checked={rule.product_ids.includes(p.id)} onChange={() => toggleProduct(p.id)} />
              <span className="truncate">{p.name}</span>
            </label>
          ))}
        </div>
      </div>

      <div>
        <p className="text-xs font-semibold text-white/70 mb-1">
          Patentes que recebem esta meta {rule.patent_levels.length > 0 && <span className="text-primary">({rule.patent_levels.length} selecionada(s))</span>}
        </p>
        <p className="text-[11px] text-white/40 mb-2">Se vazio, a meta vale para todas as patentes.</p>
        <div className="flex flex-wrap gap-1">
          {patents.map((pat) => {
            const on = rule.patent_levels.includes(pat.level);
            return (
              <button key={pat.level} type="button" onClick={() => togglePatent(pat.level)}
                className={`text-[11px] rounded-full px-2 py-1 border transition ${on ? "bg-primary text-primary-foreground border-primary" : "bg-black/30 text-white/70 border-white/15 hover:border-white/30"}`}>
                {pat.level}. {pat.display_name}
              </button>
            );
          })}
        </div>
      </div>

      <label className="block text-xs text-white/60">
        <span className="block mb-1">Descrição (opcional)</span>
        <input value={rule.description ?? ""} onChange={(e) => onUpdate({ description: e.target.value })}
          className="w-full rounded-md border border-white/10 bg-black/40 px-2 py-1.5 text-sm text-white" />
      </label>
    </div>
  );
}

export const Route = createFileRoute("/_authenticated/admin/network-unlock")({
  head: () => ({ meta: [{ title: "Liberação da Rede — Admin" }] }),
  component: RouteComponent,
});
