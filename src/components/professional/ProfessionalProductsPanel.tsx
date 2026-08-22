import React, { useEffect, useState } from "react";
import { RecurrenceFields, normalizeRecurrence, recurrenceLabel } from "@/components/shared/RecurrenceFields";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { Plus, Loader2, X, Save, DollarSign, Trash2, Package, Gift, CalendarDays, Clock, Copy, ArrowUp, ArrowDown, Eye, Users } from "lucide-react";
import { useServerFn } from "@tanstack/react-start";
import { CoproductionEditor } from "@/components/shared/CoproductionEditor";
import { ProductImageGallery } from "@/components/ui/ProductImageGallery";
import { listCoproducedProducts } from "@/lib/collab.functions";
import { ProductDownloadsManager } from "@/components/admin/ProductDownloadsManager";
import { ProductBuyersModal } from "@/components/products/ProductBuyersModal";


type TimeRange = { start: string; end: string };
type AvailabilityHours = Record<string, TimeRange[]>;
import {
  computeFromCharge,
  computeFromReceive,
  COACH_COMMISSION_OPTIONS,
  type CoachCommissionPct,
  type PartnerPriceMode,
  type PartnerSplitOverride,
} from "@/lib/partnerFinance";
import { CurrencyInputBRL } from "@/components/ui/currency-input";
import { CategoryPicker } from "@/components/store/CategoryPicker";

interface ProProduct {
  id: string;
  coach_id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  image_urls?: string[] | null;
  price: number;
  original_price?: number | null;
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
  // Freebie / coupon (optional)
  kind?: "paid" | "free";
  redemption_mode?: "free" | "discount";
  discount_percent?: number | null;
  estimated_value?: number | null;
  benefit_start_time?: string | null;
  benefit_end_time?: string | null;
  monthly_redeem_limit?: number | null;
  weekly_limit_per_student?: number | null;
  uses_scheduling?: boolean | null;
  redemption_location_name?: string | null;
  redemption_location_url?: string | null;
  // Advanced availability
  availability_weekdays?: number[];
  availability_recurrence?: "single" | "weekly";
  availability_validity_days?: number | null;
  availability_hours?: AvailabilityHours;
  event_date?: string | null;
  event_capacity?: number | null;
  event_start_time?: string | null;
  event_end_time?: string | null;
  payment_timing?: "at_booking" | "later";
  sort_order?: number | null;
  is_physical?: boolean;
  delivery_days?: number | null;
  is_mirrored?: boolean;
  mirror_source_product_id?: string | null;
  // Custom split (SaaS por produto)
  custom_split?: boolean;
  skip_tax?: boolean;
  system_fee_pct_override?: number | null;
  system_fee_amount_override?: number | null;
  creator_pct_override?: number | null;
  network_l1_pct_override?: number | null;
  network_l2_pct_override?: number | null;
  network_l3_pct_override?: number | null;
}

function productSplitOverride(p: Partial<ProProduct> | null | undefined): PartnerSplitOverride | undefined {
  if (!p?.custom_split) return undefined;
  return {
    skipTax: !!p.skip_tax,
    systemFeePctOverride: p.system_fee_pct_override ?? null,
    systemFeeAmountOverride: p.system_fee_amount_override ?? null,

    creatorPctOverride: p.creator_pct_override ?? null,
    networkL1PctOverride: p.network_l1_pct_override ?? null,
    networkL2PctOverride: p.network_l2_pct_override ?? null,
    networkL3PctOverride: p.network_l3_pct_override ?? null,
  };
}



const WEEKDAYS = [
  { v: 0, l: "Dom" }, { v: 1, l: "Seg" }, { v: 2, l: "Ter" }, { v: 3, l: "Qua" },
  { v: 4, l: "Qui" }, { v: 5, l: "Sex" }, { v: 6, l: "Sáb" },
];

