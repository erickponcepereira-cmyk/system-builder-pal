import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  calculateDistribution,
  calculatePointsFromSystemFee,
  sumSystemFee,
  type PaymentMethod,
  type PaymentFeeConfig,
  type ValueSlot,
} from "@/lib/financialEngine";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

// ───── Fee configs ────────────────────────────────────────────
export type FeeConfigRow = {
  id: string;
  name: string;
  card_fee_percentage: number;
  card_fee_3x12_percentage: number;
  pix_fee_percentage: number;
  is_active: boolean;
  is_default: boolean;
  notes: string | null;
};

export const listFeeConfigs = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async (): Promise<FeeConfigRow[]> => {
    const { data } = await supabaseAdmin
      .from("payment_fee_configs")
      .select("id,name,card_fee_percentage,card_fee_3x12_percentage,pix_fee_percentage,is_active,is_default,notes")
      .order("is_default", { ascending: false })
      .order("name");
    return (data as FeeConfigRow[]) || [];
  });

export const upsertFeeConfig = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as Partial<FeeConfigRow>)
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);
    if (data.is_default) {
      await supabaseAdmin.from("payment_fee_configs").update({ is_default: false }).neq("id", data.id || "00000000-0000-0000-0000-000000000000");
    }
    if (data.id) {
      const { error } = await supabaseAdmin.from("payment_fee_configs").update(data as never).eq("id", data.id);
      if (error) throw new Error(error.message);
      return { ok: true, id: data.id };
    }
    const { data: ins, error } = await supabaseAdmin.from("payment_fee_configs").insert(data as never).select("id").single();
    if (error) throw new Error(error.message);
    return { ok: true, id: ins!.id };
  });

// ───── Products list (financial summary) ──────────────────────
export type AdminProductRow = {
  id: string;
  name: string;
  price: number;
  status: string | null;
  points_per_sale: number;
  points_auto_calculated: boolean;
  slots_count: number;
};

export const listAdminProducts = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminProductRow[]> => {
    await ensureAdmin(context.userId);
    const { data: products } = await supabaseAdmin
      .from("products")
      .select("id,name,price,status,points_per_sale,points_auto_calculated")
      .order("sort_order", { ascending: true })
      .order("created_at", { ascending: false });
    if (!products) return [];
    const ids = products.map((p: any) => p.id);
    const { data: slots } = ids.length
      ? await supabaseAdmin.from("product_value_slots").select("product_id").in("product_id", ids)
      : { data: [] as any[] };
    const counts = new Map<string, number>();
    (slots || []).forEach((s: any) => counts.set(s.product_id, (counts.get(s.product_id) || 0) + 1));
    return (products as any[]).map((p) => ({
      id: p.id,
      name: p.name,
      price: Number(p.price || 0),
      status: p.status,
      points_per_sale: p.points_per_sale || 0,
      points_auto_calculated: !!p.points_auto_calculated,
      slots_count: counts.get(p.id) || 0,
    }));
  });

// ───── Get single product full financial config ───────────────
export type ProductFinancial = {
  product: {
    id: string;
    name: string;
    price: number;
    points_per_sale: number;
    points_auto_calculated: boolean;
    card_access_days: number;
  };
  slots: ValueSlot[];
  referralRule: {
    enabled: boolean;
    is_referral_product: boolean;
    pre_deduction_fixed: number;
    pre_deduction_label: string;
    student_referral_percentage: number;
    coach_pool_percentage: number;
  };
};

