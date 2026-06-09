import { useEffect, useState } from "react";
import { X, Check, Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { computeFromCharge, DEFAULT_PARTNER_FEES } from "@/lib/partnerFinance";
import { toast } from "sonner";

type Kind = "partner_products" | "professional_products";

interface Props {
  table: Kind;
  productId: string;
  onClose: () => void;
  onChanged?: () => void;
}

interface ProductFull {
  id: string;
  name: string;
  description: string | null;
  image_url: string | null;
  price: number;
  status: string;
  admin_notes: string | null;
  section_id: string | null;
  category_id: string | null;
  coach_commission_percentage: number | null;
  system_fee_fixed?: number | null;
  tax_percentage: number | null;
  card_fee_percentage: number | null;
  pix_fee_percentage?: number | null;
  partner_net_amount?: number | null;
  professional_net_amount?: number | null;
  coach_commission_amount: number | null;
  network_l1_amount: number | null;
  network_l2_amount: number | null;
  network_l3_amount: number | null;
}

const money = (v: number | null | undefined) =>
  Number(v || 0).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export function ProductReviewModal({ table, productId, onClose, onChanged }: Props) {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [product, setProduct] = useState<ProductFull | null>(null);
  const [sectionName, setSectionName] = useState<string>("—");
  const [categoryName, setCategoryName] = useState<string>("—");
  const [note, setNote] = useState("");

  useEffect(() => {
    (async () => {
      setLoading(true);
      const { data } = await supabase
        .from(table as never)
        .select("*")
        .eq("id" as never, productId)
        .maybeSingle();
      const p = data as unknown as ProductFull | null;
      setProduct(p);
      setNote(p?.admin_notes || "");
      if (p?.section_id) {
        const { data: s } = await supabase
          .from("store_sections" as never)
          .select("name")
          .eq("id" as never, p.section_id)
          .maybeSingle();
        setSectionName(((s as { name?: string } | null)?.name) || "—");
      }
      if (p?.category_id) {
        const { data: c } = await supabase
          .from("store_categories" as never)
          .select("name")
          .eq("id" as never, p.category_id)
          .maybeSingle();
        setCategoryName(((c as { name?: string } | null)?.name) || "—");
      }
      setLoading(false);
    })();
  }, [table, productId]);

  const review = async (decision: "approved" | "rejected") => {
    if (decision === "rejected" && !note.trim()) {
      toast.error("Informe a observação para reprovar");
      return;
    }
    setSaving(true);
    const patch: Record<string, unknown> = { status: decision, admin_notes: note || null };
    if (decision === "approved" && table === "partner_products") {
      patch.approved_at = new Date().toISOString();
    }
    const { error } = await supabase
      .from(table as never)
      .update(patch as never)
      .eq("id" as never, productId);
    setSaving(false);
    if (error) return toast.error(error.message);
    toast.success(decision === "approved" ? "Produto aprovado" : "Produto reprovado");
    onChanged?.();
    onClose();
  };

  if (loading || !product) {
    return (
      <div className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4">
        <Loader2 className="h-6 w-6 animate-spin text-primary" />
      </div>
    );
  }

  const price = Number(product.price || 0);
  const cardFeePct = product.card_fee_percentage != null ? Number(product.card_fee_percentage) : DEFAULT_PARTNER_FEES.cardFeePct;
  const pixFeePct = product.pix_fee_percentage != null ? Number(product.pix_fee_percentage) : DEFAULT_PARTNER_FEES.pixFeePct;
  const taxPct = product.tax_percentage != null ? Number(product.tax_percentage) : DEFAULT_PARTNER_FEES.taxPct;
  const sysFeePct = DEFAULT_PARTNER_FEES.systemFeePct;
  const coachPct = Number(product.coach_commission_percentage || 0) as 10 | 20 | 30 | 40 | 50;
  const cardBreakdown = computeFromCharge(price, coachPct, "card", { systemFeePct, taxPct, cardFeePct, pixFeePct });
  const pixBreakdown = computeFromCharge(price, coachPct, "pix", { systemFeePct, taxPct, cardFeePct, pixFeePct });
  const coachAmt = Number(product.coach_commission_amount || 0);
  const l1 = Number(product.network_l1_amount || 0);
  const l2 = Number(product.network_l2_amount || 0);
  const l3 = Number(product.network_l3_amount || 0);
  const ownerNet = Number(product.partner_net_amount ?? product.professional_net_amount ?? 0);

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/80 p-4 backdrop-blur-sm"
    >
      <div
        onClick={(e) => e.stopPropagation()}
        className="max-h-[92vh] w-full max-w-2xl overflow-y-auto rounded-2xl border border-white/10 bg-[#1A1A1A]"
      >
        <div className="relative aspect-[16/9] w-full overflow-hidden rounded-t-2xl bg-white/5">
          {product.image_url ? (
            <img src={product.image_url} alt={product.name} className="h-full w-full object-cover" />
          ) : (
            <div className="flex h-full w-full items-center justify-center text-white/30">Sem imagem</div>
          )}
          <button
            onClick={onClose}
            className="absolute right-3 top-3 flex h-9 w-9 items-center justify-center rounded-full bg-black/60 text-white"
          >
            <X className="h-4 w-4" />
          </button>
          <span
            className={`absolute left-3 top-3 rounded-full px-3 py-1 text-[10px] font-bold ${
              product.status === "approved"
                ? "bg-green-500/20 text-green-300"
                : product.status === "rejected"
                ? "bg-red-500/20 text-red-300"
                : "bg-yellow-500/20 text-yellow-300"
            }`}
          >
            {product.status}
          </span>
        </div>

        <div className="space-y-4 p-5">
          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">
              {sectionName} · {categoryName}
            </p>
            <h2 className="mt-1 text-xl font-bold text-white">{product.name}</h2>
            <p className="mt-2 text-2xl font-bold text-primary">{money(price)}</p>
          </div>

          {product.description && (
            <div>
              <p className="text-xs font-bold uppercase tracking-wider text-white/40">Descrição</p>
              <p className="mt-1 whitespace-pre-line text-sm text-white/85">{product.description}</p>
            </div>
          )}

          <div className="rounded-xl border border-white/10 bg-black/30 p-4">
            <p className="mb-3 text-xs font-bold uppercase tracking-wider text-primary">
              Cálculo de comissões
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <Row label="Taxa cartão" value={`${cardFeePct}%`} />
              <Row label="Taxa PIX" value={`${pixFeePct}%`} />
              <Row label="Imposto" value={`${taxPct}%`} />
              <Row label="Taxa sistema" value={money(sysFee)} />
              <Row label="Líquido (Cartão)" value={money(baseCard)} />
              <Row label="Líquido (PIX)" value={money(basePix)} />
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2 text-center text-[11px]">
              {[
                { label: "Coach", v: coachAmt },
                { label: "Nível 1", v: l1 },
                { label: "Nível 2", v: l2 },
                { label: "Nível 3", v: l3 },
              ].map((c) => (
                <div key={c.label} className="rounded-lg bg-white/5 p-2">
                  <p className="text-white/50">{c.label}</p>
                  <p className="mt-1 font-bold text-white">{money(c.v)}</p>
                </div>
              ))}
            </div>
            <div className="mt-3 flex items-center justify-between rounded-lg bg-primary/10 p-3 text-sm">
              <span className="text-white/70">
                Sobra para {table === "partner_products" ? "parceiro" : "profissional"}
              </span>
              <span className="font-bold text-primary">{money(ownerNet)}</span>
            </div>
            <p className="mt-2 text-[10px] text-white/40">
              % comissão coach: {Number(product.coach_commission_percentage || 0)}%. Master coach
              recebe bônus adicional sobre essa comissão quando vende.
            </p>
          </div>

          <div>
            <p className="text-[10px] uppercase tracking-wider text-white/40">
              Observação (obrigatória para reprovar)
            </p>
            <textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              rows={3}
              className="mt-1 w-full rounded bg-black/40 border border-white/10 px-3 py-2 text-sm text-white"
            />
          </div>

          <div className="flex gap-2">
            <button
              disabled={saving}
              onClick={() => review("approved")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-green-500/20 px-4 py-2.5 text-sm font-bold text-green-300 hover:bg-green-500/30 disabled:opacity-50"
            >
              <Check className="h-4 w-4" /> Aprovar produto
            </button>
            <button
              disabled={saving}
              onClick={() => review("rejected")}
              className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-red-500/20 px-4 py-2.5 text-sm font-bold text-red-300 hover:bg-red-500/30 disabled:opacity-50"
            >
              <X className="h-4 w-4" /> Reprovar
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between rounded bg-white/5 px-3 py-2">
      <span className="text-white/60">{label}</span>
      <span className="font-bold text-white">{value}</span>
    </div>
  );
}