export default function ProfessionalProductsPanel({ coachId }: { coachId: string }) {
  const [products, setProducts] = useState<ProProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Partial<ProProduct> | null>(null);
  const [readOnly, setReadOnly] = useState(false);
  const [readOnlyCreator, setReadOnlyCreator] = useState<string | null>(null);
  const [uploading, setUploading] = useState(false);
  const [buyersFor, setBuyersFor] = useState<{ id: string; name: string; type: "partner" | "professional" } | null>(null);
  const [coproduced, setCoproduced] = useState<Array<{ coproductionId: string; creatorName: string; splitKind: string; percentOfNet: number | null; fixedAmountBrl: number | null; product: ProProduct }>>([]);
  const loadCoproducedFn = useServerFn(listCoproducedProducts);
  // Blocos da agenda do profissional: duração dos produtos precisa ser múltipla deles.
  const [agenda, setAgenda] = useState<{ slotMinutes: number; maxWindow: number; summary: string[] }>({ slotMinutes: 30, maxWindow: 0, summary: [] });

  useEffect(() => {
    (async () => {
      const { data } = await supabase
        .from("professional_availability" as never)
        .select("weekday,start_time,end_time,slot_minutes,is_active")
        .eq("professional_coach_id" as never, coachId as never);
      const rows = ((data as unknown) as Array<{ weekday: number; start_time: string; end_time: string; slot_minutes: number | null; is_active: boolean | null }>) || [];
      const active = rows.filter((r) => r.is_active !== false);
      if (!active.length) return;
      const toMin = (t: string) => { const [h, m] = t.split(":"); return Number(h) * 60 + Number(m); };
      const fmt = (m: number) => `${String(Math.floor(m / 60)).padStart(2, "0")}:${String(m % 60).padStart(2, "0")}`;
      const slotMinutes = Math.min(...active.map((r) => Number(r.slot_minutes || 30)));
      // Faixas coladas (ex.: 14:00–14:30, 14:30–15:00…) formam UMA janela contínua.
      const byDay = new Map<number, Array<[number, number]>>();
      for (const r of active) {
        const list = byDay.get(r.weekday) || [];
        list.push([toMin(r.start_time), toMin(r.end_time)]);
        byDay.set(r.weekday, list);
      }
      const DAYS = ["Dom", "Seg", "Ter", "Qua", "Qui", "Sex", "Sáb"];
      let maxWindow = 0;
      const summary: string[] = [];
      for (const [wd, listRaw] of Array.from(byDay.entries()).sort((a, b) => a[0] - b[0])) {
        const list = listRaw.sort((a, b) => a[0] - b[0]);
        const merged: Array<[number, number]> = [];
        for (const [s, e] of list) {
          const last = merged[merged.length - 1];
          if (last && s <= last[1]) last[1] = Math.max(last[1], e);
          else merged.push([s, e]);
        }
        for (const [s, e] of merged) maxWindow = Math.max(maxWindow, e - s);
        summary.push(`${DAYS[wd]} ${merged.map(([s, e]) => `${fmt(s)}–${fmt(e)}`).join(", ")}`);
      }
      setAgenda({ slotMinutes: slotMinutes > 0 ? slotMinutes : 30, maxWindow, summary });
    })();
  }, [coachId]);


  const load = async () => {
    setLoading(true);
    const { data } = await supabase
      .from("professional_products" as never)
      .select("*")
      .eq("coach_id" as never, coachId)
      .order("sort_order" as never, { ascending: true })
      .order("created_at" as never, { ascending: false });
    setProducts((data as unknown as ProProduct[]) || []);
    try {
      const r = await loadCoproducedFn({ data: { entityType: "professional", entityId: coachId } });
      setCoproduced(r.items as any);
    } catch { /* silently ignore */ }
    setLoading(false);
  };


  useEffect(() => { load(); }, [coachId]);

  const blank = (): Partial<ProProduct> => ({
    coach_id: coachId,
    name: "", description: "", image_url: "", image_urls: [], price: 0, stock: null,
    original_price: null,
    redemption_instructions: "", is_active_by_professional: true,
    price_input_mode: "charge",
    coach_commission_percentage: 10,
    professional_net_amount: 0,
    section_id: null,
    category_id: null,
    is_schedulable: false,
    default_duration_minutes: 30,
    cancellation_window_hours: 24,
    kind: "paid",
    redemption_mode: "free",
    discount_percent: null,
    estimated_value: null,
    benefit_start_time: null,
    benefit_end_time: null,
    monthly_redeem_limit: null,
    weekly_limit_per_student: 1,
    uses_scheduling: false,
    redemption_location_name: null,
    redemption_location_url: null,
    availability_weekdays: [],
    availability_recurrence: "weekly",
    availability_validity_days: null,
    availability_hours: {},
    event_date: null,
    event_capacity: null,
    event_start_time: null,
    event_end_time: null,
    payment_timing: "at_booking",
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
  void upload; void uploading;

  const save = async () => {
    if (!editing?.name?.trim()) return toast.error("Informe o nome do produto.");
    const isFree = editing.kind === "free";

    const emptyToNull = (v: unknown) => (typeof v === "string" && v.trim() === "" ? null : v);
    let payload: Record<string, unknown> = {
      ...editing,
      coach_id: coachId,
      // Produtos gratuitos de profissionais entram já aprovados para aparecer imediatamente na aba Gratuitos
      status: (editing.status as string | undefined) || (isFree ? "approved" : "pending"),
      admin_notes: (editing as { admin_notes?: string | null }).admin_notes ?? null,
      image_url: (editing.image_urls?.[0] ?? (emptyToNull(editing.image_url) as string | null)) || null,
      image_urls: editing.image_urls?.length ? editing.image_urls : (editing.image_url ? [editing.image_url] : []),
      description: emptyToNull(editing.description) as string | null,
      redemption_instructions: emptyToNull(editing.redemption_instructions) as string | null,
      section_id: emptyToNull(editing.section_id) as string | null,
      category_id: emptyToNull(editing.category_id) as string | null,
      benefit_start_time: emptyToNull(editing.benefit_start_time) as string | null,
      benefit_end_time: emptyToNull(editing.benefit_end_time) as string | null,
      availability_weekdays: editing.availability_weekdays || [],
      availability_hours: editing.availability_hours || {},
      redemption_location_name: emptyToNull(editing.redemption_location_name) as string | null,
      redemption_location_url: emptyToNull(editing.redemption_location_url) as string | null,
      uses_scheduling: !!editing.uses_scheduling,
      weekly_limit_per_student: Math.max(1, Number(editing.weekly_limit_per_student || 1)),
    };

    if (editing.is_schedulable) {
      const dur = Number(editing.default_duration_minutes || 0);
      if (!dur || dur % agenda.slotMinutes !== 0) {
        return toast.error(
          `A duração precisa ser múltipla dos blocos da sua agenda (${agenda.slotMinutes} min). Ex.: ${agenda.slotMinutes}, ${agenda.slotMinutes * 2}, ${agenda.slotMinutes * 3} min.`,
        );
      }
      if (agenda.maxWindow > 0 && dur > agenda.maxWindow) {
        toast.warning(`Atenção: hoje o maior período livre seguido na sua agenda é de ${agenda.maxWindow} min. Como este atendimento dura ${dur} min, o aluno não vai encontrar horário até você aumentar o período na aba Configurações → Agenda.`);
      }
    }

    if (isFree) {
      payload = {
        ...payload,
        price: 0,
        original_price: null,
        professional_net_amount: 0,
        coach_commission_amount: 0,
        network_l1_amount: 0,
        network_l2_amount: 0,
        network_l3_amount: 0,
        is_schedulable: false,
      };
    } else {
      const pct = (editing.coach_commission_percentage || 10) as CoachCommissionPct;
      const mode = (editing.price_input_mode || "charge") as PartnerPriceMode;
      const split = productSplitOverride(editing);
      const b = mode === "receive"
        ? computeFromReceive(editing.professional_net_amount || 0, pct, "card", undefined, split)
        : computeFromCharge(editing.price || 0, pct, "card", undefined, split);
      if (b.gross <= 0) return toast.error("Informe um valor maior que zero.");
      if (b.partnerNet < 0) return toast.error("Valor insuficiente para cobrir as taxas. Aumente o preço.");
      payload = {
        ...payload,
        price: b.gross,
        original_price: editing.original_price && editing.original_price > b.gross ? Number(editing.original_price) : null,
        professional_net_amount: b.partnerNet,
        coach_commission_amount: b.coachCommission,
        network_l1_amount: b.networkL1,
        network_l2_amount: b.networkL2,
        network_l3_amount: b.networkL3,
      };
    }

    try {
      if (editing.id) {
        const { id, ...up } = payload as { id?: string };
        const { error } = await supabase.from("professional_products" as never).update(up as never).eq("id" as never, editing.id);
        if (error) return toast.error(error.message);
      } else {
        const { error } = await supabase.from("professional_products" as never).insert(payload as never);
        if (error) return toast.error(error.message);
      }
    } catch (e: any) {
      return toast.error(`Falha de rede ao salvar: ${e?.message || e}. Verifique sua conexão e tente novamente.`);
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

  const move = async (index: number, direction: -1 | 1) => {
    const target = index + direction;
    if (target < 0 || target >= products.length) return;
    const a = products[index];
    const b = products[target];
    // Compute new sort orders preserving order (dense re-numbering if ties)
    const list = [...products];
    [list[index], list[target]] = [list[target], list[index]];
    const updates = list.map((p, i) => ({ id: p.id, sort_order: i }));
    // Optimistic UI
    setProducts(list.map((p, i) => ({ ...p, sort_order: i })));
    // Update row-by-row (upsert dispara policy de INSERT do RLS mesmo em conflito)
    for (const u of updates) {
      const { error } = await supabase
        .from("professional_products" as never)
        .update({ sort_order: u.sort_order } as never)
        .eq("id" as never, u.id);
      if (error) {
        toast.error(error.message);
        load();
        return;
      }
    }
    void a; void b;
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

      {(() => {
        const problemas = products.filter(
          (p) => p.status === "pending" || !p.section_id || !p.category_id,
        );
        if (problemas.length === 0) return null;
        return (
          <div className="rounded-xl border border-amber-500/30 bg-amber-500/10 p-3">
            <p className="text-xs font-bold text-amber-300">
              {problemas.length} produto(s) não estão aparecendo na loja
            </p>
            <div className="mt-2 space-y-1">
              {problemas.map((p) => (
                <button
                  key={p.id}
                  type="button"
                  onClick={() => setEditing({ ...p })}
                  className="flex w-full items-center justify-between gap-2 rounded-lg bg-black/25 px-2.5 py-1.5 text-left hover:bg-black/40"
                >
                  <span className="truncate text-[11px] text-white">{p.name}</span>
                  <span className="shrink-0 text-[10px] font-bold text-amber-300">
                    {p.status === "pending"
                      ? "Aguardando aprovação do admin"
                      : !p.section_id
                        ? "Definir seção da loja"
                        : "Definir subcategoria"}
                  </span>
                </button>
              ))}
            </div>
          </div>
        );
      })()}

      {products.length === 0 && (
        <div className="rounded-2xl border border-dashed border-white/10 p-10 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <Package className="mx-auto h-8 w-8 text-white/30 mb-2" />
          <p className="text-sm text-white/50">Nenhum produto cadastrado ainda.</p>
        </div>
      )}

      <div className="space-y-2">
        {products.map((p, index) => (
          <div key={p.id} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex flex-col items-center justify-center gap-1">
              <button
                type="button"
                onClick={() => move(index, -1)}
                disabled={index === 0}
                className="rounded-md bg-white/5 p-1 text-white/60 hover:bg-white/10 disabled:opacity-30"
                title="Mover para cima"
              >
                <ArrowUp className="h-3.5 w-3.5" />
              </button>
              <button
                type="button"
                onClick={() => move(index, 1)}
                disabled={index === products.length - 1}
                className="rounded-md bg-white/5 p-1 text-white/60 hover:bg-white/10 disabled:opacity-30"
                title="Mover para baixo"
              >
                <ArrowDown className="h-3.5 w-3.5" />
              </button>
            </div>
            {p.image_url
              ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} />
              : <div className="h-16 w-16 rounded bg-white/5" />}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <p className="text-sm font-bold text-white truncate">{p.name}</p>
                <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(p.status)}`}>{p.status}</span>
                {!p.is_active_by_professional && (
                  <span className="text-[9px] px-1.5 py-0.5 rounded bg-white/10 text-white/60">Oculto</span>
                )}
              </div>
              <div className="mt-0.5 text-[11px] text-white/60">
                {p.original_price && p.original_price > p.price && (
                  <span className="mr-2 text-white/40 line-through">R$ {Number(p.original_price).toFixed(2)}</span>
                )}
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
              <div className="mt-1.5 flex gap-2 items-center flex-wrap">
                {p.is_mirrored && (
                  <span className="text-[10px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">Herbalife (espelho)</span>
                )}
                {!p.is_mirrored && (
                  <>
                    <button onClick={() => setEditing(p)} className="text-[11px] text-white/60 hover:text-white">Editar</button>
                    <button
                      onClick={() => {
                        const { id: _id, ...rest } = p;
                        void _id;
                        setEditing({ ...rest, name: `${p.name} (cópia)`, status: p.status, admin_notes: p.admin_notes, is_active_by_professional: true, is_mirrored: false, mirror_source_product_id: null });
                      }}
                      className="text-[11px] text-white/60 hover:text-white inline-flex items-center gap-1"
                    >
                      <Copy className="h-3 w-3" /> Duplicar
                    </button>
                  </>
                )}
                <button onClick={() => toggleActive(p)} className="text-[11px] text-white/60 hover:text-white">
                  {p.is_active_by_professional ? "Ocultar" : "Mostrar"}
                </button>
                <button
                  onClick={() => setBuyersFor({ id: p.id, name: p.name, type: "professional" })}
                  className="inline-flex items-center gap-1 text-[11px] text-white/60 hover:text-white"
                >
                  <Users className="h-3 w-3" /> Compradores
                </button>

                {!p.is_mirrored && (
                  <button onClick={() => remove(p.id)} className="text-[11px] text-red-400">
                    <Trash2 className="inline h-3 w-3" />
                  </button>
                )}
              </div>
            </div>
          </div>
        ))}
      </div>

      {coproduced.length > 0 && (
        <div className="mt-6 space-y-2">
          <div className="flex items-center gap-2">
            <Users className="h-4 w-4 text-primary" />
            <h3 className="text-sm font-bold text-white">Co-produções (somente visualização)</h3>
          </div>
          <p className="text-[11px] text-white/40">
            Você é coprodutor destes produtos. Pode visualizar todas as configurações, mas apenas o criador pode editá-las.
          </p>
          {coproduced.map((c) => {
            const p = c.product;
            const shareLabel = c.splitKind === "percent"
              ? `${Number(c.percentOfNet || 0).toFixed(2)}% do líquido`
              : `R$ ${Number(c.fixedAmountBrl || 0).toFixed(2)} por venda`;
            return (
              <div key={c.coproductionId} className="rounded-xl p-3 flex gap-3" style={{ backgroundColor: "#1A1A1A" }}>
                {p.image_url
                  ? <img src={p.image_url} className="h-16 w-16 rounded object-cover" alt={p.name} />
                  : <div className="h-16 w-16 rounded bg-white/5" />}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 flex-wrap">
                    <p className="text-sm font-bold text-white truncate">{p.name}</p>
                    <span className={`text-[9px] px-1.5 py-0.5 rounded ${statusColor(p.status)}`}>{p.status}</span>
                    <span className="text-[9px] px-1.5 py-0.5 rounded bg-primary/15 text-primary font-semibold">Co-produção</span>
                  </div>
                  <p className="mt-0.5 text-[11px] text-white/60">
                    Criador: <span className="text-white">{c.creatorName}</span> · Sua parte: <span className="text-primary">{shareLabel}</span>
                  </p>
                  <div className="mt-1.5">
                    <button
                      onClick={() => { setReadOnly(true); setReadOnlyCreator(c.creatorName); setEditing(p); }}
                      className="text-[11px] text-primary hover:text-primary/80 inline-flex items-center gap-1"
                    >
                      <Eye className="h-3 w-3" /> Visualizar painel
                    </button>
                    <button
                      onClick={() => setBuyersFor({ id: p.id, name: p.name, type: (c as any).productType || "professional" })}
                      className="ml-3 text-[11px] text-primary hover:text-primary/80 inline-flex items-center gap-1"
                    >
                      <Users className="h-3 w-3" /> Compradores
                    </button>
                  </div>

                </div>
              </div>
            );
          })}
        </div>
      )}

      {editing && (
        <div className="fixed inset-0 z-50 flex justify-center bg-black/70 p-2 overflow-y-auto overscroll-contain modal-safe items-start sm:items-center">
          <div className="w-full max-w-md rounded-2xl p-5 max-h-[90vh] overflow-y-auto" style={{ backgroundColor: "#1A1A1A" }} onClick={e => e.stopPropagation()}>
            <div className="flex justify-between items-center mb-3">
              <h3 className="text-base font-bold text-white">{readOnly ? "Visualizar" : (editing.id ? "Editar" : "Novo")} produto</h3>
              <button onClick={() => { setEditing(null); setReadOnly(false); setReadOnlyCreator(null); }}><X className="h-5 w-5 text-white/60" /></button>
            </div>
            {readOnly && (
              <div className="mb-3 rounded-lg border border-primary/30 bg-primary/10 px-3 py-2 text-[11px] text-primary">
                Visualização somente-leitura. Apenas <strong>{readOnlyCreator || "o criador"}</strong> pode editar este produto.
              </div>
            )}
            <fieldset disabled={readOnly} className="space-y-3 text-sm border-0 p-0 m-0 disabled:opacity-90">

              <Field label="Nome">
                <input value={editing.name || ""} onChange={e => setEditing({ ...editing, name: e.target.value })} className="field-input" />
              </Field>
              <Field label="Descrição">
                <textarea value={editing.description || ""} onChange={e => setEditing({ ...editing, description: e.target.value })} rows={3} className="field-input" />
              </Field>
              <Field label="Imagens">
                <ProductImageGallery
                  folder={`professionals/${coachId}`}
                  images={editing.image_urls?.length ? editing.image_urls : (editing.image_url ? [editing.image_url] : [])}
                  onChange={(next) => setEditing({ ...editing, image_urls: next, image_url: next[0] || null })}
                />
              </Field>

              {/* Tipo: pago x benefício gratuito (cupom) */}
              <div className="rounded-xl border border-emerald-500/20 bg-emerald-500/5 p-3 space-y-2">
                <div className="flex items-center gap-2 text-xs font-bold text-emerald-300">
                  <Gift className="h-3.5 w-3.5" /> Tipo de produto
                </div>
                <div className="flex rounded-lg bg-black/40 p-0.5">
                  <button type="button" onClick={() => setEditing({ ...editing, kind: "paid" })}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${(editing.kind ?? "paid") === "paid" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                    Pago
                  </button>
                  <button type="button" onClick={() => setEditing({ ...editing, kind: "free" })}
                    className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${editing.kind === "free" ? "bg-emerald-500 text-black" : "text-white/60"}`}>
                    Benefício gratuito (cupom)
                  </button>
                </div>
                <p className="text-[10px] text-white/50">
                  Benefícios gratuitos aparecem na aba <strong>Gratuitos</strong> do aluno com QR code para resgate.
                </p>
              </div>

              {editing.kind === "free" ? (
                <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                  <Field label="Tipo de resgate">
                    <div className="flex rounded-lg bg-black/40 p-0.5">
                      <button type="button" onClick={() => setEditing({ ...editing, redemption_mode: "free" })}
                        className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${(editing.redemption_mode ?? "free") === "free" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                        100% Gratuito
                      </button>
                      <button type="button" onClick={() => setEditing({ ...editing, redemption_mode: "discount" })}
                        className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${editing.redemption_mode === "discount" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                        Cupom de desconto
                      </button>
                    </div>
                  </Field>

                  {editing.redemption_mode === "discount" && (
                    <Field label="Desconto (%)">
                      <input type="number" min={1} max={100} value={editing.discount_percent ?? ""} onChange={e => setEditing({ ...editing, discount_percent: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" />
                    </Field>
                  )}

                  <Field label="Valor estimado do benefício (R$)">
                    <input type="number" step="0.01" min={0} value={editing.estimated_value ?? ""} onChange={e => setEditing({ ...editing, estimated_value: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" placeholder="Aparece como 'economia' para o aluno" />
                  </Field>

                  <div className="grid grid-cols-2 gap-2">
                    <Field label="Disponível a partir das (opcional)">
                      <input type="time" value={editing.benefit_start_time ?? ""} onChange={e => setEditing({ ...editing, benefit_start_time: e.target.value || null })} className="field-input" />
                    </Field>
                    <Field label="Disponível até (opcional)">
                      <input type="time" value={editing.benefit_end_time ?? ""} onChange={e => setEditing({ ...editing, benefit_end_time: e.target.value || null })} className="field-input" />
                    </Field>
                  </div>

                  <Field label="Limite de uso por mês (opcional)">
                    <input type="number" min={1} value={editing.monthly_redeem_limit ?? ""} onChange={e => setEditing({ ...editing, monthly_redeem_limit: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" placeholder="Deixe vazio para ilimitado" />
                  </Field>

                  {editing.redemption_mode !== "discount" && (
                    <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                      <label className="flex items-center gap-2 text-xs font-bold text-white">
                        <input type="checkbox" checked={!!editing.uses_scheduling} onChange={e => setEditing({ ...editing, uses_scheduling: e.target.checked })} />
                        Aluno reserva horário para resgatar
                      </label>
                      {editing.uses_scheduling && (
                        <Field label="Reservas por aluno / semana">
                          <input type="number" min={1} value={editing.weekly_limit_per_student ?? 1} onChange={e => setEditing({ ...editing, weekly_limit_per_student: Math.max(1, Number(e.target.value || 1)) })} className="field-input" />
                        </Field>
                      )}
                    </div>
                  )}

                  <div className="rounded-lg border border-white/10 bg-black/20 p-3 space-y-3">
                    <p className="text-[11px] font-bold uppercase tracking-wider text-white/50">Local de resgate</p>
                    <Field label="Nome do local (opcional)">
                      <input value={editing.redemption_location_name || ""} onChange={e => setEditing({ ...editing, redemption_location_name: e.target.value })} className="field-input" placeholder="Ex: Consultório Centro" />
                    </Field>
                    <Field label="Link do mapa (Google Maps, Waze, etc.)">
                      <input value={editing.redemption_location_url || ""} onChange={e => setEditing({ ...editing, redemption_location_url: e.target.value })} className="field-input" placeholder="https://maps.app.goo.gl/..." />
                    </Field>
                  </div>
                </div>
              ) : (
                <PaidPricingEditor
                  product={editing}
                  onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
                />
              )}

              <Field label="Estoque (opcional)">
                <input type="number" value={editing.stock ?? ""} onChange={e => setEditing({ ...editing, stock: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" />
              </Field>

              {editing.kind !== "free" && (
                <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-2">
                  <label className="flex items-center gap-2 text-xs font-bold text-primary">
                    <input
                      type="checkbox"
                      checked={!!editing.is_physical}
                      onChange={e => setEditing({ ...editing, is_physical: e.target.checked })}
                    />
                    Produto físico (requer entrega)
                  </label>
                  {editing.is_physical && (
                    <Field label="Prazo médio de entrega (dias) *">
                      <input
                        type="number"
                        min={1}
                        max={365}
                        value={editing.delivery_days ?? ""}
                        onChange={e => setEditing({ ...editing, delivery_days: e.target.value === "" ? null : Math.max(1, Number(e.target.value)) })}
                        placeholder="Ex.: 7"
                        className="field-input"
                      />
                    </Field>
                  )}
                </div>
              )}

              <CategoryPicker
                targetAudience="professional"
                sectionId={editing.section_id}
                categoryId={editing.category_id}
                onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } : prev)}
              />

              <Field label="Instruções de resgate">
                <textarea value={editing.redemption_instructions || ""} onChange={e => setEditing({ ...editing, redemption_instructions: e.target.value })} rows={2} className="field-input" placeholder="Ex: Como o aluno usa o produto após pagar / resgatar" />
              </Field>

              {/* Disponibilidade (dias / recorrência / validade) — para qualquer produto */}
              <div className="rounded-xl border border-white/10 bg-black/30 p-3 space-y-3">
                <div className="flex items-center gap-2 text-xs font-bold text-white">
                  <CalendarDays className="h-3.5 w-3.5 text-primary" /> Disponibilidade do produto
                </div>

                <Field label="Dias da semana liberados">
                  <div className="flex flex-wrap gap-1.5">
                    {WEEKDAYS.map(d => {
                      const selected = (editing.availability_weekdays || []).includes(d.v);
                      return (
                        <button key={d.v} type="button"
                          onClick={() => {
                            const cur = editing.availability_weekdays || [];
                            const next = selected ? cur.filter(x => x !== d.v) : [...cur, d.v].sort((a, b) => a - b);
                            setEditing({ ...editing, availability_weekdays: next });
                          }}
                          className={`rounded-lg px-2.5 py-1 text-[11px] font-bold transition ${selected ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60 hover:text-white"}`}>
                          {d.l}
                        </button>
                      );
                    })}
                  </div>
                  <p className="mt-1 text-[10px] text-white/40">Vazio = todos os dias.</p>
                </Field>

                {(editing.availability_weekdays && editing.availability_weekdays.length > 0) && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-[11px] font-bold text-white/80">
                      <Clock className="h-3 w-3 text-primary" /> Horários por dia
                    </div>
                    {(editing.availability_weekdays || []).map(wd => {
                      const label = WEEKDAYS.find(w => w.v === wd)?.l || "";
                      const key = String(wd);
                      const ranges = (editing.availability_hours || {})[key] || [];
                      const updateRanges = (next: TimeRange[]) => {
                        const all = { ...(editing.availability_hours || {}) };
                        if (next.length === 0) delete all[key]; else all[key] = next;
                        setEditing({ ...editing, availability_hours: all });
                      };
                      return (
                        <div key={wd} className="rounded-lg bg-black/40 border border-white/5 p-2">
                          <div className="flex items-center justify-between mb-1.5">
                            <span className="text-[11px] font-bold text-white">{label}</span>
                            <button type="button"
                              onClick={() => updateRanges([...ranges, { start: "08:00", end: "18:00" }])}
                              className="flex items-center gap-1 rounded bg-primary/15 text-primary px-2 py-0.5 text-[10px] font-bold">
                              <Plus className="h-3 w-3" /> Faixa
                            </button>
                          </div>
                          {ranges.length === 0 ? (
                            <p className="text-[10px] text-white/40">Sem horário definido (dia inteiro).</p>
                          ) : (
                            <div className="space-y-1.5">
                              {ranges.map((r, i) => (
                                <div key={i} className="flex items-center gap-1.5">
                                  <input type="time" value={r.start}
                                    onChange={e => {
                                      const next = [...ranges];
                                      next[i] = { ...next[i], start: e.target.value };
                                      updateRanges(next);
                                    }}
                                    className="field-input flex-1 !py-1 !text-xs" />
                                  <span className="text-white/40 text-[10px]">até</span>
                                  <input type="time" value={r.end}
                                    onChange={e => {
                                      const next = [...ranges];
                                      next[i] = { ...next[i], end: e.target.value };
                                      updateRanges(next);
                                    }}
                                    className="field-input flex-1 !py-1 !text-xs" />
                                  <button type="button"
                                    onClick={() => updateRanges(ranges.filter((_, j) => j !== i))}
                                    className="text-red-400 p-1">
                                    <Trash2 className="h-3 w-3" />
                                  </button>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      );
                    })}
                    <p className="text-[10px] text-white/40">Você pode adicionar várias faixas por dia (ex: 08:00–12:00 e 14:00–18:00).</p>
                  </div>
                )}

                <Field label="Recorrência">
                  <div className="flex rounded-lg bg-black/40 p-0.5">
                    <button type="button" onClick={() => setEditing({ ...editing, availability_recurrence: "single" })}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${editing.availability_recurrence === "single" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                      Uso único
                    </button>
                    <button type="button" onClick={() => setEditing({ ...editing, availability_recurrence: "weekly" })}
                      className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${(editing.availability_recurrence ?? "weekly") === "weekly" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                      Toda semana
                    </button>
                  </div>
                </Field>

                {editing.availability_recurrence === "single" && (
                  <div className="grid grid-cols-2 gap-2 rounded-lg border border-primary/20 bg-primary/5 p-2">
                    <Field label="Data do evento">
                      <input type="date" value={editing.event_date ?? ""} onChange={e => setEditing({ ...editing, event_date: e.target.value || null })} className="field-input" />
                    </Field>
                    <Field label="Vagas disponíveis">
                      <input type="number" min={1} value={editing.event_capacity ?? ""} onChange={e => setEditing({ ...editing, event_capacity: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" placeholder="Ex: 20" />
                    </Field>
                    <Field label="Horário de abertura">
                      <input type="time" value={editing.event_start_time ?? ""} onChange={e => setEditing({ ...editing, event_start_time: e.target.value || null })} className="field-input" />
                    </Field>
                    <Field label="Horário de encerramento">
                      <input type="time" value={editing.event_end_time ?? ""} onChange={e => setEditing({ ...editing, event_end_time: e.target.value || null })} className="field-input" />
                    </Field>
                    <p className="col-span-2 text-[10px] text-white/50">Para eventos e workshops: defina a data específica, os horários e o número máximo de pessoas.</p>
                  </div>
                )}

                <Field label="Validade após compra (dias)">
                  <input type="number" min={1} value={editing.availability_validity_days ?? ""} onChange={e => setEditing({ ...editing, availability_validity_days: e.target.value === "" ? null : Number(e.target.value) })} className="field-input" placeholder="Ex: 30 (quantos dias o produto fica disponível após a compra)" />
                </Field>
              </div>

              {editing.kind !== "free" && (
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
                      <Field label={`Duração (blocos de ${agenda.slotMinutes} min)`}>
                        <select
                          value={String(editing.default_duration_minutes ?? agenda.slotMinutes)}
                          onChange={(e) => setEditing({ ...editing, default_duration_minutes: Number(e.target.value) })}
                          className="field-input"
                        >
                          {Array.from({ length: 8 }, (_, i) => (i + 1) * agenda.slotMinutes).map((m) => (
                            <option key={m} value={m}>
                              {m} min ({m / agenda.slotMinutes} bloco{m / agenda.slotMinutes > 1 ? "s" : ""})
                            </option>
                          ))}
                        </select>
                        <p className="mt-1 text-[10px] text-white/40">
                          Sua agenda usa blocos de {agenda.slotMinutes} min.
                          {agenda.summary.length > 0 && <> Horários configurados: {agenda.summary.join(" · ")}.</>}
                        </p>
                        {agenda.maxWindow > 0 && Number(editing.default_duration_minutes || agenda.slotMinutes) > agenda.maxWindow && (
                          <p className="mt-1 text-[10px] font-bold text-amber-400">
                            O maior período livre seguido na sua agenda é de {agenda.maxWindow} min. Com esta duração o aluno não encontrará horário — aumente o período em Configurações → Agenda.
                          </p>
                        )}
                      </Field>
                      <Field label="Janela cancelar (h)">
                        <input
                          type="number"
                          min={0}
                          max={168}
                          value={editing.cancellation_window_hours ?? ""}
                          onChange={(e) => {
                            const v = e.target.value;
                            setEditing({ ...editing, cancellation_window_hours: v === "" ? undefined : Number(v) });
                          }}
                          onBlur={(e) => {
                            if (e.target.value === "") setEditing({ ...editing, cancellation_window_hours: 24 });
                          }}
                          className="field-input"
                        />
                      </Field>
                    </div>
                  )}
                  {editing.is_schedulable && (
                    <>
                      <Field label="Momento do pagamento">
                        <div className="flex rounded-lg bg-black/40 p-0.5">
                          <button type="button" onClick={() => setEditing({ ...editing, payment_timing: "at_booking" })}
                            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${(editing.payment_timing ?? "at_booking") === "at_booking" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                            Pagar ao agendar
                          </button>
                          <button type="button" onClick={() => setEditing({ ...editing, payment_timing: "later" })}
                            className={`flex-1 rounded-md px-2 py-1.5 text-[11px] font-bold transition ${editing.payment_timing === "later" ? "bg-primary text-primary-foreground" : "text-white/60"}`}>
                            Agendar e pagar depois
                          </button>
                        </div>
                        <p className="mt-1 text-[10px] text-white/50">
                          {editing.payment_timing === "later"
                            ? "O aluno reserva o horário e pode pagar depois (ex.: no atendimento presencial)."
                            : "O aluno precisa pagar no ato do agendamento para confirmar a reserva."}
                        </p>
                      </Field>
                      <p className="text-[10px] text-white/50">
                        Defina seus dias e horários disponíveis na aba <strong>Configurações → Agenda</strong>.
                      </p>
                    </>
                  )}
                </div>
              )}
            </fieldset>
            {editing.kind === "paid" && !readOnly && (
              <div className="mt-4 grid gap-3">
                <RecurrenceFields
                  value={editing as any}
                  price={Number(editing.price || 0)}
                  onChange={(patch) => setEditing(prev => prev ? { ...prev, ...patch } as any : prev)}
                />
              </div>
            )}
            {editing.id && editing.kind === "paid" && !readOnly && (
              <div className="mt-4 border-t border-white/10 pt-4">
                <CoproductionEditor
                  productType="professional"
                  productId={editing.id}
                  creatorType="professional"
                  creatorId={coachId}
                  productNetValueBrl={Number(editing.professional_net_amount || editing.price || 0)}
                />
              </div>
            )}
            {(editing.kind ?? "paid") === "paid" && !readOnly && (
              <div className="mt-4 border-t border-white/10 pt-4">
                {editing.id ? (
                  <ProductDownloadsManager professionalProductId={editing.id} />
                ) : (
                  <div className="rounded-lg border border-dashed border-white/20 bg-white/5 p-3 text-xs text-white/60">
                    <p className="font-semibold text-white/80 mb-1">Arquivos para download após compra</p>
                    <p>Salve o produto primeiro para poder anexar ebooks/PDFs. Depois, edite este produto novamente para enviar os arquivos.</p>
                  </div>
                )}
              </div>
            )}
            <div className="mt-4 flex gap-2">
              <button onClick={() => { setEditing(null); setReadOnly(false); setReadOnlyCreator(null); }} className="flex-1 rounded bg-white/5 px-3 py-2 text-sm text-white">
                {readOnly ? "Fechar" : "Cancelar"}
              </button>
              {!readOnly && (
                <button onClick={save} className="flex-1 rounded bg-primary px-3 py-2 text-sm font-bold text-primary-foreground">
                  <Save className="inline h-4 w-4 mr-1" /> Salvar
                </button>
              )}
            </div>
          </div>
        </div>
      )}

      {buyersFor && (
        <ProductBuyersModal
          productType={buyersFor.type}
          productId={buyersFor.id}
          productName={buyersFor.name}
          onClose={() => setBuyersFor(null)}
        />
      )}

      <style>{`.field-input { width:100%; border-radius:.375rem; background:rgba(0,0,0,.4); border:1px solid rgba(255,255,255,.1); padding:.5rem .75rem; color:white; font-size:.875rem; }`}</style>

    </div>
  );
}

function PaidPricingEditor({ product, onChange }: { product: Partial<ProProduct>; onChange: (patch: Partial<ProProduct>) => void }) {
  const mode = (product.price_input_mode || "charge") as PartnerPriceMode;
  const pct = (product.coach_commission_percentage || 10) as CoachCommissionPct;
  const [method, setMethod] = useState<"pix" | "card">("card");
  const split = productSplitOverride(product);
  const isCustom = !!split;

  const charge = Number(product.price) || 0;
  const receive = Number(product.professional_net_amount) || 0;

  const breakdown = mode === "receive"
    ? computeFromReceive(receive, pct, method, undefined, split)
    : computeFromCharge(charge, pct, method, undefined, split);

  const updateCharge = (n: number) => onChange({ price: n });
  const updateReceive = (n: number) => {
    const inv = computeFromReceive(n, pct, method, undefined, split);
    onChange({ professional_net_amount: n, price: inv.gross });
  };

  const switchMode = (next: PartnerPriceMode) => {
    if (next === "receive") {
      const b = computeFromCharge(charge, pct, method, undefined, split);
      onChange({ price_input_mode: next, professional_net_amount: Math.max(0, b.partnerNet) });
    } else {
      onChange({ price_input_mode: next, price: breakdown.gross });
    }
  };

  const changePct = (next: CoachCommissionPct) => {
    if (mode === "receive") {
      const inv = computeFromReceive(receive, next, method, undefined, split);
      onChange({ coach_commission_percentage: next, price: inv.gross });
    } else {
      onChange({ coach_commission_percentage: next });
    }
  };

  const changeMethod = (m: "pix" | "card") => {
    setMethod(m);
    if (mode === "receive") {
      const inv = computeFromReceive(receive, pct, m, undefined, split);
      onChange({ price: inv.gross });
    }
  };

  const fmtPct = (n: number) => `${Number(n).toLocaleString("pt-BR", { maximumFractionDigits: 2 })}%`;
  const creatorPctLabel = isCustom && split?.creatorPctOverride != null
    ? fmtPct(Number(split.creatorPctOverride))
    : null;

  return (
    <div className="rounded-xl border border-primary/20 bg-primary/5 p-3 space-y-3">
      <div className="flex items-center gap-2 text-xs font-bold text-primary">
        <DollarSign className="h-3.5 w-3.5" /> Financeiro do produto
      </div>

      {isCustom && (
        <div className="rounded-md border border-amber-400/30 bg-amber-500/10 px-2.5 py-1.5 text-[11px] text-amber-200">
          Este produto usa <strong>regras financeiras personalizadas</strong> configuradas pelo admin. Os campos abaixo respeitam essa cascata específica.
        </div>
      )}

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
        <Field label="Valor de venda cobrado do cliente">
          <CurrencyInputBRL value={charge} onChange={updateCharge} />
        </Field>
      ) : (
        <Field label="Quanto você quer receber líquido">
          <CurrencyInputBRL value={receive} onChange={updateReceive} />
          <p className="mt-1 text-[10px] text-white/40">O preço cobrado é aumentado automaticamente para cobrir as taxas (igual simulação de cartão em apps bancários).</p>
        </Field>
      )}

      <Field label="Valor original do produto (opcional)">
        <CurrencyInputBRL value={Number(product.original_price || 0)} onChange={(n) => onChange({ original_price: n > 0 ? n : null })} />
        <p className="mt-1 text-[10px] text-white/40">Use quando houver desconto. O cliente verá o valor original riscado e o valor de venda em destaque.</p>
      </Field>

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

      {!isCustom && (
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
      )}

      <div className="rounded-lg bg-black/40 p-2.5 text-[11px] space-y-1">
        <BreakdownLine label="Valor cobrado do cliente" value={breakdown.gross} bold />
        <BreakdownLine label={`− Taxa ${method === "pix" ? "PIX (0,99%)" : "cartão (4,98%)"}`} value={-breakdown.paymentFee} muted />
        {breakdown.taxPct > 0 && (
          <BreakdownLine label={`− Reserva fiscal (${fmtPct(breakdown.taxPct)})`} value={-breakdown.tax} muted />
        )}
        <BreakdownLine
          label={split?.systemFeeAmountOverride != null
            ? "− Taxa do sistema (valor fixo)"
            : `− Taxa do sistema (${fmtPct(breakdown.systemFeePct)})`}
          value={-breakdown.systemFee}
          muted
        />
        <BreakdownLine
          label={`− Cadeia comercial (${fmtPct(breakdown.coachCommissionPct)})`}
          value={-breakdown.coachCommission}
          muted
        />
        <div className="my-1 border-t border-white/10" />
        <BreakdownLine
          label={creatorPctLabel ? `✓ Criador (${creatorPctLabel})` : "✓ Líquido para você"}
          value={breakdown.partnerNet}
          highlight
        />
        <div className="mt-2 pt-2 border-t border-white/10 space-y-1">
          <p className="text-white/40 text-[10px] font-semibold uppercase">Distribuição da cadeia comercial</p>
          <BreakdownLine label="Coach vendedor (líquido)" value={breakdown.coachNet} muted />
          <BreakdownLine label={`Rede L1 (${fmtPct(breakdown.networkL1Pct)})`} value={breakdown.networkL1} muted />
          <BreakdownLine label={`Rede L2 (${fmtPct(breakdown.networkL2Pct)})`} value={breakdown.networkL2} muted />
          <BreakdownLine label={`Rede L3 (${fmtPct(breakdown.networkL3Pct)})`} value={breakdown.networkL3} muted />
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
