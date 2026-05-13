import { createFileRoute } from "@tanstack/react-router";
import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Save, Settings2, Bolt, Lock, CreditCard, Receipt,
  Building2, Package, Stethoscope, UserCircle, Network, Shield, SlidersHorizontal,
  Vault, CircleCheck, AlertTriangle, AlertCircle, Users, X,
} from "lucide-react";
import {
  listAdminProducts,
  getProductFinancial,
  saveProductFinancial,
  listFeeConfigs,
  upsertFeeConfig,
  type AdminProductRow,
  type ProductFinancial,
  type FeeConfigRow,
} from "@/lib/financial.functions";
import {
  calculateDistribution,
  calculatePointsFromSystemFee,
  sumSystemFee,
  PAYMENT_METHOD_LABEL,
  type PaymentMethod,
  type ValueSlot,
} from "@/lib/financialEngine";

export const Route = createFileRoute("/admin/products")({
  head: () => ({ meta: [{ title: "Produtos — Motor Financeiro" }] }),
  component: AdminProductsPage,
});

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

const DESTINATION_OPTIONS = [
  { value: "coach_wallet", label: "Carteira do Coach (vendedor)" },
  { value: "admin_wallet", label: "Carteira Admin / Sistema" },
  { value: "network_l1", label: "Rede — Nível 1 (upline direto)" },
  { value: "network_l2", label: "Rede — Nível 2" },
  { value: "network_l3", label: "Rede — Nível 3" },
  { value: "platform_reserve", label: "Reserva Plataforma" },
  { value: "product_order_pool", label: "Painel de Pedidos (custos)" },
  { value: "nutritionist_blocked", label: "Carteira Nutricionista (bloqueada)" },
  { value: "referral_student", label: "Aluno Indicador" },
];

function AdminProductsPage() {
  const fetchList = useServerFn(listAdminProducts);
  const [rows, setRows] = useState<AdminProductRow[] | null>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [showFeeConfig, setShowFeeConfig] = useState(false);

  const reload = () => fetchList().then(setRows).catch(() => toast.error("Erro ao carregar"));
  useEffect(() => { reload(); }, []);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-bold text-white">Motor Financeiro — Produtos</h1>
          <p className="text-xs text-white/50">Configure slots de distribuição, pontos e taxas por produto.</p>
        </div>
        <button
          onClick={() => setShowFeeConfig(true)}
          className="flex items-center gap-2 rounded-lg bg-white/5 hover:bg-white/10 px-3 py-2 text-xs text-white"
        >
          <Settings2 className="h-3.5 w-3.5" /> Taxas do Gateway
        </button>
      </div>

      {!rows ? (
        <div className="flex items-center justify-center py-12 text-white/50"><Loader2 className="h-5 w-5 animate-spin" /></div>
      ) : rows.length === 0 ? (
        <div className="text-center text-sm text-white/50 py-10">Nenhum produto cadastrado.</div>
      ) : (
        <div className="rounded-xl border border-white/10 overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-white/5 text-xs text-white/60">
              <tr>
                <th className="px-4 py-2 text-left">Produto</th>
                <th className="px-4 py-2 text-right">Preço</th>
                <th className="px-4 py-2 text-center">Slots</th>
                <th className="px-4 py-2 text-center">Pontos</th>
                <th className="px-4 py-2"></th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.id} className="border-t border-white/5 text-white">
                  <td className="px-4 py-2">{r.name}</td>
                  <td className="px-4 py-2 text-right">{money(r.price)}</td>
                  <td className="px-4 py-2 text-center text-white/70">{r.slots_count}</td>
                  <td className="px-4 py-2 text-center">
                    <span className="inline-flex items-center gap-1 rounded-md bg-primary/15 text-primary px-2 py-0.5 text-xs">
                      {r.points_per_sale} pts {r.points_auto_calculated ? "(auto)" : "(manual)"}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right">
                    <button
                      onClick={() => setSelectedId(r.id)}
                      className="rounded-md bg-primary/20 hover:bg-primary/30 text-primary px-3 py-1 text-xs font-bold"
                    >
                      Editar Financeiro
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedId && (
        <ProductFinancialDrawer
          productId={selectedId}
          onClose={() => setSelectedId(null)}
          onSaved={() => { setSelectedId(null); reload(); }}
        />
      )}

      {showFeeConfig && <FeeConfigDrawer onClose={() => setShowFeeConfig(false)} />}
    </div>
  );
}

