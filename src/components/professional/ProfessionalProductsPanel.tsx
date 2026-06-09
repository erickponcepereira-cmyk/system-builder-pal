import React, { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Loader2, Image as ImageIcon, X, Save, DollarSign, Trash2, Package } from "lucide-react";
import {
  computeFromCharge,
  computeFromReceive,
  COACH_COMMISSION_OPTIONS,
  type CoachCommissionPct,
  type PartnerPriceMode,
} from "@/lib/partnerFinance";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import { CategoryPicker } from "@/components/store/CategoryPicker";

interface ProProduct {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  stock: number | null;
  redemption_instructions: string | null;
  status: string;
  admin_notes: string | null;
  is_active_by_professional: boolean;
  price_input_mode?: "charge" | "receive";
  coach_commission_percentage?: number;
  professional_net_amount?: number;
  coach_commission_amount?: number;
  network_l1_amount?: number;
  network_l2_amount?: number;
  network_l3_amount?: number;
  section_id?: string | null;
  category_id?: string | null;
  is_schedulable?: boolean;
  default_duration_minutes?: number;
  cancellation_window_hours?: number;
}

export default function ProfessionalProductsPanel({ coachId }: { coachId: string }) {
  const [products, setProducts] = useState<ProProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ProProduct> | null>(null);
  const [uploading, setUploading] = useState(false);

  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("professional_products" as never)
      .select("*")
      .eq("coach_id" as never, coachId)
      .order("created_at" as never, { ascending: false });
    setProducts((data as unknown as ProProduct[]) || []);
    setLoading(false);
  };

  useEffect(() => { load(); }, [coachId]);

  const blank = (): Partial<ProProduct> => ({
    coach_id: coachId,
    name: "", description: "", image_url: "", price: 0, stock: null,
    redemption_instructions: "", is_active_by_professional: true,
    price_input_mode: "charge",
    coach_commission_percentage: 10,
    professional_net_amount: 0,
    section_id: null,
    category_id: null,
    is_schedulable: false,
    default_duration_minutes: 30,
    cancellation_window_hours: 24,
  });

  const upload = async (file: File) => {
    setUploading(true);
    const ext = file.name.split(".").pop();
    const path = `professionals/${coachId}/${Date.now()}.${ext}`;
    const { error } = await supabase.storage.from("store-images").upload(path, file, { upsert: true });
    if (error) { toast.error(error.message); setUploading(false); return; }
    const { data } = supabase.storage.from("store-images").getPublicUrl(path);
    setEditing(e => e ? { ...e, image_url: data.publicUrl } : e);
    setUploading(false);
  };

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Informe o nome do produto.");
    const pct = (editing.coach_commission_percentage || 10) as CoachCommissionPct;
    const mode = (editing.price_input_mode || "charge") as PartnerPriceMode;
    const b = mode === "receive"
      ? computeFromReceive(editing.professional_net_amount || 0, pct)
      : computeFromCharge(editing.price || 0, pct);
    if (b.gross <= 0) return toast.error("Informe um valor maior que zero.");
    if (b.partnerNet < 0) return toast.error("Valor insuficiente para cobrir as taxas. Aumente o preço.");

    const payload = {
      ...editing,
      coach_id: coachId,
      price: b.gross,
      professional_net_amount: b.partnerNet,
      coach_commission_amount: b.coachCommission,
      network_l1_amount: b.networkL1,
      network_l2_amount: b.networkL2,
      network_l3_amount: b.networkL3,
      status: "pending" as const,
      admin_notes: null,
    };

    if (editing.id) {
      const { id, ...up } = payload;
      const { error } = await supabase.from("professional_products" as never).update(up as never).eq("id" as never, id!);
      if (error) return toast.error(error.message);
    } else {
      const { error } = await supabase.from("professional_products" as never).insert(payload as never);
      if (error) return toast.error(error.message);
    }
    toast.success("Salvo. Aguardando aprovação do admin.");
    setEditing(null); load();
  };

  const remove = async (id: string) => {
    if (!confirm("Excluir produto?")) return;
    const { error } = await supabase.from("professional_products" as never).delete().eq("id" as never, id);
    if (error) return toast.error(error.message);
    toast.success("Removido"); load();
  };

  const toggleActive = async (p: ProProduct) => {
    const { error } = await supabase
      .from("professional_products" as never)
      .update({ is_active_by_professional: !p.is_active_by_professional } as never)
      .eq("id" as never, p.id);
    if (error) return toast.error(error.message);
    load();
  };

  if (loading) {
    return <div className="flex justify-center py-10"><Loader2 className="h-6 w-6 animate-spin text-primary" /></div>;
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-lg font-bold text-white flex items-center gap-2"><Package className="h-4 w-4" /> Meus produtos</h2>
          <p className="text-[11px] text-white/40">Cada produto passa por aprovação do admin antes de ficar disponível.</p>
        </div>
        <button
          onClick={() => setEditing(blank())}
          className="flex items-center gap-1 rounded-lg bg-primary px-3 py-1.5 text-xs font-bold text-primary-foreground"
        >
          <Plus className="h-3.5 w-3.5" /> Novo
        </button>
      </div>

      {products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Package className="mx-auto h-8 w-8 text-white/30 mb-2" />
          <p className="text-sm text-white/50">Nenhum produto cadastrado ainda.</p>
        </div>
      )}

      <div className="space-y-2">
        {products.map(p => (
          <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
            {p.image_url
              ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} />
              : <div className="h-16 w-16 rounded bg-white/5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(p.status)}`}>{p.status}</span>
              </div>
              <div className="mt-0.5 text-[11px] text-white/60">
                <span className="text-primary font-semibold">R$ {Number(p.price).toFixed(2)}</span>
                {typeof p.professional_net_amount === "number" && p.professional_net_amount > 0 && (
                  <span className="ml-2">• Líquido: <span className="text-green-400">R$ {p.professional_net_amount.toFixed(2)}</span></span>
                )}
                {typeof p.coach_commission_percentage === "number" && (
                  <span className="ml-2">• Coach: {p.coach_commission_percentage}%</span>
                )}
              </div>
              {p.status === "rejected" && p.admin_notes && (
                <p className="text-[10px] text-red-300 mt-1">Obs.: {p.admin_notes}</p>
              )}
              <div className="mt-1.5 flex gap-2">
                <button onClick={() => setEditing(p)} className="text-[11px] text-white/60 hover:text-white">Editar</button>
                <button onClick={() => toggleActive(p)} className="text-[11px] text-white/60 hover:text-white">
                  {p.is_active_by_professional ? "Desativar" : "Ativar"}
                </button>
                <button onClick={() => remove(p.id)} className="text-[11px] text-red-400">
                  <Trash2 className="inline h-3 w-3" />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {editing && (
        <div className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/70 p-2" onClick={() => setEditing(null)}>
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-white">{editing.id ? "Editar" : "Novo"} produto</h3>
              <button onClick={() => setEditing(null)}><X className="h-5 w-5 text-white/60" /></button>
            </div>
            <div className="space-y-3 text-sm">
              <Field label="Nome">
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} className="field-input" />
              </Field>
              <Field label="Descrição">
                <textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="field-input" />
              </Field>
              <Field label="Imagem">
                {editing.image_url ? (
                  <div className="relative">
                    <img src={editing.image_url} className="h-32 w-full rounded object-cover" />
                    <button onClick={() => setEditing({ ...editing, image_url: "" })} className="absolute top-1 right-1 bg-black/70 rounded p-1">
                      <X className="h-3 w-3 text-white" />
                    </button>
                  </div>
                ) : (
                  <label className="flex h-24 cursor-pointer flex-col items-center justify-center gap-1 rounded border border-dashed border-white/20">
                    {uploading ? <Loader2 className="h-5 w-5 animate-spin text-primary" /> : <ImageIcon className="h-5 w-5 text-white/40" />}
                    <span className="text-[10px] text-white/40">Recomendado: 1080×1080px (1:1)</span>
                    <input type="file" accept="image/*" className="hidden" onChange={e => e.target.files?.[0] && upload(e.target.files[0])} />
                  </label>
                )}
              </Field>

              <PaidPricingEditor
                product={editing}
                onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
              />

              <Field label="Estoque (opcional)">
                <input type="number" value={editing.stock ?? ""} onChange={e => setEditing({ ...editing, stock: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" />
              </Field>

              <CategoryPicker
                targetAudience="professional"
                sectionId={editing.section_id}
                categoryId={editing.category_id}
                onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
              />

              <Field label="Instruções de resgate">
                <textarea value={editing.redemption_instructions || ""} onChange={e => setEditing({ ...editing, redemption_instructions: e.target.value })} rows={2} className="field-input" placeholder="Ex: Como o aluno usa o produto após pagar" />
              </Field>

              <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                <label className="flex items-center gap-2 text-xs font-bold text-primary cursor-pointer">
                  <input
                    type="checkbox"
                    checked={!!editing.is_schedulable}
                    onChange={(e) => setEditing({ ...editing, is_schedulable: e.target.checked })}
                  />
                  Produto agendável (consulta / atendimento)
                </label>
                {editing.is_schedulable && (
                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Duração (min)">
                      <input
                        type="number"
                        min={5}
                        max={240}
                        step={5}
                        value={editing.default_duration_minutes ?? 30}
                        onChange={(e) =>
                          setEditing({ ...editing, default_duration_minutes: Number(e.target.value) || 30 })
                        }
                        className="field-input"
                      />
                    </Field>
                    <Field label="Janela cancelar (h)">
                      <input
                        type="number"
                        min={0}
                        max={168}
                        value={editing.cancellation_window_hours ?? 24}
                        onChange={(e) =>
                          setEditing({ ...editing, cancellation_window_hours: Number(e.target.value) || 24 })
                        }
                        className="field-input"
                      />
                    </Field>
                  </div>
                )}
                {editing.is_schedulable && (
                  <p className="text-[10px] text-white/50">
                    Defina seus dias e horários disponíveis na aba <strong>Configurações → Agenda</strong>.
                  </p>
                )}
              </div>
            </div>
            <div className="mt-4 flex gap-2">
              <button onClick={() => setEditing(null)} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-white">Cancelar</button>
              <button onClick={save} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                <Save className="inline h-4 w-4 mr-1" /> Salvar
              </button>
            </div>
          </div>
        </div>
      )}

      <style>{`.field-input { width:100%; border-radius:.375rem; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.1); padding:.5rem .75rem; color:white; font-size:.875rem; }`}</style>
    </div>
  );
}

function PaidPricingEditor({ product, onChange }: { product: Partial<ProProduct>; onChange: (patch: Partial<ProProduct>) => void }) {
  const mode = (product.price_input_mode || "charge") as PartnerPriceMode;
  const pct = (product.coach_commission_percentage || 10) as CoachCommissionPct;
  const [method, setMethod] = useState<"pix" | "card">("card");

  const charge = Number(product.price) || 0;
  const receive = Number(product.professional_net_amount) || 0;

  const breakdown = mode === "receive"
    ? computeFromReceive(receive, pct, method)
    : computeFromCharge(charge, pct, method);

  const updateCharge = (n: number) => onChange({ price: n });
  const updateReceive = (n: number) => {
    const inv = computeFromReceive(n, pct, method);
    onChange({ professional_net_amount: n, price: inv.gross });
  };

  const switchMode = (next: PartnerPriceMode) => {
    if (next === "receive") {
      const b = computeFromCharge(charge, pct, method);
      onChange({ price_input_mode: next, professional_net_amount: Math.max(0, b.partnerNet) });
    } else {
      onChange({ price_input_mode: next, price: breakdown.gross });
    }
  };

  const changePct = (next: CoachCommissionPct) => {
    if (mode === "receive") {
      const inv = computeFromReceive(receive, next, method);
      onChange({ coach_commission_percentage: next, price: inv.gross });
    } else {
      onChange({ coach_commission_percentage: next });
    }
  };

  const changeMethod = (m: "pix" | "card") => {
    setMethod(m);
    if (mode === "receive") {
      const inv = computeFromReceive(receive, pct, m);
      onChange({ price: inv.gross });
    }
  };

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-primary">
        <DollarSign className="h-3.5 w-3.5" /> Financeiro do produto
      </div>

      <div className="flex rounded-lg bg-black/40 p-0.5">
        <button type="button" onClick={() => switchMode("charge")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${mode === "charge" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Quanto cobrar
        </button>
        <button type="button" onClick={() => switchMode("receive")}
          className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${mode === "receive" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
          Quanto receber
        </button>
      </div>

      {mode === "charge" ? (
        <Field label="Preço cobrado do cliente">
          <CurrencyInputBRL value={charge} onChange={updateCharge} />
        </Field>
      ) : (
        <Field label="Quanto você quer receber líquido">
          <CurrencyInputBRL value={receive} onChange={updateReceive} />
          <p className="mt-1 text-[10px] text-white/40">O preço cobrado é aumentado automaticamente para cobrir as taxas (igual simulação de cartão em apps bancários).</p>
        </Field>
      )}

      <div>
        <label className="text-xs text-white/60">Forma de pagamento simulada</label>
        <div className="mt-1 flex rounded-lg bg-black/40 p-0.5">
          <button type="button" onClick={() => changeMethod("pix")}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${method === "pix" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
            PIX 0,99%
          </button>
          <button type="button" onClick={() => changeMethod("card")}
            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${method === "card" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
            Cartão 4,98%
          </button>
        </div>
      </div>

      <div>
        <label className="text-xs text-white/60">Comissão para o coach vendedor (10% a 50%)</label>
        <div className="mt-1 grid grid-cols-5 gap-1.5">
          {COACH_COMMISSION_OPTIONS.map(opt => (
            <button key={opt} type="button" onClick={() => changePct(opt)}
              className={`rounded-lg py-1.5 text-xs font-bold transition ${pct === opt ? "bg-primary text-primary-foreground" : "bg-black/40 text-white/60 hover:text-white"}`}>
              {opt}%
            </button>
          ))}
        </div>
        <p className="mt-1 text-[10px] text-white/40">Essa % é o que vai para o coach que vender o produto. O restante (após taxas) fica com você.</p>
      </div>

      <div className="rounded-lg bg-black/40 p-2.5 text-[11px] space-y-1">
        <BreakdownLine label="Valor cobrado do cliente" value={breakdown.gross} bold />
        <BreakdownLine label={`− Taxa ${method === "pix" ? "PIX (0,99%)" : "cartão (4,98%)"}`} value={-breakdown.paymentFee} muted />
        <BreakdownLine label="− Imposto (6%)" value={-breakdown.tax} muted />
        <BreakdownLine label="− Taxa do sistema (5%)" value={-breakdown.systemFee} muted />
        <BreakdownLine label={`− Comissão coach (${pct}%)`} value={-breakdown.coachCommission} muted />
        <div className="my-1 border-t border-white/10" />
        <BreakdownLine label="✓ Líquido para você" value={breakdown.partnerNet} highlight />
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          <p className="text-white/40 text-[10px] font-semibold uppercase">Distribuição da comissão do coach</p>
          <BreakdownLine label="Coach vendedor (líquido)" value={breakdown.coachNet} muted />
          <BreakdownLine label="Rede L1 (3%)" value={breakdown.networkL1} muted />
          <BreakdownLine label="Rede L2 (2%)" value={breakdown.networkL2} muted />
          <BreakdownLine label="Rede L3 (1%)" value={breakdown.networkL3} muted />
        </div>
      </div>
    </div>
  );
}


function BreakdownLine({ label, value, bold, muted, highlight }: { label: string; value: number; bold?: boolean; muted?: boolean; highlight?: boolean }) {
  return (
    <div className={`flex justify-between ${bold ? "font-bold text-white" : muted ? "text-white/60" : ""} ${highlight ? "text-green-400 font-bold" : ""}`}>
      <span>{label}</span>
      <span>R$ {value.toFixed(2)}</span>
    </div>
  );
}

function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <div><label className="text-xs text-white/60">{label}</label><div className="mt-1">{children}</div></div>;
}

function statusColor(s: string) {
  return s === "approved" ? "bg-green-500/15 text-green-400"
    : s === "rejected" ? "bg-red-500/15 text-red-400"
    : s === "inactive" ? "bg-white/10 text-white/50"
    : "bg-yellow-500/15 text-yellow-400";
}
