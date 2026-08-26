import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { calculateDistribution, type ValueSlot, type PaymentFeeConfig } from "@/lib/financialEngine";
import { computeFromCharge, DEFAULT_PARTNER_FEES, NETWORK_SPLIT, type CoachCommissionPct } from "@/lib/partnerFinance";
import { carregarTaxasVigentesServidor } from "@/lib/taxas-vigentes.server";
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

/**
 * Le da taxa vigente, nao mais de payment_fee_configs.
 *
 * payment_fee_configs era a terceira copia dos mesmos percentuais de
 * maquininha. Enquanto o SQL da venda lia taxas_vigentes e esta tela lia a
 * outra tabela, dava para as duas discordarem sem ninguem perceber.
 */
async function loadDefaultFeeConfig(): Promise<PaymentFeeConfig> {
  await carregarTaxasVigentesServidor();
  return {
    card_fee_percentage: DEFAULT_PARTNER_FEES.cardFeePct,
    card_fee_3x12_percentage: DEFAULT_PARTNER_FEES.cardFeePct,
    pix_fee_percentage: DEFAULT_PARTNER_FEES.pixFeePct,
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

    // ── FitMind products ────────────────────────────────────────────
    const { data, error } = await supabaseAdmin
      .from("products")
      .select(
        "id, name, price, cost, other_costs, app_fee, app_fee_percentage, card_fee_percentage, credit_fee_percentage, pix_fee_percentage, tax_percentage, commission_coach, commission_level1, commission_level2, commission_level3, image_url"
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

    const fitmindProducts = rows.map((p: any) => {
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
        kind: "fitmind" as const,
        section_id: null as string | null,
        section_name: "FitMind",
        category_id: null as string | null,
        category_name: null as string | null,
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

    // ── Partner / Professional products ─────────────────────────────
    const [{ data: partnerRows }, { data: proRows }] = await Promise.all([
      supabaseAdmin
        .from("partner_products")
        .select("id,name,price,coach_commission_percentage,card_fee_percentage,pix_fee_percentage,tax_percentage,section_id,category_id,image_url,status,is_active_by_partner,deleted_at")
        .eq("status", "approved")
        .eq("is_active_by_partner", true)
        .is("deleted_at", null)
        .order("price", { ascending: true }),
      supabaseAdmin
        .from("professional_products")
        .select("id,name,price,coach_commission_percentage,section_id,category_id,image_url,status,is_active_by_professional")
        .eq("status", "approved")
        .eq("is_active_by_professional", true)
        .order("price", { ascending: true }),
    ]);

    // Sections + categories for labels
    const sectionIds = new Set<string>();
    const categoryIds = new Set<string>();
    (partnerRows || []).forEach((r: any) => { if (r.section_id) sectionIds.add(r.section_id); if (r.category_id) categoryIds.add(r.category_id); });
    (proRows || []).forEach((r: any) => { if (r.section_id) sectionIds.add(r.section_id); if (r.category_id) categoryIds.add(r.category_id); });

    const [{ data: secs }, { data: cats }] = await Promise.all([
      sectionIds.size
        ? supabaseAdmin.from("store_sections").select("id,name").in("id", Array.from(sectionIds))
        : Promise.resolve({ data: [] as any[] }),
      categoryIds.size
        ? supabaseAdmin.from("store_categories").select("id,name").in("id", Array.from(categoryIds))
        : Promise.resolve({ data: [] as any[] }),
    ]);
    const secName = new Map<string, string>((secs || []).map((r: any) => [r.id, r.name]));
    const catName = new Map<string, string>((cats || []).map((r: any) => [r.id, r.name]));

    const buildPartnerLike = (row: any, kind: "partner" | "professional") => {
      const price = Number(row.price ?? 0);
      const commPct = (Number(row.coach_commission_percentage ?? 0) || 10) as CoachCommissionPct;
      const feesOverride = {
        systemFeePct: DEFAULT_PARTNER_FEES.systemFeePct,
        taxPct: row.tax_percentage != null ? Number(row.tax_percentage) : DEFAULT_PARTNER_FEES.taxPct,
        cardFeePct: row.card_fee_percentage != null ? Number(row.card_fee_percentage) : DEFAULT_PARTNER_FEES.cardFeePct,
        pixFeePct: row.pix_fee_percentage != null ? Number(row.pix_fee_percentage) : DEFAULT_PARTNER_FEES.pixFeePct,
      };
      const pixBd = computeFromCharge(price, commPct, "pix", feesOverride);
      const cardBd = computeFromCharge(price, commPct, "card", feesOverride);
      const kindLabel = kind === "partner" ? "Parceiro" : "Profissional";

      return {
        id: row.id,
        name: row.name,
        kind,
        section_id: row.section_id ?? null,
        section_name: row.section_id ? secName.get(row.section_id) ?? kindLabel : kindLabel,
        category_id: row.category_id ?? null,
        category_name: row.category_id ? catName.get(row.category_id) ?? null : null,
        price,
        pix_fee_pct:  feesOverride.pixFeePct,
        card_fee_pct: feesOverride.cardFeePct,
        tax_pct_real: feesOverride.taxPct,
        payment_fee_amount_pix:  pixBd.paymentFee,
        tax_amount_pix:          pixBd.tax,
        base_distributable_pix:  Math.max(0, price - pixBd.paymentFee - pixBd.tax),
        platform_fee_pix:        pixBd.systemFee,
        coach_real_commission:   pixBd.coachNet,
        network_l1_real:         pixBd.networkL1,
        network_l2_real:         pixBd.networkL2,
        network_l3_real:         pixBd.networkL3,
        payment_fee_amount_card: cardBd.paymentFee,
        tax_amount_card:         cardBd.tax,
        base_distributable_card: Math.max(0, price - cardBd.paymentFee - cardBd.tax),
        platform_fee_card:       cardBd.systemFee,
        coach_real_commission_card: cardBd.coachNet,
        network_l1_real_card:    cardBd.networkL1,
        network_l2_real_card:    cardBd.networkL2,
        network_l3_real_card:    cardBd.networkL3,
        product_cost_slots: 0,
        nutritionist_fee:   0,
        cost: 0,
        other_costs: 0,
        app_fee: 0,
        app_fee_percentage: 0,
        card_fee_percentage: feesOverride.cardFeePct,
        credit_fee_percentage: feesOverride.cardFeePct,
        tax_percentage: feesOverride.taxPct,
        commission_coach: commPct,
        commission_level1: NETWORK_SPLIT.l1,
        commission_level2: NETWORK_SPLIT.l2,
        commission_level3: NETWORK_SPLIT.l3,
        base_distributable: Math.max(0, price - pixBd.paymentFee - pixBd.tax),
      };
    };

    const partnerProducts = (partnerRows || []).map((r: any) => buildPartnerLike(r, "partner"));
    const professionalProducts = (proRows || []).map((r: any) => buildPartnerLike(r, "professional"));

    return [...fitmindProducts, ...partnerProducts, ...professionalProducts];
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
      const distCard = calculateDistribution(price, "credit_1x", fee, slots);
      const coachCommission = Math.max(0, dist.remainder);
      const networkL1 = sumByDestination(dist.lines, "network_l1");
      const networkL2 = sumByDestination(dist.lines, "network_l2");
      const networkL3 = sumByDestination(dist.lines, "network_l3");
      const coachCommissionCard = Math.max(0, distCard.remainder);
      const networkL1Card = sumByDestination(distCard.lines, "network_l1");
      const networkL2Card = sumByDestination(distCard.lines, "network_l2");
      const networkL3Card = sumByDestination(distCard.lines, "network_l3");
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
        coachCommissionCard,
        networkL1Card,
        networkL2Card,
        networkL3Card,
        baseDistributable: dist.base_distributable,
        baseDistributableCard: distCard.base_distributable,
      };
    });
  });

