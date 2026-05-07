import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Plus, Edit, Save, X, Package } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/admin/products")({
  component: AdminProducts,
});

type ProductType = "challenge" | "herbalife" | "physical";

interface Product {
  id: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  duration_days: number | null;
  type: ProductType | null;
  status: string | null;
  commission_coach: number | null;
  commission_level1: number | null;
  commission_level2: number | null;
  commission_level3: number | null;
  network_commission_percentage: number | null;
  app_fee_percentage: number | null;
  cost: number | null;
  tax_percentage: number | null;
  card_fee_percentage: number | null;
  marketing_plan: number | null;
  other_costs: number | null;
  feature_calorie_ai?: boolean | null;
  feature_bioimpedance?: boolean | null;
  feature_group_chat?: boolean | null;
  feature_coach_chat?: boolean | null;
  feature_class_schedule?: boolean | null;
  feature_photo_evolution?: boolean | null;
  feature_weight_tracking?: boolean | null;
  feature_store?: boolean | null;
  feature_recipes?: boolean | null;
}

const FEATURES = [
  { key: "feature_calorie_ai", label: "IA de Calorias" },
  { key: "feature_bioimpedance", label: "Bioimpedância" },
  { key: "feature_group_chat", label: "Chat de Grupo" },
  { key: "feature_coach_chat", label: "Chat com Coach" },
  { key: "feature_class_schedule", label: "Aulas ao Vivo" },
  { key: "feature_photo_evolution", label: "Evolução por Foto" },
  { key: "feature_weight_tracking", label: "Acompanhamento de Peso" },
  { key: "feature_store", label: "Loja" },
  { key: "feature_recipes", label: "Receitas" },
] as const;

