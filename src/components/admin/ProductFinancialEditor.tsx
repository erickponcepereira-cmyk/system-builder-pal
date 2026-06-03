import { useEffect, useMemo, useState } from "react";
import { useServerFn } from "@tanstack/react-start";
import { toast } from "sonner";
import {
  Loader2, Plus, Trash2, Save, Bolt, Lock, CreditCard, Receipt,
  Package, Stethoscope, UserCircle, Network, Shield, SlidersHorizontal,
  Vault, CircleCheck, AlertTriangle, AlertCircle, Users, X, ChevronUp, ChevronDown,
} from "lucide-react";
import {
  getProductFinancial,
  saveProductFinancial,
  listFeeConfigs,
  type ProductFinancial,
} from "@/lib/financial.functions";
import {
  getProductBadgeFlags,
  saveProductBadgeFlags,
  BADGE_KEYS,
  type BadgeKey,
} from "@/lib/coach-badges.functions";
import {
  calculateDistribution,
  computeSlotAmounts,
  type PaymentMethod,
  type ValueSlot,
  type SlotValueType,
} from "@/lib/financialEngine";

const money = (v: number) =>
  `R$ ${v.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;

type DestMeta = { label: string; barClass: string; borderClass: string; Icon: typeof Bolt };
const DEST_META: Record<string, DestMeta> = {
  coach_wallet:        { label: "Coach vendedor",            barClass: "bg-[#E24B4A]", borderClass: "border-l-[#E24B4A]", Icon: UserCircle },
  admin_wallet:        { label: "Carteira Admin / Sistema",  barClass: "bg-[#888780]", borderClass: "border-l-[#888780]", Icon: Shield },
  network_l1:          { label: "Upline nível 1",            barClass: "bg-[#F09595]", borderClass: "border-l-[#F09595]", Icon: Network },
  network_l2:          { label: "Upline nível 2",            barClass: "bg-[#F09595]", borderClass: "border-l-[#F09595]", Icon: Network },
  network_l3:          { label: "Upline nível 3",            barClass: "bg-[#F09595]", borderClass: "border-l-[#F09595]", Icon: Network },
  platform_reserve:    { label: "Comissão do vendedor",     barClass: "bg-[#E24B4A]", borderClass: "border-l-[#E24B4A]", Icon: UserCircle },
  product_order_pool:  { label: "Painel de Pedidos (custos)",barClass: "bg-[#B4B2A9]", borderClass: "border-l-[#B4B2A9]", Icon: Package },
  nutritionist_blocked:{ label: "Nutricionista (bloqueado)", barClass: "bg-white/40",  borderClass: "border-l-white/40",  Icon: Stethoscope },
  referral_student:    { label: "Aluno indicador",           barClass: "bg-[#F09595]", borderClass: "border-l-[#F09595]", Icon: Users },
  custom:              { label: "Personalizado",             barClass: "bg-[#B4B2A9]", borderClass: "border-l-[#B4B2A9]", Icon: SlidersHorizontal },
};
const DESTINATION_OPTIONS = Object.entries(DEST_META).map(([value, m]) => ({ value, label: m.label }));
const getMeta = (dest: string): DestMeta => DEST_META[dest] || DEST_META.custom;

const PAYMENT_METHODS: { id: PaymentMethod; short: string; feeKey: "pix" | "card" | "card3" }[] = [
  { id: "pix",        short: "PIX",         feeKey: "pix" },
  { id: "debit",      short: "Débito",      feeKey: "card" },
  { id: "credit_1x",  short: "Crédito 1x",  feeKey: "card" },
  { id: "credit_2x",  short: "Crédito 2x",  feeKey: "card" },
  { id: "credit_3x",  short: "Crédito 3x",  feeKey: "card3" },
  { id: "credit_6x",  short: "Crédito 6x",  feeKey: "card3" },
  { id: "credit_12x", short: "Crédito 12x", feeKey: "card3" },
];

type FeeLike = { pix_fee_percentage: number; card_fee_percentage: number; card_fee_3x12_percentage: number };

export function ProductFinancialEditor({ productId, onSaved, compact }: { productId: string; onSaved?: () => void; compact?: boolean }) {
  const fetchOne = useServerFn(getProductFinancial);
  const fetchFees = useServerFn(listFeeConfigs);
  const save = useServerFn(saveProductFinancial);
  const [data, setData] = useState<ProductFinancial | null>(null);
  const [feeCfg, setFeeCfg] = useState<FeeLike>({ pix_fee_percentage: 0.99, card_fee_percentage: 4.98, card_fee_3x12_percentage: 4.98 });
  const [taxPct, setTaxPct] = useState(6);
  const [previewMethod, setPreviewMethod] = useState<PaymentMethod>("pix");
  const [simMode, setSimMode] = useState<"direct" | "referral">("direct");
  const [saving, setSaving] = useState(false);
  const slotApplies = (s: ValueSlot) =>
    simMode === "direct" ? s.applies_to_referral_sales : s.applies_to_student_referral;

  useEffect(() => {
    fetchOne({ data: { productId } }).then(setData).catch((e: any) => toast.error(e?.message || "Erro"));
    fetchFees().then((rs) => {
      const def = rs.find((r) => r.is_default) || rs[0];
      if (def) setFeeCfg({
        pix_fee_percentage: Number(def.pix_fee_percentage),
        card_fee_percentage: Number(def.card_fee_percentage),
        card_fee_3x12_percentage: Number(def.card_fee_3x12_percentage),
      });
    });
  }, [productId, fetchOne, fetchFees]);

  const updateSlot = (idx: number, patch: Partial<ValueSlot>) => {
    if (!data) return;
    setData({ ...data, slots: data.slots.map((s, i) => (i === idx ? { ...s, ...patch } : s)) });
  };
  const addSlot = () => {
    if (!data) return;
    const maxOrder = data.slots.reduce((m, s) => Math.max(m, s.slot_order ?? 0), -1);
    setData({
      ...data,
      slots: [...data.slots, {
        id: `tmp-${Date.now()}`,
        slot_order: maxOrder + 1,
        label: "Nova linha",
        value_type: "percentage",
        value_amount: 0,
        destination: "custom",
        destination_label: "Personalizado",
        is_blocked_until_delivery: false,
        is_system_fee: false,
        applies_to_referral_sales: true,
        applies_to_student_referral: false,
      }],
    });
  };
  const removeSlot = (id: string) => {
    if (!data) return;
    setData({ ...data, slots: data.slots.filter((s) => s.id !== id) });
  };
  const moveSlot = (id: string, dir: -1 | 1) => {
    if (!data) return;
    const ordered = [...data.slots].sort((a, b) => a.slot_order - b.slot_order);
    const idx = ordered.findIndex((s) => s.id === id);
    const swap = idx + dir;
    if (idx < 0 || swap < 0 || swap >= ordered.length) return;
    const a = ordered[idx], b = ordered[swap];
    const ao = a.slot_order, bo = b.slot_order;
    setData({
      ...data,
      slots: data.slots.map((s) =>
        s.id === a.id ? { ...s, slot_order: bo } :
        s.id === b.id ? { ...s, slot_order: ao } : s,
      ),
    });
  };

  const sortedSlots = useMemo(
    () => (data ? [...data.slots].sort((a, b) => a.slot_order - b.slot_order) : []),
    [data],
  );

  const dist = useMemo(() => {
    if (!data) return null;
    return calculateDistribution(data.product.price, previewMethod, feeCfg, sortedSlots, taxPct);
  }, [data, sortedSlots, previewMethod, feeCfg, taxPct]);

  const slotAmtMap = useMemo(() => {
    if (!data || !dist) return new Map<string, number>();
    const active = sortedSlots.filter((s) => s.applies_to_referral_sales);
    const amts = computeSlotAmounts(active, dist.base_distributable);
    const map = new Map<string, number>();
    active.forEach((s, i) => map.set(s.id, amts[i]));
    return map;
  }, [data, dist, sortedSlots]);

  const handleSave = async () => {
    if (!data) return;
    setSaving(true);
    try {
      const orderedSlots = [...data.slots].sort((a, b) => a.slot_order - b.slot_order);
      await save({
        data: {
          productId,
          points_per_sale: data.product.points_per_sale,
          points_auto_calculated: false,
          card_access_days: Number((data.product as any).card_access_days || 0),
          slots: orderedSlots.map(({ id: _id, ...rest }) => rest),
          referralRule: data.referralRule,
        },
      });

      toast.success("Configuração financeira salva");
      onSaved?.();
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  if (!data || !dist) {
    return <div className="flex items-center justify-center py-12 text-white/50"><Loader2 className="h-5 w-5 animate-spin" /></div>;
  }

  return (
    <div className="text-white">
      {/* Produto e impostos */}
      <SectionLabel>Produto e impostos</SectionLabel>
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-6">
        <Field label="Nome do produto"><InputBox value={data.product.name} disabled /></Field>
        <Field label="Valor bruto">
          <MoneyInput value={data.product.price}
            onChange={(v) => setData({ ...data, product: { ...data.product, price: v } })} />
        </Field>
        <Field label="Imposto — Simples Nacional (%)">
          <NumberInput value={taxPct}
            onChange={(v) => setTaxPct(parseFloat(v) || 0)} />
        </Field>
      </div>

      <BadgeFlagsSection productId={productId} />



      <SectionLabel>Simulação · forma de pagamento</SectionLabel>
      <div className="mb-2 flex items-start gap-2 rounded-md border border-white/10 bg-white/5 px-3 py-2 text-[11px] text-white/60">
        <AlertCircle className="h-3.5 w-3.5 mt-0.5 text-[#E24B4A] shrink-0" />
        <span>
          A forma de pagamento é definida pelo <b className="text-white">cliente</b> no checkout. Este seletor apenas <b className="text-white">simula</b> como ficam os valores e a comissão do coach em cada cenário.
          O relatório de pagamentos registra automaticamente o método usado em cada venda.
        </span>
      </div>
      <div className="flex flex-wrap gap-1.5 mb-3">
        {PAYMENT_METHODS.map((m) => {
          const fee = m.feeKey === "pix" ? feeCfg.pix_fee_percentage : m.feeKey === "card" ? feeCfg.card_fee_percentage : feeCfg.card_fee_3x12_percentage;
          const active = previewMethod === m.id;
          return (
            <button type="button" key={m.id} onClick={() => setPreviewMethod(m.id)}
              className={`rounded-md px-3 py-1.5 text-xs font-medium border transition ${
                active ? "bg-[#E24B4A] border-[#E24B4A] text-white"
                       : "bg-transparent border-white/15 text-white/70 hover:border-[#E24B4A] hover:text-[#E24B4A]"
              }`}>
              {m.short} {fee}%
            </button>
          );
        })}
      </div>

      <CoachCommissionByMethod
        price={data.product.price}
        feeCfg={feeCfg}
        slots={sortedSlots}
        taxPct={taxPct}
        selected={previewMethod}
        onSelect={setPreviewMethod}
      />

      <div className={`grid grid-cols-1 ${compact ? "" : "lg:grid-cols-2"} gap-4`}>
        <div>
          <SectionLabel>Distribuição da venda normal</SectionLabel>
          <div className="rounded-lg p-3" style={{ backgroundColor: "#161616" }}>
            <div className="space-y-2">
              {sortedSlots.map((s, idx) => (
                <SlotCard key={s.id || idx} slot={s}
                  amount={slotAmtMap.get(s.id) ?? 0}
                  gross={data.product.price}
                  canMoveUp={idx > 0}
                  canMoveDown={idx < sortedSlots.length - 1}
                  onMoveUp={() => moveSlot(s.id, -1)}
                  onMoveDown={() => moveSlot(s.id, 1)}
                  onChange={(p) => updateSlot(data.slots.findIndex((x) => x.id === s.id), p)}
                  onRemove={() => removeSlot(s.id)} />
              ))}
              {sortedSlots.length === 0 && (
                <p className="text-xs text-white/40 text-center py-4">Nenhum slot. Adicione para distribuir o valor.</p>
              )}
            </div>
            <button type="button" onClick={addSlot}
              className="w-full mt-2 rounded-md border border-dashed border-white/15 hover:border-[#E24B4A] hover:text-[#E24B4A] py-2.5 text-xs text-white/60 flex items-center justify-center gap-1.5">
              <Plus className="h-3.5 w-3.5" /> Adicionar linha
            </button>
          </div>

          <div className="mt-4">
            <SectionLabel>Pontos por venda (carreira do coach)</SectionLabel>
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#161616" }}>
              <p className="text-[11px] text-white/50">
                Pontos manuais atribuídos ao coach que vendeu. Não interferem no valor do produto e alimentam o sistema de carreira.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <NumberInput value={data.product.points_per_sale}
                    onChange={(v) => setData({ ...data, product: { ...data.product, points_per_sale: parseInt(v) || 0 } })} />
                </div>
                <span className="text-xs text-white/50">pts por venda</span>
              </div>
            </div>
          </div>

          <div className="mt-4">
            <SectionLabel>Validade da carteirinha (dias)</SectionLabel>
            <div className="rounded-lg p-3 space-y-2" style={{ backgroundColor: "#161616" }}>
              <p className="text-[11px] text-white/50">
                Quantos dias de acesso à carteirinha do aluno este produto concede após o pagamento. Use 0 para não estender.
              </p>
              <div className="flex items-center gap-3">
                <div className="w-32">
                  <NumberInput value={Number((data.product as any).card_access_days || 0)}
                    onChange={(v) => setData({ ...data, product: { ...data.product, card_access_days: Math.max(0, parseInt(v) || 0) } as any })} />
                </div>
                <span className="text-xs text-white/50">dias de acesso</span>
              </div>
            </div>
          </div>

        </div>

        <div>
          <SectionLabel>Fluxo de distribuição</SectionLabel>
          <div className="rounded-md p-3 mb-2" style={{ background: "#E24B4A" }}>
            <div className="text-[11px] text-white/70 font-medium">Valor bruto recebido</div>
            <div className="text-[22px] font-medium font-mono">{money(dist.gross_amount)}</div>
          </div>

          <FlowLine name={`Taxa ${previewMethod.toUpperCase()} (${dist.payment_fee_pct}%)`} val={-dist.payment_fee_amount}
            gross={dist.gross_amount} barClass="bg-[#E24B4A]" Icon={CreditCard} />
          <FlowLine name={`Simples Nacional (${dist.tax_pct}%)`} val={-dist.tax_amount}
            gross={dist.gross_amount} barClass="bg-[#F09595]" Icon={Receipt} />

          <FlowDivider />

          {sortedSlots.map((s, i) => {
            const m = getMeta(s.destination);
            const amt = slotAmtMap.get(s.id) ?? 0;
            const groupTag = s.slot_group != null ? ` · G${s.slot_group}` : "";
            return <FlowLine key={i} name={`${s.label}${groupTag}`} val={amt} gross={dist.gross_amount} barClass={m.barClass} Icon={m.Icon} locked={s.is_blocked_until_delivery} />;
          })}
          {dist.remainder > 0.005 && (
            <FlowLine name="Comissão do vendedor (sobra)" val={dist.remainder} gross={dist.gross_amount} barClass="bg-[#E24B4A]" Icon={UserCircle} />
          )}

          <div className="mt-3 rounded-md p-3" style={{ backgroundColor: "#161616" }}>
            <div className="flex justify-between items-center text-xs">
              <span className="text-white/60">Total distribuído</span>
              <span className={`font-mono font-medium ${Math.abs(dist.remainder) < 0.01 ? "text-emerald-400" : dist.remainder < 0 ? "text-[#E24B4A]" : "text-amber-400"}`}>
                {money(dist.total_distributed)}
              </span>
            </div>
            <div className="flex justify-between items-center text-xs mt-1">
              <span className="text-white/60">Comissão do vendedor (sobra)</span>
              <span className="font-mono text-[#E24B4A]">{dist.remainder > 0.005 ? money(dist.remainder) : "—"}</span>
            </div>
            <ProgressTrack dist={dist} slots={data.slots} />
            <div className="mt-2 text-[11px]">
              {Math.abs(dist.remainder) < 0.01 ? (
                <span className="text-emerald-400 inline-flex items-center gap-1"><CircleCheck className="h-3 w-3" /> 100% distribuído</span>
              ) : dist.remainder > 0 ? (
                <span className="text-[#E24B4A] inline-flex items-center gap-1"><UserCircle className="h-3 w-3" /> {money(dist.remainder)} vai para a comissão do vendedor</span>
              ) : (
                <span className="text-[#E24B4A] inline-flex items-center gap-1"><AlertCircle className="h-3 w-3" /> Distribui {money(Math.abs(dist.remainder))} a mais — revise os valores</span>
              )}
            </div>
          </div>

          <SummaryGrid dist={dist} slots={data.slots} />
        </div>
      </div>

      {/* Bloco antigo "Indicação aluno → aluno" removido.
          Agora a indicação é controlada pela checkbox "Indicação" em cada slot acima. */}

      <div className="flex justify-end gap-2 pt-4 mt-6 border-t border-white/10">
        <button type="button" onClick={handleSave} disabled={saving}
          className="flex items-center gap-2 rounded-md bg-[#E24B4A] hover:opacity-90 px-4 py-2 text-sm font-bold text-white disabled:opacity-50">
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Salvar configuração financeira
        </button>
      </div>
    </div>
  );
}

export function ProductFinancialDrawer({ productId, onClose, onSaved }: { productId: string; onClose: () => void; onSaved?: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-black/70" onClick={onClose}>
      <div
        className="w-full max-w-5xl h-full overflow-y-auto border-l border-white/10 p-6 text-white"
        style={{ backgroundColor: "#0F0F0F" }}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-3 pb-4 mb-6 border-b border-white/10">
          <div className="w-9 h-9 rounded-md flex items-center justify-center bg-[#E24B4A]"><Bolt className="h-4 w-4 text-white" /></div>
          <div className="flex-1">
            <div className="text-[15px] font-medium">Configurador financeiro</div>
            <div className="text-[12px] text-white/50">Fluxo em tempo real · slots paralelos · pontos manuais</div>
          </div>
          <button type="button" onClick={onClose} className="text-white/60 hover:text-white text-sm flex items-center gap-1"><X className="h-4 w-4" /> Fechar</button>
        </div>
        <ProductFinancialEditor productId={productId} onSaved={() => { onSaved?.(); onClose(); }} />
      </div>
    </div>
  );
}

// ── Internal subcomponents ─────────────────────────────────────
function CoachCommissionByMethod({ price, feeCfg, slots, taxPct, selected, onSelect }: {
  price: number; feeCfg: FeeLike; slots: ValueSlot[]; taxPct: number;
  selected: PaymentMethod; onSelect: (m: PaymentMethod) => void;
}) {
  const groups: { label: string; method: PaymentMethod; feePct: number }[] = [
    { label: "PIX",         method: "pix",        feePct: feeCfg.pix_fee_percentage },
    { label: "Cartão 1-2x", method: "credit_1x",  feePct: feeCfg.card_fee_percentage },
    { label: "Cartão 3-12x",method: "credit_3x",  feePct: feeCfg.card_fee_3x12_percentage },
  ];
  const calc = (method: PaymentMethod) => {
    const d = calculateDistribution(price, method, feeCfg, slots, taxPct);
    const coachSlots = d.lines
      .filter((l) => l.type === "distribution" && (l.destination === "coach_wallet" || l.destination === "platform_reserve"))
      .reduce((s, l) => s + l.amount, 0);
    return Math.max(0, coachSlots + Math.max(0, d.remainder));
  };
  return (
    <div className="mb-6 rounded-lg p-3" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center gap-2 mb-2">
        <UserCircle className="h-3.5 w-3.5 text-[#E24B4A]" />
        <span className="text-[11px] font-medium uppercase tracking-wider text-white/60">
          Comissão do coach vendedor por forma de pagamento
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {groups.map((g) => {
          const amount = calc(g.method);
          const active = selected === g.method ||
            (g.method === "credit_1x" && (selected === "debit" || selected === "credit_2x")) ||
            (g.method === "credit_3x" && (selected === "credit_6x" || selected === "credit_12x"));
          return (
            <button type="button" key={g.method} onClick={() => onSelect(g.method)}
              className={`rounded-md px-3 py-2 text-left border transition ${
                active ? "bg-[#E24B4A]/10 border-[#E24B4A]" : "bg-white/5 border-white/10 hover:border-[#E24B4A]/50"
              }`}>
              <div className="flex items-center justify-between text-[10px] text-white/50 mb-1">
                <span>{g.label}</span>
                <span>taxa {g.feePct}%</span>
              </div>
              <div className={`font-mono text-[17px] font-medium ${active ? "text-[#E24B4A]" : "text-white"}`}>
                {money(amount)}
              </div>
              <div className="text-[10px] text-white/40 mt-0.5">
                {price > 0 ? ((amount / price) * 100).toFixed(2) : "0.00"}% do bruto
              </div>
            </button>
          );
        })}
      </div>
      <p className="text-[10px] text-white/40 mt-2">
        O coach recebe exatamente o valor da forma de pagamento escolhida pelo cliente no checkout.
      </p>
    </div>
  );
}

function SectionLabel({ children }: { children: React.ReactNode }) {
  return <div className="text-[11px] font-medium uppercase tracking-wider text-white/40 mb-2">{children}</div>;
}
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className="block"><span className="block text-[11px] text-white/60 mb-1.5 font-medium">{label}</span>{children}</label>;
}
function InputBox(props: Omit<React.InputHTMLAttributes<HTMLInputElement>, "onChange"> & { onChange?: (v: string) => void }) {
  const { className, onChange, ...rest } = props;
  return (
    <input {...rest} onChange={(e) => onChange?.(e.target.value)}
      className={`w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A] disabled:opacity-50 ${className || ""}`} />
  );
}

function MoneyInput({ value, onChange, disabled }: { value: number; onChange?: (v: number) => void; disabled?: boolean }) {
  const fmt = (cents: number) =>
    `R$ ${(cents / 100).toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
  const [text, setText] = useState(() => fmt(Math.round((value || 0) * 100)));
  const lastEmitted = useMemo(() => ({ v: value }), []);
  useEffect(() => {
    if (Math.abs((lastEmitted.v ?? 0) - (value ?? 0)) > 0.0001) {
      setText(fmt(Math.round((value || 0) * 100)));
      lastEmitted.v = value;
    }
  }, [value, lastEmitted]);
  return (
    <input
      type="text"
      inputMode="numeric"
      disabled={disabled}
      value={text}
      onChange={(e) => {
        const digits = e.target.value.replace(/\D/g, "");
        const cents = digits ? parseInt(digits, 10) : 0;
        const next = cents / 100;
        setText(fmt(cents));
        lastEmitted.v = next;
        onChange?.(next);
      }}
      className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A] disabled:opacity-50"
    />
  );
}

