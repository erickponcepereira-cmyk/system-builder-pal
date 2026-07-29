import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type SourceKind = "store_order" | "transaction" | "partner_product_order" | "subscription_invoice";

export type SourceRecurrence = {
  productKind: string;
  productId: string;
  title: string;
  amount: number;
  intervalType: "monthly" | "yearly";
  trialDays: number;
  allowOneTime: boolean;
};

type Cfg = {
  is_recurring?: boolean | null;
  recurrence_interval?: string | null;
  recurrence_amount?: number | null;
  recurrence_trial_days?: number | null;
  recurrence_allow_one_time?: boolean | null;
  price?: number | null;
  name?: string | null;
  title?: string | null;
};

function toRecurrence(kind: string, id: string, cfg: Cfg | null, fallbackAmount: number): SourceRecurrence | null {
  if (!cfg?.is_recurring) return null;
  return {
    productKind: kind,
    productId: id,
    title: cfg.name || cfg.title || "Assinatura",
    amount: Number(cfg.recurrence_amount ?? cfg.price ?? fallbackAmount) || fallbackAmount,
    intervalType: cfg.recurrence_interval === "yearly" ? "yearly" : "monthly",
    trialDays: Math.max(0, Number(cfg.recurrence_trial_days || 0)),
    allowOneTime: cfg.recurrence_allow_one_time !== false,
  };
}

const SELECT =
  "id, name, price, is_recurring, recurrence_interval, recurrence_amount, recurrence_trial_days, recurrence_allow_one_time";

/** Descobre se o pedido/origem corresponde a um produto configurado como recorrente. */
export async function resolveSourceRecurrence(kind: SourceKind, id: string): Promise<SourceRecurrence | null> {
  try {
    if (kind === "store_order") {
      const { data: items } = await supabaseAdmin
        .from("store_order_items")
        .select("product_id, store_product_id, product_kind, title, unit_price")
        .eq("order_id", id);
      for (const it of items || []) {
        if (it.product_id) {
          const { data } = await supabaseAdmin.from("products").select(SELECT).eq("id", it.product_id).maybeSingle();
          const r = toRecurrence("product", it.product_id, data as Cfg, Number(it.unit_price || 0));
          if (r) return { ...r, title: r.title || it.title };
        }
        if (it.store_product_id) {
          const { data } = await supabaseAdmin
            .from("store_products")
            .select(SELECT)
            .eq("id", it.store_product_id)
            .maybeSingle();
          const r = toRecurrence("store_product", it.store_product_id, data as Cfg, Number(it.unit_price || 0));
          if (r) return { ...r, title: r.title || it.title };
        }
      }
      return null;
    }

    if (kind === "transaction") {
      const { data: tx } = await supabaseAdmin
        .from("transactions")
        .select("product_id, store_product_id, gross_amount")
        .eq("id", id)
        .maybeSingle();
      if (!tx) return null;
      if (tx.product_id) {
        const { data } = await supabaseAdmin.from("products").select(SELECT).eq("id", tx.product_id).maybeSingle();
        const r = toRecurrence("product", tx.product_id, data as Cfg, Number(tx.gross_amount || 0));
        if (r) return r;
      }
      if (tx.store_product_id) {
        const { data } = await supabaseAdmin
          .from("store_products")
          .select(SELECT)
          .eq("id", tx.store_product_id)
          .maybeSingle();
        return toRecurrence("store_product", tx.store_product_id, data as Cfg, Number(tx.gross_amount || 0));
      }
      return null;
    }

    if (kind === "partner_product_order") {
      const { data: po } = await supabaseAdmin
        .from("partner_product_orders")
        .select("partner_product_id, professional_product_id, gross_amount")
        .eq("id", id)
        .maybeSingle();
      if (!po) return null;
      if (po.partner_product_id) {
        const { data } = await supabaseAdmin
          .from("partner_products")
          .select(SELECT)
          .eq("id", po.partner_product_id)
          .maybeSingle();
        const r = toRecurrence("partner_product", po.partner_product_id, data as Cfg, Number(po.gross_amount || 0));
        if (r) return r;
      }
      if (po.professional_product_id) {
        const { data } = await supabaseAdmin
          .from("professional_products")
          .select(SELECT)
          .eq("id", po.professional_product_id)
          .maybeSingle();
        return toRecurrence(
          "professional_product",
          po.professional_product_id,
          data as Cfg,
          Number(po.gross_amount || 0)
        );
      }
      return null;
    }

    return null;
  } catch (e) {
    console.error("[resolveSourceRecurrence]", e);
    return null;
  }
}

/** Cria (ou reaproveita) a assinatura recorrente após um pagamento aprovado com cartão salvo. */
export async function activateSubscriptionForSource(params: {
  kind: SourceKind;
  id: string;
  studentId: string | null;
  savedCardId: string | null;
}) {
  if (!params.studentId || !params.savedCardId) return;
  const rec = await resolveSourceRecurrence(params.kind, params.id);
  if (!rec) return;

  const { data: student } = await supabaseAdmin
    .from("students")
    .select("id, profile_id, profiles:profile_id(id, user_id)")
    .eq("id", params.studentId)
    .maybeSingle();
  const profile = (student as any)?.profiles;
  if (!profile?.user_id) return;

  const { data: existing } = await supabaseAdmin
    .from("recurring_subscriptions")
    .select("id, status")
    .eq("user_id", profile.user_id)
    .eq("product_kind", rec.productKind)
    .eq("product_id", rec.productId)
    .in("status", ["active", "pending", "past_due", "paused"])
    .maybeSingle();

  const next = new Date();
  if (rec.trialDays > 0) next.setDate(next.getDate() + rec.trialDays);
  else if (rec.intervalType === "yearly") next.setFullYear(next.getFullYear() + 1);
  else next.setMonth(next.getMonth() + 1);

  const payload = {
    user_id: profile.user_id,
    profile_id: profile.id,
    student_id: params.studentId,
    product_kind: rec.productKind,
    product_id: rec.productId,
    title: rec.title,
    amount: rec.amount,
    interval_type: rec.intervalType,
    billing_day: next.getDate(),
    engine: "saved_card",
    saved_card_id: params.savedCardId,
    status: "active",
    next_charge_at: next.toISOString().slice(0, 10),
    failure_count: 0,
    last_charge_at: new Date().toISOString(),
  };

  if (existing?.id) {
    await supabaseAdmin.from("recurring_subscriptions").update(payload).eq("id", existing.id);
  } else {
    await supabaseAdmin.from("recurring_subscriptions").insert(payload);
  }
}
