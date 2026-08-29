import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

function normalizeEmail(value: unknown): string {
  return typeof value === "string" ? value.trim().toLowerCase() : "";
}

/** Assinaturas recorrentes + cartões salvos do usuário logado. */
export const getMyRecurring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [subsRes, cardsRes] = await Promise.all([
      supabase.from("recurring_subscriptions" as never).select("*" as never).eq("user_id" as never, userId as never).order("created_at" as never, { ascending: false } as never),
      supabase.from("saved_payment_cards" as never).select("id, brand, last_four, expiration_month, expiration_year, is_default, created_at" as never).order("created_at" as never, { ascending: false } as never),
    ]);
    const subs = (subsRes.data || []) as any[];
    let charges: any[] = [];
    if (subs.length) {
      const { data } = await supabase
        .from("recurring_charges" as never)
        .select("*" as never)
        .in("subscription_id" as never, subs.map((s) => s.id) as never)
        .order("created_at" as never, { ascending: false } as never)
        .limit(50);
      charges = (data || []) as any[];
    }
    return { subscriptions: subs, cards: (cardsRes.data || []) as any[], charges };
  });

/** Ativa o débito automático da mensalidade da plataforma no cartão salvo. */
export const enableAutoDebit = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { saved_card_id: string; billing_day?: number }) =>
    z.object({ saved_card_id: z.string().uuid(), billing_day: z.number().int().min(1).max(28).optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, name").eq("user_id", userId).maybeSingle();
    const { data: sub } = await supabase
      .from("user_subscriptions").select("custom_amount, billing_day, plan:subscription_plans(default_amount)")
      .eq("user_id", userId).maybeSingle();
    const amount = Number((sub as any)?.custom_amount ?? (sub as any)?.plan?.default_amount ?? 100);
    const day = data.billing_day ?? Number((sub as any)?.billing_day ?? 5);

    const { data: ownedCard } = await supabase
      .from("saved_payment_cards" as never)
      .select("id" as never)
      .eq("id" as never, data.saved_card_id as never)
      .maybeSingle();
    if (!ownedCard) throw new Error("Cartão não encontrado");

    const { data: existing } = await supabase
      .from("recurring_subscriptions" as never)
      .select("id" as never)
      .eq("user_id" as never, userId as never)
      .eq("product_kind" as never, "platform_subscription" as never)
      .maybeSingle();

    const next = new Date();
    next.setDate(Math.min(day, 28));
    if (next < new Date()) next.setMonth(next.getMonth() + 1);

    const payload = {
      user_id: userId,
      profile_id: (profile as any)?.id ?? null,
      product_kind: "platform_subscription",
      title: "Mensalidade FitMind Club",
      amount,
      interval_type: "monthly",
      billing_day: Math.min(day, 28),
      engine: "saved_card",
      saved_card_id: data.saved_card_id,
      status: "active",
      failure_count: 0,
      next_charge_at: next.toISOString().slice(0, 10),
    };
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    if ((existing as any)?.id) {
      const { error } = await supabaseAdmin.from("recurring_subscriptions" as never).update(payload as never).eq("id" as never, (existing as any).id as never);
      if (error) throw new Error(error.message);
      return { id: (existing as any).id };
    }
    const { data: row, error } = await supabaseAdmin.from("recurring_subscriptions" as never).insert(payload as never).select("id" as never).single();
    if (error) throw new Error(error.message);
    return { id: (row as any).id };
  });