// ─── Drawer: Editar slots/pontos/regra de indicação ─────────────
function ProductFinancialDrawer({
  productId, onClose, onSaved,
}: { productId: string; onClose: () => void; onSaved: () => void }) {
  const fetchOne = useServerFn(getProductFinancial);
  const save = useServerFn(saveProductFinancial);
  const [data, setData] = useState<ProductFinancial | null>(null);
  const [saving, setSaving] = useState(false);
  const [previewMethod, setPreviewMethod] = useState<PaymentMethod>("pix");

  useEffect(() => {
    fetchOne({ data: { productId } }).then(setData).catch((e) => toast.error(e?.message || "Erro"));
  }, [productId, fetchOne]);

  const updateSlot = (idx: number, patch: Partial<ValueSlot>) => {
    if (!data) return;
    const slots = data.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s));
    setData({ ...data, slots });
  };

  const addSlot = () => {
    if (!data) return;
    const newSlot: ValueSlot = {
      id: `tmp-${Date.now()}`,
      slot_order: data.slots.length,
      label: "Novo slot",
      value_type: "percentage",
      value_amount: 0,
      destination: "coach_wallet",
      destination_label: "Carteira do Coach",
      is_blocked_until_delivery: false,
      is_system_fee: false,
      applies_to_referral_sales: true,
      applies_to_student_referral: false,
    };
    setData({ ...data, slots: [...data.slots, newSlot] });
  };

  const removeSlot = (idx: number) => {
    if (!data) return;
    setData({ ...data, slots: data.slots.filter((_, i) => i !== idx) });
  };

  const autoPoints = useMemo(() => {
    if (!data) return 0;
    return calculatePointsFromSystemFee(sumSystemFee(data.slots, data.product.price));
  }, [data]);

  const previewDist = useMemo(() => {
    if (!data) return null;
    return calculateDistribution(
      data.product.price,
      previewMethod,
      { card_fee_percentage: 4.98, card_fee_3x12_percentage: 4.98, pix_fee_percentage: 0.99 },
      data.slots,
    );
  }, [data, previewMethod]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      await save({
        data: {
          productId,
          points_per_sale: data.product.points_per_sale,
          points_auto_calculated: data.product.points_auto_calculated,
          slots: data.slots.map(({ id: _id, ...rest }) => rest),
          referralRule: data.referralRule,
        },
      });
      toast.success("Salvo!");
      onSaved();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-3xl h-full overflow-y-auto border-l border-white/10 p-6"
        style={{ backgroundColor: "#0F0F0F" }}
        onClick={(e) => e.stopPropagation()}
      >
        {!data ? (
          <div className="flex items-center justify-center py-12 text-white/50"><Loader2 className="h-5 w-5 animate-spin" /></div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold text-white">{data.product.name}</h2>
                <p className="text-xs text-white/50">Preço: {money(data.product.price)}</p>
              </div>
              <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Fechar</button>
            </div>

            {/* Pontos */}
            <section className="rounded-xl border border-white/10 p-4 mb-4" style={{ backgroundColor: "#161616" }}>
              <h3 className="text-sm font-bold text-white mb-3">Pontos por venda</h3>
              <div className="flex items-center gap-3 mb-2">
                <label className="flex items-center gap-2 text-xs text-white/70">
                  <input
                    type="checkbox"
                    checked={data.product.points_auto_calculated}
                    onChange={(e) =>
                      setData({
                        ...data,
                        product: {
                          ...data.product,
                          points_auto_calculated: e.target.checked,
                          points_per_sale: e.target.checked ? autoPoints : data.product.points_per_sale,
                        },
                      })
                    }
                  />
                  Calcular automaticamente (FLOOR(Taxa do Sistema / 20) × 10)
                </label>
              </div>
              <div className="flex items-center gap-3">
                <input
                  type="number"
                  min={0}
                  value={data.product.points_per_sale}
                  disabled={data.product.points_auto_calculated}
                  onChange={(e) =>
                    setData({ ...data, product: { ...data.product, points_per_sale: Number(e.target.value || 0) } })
                  }
                  className="rounded-md bg-white/5 border border-white/10 px-3 py-1.5 text-sm text-white w-32 disabled:opacity-50"
                />
                <span className="text-xs text-white/50">
                  Auto-calculado: <strong className="text-primary">{autoPoints} pts</strong>
                </span>
              </div>
            </section>

            {/* Slots */}
            <section className="rounded-xl border border-white/10 p-4 mb-4" style={{ backgroundColor: "#161616" }}>
              <div className="flex items-center justify-between mb-3">
                <h3 className="text-sm font-bold text-white">Slots de Distribuição</h3>
                <button onClick={addSlot} className="flex items-center gap-1 rounded-md bg-primary/20 text-primary px-2 py-1 text-xs">
                  <Plus className="h-3 w-3" /> Slot
                </button>
              </div>
              <div className="space-y-2">
                {data.slots.map((s, idx) => (
                  <div key={idx} className="rounded-lg border border-white/10 p-3 space-y-2" style={{ backgroundColor: "#1A1A1A" }}>
                    <div className="grid grid-cols-12 gap-2">
                      <input
                        value={s.label}
                        onChange={(e) => updateSlot(idx, { label: e.target.value })}
                        placeholder="Rótulo"
                        className="col-span-5 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                      />
                      <select
                        value={s.value_type}
                        onChange={(e) => updateSlot(idx, { value_type: e.target.value as "percentage" | "fixed" })}
                        className="col-span-2 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                      >
                        <option value="percentage">%</option>
                        <option value="fixed">R$</option>
                      </select>
                      <input
                        type="number"
                        value={s.value_amount}
                        step="0.01"
                        onChange={(e) => updateSlot(idx, { value_amount: Number(e.target.value || 0) })}
                        className="col-span-2 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white text-right"
                      />
                      <select
                        value={s.destination}
                        onChange={(e) => {
                          const opt = DESTINATION_OPTIONS.find((o) => o.value === e.target.value);
                          updateSlot(idx, { destination: e.target.value, destination_label: opt?.label || "" });
                        }}
                        className="col-span-2 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                      >
                        {DESTINATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </select>
                      <button onClick={() => removeSlot(idx)} className="col-span-1 text-destructive hover:bg-destructive/10 rounded p-1 flex items-center justify-center">
                        <Trash2 className="h-3.5 w-3.5" />
                      </button>
                    </div>
                    <div className="flex flex-wrap gap-3 text-[11px] text-white/60">
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={s.is_system_fee} onChange={(e) => updateSlot(idx, { is_system_fee: e.target.checked })} />
                        Taxa do Sistema (gera pontos)
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={s.is_blocked_until_delivery} onChange={(e) => updateSlot(idx, { is_blocked_until_delivery: e.target.checked })} />
                        Bloqueado até entrega
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={s.applies_to_referral_sales} onChange={(e) => updateSlot(idx, { applies_to_referral_sales: e.target.checked })} />
                        Venda normal
                      </label>
                      <label className="flex items-center gap-1">
                        <input type="checkbox" checked={s.applies_to_student_referral} onChange={(e) => updateSlot(idx, { applies_to_student_referral: e.target.checked })} />
                        Indicação aluno→aluno
                      </label>
                    </div>
                  </div>
                ))}
                {data.slots.length === 0 && (
                  <p className="text-xs text-white/40 text-center py-4">Nenhum slot. Adicione para distribuir o valor.</p>
                )}
              </div>
            </section>

            {/* Simulador */}
            <section className="rounded-xl border border-white/10 p-4 mb-4" style={{ backgroundColor: "#161616" }}>
              <h3 className="text-sm font-bold text-white mb-3 flex items-center gap-2">
                <Calculator className="h-4 w-4" /> Simulador
              </h3>
              <div className="flex items-center gap-2 mb-3">
                <span className="text-xs text-white/60">Forma de pagamento:</span>
                <select
                  value={previewMethod}
                  onChange={(e) => setPreviewMethod(e.target.value as PaymentMethod)}
                  className="rounded-md bg-white/5 border border-white/10 px-2 py-1 text-xs text-white"
                >
                  {(Object.keys(PAYMENT_METHOD_LABEL) as PaymentMethod[]).map((m) => (
                    <option key={m} value={m}>{PAYMENT_METHOD_LABEL[m]}</option>
                  ))}
                </select>
              </div>
              {previewDist && (
                <div className="space-y-1 text-xs">
                  <div className="flex justify-between text-white/60"><span>Bruto</span><span>{money(previewDist.gross_amount)}</span></div>
                  {previewDist.lines.map((l, i) => (
                    <div key={i} className={`flex justify-between ${l.amount < 0 ? "text-red-400" : "text-white"}`}>
                      <span className="truncate pr-2">{l.label}</span>
                      <span>{money(l.amount)}</span>
                    </div>
                  ))}
                  <div className="flex justify-between border-t border-white/10 pt-1 mt-1 text-white/70">
                    <span>Distribuído</span><span>{money(previewDist.total_distributed)} / {money(previewDist.base_distributable)}</span>
                  </div>
                  {!previewDist.is_balanced && (
                    <p className="text-amber-400 text-[11px]">⚠️ Resto: {money(previewDist.remainder)}</p>
                  )}
                </div>
              )}
            </section>

            <div className="flex justify-end gap-2 sticky bottom-0 py-3" style={{ backgroundColor: "#0F0F0F" }}>
              <button onClick={onClose} className="rounded-md bg-white/5 hover:bg-white/10 px-4 py-2 text-sm text-white">Cancelar</button>
              <button
                onClick={handleSave}
                disabled={saving}
                className="flex items-center gap-2 rounded-md bg-primary hover:opacity-90 px-4 py-2 text-sm font-bold text-primary-foreground disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
                Salvar
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

// ─── Drawer: Configurar Taxas do Gateway ────────────────────────
function FeeConfigDrawer({ onClose }: { onClose: () => void }) {
  const list = useServerFn(listFeeConfigs);
  const upsert = useServerFn(upsertFeeConfig);
  const [rows, setRows] = useState<FeeConfigRow[] | null>(null);
  const [saving, setSaving] = useState<string | null>(null);

  useEffect(() => { list().then(setRows); }, [list]);

  const update = (id: string, patch: Partial<FeeConfigRow>) => {
    if (!rows) return;
    setRows(rows.map((r) => (r.id === id ? { ...r, ...patch } : r)));
  };

  const handleSave = async (row: FeeConfigRow) => {
    setSaving(row.id);
    try {
      await upsert({ data: row });
      toast.success("Salvo");
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    } finally {
      setSaving(null);
    }
  };

  const addNew = async () => {
    try {
      await upsert({
        data: {
          name: "Nova config",
          card_fee_percentage: 4.98,
          card_fee_3x12_percentage: 4.98,
          pix_fee_percentage: 0.99,
          is_active: true,
          is_default: false,
        } as Partial<FeeConfigRow>,
      });
      list().then(setRows);
    } catch (e: any) {
      toast.error(e?.message || "Erro");
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-xl h-full overflow-y-auto border-l border-white/10 p-6"
        style={{ backgroundColor: "#0F0F0F" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-lg font-bold text-white">Taxas do Gateway de Pagamento</h2>
          <button onClick={onClose} className="text-white/60 hover:text-white text-sm">Fechar</button>
        </div>
        <button onClick={addNew} className="mb-3 flex items-center gap-1 rounded-md bg-primary/20 text-primary px-3 py-1.5 text-xs">
          <Plus className="h-3 w-3" /> Nova configuração
        </button>
        {!rows ? (
          <Loader2 className="h-5 w-5 animate-spin text-white/50" />
        ) : (
          <div className="space-y-3">
            {rows.map((r) => (
              <div key={r.id} className="rounded-xl border border-white/10 p-3 space-y-2" style={{ backgroundColor: "#161616" }}>
                <div className="flex items-center gap-2">
                  <input
                    value={r.name}
                    onChange={(e) => update(r.id, { name: e.target.value })}
                    className="flex-1 rounded-md bg-white/5 border border-white/10 px-2 py-1 text-sm text-white"
                  />
                  <label className="flex items-center gap-1 text-xs text-white/60">
                    <input type="checkbox" checked={r.is_default} onChange={(e) => update(r.id, { is_default: e.target.checked })} /> Padrão
                  </label>
                  <label className="flex items-center gap-1 text-xs text-white/60">
                    <input type="checkbox" checked={r.is_active} onChange={(e) => update(r.id, { is_active: e.target.checked })} /> Ativo
                  </label>
                </div>
                <div className="grid grid-cols-3 gap-2 text-xs text-white/70">
                  <label>PIX (%)
                    <input type="number" step="0.01" value={r.pix_fee_percentage} onChange={(e) => update(r.id, { pix_fee_percentage: Number(e.target.value) })}
                      className="mt-0.5 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-white" />
                  </label>
                  <label>Cartão 1-2x (%)
                    <input type="number" step="0.01" value={r.card_fee_percentage} onChange={(e) => update(r.id, { card_fee_percentage: Number(e.target.value) })}
                      className="mt-0.5 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-white" />
                  </label>
                  <label>Cartão 3-12x (%)
                    <input type="number" step="0.01" value={r.card_fee_3x12_percentage} onChange={(e) => update(r.id, { card_fee_3x12_percentage: Number(e.target.value) })}
                      className="mt-0.5 w-full rounded-md bg-white/5 border border-white/10 px-2 py-1 text-white" />
                  </label>
                </div>
                <button
                  onClick={() => handleSave(r)}
                  disabled={saving === r.id}
                  className="rounded-md bg-primary px-3 py-1 text-xs font-bold text-primary-foreground"
                >
                  {saving === r.id ? "Salvando..." : "Salvar"}
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