export const getProductFinancial = createServerFn({ method: "GET" })
  .inputValidator((d: unknown) => d as { productId: string })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ProductFinancial> => {
    await ensureAdmin(context.userId);
    const [{ data: product }, { data: slots }, { data: rule }] = await Promise.all([
      supabaseAdmin
        .from("products")
        .select("id,name,price,points_per_sale,points_auto_calculated,card_access_days")
        .eq("id", data.productId)
        .single(),
      supabaseAdmin
        .from("product_value_slots")
        .select("*")
        .eq("product_id", data.productId)
        .order("slot_order"),
      supabaseAdmin
        .from("product_referral_rules")
        .select("*")
        .eq("product_id", data.productId)
        .maybeSingle(),
    ]);
    if (!product) throw new Error("Produto não encontrado");

    return {
      product: {
        id: product.id,
        name: product.name,
        price: Number(product.price || 0),
        points_per_sale: product.points_per_sale || 0,
        points_auto_calculated: !!product.points_auto_calculated,
        card_access_days: Number((product as any).card_access_days || 0),
      },
      slots: (slots || []).map((s: any) => ({
        id: s.id,
        slot_order: s.slot_order,
        label: s.label,
        value_type: s.value_type,
        value_amount: Number(s.value_amount || 0),
        destination: s.destination,
        destination_label: s.destination_label || "",
        is_blocked_until_delivery: !!s.is_blocked_until_delivery,
        is_system_fee: !!s.is_system_fee,
        applies_to_referral_sales: !!s.applies_to_referral_sales,
        applies_to_student_referral: !!s.applies_to_student_referral,
        slot_group: s.slot_group ?? null,
      })),
      referralRule: rule
        ? {
            enabled: !!rule.enabled,
            is_referral_product: !!(rule as any).is_referral_product,
            pre_deduction_fixed: Number(rule.pre_deduction_fixed || 0),
            pre_deduction_label: rule.pre_deduction_label || "Taxa do Sistema",
            student_referral_percentage: Number(rule.student_referral_percentage || 0),
            coach_pool_percentage: Number(rule.coach_pool_percentage || 0),
          }
        : {
            enabled: true,
            is_referral_product: false,
            pre_deduction_fixed: 20,
            pre_deduction_label: "Taxa do Sistema",
            student_referral_percentage: 50,
            coach_pool_percentage: 50,
          },
    };
  });

// ───── Save product financial (slots + referral + points) ─────
export type SaveProductFinancialInput = {
  productId: string;
  points_per_sale: number;
  points_auto_calculated: boolean;
  card_access_days: number;
  slots: Array<Omit<ValueSlot, "id"> & { id?: string }>;
  referralRule: {
    enabled: boolean;
    is_referral_product: boolean;
    pre_deduction_fixed: number;
    pre_deduction_label: string;
    student_referral_percentage: number;
    coach_pool_percentage: number;
  };
};

export const saveProductFinancial = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => d as SaveProductFinancialInput)
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    await ensureAdmin(context.userId);

    // Replace slots: simple strategy — delete then insert
    await supabaseAdmin.from("product_value_slots").delete().eq("product_id", data.productId);
    if (data.slots.length) {
      const payload = data.slots.map((s, i) => ({
        product_id: data.productId,
        slot_order: i,
        label: s.label,
        value_type: s.value_type,
        value_amount: s.value_amount,
        destination: s.destination,
        destination_label: s.destination_label,
        is_blocked_until_delivery: s.is_blocked_until_delivery,
        is_system_fee: s.is_system_fee,
        applies_to_referral_sales: s.applies_to_referral_sales,
        applies_to_student_referral: s.applies_to_student_referral,
        slot_group: s.slot_group ?? null,
      }));
      const { error } = await supabaseAdmin.from("product_value_slots").insert(payload as never);
      if (error) throw new Error(error.message);
    }

    // Upsert referral rule
    const { error: ruleErr } = await supabaseAdmin
      .from("product_referral_rules")
      .upsert(
        {
          product_id: data.productId,
          enabled: data.referralRule.enabled,
          is_referral_product: data.referralRule.is_referral_product,
          pre_deduction_fixed: data.referralRule.pre_deduction_fixed,
          pre_deduction_label: data.referralRule.pre_deduction_label,
          student_referral_percentage: data.referralRule.student_referral_percentage,
          coach_pool_percentage: data.referralRule.coach_pool_percentage,
        },
        { onConflict: "product_id" },
      );
    if (ruleErr) throw new Error(ruleErr.message);

    // Update points (after slots insert, the trigger will overwrite if auto)
    const { error: prodErr } = await supabaseAdmin
      .from("products")
      .update({
        points_per_sale: data.points_per_sale,
        points_auto_calculated: data.points_auto_calculated,
        card_access_days: data.card_access_days,
      } as never)
      .eq("id", data.productId);
    if (prodErr) throw new Error(prodErr.message);

    return { ok: true };
  });