export const cancelMyRecurring = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: sub } = await context.supabase
      .from("recurring_subscriptions" as never)
      .select("id, user_id, mp_preapproval_id" as never)
      .eq("id" as never, data.id as never)
      .maybeSingle();
    const row = sub as any;
    if (!row || row.user_id !== context.userId) throw new Error("Assinatura não encontrada");
    if (row.mp_preapproval_id) {
      const { data: profile } = await context.supabase
        .from("profiles")
        .select("email")
        .eq("user_id", context.userId)
        .maybeSingle();
      const expectedEmail = normalizeEmail(profile?.email);
      if (!expectedEmail) throw new Error("Perfil sem e-mail válido");
      const {
        cancelPreapproval,
        getPreapproval,
        MercadoPagoApiError,
      } = await import("@/server/mercadopago.server");
      try {
        const current = await getPreapproval(row.mp_preapproval_id);
        if (
          current?.external_reference !== `recurring:${row.id}`
          || normalizeEmail(current?.payer_email) !== expectedEmail
        ) throw new Error("Assinatura externa não pertence a esta conta");
        if (current?.status !== "cancelled") {
          const cancelled = await cancelPreapproval(row.mp_preapproval_id);
          if (cancelled?.status !== "cancelled") {
            const confirmed = await getPreapproval(row.mp_preapproval_id);
            if (confirmed?.status !== "cancelled") {
              throw new Error("Cancelamento externo não confirmado");
            }
          }
        }
      } catch (error) {
        if (!(error instanceof MercadoPagoApiError && [404, 410].includes(error.status))) throw error;
      }
    }
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { error } = await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .update({ status: "cancelled", cancelled_at: new Date().toISOString(), next_charge_at: null } as never)
      .eq("id" as never, data.id as never)
      .eq("user_id" as never, context.userId as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const deleteMySavedCard = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: card } = await context.supabase
      .from("saved_payment_cards" as never)
      .select("id, mp_customer_id, mp_card_id" as never)
      .eq("id" as never, data.id as never)
      .maybeSingle();
    if (!card) throw new Error("Cartão não encontrado");
    const { data: profile } = await context.supabase
      .from("profiles")
      .select("email")
      .eq("user_id", context.userId)
      .maybeSingle();
    const {
      deleteCustomerCard,
      getCustomer,
      getCustomerCard,
      MercadoPagoApiError,
    } = await import("@/server/mercadopago.server");
    const customerId = String((card as any).mp_customer_id || "");
    const cardId = String((card as any).mp_card_id || "");
    if (!customerId || !cardId) throw new Error("Referência externa do cartão inválida");
    const expectedEmail = normalizeEmail(profile?.email);
    if (!expectedEmail) throw new Error("Perfil sem e-mail válido");
    try {
      const customer = await getCustomer(customerId);
      if (normalizeEmail(customer?.email) !== expectedEmail) {
        throw new Error("Cartão externo não pertence a esta conta");
      }
      const remoteCard = await getCustomerCard(customerId, cardId);
      if (String(remoteCard?.id || "") !== cardId) {
        throw new Error("Cartão externo não pertence a esta conta");
      }
      await deleteCustomerCard(customerId, cardId);
      try {
        await getCustomerCard(customerId, cardId);
        throw new Error("Remoção externa do cartão não confirmada");
      } catch (confirmationError) {
        if (!(confirmationError instanceof MercadoPagoApiError && [404, 410].includes(confirmationError.status))) {
          throw confirmationError;
        }
      }
    } catch (error) {
      if (!(error instanceof MercadoPagoApiError && [404, 410].includes(error.status))) throw error;
    }
    const { error } = await context.supabase.from("saved_payment_cards" as never).delete().eq("id" as never, data.id as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Trilho B: cria uma assinatura nativa do Mercado Pago (Preapproval). */
export const createPreapprovalSubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { title: string; amount: number; interval?: "monthly" | "yearly"; product_id?: string }) =>
    z.object({
      title: z.string().min(2).max(120),
      amount: z.number().positive(),
      interval: z.enum(["monthly", "yearly"]).optional(),
      product_id: z.string().uuid().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: profile } = await supabase.from("profiles").select("id, email, name").eq("user_id", userId).maybeSingle();
    const email = (profile as any)?.email;
    if (!email) throw new Error("Perfil sem e-mail");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: row, error } = await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .insert({
        user_id: userId,
        profile_id: (profile as any).id,
        product_kind: data.product_id ? "product" : "custom",
        product_id: data.product_id ?? null,
        title: data.title,
        amount: data.amount,
        interval_type: data.interval ?? "monthly",
        engine: "mp_preapproval",
        status: "external_creating",
      } as never)
      .select("id" as never)
      .single();
    if (error) throw new Error(error.message);

    const { cancelPreapproval, createPreapproval } = await import("@/server/mercadopago.server");
    const { siteUrl } = await import("./mercadopago-impl.server");
    let pre: { id?: unknown; init_point?: unknown } | null = null;
    try {
      pre = await createPreapproval({
        reason: data.title,
        externalReference: `recurring:${(row as any).id}`,
        payerEmail: email,
        amount: data.amount,
        frequency: 1,
        frequencyType: "months",
        backUrl: `${siteUrl()}/student/profile`,
      });

      if (!pre?.id || !pre?.init_point) throw new Error("Resposta inválida do Mercado Pago");
      const { error: updateError } = await supabaseAdmin
        .from("recurring_subscriptions" as never)
        .update({ mp_preapproval_id: String(pre.id), status: "pending" } as never)
        .eq("id" as never, (row as any).id as never)
        .eq("status" as never, "external_creating" as never);
      if (updateError) throw new Error(updateError.message);
    } catch (creationError) {
      if (pre?.id) {
        try {
          const cancelled = await cancelPreapproval(String(pre.id));
          if (cancelled?.status === "cancelled") {
            await supabaseAdmin
              .from("recurring_subscriptions" as never)
              .delete()
              .eq("id" as never, (row as any).id as never);
          }
        } catch { /* keep row for manual reconciliation */ }
      } else {
        await supabaseAdmin
          .from("recurring_subscriptions" as never)
          .delete()
          .eq("id" as never, (row as any).id as never);
      }
      throw creationError;
    }

    return { id: (row as any).id, initPoint: String(pre?.init_point ?? "") };
  });

