import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateDistribution, type ValueSlot, type PaymentFeeConfig } from "@/lib/financialEngine";
import { z } from "zod";


async function resolveCoachId(userId: string): Promise<string> {
  const { data: profile } = await supabaseAdmin
    .from("profiles")
    .select("id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!profile?.id) throw new Error("Perfil não encontrado");
  const { data: coach } = await supabaseAdmin
    .from("coaches")
    .select("id")
    .eq("profile_id", profile.id)
    .maybeSingle();
  if (!coach?.id) throw new Error("Coach não encontrado");
  return coach.id;
}

const TreeSchema = z.record(
  z.string(),
  z.object({
    id: z.string(),
    nome: z.string(),
    vendas: z.number().int().min(0),
    parentId: z.string().nullable(),
  })
);

export const getNetworkProjection = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { productId?: string | null }) => d)
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    let q = supabaseAdmin
      .from("coach_network_projections")
      .select("id, product_id, vendas_coach, tree, updated_at")
      .eq("coach_id", coachId);
    q = data.productId ? q.eq("product_id", data.productId) : q.is("product_id", null);
    const { data: row } = await q.maybeSingle();
    return row ?? null;
  });

export const saveNetworkProjection = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { productId?: string | null; vendasCoach: number; tree: unknown }) =>
    z
      .object({
        productId: z.string().uuid().nullable().optional(),
        vendasCoach: z.number().int().min(0).max(100000),
        tree: TreeSchema,
      })
      .parse(d)
  )
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    const { error } = await supabaseAdmin
      .from("coach_network_projections")
      .upsert(
        {
          coach_id: coachId,
          product_id: data.productId ?? null,
          vendas_coach: data.vendasCoach,
          tree: data.tree,
          updated_at: new Date().toISOString(),
        },
        { onConflict: "coach_id,product_id" }
      );
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ─── Helpers compartilhados ──────────────────────────────────────────
function mapSlotRow(s: any): ValueSlot {
  return {
    id: s.id,
    slot_order: s.slot_order,
    label: s.label,
    value_type: s.value_type,
    value_amount: Number(s.value_amount || 0),
    destination: s.destination,
    destination_label: s.destination_label || "",
    is_blocked_until_delivery: !!s.is_blocked_until_delivery,
    is_system_fee: !!s.is_system_fee,
    applies_to_referral_sales: s.applies_to_referral_sales !== false,
    applies_to_student_referral: !!s.applies_to_student_referral,
    slot_group: s.slot_group ?? null,
  };
}

async function loadDefaultFeeConfig(): Promise<PaymentFeeConfig> {
  const { data } = await supabaseAdmin
    .from("payment_fee_configs")
    .select("card_fee_percentage,card_fee_3x12_percentage,pix_fee_percentage")
    .eq("is_default", true)
    .maybeSingle();
  return {
    card_fee_percentage: Number(data?.card_fee_percentage ?? 4.98),
    card_fee_3x12_percentage: Number(data?.card_fee_3x12_percentage ?? 4.98),
    pix_fee_percentage: Number(data?.pix_fee_percentage ?? 0.99),
  };
}

function sumByDestination(lines: { destination: string; amount: number }[], dest: string): number {
  return lines
    .filter((l) => l.destination === dest)
    .reduce((s, l) => s + Math.abs(l.amount), 0);
}