function NumberInput({ value, onChange, placeholder, allowEmpty }: {
  value: number | null | undefined;
  onChange?: (v: string) => void;
  placeholder?: string;
  allowEmpty?: boolean;
}) {
  const toStr = (v: number | null | undefined) => (v === null || v === undefined ? "" : String(v));
  const [text, setText] = useState(() => toStr(value));
  const focused = useMemo(() => ({ on: false }), []);
  useEffect(() => {
    if (!focused.on) setText(toStr(value));
  }, [value, focused]);
  return (
    <input
      type="text"
      inputMode="decimal"
      value={text}
      placeholder={placeholder}
      onFocus={() => { focused.on = true; }}
      onBlur={() => {
        focused.on = false;
        if (text === "" && !allowEmpty) {
          setText("0");
          onChange?.("0");
        }
      }}
      onChange={(e) => {
        const raw = e.target.value.replace(/[^\d.,-]/g, "").replace(",", ".");
        setText(e.target.value);
        onChange?.(raw);
      }}
      className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A] disabled:opacity-50"
    />
  );
}

function SlotCard({ slot, amount, gross, onChange, onRemove, onMoveUp, onMoveDown, canMoveUp, canMoveDown }: {
  slot: ValueSlot; amount: number; gross: number;
  onChange: (p: Partial<ValueSlot>) => void; onRemove: () => void;
  onMoveUp?: () => void; onMoveDown?: () => void;
  canMoveUp?: boolean; canMoveDown?: boolean;
}) {
  const m = getMeta(slot.destination);
  const pct = gross > 0 ? (amount / gross) * 100 : 0;
  return (
    <div className={`rounded-md border-l-2 ${m.borderClass} border border-white/10 p-3`} style={{ backgroundColor: "#1A1A1A" }}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="text-[13px] font-medium flex items-center gap-1.5">
          <m.Icon className="h-3.5 w-3.5 text-white/60" />
          {slot.label}
          {slot.slot_group != null && (
            <span className="inline-flex items-center text-[9px] px-1.5 py-0.5 rounded bg-[#E24B4A]/20 text-[#E24B4A]">
              Grupo {slot.slot_group} · paralelo
            </span>
          )}
          {slot.is_blocked_until_delivery && (
            <span className="inline-flex items-center gap-1 text-[9px] px-1.5 py-0.5 rounded bg-amber-900/40 text-amber-300">
              <Lock className="h-2.5 w-2.5" /> aguarda entrega
            </span>
          )}
        </div>
        <div className="flex items-center gap-2">
          <div className="text-right">
            <div className={`text-[18px] font-medium font-mono ${slot.destination === "coach_wallet" ? "text-[#E24B4A]" : ""}`}>{money(amount)}</div>
            <div className="text-[10px] text-white/40">{m.label} · {pct.toFixed(2)}%</div>
          </div>
          <div className="flex flex-col gap-0.5">
            <button type="button" onClick={onMoveUp} disabled={!canMoveUp} title="Mover para cima"
              className="rounded-md border border-white/10 hover:border-[#E24B4A] hover:text-[#E24B4A] p-0.5 text-white/60 disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
              <ChevronUp className="h-3 w-3" />
            </button>
            <button type="button" onClick={onMoveDown} disabled={!canMoveDown} title="Mover para baixo"
              className="rounded-md border border-white/10 hover:border-[#E24B4A] hover:text-[#E24B4A] p-0.5 text-white/60 disabled:opacity-30 disabled:hover:border-white/10 disabled:hover:text-white/60">
              <ChevronDown className="h-3 w-3" />
            </button>
          </div>
          <button type="button" onClick={onRemove} className="rounded-md border border-white/10 hover:border-[#E24B4A] hover:text-[#E24B4A] p-1.5 text-white/60">
            <Trash2 className="h-3 w-3" />
          </button>
        </div>
      </div>
      <div className="grid grid-cols-12 gap-1.5 pt-2 border-t border-white/10">
        <div className="col-span-4">
          <label className="text-[10px] text-white/50 block mb-1">Rótulo</label>
          <InputBox value={slot.label} onChange={(v) => onChange({ label: v })} />
        </div>
        <div className="col-span-3">
          <label className="text-[10px] text-white/50 block mb-1">Destino</label>
          <select value={slot.destination}
            onChange={(e) => onChange({ destination: e.target.value, destination_label: getMeta(e.target.value).label })}
            className="w-full rounded-md bg-[#1a1a1a] border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A] [&>option]:bg-[#1a1a1a] [&>option]:text-white">
            {DESTINATION_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </select>
        </div>
        <div className="col-span-3">
          <label className="text-[10px] text-white/50 block mb-1">Tipo / valor</label>
          <select value={slot.value_type}
            onChange={(e) => onChange({ value_type: e.target.value as SlotValueType })}
            className="w-full rounded-md bg-[#1a1a1a] border border-white/10 px-2 py-1 text-[11px] text-white mb-1 outline-none focus:border-[#E24B4A] [&>option]:bg-[#1a1a1a] [&>option]:text-white">
            <option value="fixed">R$ fixo</option>
            <option value="percentage">% da base</option>
            <option value="pct_running">% do saldo restante</option>
          </select>
          {slot.value_type === "fixed"
            ? <MoneyInput value={slot.value_amount} onChange={(v) => onChange({ value_amount: v })} />
            : <NumberInput value={slot.value_amount} onChange={(v) => onChange({ value_amount: parseFloat(v) || 0 })} />}
        </div>
        <div className="col-span-2">
          <label className="text-[10px] text-white/50 block mb-1" title="Slots com mesmo Grupo são deduzidos em paralelo sobre o mesmo saldo">Grupo</label>
          <NumberInput value={slot.slot_group ?? null} placeholder="—" allowEmpty
            onChange={(v) => onChange({ slot_group: v === "" ? null : parseInt(v) })} />
        </div>
      </div>
      <div className="flex flex-wrap gap-3 mt-2 pt-2 border-t border-white/10 text-[11px] text-white/60">
        <label className="flex items-center gap-1"><input type="checkbox" checked={slot.is_blocked_until_delivery}
          onChange={(e) => onChange({ is_blocked_until_delivery: e.target.checked })} /> Bloquear até entrega</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={slot.is_system_fee}
          onChange={(e) => onChange({ is_system_fee: e.target.checked })} /> Taxa do Sistema</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={slot.applies_to_referral_sales}
          onChange={(e) => onChange({ applies_to_referral_sales: e.target.checked })} /> Venda normal</label>
        <label className="flex items-center gap-1"><input type="checkbox" checked={slot.applies_to_student_referral}
          onChange={(e) => onChange({ applies_to_student_referral: e.target.checked })} /> Indicação</label>
      </div>
    </div>
  );
}

function FlowLine({ name, val, gross, barClass, Icon, locked }: {
  name: string; val: number; gross: number; barClass: string; Icon: typeof Bolt; locked?: boolean;
}) {
  const isNeg = val < 0;
  const pct = gross > 0 ? (Math.abs(val) / gross) * 100 : 0;
  const w = Math.min(pct, 100);
  return (
    <div className="flex items-center gap-2 py-1.5 border-b border-white/5 last:border-b-0">
      <Icon className="h-3.5 w-3.5 text-white/40 shrink-0" />
      <span className="text-[12px] text-white/70 min-w-[120px] truncate flex items-center gap-1">
        {name}
        {locked && <Lock className="h-2.5 w-2.5 text-amber-400" />}
      </span>
      <div className="flex-1 h-1.5 rounded bg-white/5 overflow-hidden">
        <div className={`${barClass} h-1.5 transition-all`} style={{ width: `${w.toFixed(1)}%` }} />
      </div>
      <span className={`text-[12px] font-medium font-mono min-w-[64px] text-right ${isNeg ? "text-[#E24B4A]" : ""}`}>{isNeg ? "−" : ""}{money(Math.abs(val))}</span>
      <span className="text-[10px] text-white/40 min-w-[40px] text-right">{pct.toFixed(2)}%</span>
    </div>
  );
}
function FlowDivider() {
  return (
    <div className="relative my-3 h-px bg-white/10">
      <span className="absolute left-1/2 -translate-x-1/2 -top-2 px-1.5 text-[9px] font-medium tracking-wider text-white/40 uppercase" style={{ backgroundColor: "#0F0F0F" }}>
        BASE DISTRIBUÍVEL
      </span>
    </div>
  );
}
function ProgressTrack({ dist, slots }: { dist: NonNullable<ReturnType<typeof calculateDistribution>>; slots: ValueSlot[] }) {
  const segs: { w: number; cls: string }[] = [
    { w: (dist.payment_fee_amount / dist.gross_amount) * 100, cls: "bg-[#E24B4A]" },
    { w: (dist.tax_amount / dist.gross_amount) * 100, cls: "bg-[#F09595]" },
  ];
  const active = slots.filter((s) => s.applies_to_referral_sales);
  const amts = computeSlotAmounts(active, dist.base_distributable);
  active.forEach((s, i) => {
    segs.push({ w: (amts[i] / dist.gross_amount) * 100, cls: getMeta(s.destination).barClass });
  });
  if (dist.remainder > 0) segs.push({ w: (dist.remainder / dist.gross_amount) * 100, cls: "bg-[#E24B4A]" });
  return (
    <div className="h-1.5 mt-2 rounded overflow-hidden flex gap-px" style={{ backgroundColor: "#0F0F0F" }}>
      {segs.map((s, i) => <div key={i} className={s.cls} style={{ width: `${s.w.toFixed(2)}%`, height: "100%" }} />)}
    </div>
  );
}
function SummaryGrid({ dist, slots }: { dist: NonNullable<ReturnType<typeof calculateDistribution>>; slots: ValueSlot[] }) {
  const active = slots.filter((s) => s.applies_to_referral_sales);
  const amts = computeSlotAmounts(active, dist.base_distributable);
  const sumBy = (preds: string[]) =>
    active.reduce((a, s, i) => a + (preds.includes(s.destination) ? amts[i] : 0), 0);
  const systemFeeT = active.reduce((a, s, i) => a + (s.is_system_fee ? amts[i] : 0), 0);
  const adminT = sumBy(["admin_wallet"]) + systemFeeT;
  const coachT = sumBy(["coach_wallet"]) + (dist.remainder > 0.005 ? dist.remainder : 0);
  const netT = sumBy(["network_l1", "network_l2", "network_l3"]);
  const nutriT = sumBy(["nutritionist_blocked"]);
  const prodT = sumBy(["product_order_pool"]);
  const cards: Array<[string, string, string?]> = [
    ["Sistema", money(adminT)],
    ["Coach vendedor", money(coachT), "text-[#E24B4A]"],
    ["Rede L1+L2+L3", money(netT)],
    ["Nutricionista", money(nutriT)],
    ["Custo produto", money(prodT)],
    ["Taxas + imposto", money(dist.payment_fee_amount + dist.tax_amount), "text-white/60"],
  ];
  return (
    <div className="grid grid-cols-2 sm:grid-cols-3 gap-2 mt-3">
      {cards.map(([label, val, cls], i) => (
        <div key={i} className="rounded-md p-2.5" style={{ backgroundColor: "#161616" }}>
          <div className="text-[10px] text-white/40 font-medium uppercase tracking-wider">{label}</div>
          <div className={`text-sm font-medium font-mono mt-0.5 ${cls || ""}`}>{val}</div>
        </div>
      ))}
    </div>
  );
}

function ReferralSection({ referralRule, onChange, gross, feePct, feeAmt, taxAmt, base, slots, method }: {
  referralRule: ProductFinancial["referralRule"];
  onChange: (rr: ProductFinancial["referralRule"]) => void;
  gross: number; feePct: number; feeAmt: number; taxAmt: number; base: number; slots: ValueSlot[]; method: PaymentMethod;
}) {
  const afterPre = gross - referralRule.pre_deduction_fixed;
  const studAmt = afterPre * (referralRule.student_referral_percentage / 100);
  const coachPool = afterPre * (referralRule.coach_pool_percentage / 100);
  const coachNet = coachPool - feeAmt - taxAmt;
  const netTotal = slots.filter((s) => ["network_l1", "network_l2", "network_l3"].includes(s.destination))
    .reduce((a, s) => a + (s.value_type === "fixed" ? s.value_amount : base * (s.value_amount / 100)), 0);
  const coachFinal = coachNet - netTotal;

  return (
    <div className="mt-6 border border-white/10 rounded-lg overflow-hidden">
      <div className="flex items-center justify-between p-3.5" style={{ backgroundColor: "#161616" }}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 rounded-md flex items-center justify-center bg-[#F09595]"><Users className="h-3.5 w-3.5 text-[#A32D2D]" /></div>
          <div>
            <div className="text-[13px] font-medium">Indicação aluno → aluno</div>
            <div className="text-[11px] text-white/50">Regra especial quando um aluno (não coach) indica outra pessoa</div>
          </div>
        </div>
        <Toggle checked={referralRule.enabled} onChange={(v) => onChange({ ...referralRule, enabled: v })} />
      </div>
      {referralRule.enabled && (
        <div className="p-4">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 mb-4">
            <Field label="1. Dedução fixa do sistema">
              <MoneyInput value={referralRule.pre_deduction_fixed}
                onChange={(v) => onChange({ ...referralRule, pre_deduction_fixed: v })} />
            </Field>
            <Field label="2. % do restante para o aluno indicador">
              <NumberInput value={referralRule.student_referral_percentage}
                onChange={(v) => onChange({ ...referralRule, student_referral_percentage: parseFloat(v) || 0 })} />
            </Field>
            <Field label="3. % do restante para o coach vendedor">
              <NumberInput value={referralRule.coach_pool_percentage}
                onChange={(v) => onChange({ ...referralRule, coach_pool_percentage: parseFloat(v) || 0 })} />
            </Field>
          </div>
          <div className="rounded-md p-3" style={{ backgroundColor: "#161616" }}>
            <div className="text-[11px] uppercase tracking-wider text-white/50 mb-2 font-medium">Como fica para uma venda via indicação</div>
            <RefStep n={1} label="Dedução fixa do sistema" detail={`${money(referralRule.pre_deduction_fixed)} retirado do bruto antes de qualquer divisão`}
              val={`Vai para admins → Restante: ${money(afterPre)}`} color="#888780" />
            <RefStep n={2} label="Divisão do restante" detail={`${money(afterPre)} dividido ${referralRule.student_referral_percentage}% / ${referralRule.coach_pool_percentage}%`}
              val={`Aluno: ${money(studAmt)} | Pool coach: ${money(coachPool)}`} color="#fff" />
            <RefStep n={3} label="Deduções do pool do coach" detail={`Taxa ${method.toUpperCase()} (${feePct}%) e Simples Nacional — sobre o bruto ${money(gross)}`}
              val={`− ${money(feeAmt + taxAmt)} → pool líquido: ${money(coachNet)}`} color="#E24B4A" />
            <RefStep n={4} label="Comissões de rede" detail="L1/L2/L3 deduzidos do pool líquido"
              val={`− ${money(netTotal)} para a rede`} color="#F09595" />
            <RefStep n={5} label="Coach vendedor recebe" detail="Saldo final após todas as deduções"
              val={coachFinal > 0 ? money(coachFinal) : "⚠ Negativo — revise os percentuais"} color={coachFinal > 0 ? "#34d399" : "#E24B4A"} last />
          </div>
        </div>
      )}
    </div>
  );
}
function Toggle({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button type="button" onClick={() => onChange(!checked)} className={`w-8 h-[18px] rounded-full relative transition ${checked ? "bg-[#E24B4A]" : "bg-white/15"}`}>
      <span className="absolute top-[3px] w-3 h-3 rounded-full bg-white transition-all" style={{ left: checked ? 17 : 3 }} />
    </button>
  );
}
function RefStep({ n, label, detail, val, color, last }: { n: number; label: string; detail: string; val: string; color: string; last?: boolean }) {
  return (
    <div className={`flex items-start gap-2.5 ${last ? "" : "mb-2.5"}`}>
      <div className="w-5 h-5 rounded-full bg-[#E24B4A] text-white text-[10px] font-medium flex items-center justify-center shrink-0 mt-0.5">{n}</div>
      <div className="flex-1">
        <div className="text-xs font-medium">{label}</div>
        <div className="text-[11px] text-white/50 mt-0.5">{detail}</div>
        <div className="text-xs font-medium font-mono mt-0.5" style={{ color }}>{val}</div>
      </div>
    </div>
  );
}

// ─── Seção de restrições por categoria ──────────────────────────────
const BADGE_LABEL: Record<BadgeKey, string> = {
  master_coach: "Master Coach",
  coach_hbl_42: "Coach HBL 42%",
  coach_hbl_50: "Coach HBL 50%",
  nutritionist_partner: "Nutricionista Parceiro",
  council: "Conselho",
  partnership_master: "Mestre de Parcerias",
};

function BadgeFlagsSection({ productId }: { productId: string }) {
  const getFlags = useServerFn(getProductBadgeFlags);
  const saveFlags = useServerFn(saveProductBadgeFlags);
  const [requiredBadge, setRequiredBadge] = useState<BadgeKey | "">("");
  const [allowMaster, setAllowMaster] = useState(false);
  const [freeCouncil, setFreeCouncil] = useState(false);
  const [freeNutritionist, setFreeNutritionist] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getFlags({ data: { productId } })
      .then((f: any) => {
        setRequiredBadge((f?.required_badge ?? "") as BadgeKey | "");
        setAllowMaster(!!f?.allow_master_coach_sale);
        setFreeCouncil(!!f?.free_for_council);
        setFreeNutritionist(!!f?.free_for_nutritionist);
      })
      .catch(() => {})
      .finally(() => setLoading(false));
  }, [productId]);

  const handleSave = async () => {
    setSaving(true);
    try {
      await saveFlags({
        data: {
          productId,
          required_badge: (requiredBadge || null) as BadgeKey | null,
          allow_master_coach_sale: allowMaster,
          free_for_council: freeCouncil,
          free_for_nutritionist: freeNutritionist,
        },
      });
      toast.success("Restrições salvas");
    } catch (e: any) {
      toast.error(e?.message || "Erro ao salvar");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="mb-6 rounded-lg border border-white/10 p-4" style={{ backgroundColor: "#161616" }}>
      <div className="flex items-center justify-between mb-3">
        <SectionLabel>Acesso por categoria</SectionLabel>
        <button
          onClick={handleSave}
          disabled={loading || saving}
          className="flex items-center gap-1.5 rounded-md bg-[#E24B4A] hover:bg-[#E24B4A]/90 disabled:opacity-50 px-3 py-1.5 text-xs font-bold text-white"
        >
          {saving ? <Loader2 className="h-3 w-3 animate-spin" /> : <Save className="h-3 w-3" />}
          Salvar restrições
        </button>
      </div>
      {loading ? (
        <Loader2 className="h-4 w-4 animate-spin text-white/40" />
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-3 text-sm">
          <label className="block">
            <span className="block text-xs text-white/60 mb-1">Categoria exigida para vender</span>
            <select
              value={requiredBadge}
              onChange={(e) => setRequiredBadge(e.target.value as BadgeKey | "")}
              className="w-full rounded-md bg-white/5 border border-white/10 px-2 py-1.5 text-sm text-white outline-none focus:border-[#E24B4A]"
            >
              <option value="">Sem restrição (todos vendem)</option>
              {BADGE_KEYS.map((k) => (
                <option key={k} value={k}>{BADGE_LABEL[k]}</option>
              ))}
            </select>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-3 cursor-pointer hover:border-white/30">
            <input
              type="checkbox"
              checked={allowMaster}
              onChange={(e) => setAllowMaster(e.target.checked)}
              className="mt-0.5 accent-[#E24B4A]"
            />
            <div>
              <p className="text-xs font-semibold text-white">Permitir venda do Master Coach</p>
              <p className="text-[11px] text-white/50">Master coach ganha 10% extra ao vender</p>
            </div>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-3 cursor-pointer hover:border-white/30">
            <input
              type="checkbox"
              checked={freeCouncil}
              onChange={(e) => setFreeCouncil(e.target.checked)}
              className="mt-0.5 accent-[#E24B4A]"
            />
            <div>
              <p className="text-xs font-semibold text-white">Gratuito para Conselho</p>
              <p className="text-[11px] text-white/50">Coaches com categoria "Conselho" não pagam</p>
            </div>
          </label>
          <label className="flex items-start gap-2 rounded-md border border-white/10 bg-white/5 p-3 cursor-pointer hover:border-white/30">
            <input
              type="checkbox"
              checked={freeNutritionist}
              onChange={(e) => setFreeNutritionist(e.target.checked)}
              className="mt-0.5 accent-[#E24B4A]"
            />
            <div>
              <p className="text-xs font-semibold text-white">Gratuito para Nutricionista Parceiro</p>
              <p className="text-[11px] text-white/50">Coaches com categoria "Nutricionista Parceiro" não pagam (ex.: FitMindShape)</p>
            </div>
          </label>
        </div>
      )}
    </div>
  );
}