// ───── Coach sale preview: commission + points for current coach ─
export type SaleEarningsItem = {
  productId: string;
  kind: "challenge" | "digital" | "store" | "item";
  title: string;
  unitPrice: number;
  quantity: number;
  commissionPerUnit: number;
  pointsPerUnit: number;
  commissionTotal: number;
  pointsTotal: number;
};

export const previewCoachSaleEarnings = createServerFn({ method: "POST" })
  .inputValidator(
    (d: unknown) =>
      d as {
        items: Array<{
          productId: string;
          kind: "challenge" | "digital" | "store" | "item";
          title: string;
          unitPrice: number;
          quantity: number;
        }>;
        paymentMethod?: PaymentMethod;
      },
  )
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ data }): Promise<{ items: SaleEarningsItem[]; commissionTotal: number; pointsTotal: number }> => {
    if (!data.items.length) return { items: [], commissionTotal: 0, pointsTotal: 0 };

    const challengeIds = data.items.filter((i) => i.kind === "challenge").map((i) => i.productId);
    const { data: feeCfg } = await supabaseAdmin
      .from("payment_fee_configs")
      .select("card_fee_percentage,card_fee_3x12_percentage,pix_fee_percentage")
      .eq("is_default", true)
      .maybeSingle();
    const fee: PaymentFeeConfig = feeCfg || { card_fee_percentage: 4.98, card_fee_3x12_percentage: 4.98, pix_fee_percentage: 0.99 };
    const method: PaymentMethod = data.paymentMethod || "pix";

    const { data: slotRows } = challengeIds.length
      ? await supabaseAdmin.from("product_value_slots").select("*").in("product_id", challengeIds)
      : { data: [] as any[] };
    const { data: prodRows } = challengeIds.length
      ? await supabaseAdmin.from("products").select("id,price,points_per_sale,points_auto_calculated").in("id", challengeIds)
      : { data: [] as any[] };

    const slotsByProduct = new Map<string, ValueSlot[]>();
    (slotRows || []).forEach((s: any) => {
      const arr = slotsByProduct.get(s.product_id) || [];
      arr.push({
        id: s.id,
        slot_order: s.slot_order,
        label: s.label,
        value_type: s.value_type,
        value_amount: Number(s.value_amount || 0),
        destination: s.destination,
        destination_label: s.destination_label || "",
        is_blocked_until_delivery: !!s.is_blocked_until_delivery,
        is_system_fee: !!s.is_system_fee,
        applies_to_referral_sales: !!s.applies_to_referral_sales,
        applies_to_student_referral: !!s.applies_to_student_referral,
      });
      slotsByProduct.set(s.product_id, arr);
    });
    const productById = new Map<string, any>();
    (prodRows || []).forEach((p: any) => productById.set(p.id, p));

    const out: SaleEarningsItem[] = data.items.map((item) => {
      let commissionPerUnit = 0;
      let pointsPerUnit = 0;
      if (item.kind === "challenge") {
        const slots = slotsByProduct.get(item.productId) || [];
        const product = productById.get(item.productId);
        const dist = calculateDistribution(item.unitPrice, method, fee, slots);
        commissionPerUnit = dist.lines
          .filter((l) => l.destination === "coach_wallet")
          .reduce((s, l) => s + l.amount, 0);
        if (product) {
          if (product.points_auto_calculated) {
            const feeTotal = sumSystemFee(slots, item.unitPrice);
            pointsPerUnit = calculatePointsFromSystemFee(feeTotal);
          } else {
            pointsPerUnit = product.points_per_sale || 0;
          }
        }
      }
      const commissionTotal = commissionPerUnit * item.quantity;
      const pointsTotal = pointsPerUnit * item.quantity;
      return {
        productId: item.productId,
        kind: item.kind,
        title: item.title,
        unitPrice: item.unitPrice,
        quantity: item.quantity,
        commissionPerUnit,
        pointsPerUnit,
        commissionTotal,
        pointsTotal,
      };
    });

    return {
      items: out,
      commissionTotal: out.reduce((s, i) => s + i.commissionTotal, 0),
      pointsTotal: out.reduce((s, i) => s + i.pointsTotal, 0),
    };
  });