// ─── listSimulatorProducts (com comissões reais PIX + Cartão) ───────
export const listSimulatorProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const fee = await loadDefaultFeeConfig();

    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, price, cost, other_costs, app_fee, app_fee_percentage, card_fee_percentage, credit_fee_percentage, pix_fee_percentage, tax_percentage, commission_coach, commission_level1, commission_level2, commission_level3"
      )
      .eq("status", "active")
      .order("price", { ascending: true });

    if (error) throw new Error(error.message);
    const rows = data ?? [];
    const ids = rows.map((p: any) => p.id);

    const { data: allSlots } = ids.length
      ? await supabaseAdmin
          .from("product_value_slots")
          .select("*")
          .in("product_id", ids)
          .order("slot_order")
      : { data: [] as any[] };

    const slotsByProduct = new Map<string, ValueSlot[]>();
    (allSlots || []).forEach((s: any) => {
      const arr = slotsByProduct.get(s.product_id) || [];
      arr.push(mapSlotRow(s));
      slotsByProduct.set(s.product_id, arr);
    });

    const TAX_PCT = 6;

    return rows.map((p: any) => {
      const price = Number(p.price ?? 0);
      const slots = slotsByProduct.get(p.id) ?? [];

      const distPix = calculateDistribution(price, "pix", fee, slots, TAX_PCT);
      const coachCommPix   = Math.max(0, distPix.remainder);
      const netL1Pix       = sumByDestination(distPix.lines, "network_l1");
      const netL2Pix       = sumByDestination(distPix.lines, "network_l2");
      const netL3Pix       = sumByDestination(distPix.lines, "network_l3");
      const costSlots      = sumByDestination(distPix.lines, "product_order_pool");
      const platformPix    = sumByDestination(distPix.lines, "admin_wallet");
      const nutritionist   = sumByDestination(distPix.lines, "nutritionist_blocked");

      const distCard = calculateDistribution(price, "credit_1x", fee, slots, TAX_PCT);
      const coachCommCard  = Math.max(0, distCard.remainder);
      const netL1Card      = sumByDestination(distCard.lines, "network_l1");
      const netL2Card      = sumByDestination(distCard.lines, "network_l2");
      const netL3Card      = sumByDestination(distCard.lines, "network_l3");
      const platformCard   = sumByDestination(distCard.lines, "admin_wallet");

      return {
        id: p.id,
        name: p.name,
        price,
        pix_fee_pct:    fee.pix_fee_percentage,
        card_fee_pct:   fee.card_fee_percentage,
        tax_pct_real:   TAX_PCT,
        payment_fee_amount_pix:   distPix.payment_fee_amount,
        tax_amount_pix:           distPix.tax_amount,
        base_distributable_pix:   distPix.base_distributable,
        platform_fee_pix:         platformPix,
        coach_real_commission:    coachCommPix,
        network_l1_real:          netL1Pix,
        network_l2_real:          netL2Pix,
        network_l3_real:          netL3Pix,
        payment_fee_amount_card:  distCard.payment_fee_amount,
        tax_amount_card:          distCard.tax_amount,
        base_distributable_card:  distCard.base_distributable,
        platform_fee_card:        platformCard,
        coach_real_commission_card: coachCommCard,
        network_l1_real_card:     netL1Card,
        network_l2_real_card:     netL2Card,
        network_l3_real_card:     netL3Card,
        product_cost_slots: costSlots,
        nutritionist_fee:   nutritionist,
        cost:                 Number(p.cost ?? 0),
        other_costs:          Number(p.other_costs ?? 0),
        app_fee:              Number(p.app_fee ?? 0),
        app_fee_percentage:   Number(p.app_fee_percentage ?? 0),
        card_fee_percentage:  Number(p.card_fee_percentage ?? 0),
        credit_fee_percentage: Number(p.credit_fee_percentage ?? 0),
        tax_percentage:        Number(p.tax_percentage ?? 0),
        commission_coach:      Number(p.commission_coach ?? 50),
        commission_level1:     Number(p.commission_level1 ?? 15),
        commission_level2:     Number(p.commission_level2 ?? 5),
        commission_level3:     Number(p.commission_level3 ?? 3),
        base_distributable:    distPix.base_distributable,
      };
    });
  });

// ─── listProductsWithRealEarnings (esteira / loja) ──────────────────
export const listProductsWithRealEarnings = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async () => {
    const fee = await loadDefaultFeeConfig();
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id,name,price,original_price,subtitle,description,is_featured,badge_label,status,image_url,sort_order")
      .eq("status", "active")
      .order("sort_order", { ascending: true });
    if (!products?.length) return [];
    const ids = products.map((p: any) => p.id);
    const { data: allSlots } = await supabaseAdmin
      .from("product_value_slots")
      .select("*")
      .in("product_id", ids)
      .order("slot_order");
    const slotsByProduct = new Map<string, ValueSlot[]>();
    (allSlots || []).forEach((s: any) => {
      const arr = slotsByProduct.get(s.product_id) || [];
      arr.push(mapSlotRow(s));
      slotsByProduct.set(s.product_id, arr);
    });

    return (products as any[]).map((p) => {
      const price = Number(p.price || 0);
      const slots = slotsByProduct.get(p.id) ?? [];
      const dist = calculateDistribution(price, "pix", fee, slots);
      const coachCommission = Math.max(0, dist.remainder);
      const networkL1 = sumByDestination(dist.lines, "network_l1");
      const networkL2 = sumByDestination(dist.lines, "network_l2");
      const networkL3 = sumByDestination(dist.lines, "network_l3");
      const pct = (v: number) => (price > 0 ? (v / price) * 100 : 0);
      return {
        id: p.id,
        name: p.name,
        price,
        original_price: p.original_price ? Number(p.original_price) : null,
        subtitle: p.subtitle,
        description: p.description,
        is_featured: p.is_featured,
        badge_label: p.badge_label,
        image_url: p.image_url,
        coachCommission,
        coachCommissionPct: pct(coachCommission),
        networkL1,
        networkL1Pct: pct(networkL1),
        networkL2,
        networkL2Pct: pct(networkL2),
        networkL3,
        networkL3Pct: pct(networkL3),
        baseDistributable: dist.base_distributable,
      };
    });
  });