function AdminProducts() {
  const [products, setProducts] = useState<Product[]>([]);
  const [editing, setEditing] = useState<Product | null>(null);
  const [editTab, setEditTab] = useState<"general" | "financial">("general");
  const [loading, setLoading] = useState(true);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase.from("products").select("*").order("sort_order");
    setProducts((data as Product[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, []);

  const startNew = () => {
    setEditTab("general");
    setEditing({
      id: "",
      name: "",
      description: "",
      price: 197,
      original_price: null,
      duration_days: 30,
      type: "challenge",
      status: "active",
      commission_coach: 50,
      commission_level1: 15,
      commission_level2: 5,
      commission_level3: 3,
      network_commission_percentage: 0,
      app_fee_percentage: 10,
      cost: 0,
      tax_percentage: 0,
      card_fee_percentage: 0,
      marketing_plan: 0,
      other_costs: 0,
    });
  };

  const save = async () => {
    if (!editing) return;
    if (editing.cost !== null && editing.cost !== undefined && Number(editing.cost) > Number(editing.price || 0)) {
      toast.error("Custo não pode ser maior que o preço de venda.");
      setEditTab("financial");
      return;
    }
    const payload = { ...editing };
    let error;
    if (editing.id) {
      ({ error } = await supabase.from("products").update(payload).eq("id", editing.id));
    } else {
      const { id, ...insertPayload } = payload;
      void id;
      ({ error } = await supabase.from("products").insert(insertPayload as never));
    }
    if (error) toast.error("Erro: " + error.message);
    else { toast.success("Produto salvo!"); setEditing(null); load(); }
  };

  const fmt = (n: number) =>
    n.toLocaleString("pt-BR", { style: "currency", currency: "BRL", maximumFractionDigits: 2 });

  if (editing) {
    return (
      <>
        <div className="mb-6 flex items-center justify-between">
          <h1 className="text-2xl font-bold text-white">{editing.id ? "Editar" : "Novo"} produto</h1>
          <div className="flex gap-2">
            <button onClick={() => setEditing(null)} className="flex items-center gap-1.5 rounded-lg bg-white/10 px-4 py-2 text-sm text-white hover:bg-white/20">
              <X className="h-4 w-4" /> Cancelar
            </button>
            <button onClick={save} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
              <Save className="h-4 w-4" /> Salvar
            </button>
          </div>
        </div>

        <div className="mb-4 flex gap-2 border-b border-white/10">
          <button
            onClick={() => setEditTab("general")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${editTab === "general" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"}`}
          >
            Geral
          </button>
          <button
            onClick={() => setEditTab("financial")}
            className={`px-4 py-2 text-sm font-medium border-b-2 transition-colors ${editTab === "financial" ? "border-primary text-primary" : "border-transparent text-white/60 hover:text-white"}`}
          >
            Financeiro
          </button>
        </div>

        {editTab === "general" && (
          <div className="space-y-4">
            <Section title="Informações básicas">
              <Field label="Nome">
                <Input value={editing.name} onChange={(v) => setEditing({ ...editing, name: v })} />
              </Field>
              <Field label="Descrição">
                <textarea
                  value={editing.description || ""}
                  onChange={(e) => setEditing({ ...editing, description: e.target.value })}
                  rows={3}
                  className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
                  style={{ backgroundColor: "#0F0F0F" }}
                />
              </Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label="Preço (R$)">
                  <Input type="number" value={editing.price} onChange={(v) => setEditing({ ...editing, price: Number(v) })} />
                </Field>
                <Field label="Preço original (R$)">
                  <Input type="number" value={editing.original_price || ""} onChange={(v) => setEditing({ ...editing, original_price: v ? Number(v) : null })} />
                </Field>
                <Field label="Duração (dias)">
                  <Input type="number" value={editing.duration_days || 30} onChange={(v) => setEditing({ ...editing, duration_days: Number(v) })} />
                </Field>
                <Field label="Status">
                  <select
                    value={editing.status || "active"}
                    onChange={(e) => setEditing({ ...editing!, status: e.target.value })}
                    className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none"
                    style={{ backgroundColor: "#0F0F0F" }}
                  >
                    <option value="active">Ativo</option>
                    <option value="inactive">Inativo</option>
                  </select>
                </Field>
              </div>
            </Section>

            <Section title="Features inclusas">
              <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2">
                {FEATURES.map((f) => {
                  const enabled = !!editing[f.key as keyof Product];
                  return (
                    <label
                      key={f.key}
                      className="flex items-center gap-3 rounded-lg p-3 cursor-pointer hover:bg-white/5"
                      style={{ backgroundColor: "#0F0F0F" }}
                    >
                      <input
                        type="checkbox"
                        checked={enabled}
                        onChange={(e) => setEditing({ ...editing, [f.key]: e.target.checked } as Product)}
                        className="h-4 w-4 accent-primary"
                      />
                      <span className="text-sm text-white">{f.label}</span>
                    </label>
                  );
                })}
              </div>
            </Section>
          </div>
        )}

        {editTab === "financial" && (
          <div className="space-y-4">
            <Section title="Custos">
              <div className="grid grid-cols-2 lg:grid-cols-3 gap-3">
                <Field label="Custo do produto (R$)">
                  <Input type="number" value={editing.cost ?? 0} onChange={(v) => setEditing({ ...editing, cost: Number(v) })} />
                </Field>
                <Field label="Imposto (%)">
                  <Input type="number" value={editing.tax_percentage ?? 0} onChange={(v) => setEditing({ ...editing, tax_percentage: Number(v) })} />
                </Field>
                <Field label="Taxa da maquininha (%)">
                  <Input type="number" value={editing.card_fee_percentage ?? 0} onChange={(v) => setEditing({ ...editing, card_fee_percentage: Number(v) })} />
                </Field>
                <Field label="Taxa do sistema (%)">
                  <Input type="number" value={editing.app_fee_percentage ?? 0} onChange={(v) => setEditing({ ...editing, app_fee_percentage: Number(v) })} />
                </Field>
                <Field label="Plano de marketing (%)">
                  <Input type="number" value={editing.marketing_plan ?? 0} onChange={(v) => setEditing({ ...editing, marketing_plan: Number(v) })} />
                </Field>
                <Field label="Outros (%)">
                  <Input type="number" value={editing.other_costs ?? 0} onChange={(v) => setEditing({ ...editing, other_costs: Number(v) })} />
                </Field>
              </div>
            </Section>

            <Section title="Comissões (%)">
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-3">
                <Field label="Coach (direto)">
                  <Input type="number" value={editing.commission_coach || 0} onChange={(v) => setEditing({ ...editing, commission_coach: Number(v) })} />
                </Field>
                <Field label="Rede (total)">
                  <Input type="number" value={editing.network_commission_percentage ?? 0} onChange={(v) => setEditing({ ...editing, network_commission_percentage: Number(v) })} />
                </Field>
                <Field label="Linha 1">
                  <Input type="number" value={editing.commission_level1 || 0} onChange={(v) => setEditing({ ...editing, commission_level1: Number(v) })} />
                </Field>
                <Field label="Linha 2">
                  <Input type="number" value={editing.commission_level2 || 0} onChange={(v) => setEditing({ ...editing, commission_level2: Number(v) })} />
                </Field>
                <Field label="Linha 3">
                  <Input type="number" value={editing.commission_level3 || 0} onChange={(v) => setEditing({ ...editing, commission_level3: Number(v) })} />
                </Field>
              </div>
            </Section>

            <Section title="Resumo">
              <SummaryRow editing={editing} />
            </Section>
          </div>
        )}
      </>
    );
  }

  return (
    <>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">Produtos</h1>
          <p className="text-sm text-white/50">Gerenciar desafios, planos e produtos</p>
        </div>
        <button onClick={startNew} className="flex items-center gap-1.5 rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground hover:opacity-90">
          <Plus className="h-4 w-4" /> Novo
        </button>
      </div>

      {loading ? (
        <p className="text-white/50">Carregando...</p>
      ) : products.length === 0 ? (
        <div className="rounded-2xl p-12 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Package className="h-10 w-10 text-white/20 mx-auto mb-3" />
          <p className="text-white/50">Nenhum produto cadastrado.</p>
        </div>
      ) : (
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {products.map((p) => (
            <div key={p.id} className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
              <div className="flex items-start justify-between mb-3">
                <div className="flex-1">
                  <h3 className="text-sm font-bold text-white">{p.name}</h3>
                  <p className="text-[11px] text-white/40 capitalize">{p.type}</p>
                </div>
                <span className={`rounded-full px-2 py-0.5 text-[10px] font-bold ${
                  p.status === "active" ? "bg-success/20 text-success" : "bg-white/10 text-white/40"
                }`}>
                  {p.status}
                </span>
              </div>
              <p className="text-2xl font-bold text-primary mb-1">{fmt(p.price)}</p>
              <p className="text-[11px] text-white/40 mb-3">{p.duration_days} dias</p>
              <div className="grid grid-cols-4 gap-1 text-center text-[10px] text-white/50 mb-3">
                <div><div className="font-bold text-white">{p.commission_coach}%</div>direto</div>
                <div><div className="font-bold text-white">{p.commission_level1}%</div>nv1</div>
                <div><div className="font-bold text-white">{p.commission_level2}%</div>nv2</div>
                <div><div className="font-bold text-white">{p.commission_level3}%</div>nv3</div>
              </div>
              <button onClick={() => setEditing(p)} className="w-full flex items-center justify-center gap-1.5 rounded-lg bg-white/5 px-3 py-2 text-xs font-medium text-white hover:bg-white/10">
                <Edit className="h-3.5 w-3.5" /> Editar
              </button>
            </div>
          ))}
        </div>
      )}
    </>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="rounded-2xl border border-white/5 p-5" style={{ backgroundColor: "#1A1A1A" }}>
      <h2 className="text-sm font-bold text-white mb-4 uppercase tracking-wider">{title}</h2>
      <div className="space-y-3">{children}</div>
    </div>
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

function Input({ value, onChange, type = "text" }: { value: string | number; onChange: (v: string) => void; type?: string }) {
  return (
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="w-full rounded-lg px-3 py-2 text-sm text-white outline-none focus:ring-1 focus:ring-primary"
      style={{ backgroundColor: "#0F0F0F" }}
    />
  );
}