/** Admin: visão geral de todas as recorrências. */
export const adminListRecurring = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (!isAdmin) throw new Error("Sem permissão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: subs } = await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .select("*" as never)
      .order("next_charge_at" as never, { ascending: true } as never)
      .limit(500);
    const rows = (subs || []) as any[];
    const profileIds = rows.map((r) => r.profile_id).filter(Boolean);
    let names: Record<string, string> = {};
    if (profileIds.length) {
      const { data: profs } = await supabaseAdmin.from("profiles").select("id, name, email").in("id", profileIds);
      names = Object.fromEntries((profs || []).map((p: any) => [p.id, p.name || p.email]));
    }
    const { data: charges } = await supabaseAdmin
      .from("recurring_charges" as never)
      .select("*" as never)
      .order("created_at" as never, { ascending: false } as never)
      .limit(200);
    return {
      subscriptions: rows.map((r) => ({ ...r, subscriber: names[r.profile_id] || "—" })),
      charges: (charges || []) as any[],
    };
  });

/** Admin: cancela/pausa qualquer recorrência. */
export const adminSetRecurringStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; status: "active" | "paused" | "cancelled" }) =>
    z.object({ id: z.string().uuid(), status: z.enum(["active", "paused", "cancelled"]) }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Sem permissão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const patch: any = { status: data.status };
    if (data.status === "cancelled") { patch.cancelled_at = new Date().toISOString(); patch.next_charge_at = null; }
    if (data.status === "paused") patch.next_charge_at = null;
    const { error } = await supabaseAdmin.from("recurring_subscriptions" as never).update(patch as never).eq("id" as never, data.id as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

/** Admin (teste): define a próxima cobrança para uma data (padrão: hoje). */
export const adminSetNextChargeDate = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string; date?: string }) =>
    z.object({ id: z.string().uuid(), date: z.string().optional() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Sem permissão");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const target = data.date || new Date().toISOString().slice(0, 10);
    const { error } = await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .update({ next_charge_at: target, status: "active" } as never)
      .eq("id" as never, data.id as never);
    if (error) throw new Error(error.message);
    return { ok: true, next_charge_at: target };
  });

/** Admin (teste): dispara a cobrança de uma assinatura imediatamente. */
export const adminForceCharge = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { id: string }) => z.object({ id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Sem permissão");
    const { chargeSubscriptionNow } = await import("./recurring.server");
    const res = await chargeSubscriptionNow(data.id);
    return res;
  });
