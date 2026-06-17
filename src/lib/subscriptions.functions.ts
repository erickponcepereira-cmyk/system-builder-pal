import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const getMySubscription = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: sub } = await supabase
      .from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .eq("user_id", userId)
      .maybeSingle();
    if (!sub) return null;

    const { data: invoices } = await supabase
      .from("subscription_invoices")
      .select("*")
      .eq("user_id", userId)
      .order("reference_month", { ascending: false })
      .limit(24);

    // Saldos por carteira (para decidir débito) + dados de pagador
    const { data: profile } = await supabase
      .from("profiles").select("id, name, email, document").eq("user_id", userId).maybeSingle();


    const wallets: Record<string, number> = { coach: 0, partner: 0, professional: 0 };
    if (profile?.id) {
      const [{ data: cw }, { data: partner }, { data: coach }] = await Promise.all([
        supabase.from("wallets").select("available_balance").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("partners").select("id").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
      ]);
      wallets.coach = Number(cw?.available_balance || 0);
      if (partner?.id) {
        const { data: pw } = await supabase.from("partner_wallets").select("available_balance").eq("partner_id", partner.id).maybeSingle();
        wallets.partner = Number(pw?.available_balance || 0);
      }
      if (coach?.id) {
        const { data: pw } = await supabase.from("professional_wallets").select("available_balance").eq("professional_coach_id", coach.id).maybeSingle();
        wallets.professional = Number(pw?.available_balance || 0);
      }
    }

    const amount = Number((sub as any).custom_amount ?? (sub as any).plan?.default_amount ?? 100);
    return { subscription: sub, invoices: invoices ?? [], wallets, effectiveAmount: amount };
  });

export const updateMySubscriptionPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { billing_day?: number; preferred_payment_method?: string }) =>
    z.object({
      billing_day: z.number().int().min(1).max(28).optional(),
      preferred_payment_method: z.enum(["pix","card","auto_debit","wallet"]).optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    const patch: any = {};
    if (data.billing_day !== undefined) patch.billing_day = data.billing_day;
    if (data.preferred_payment_method) patch.preferred_payment_method = data.preferred_payment_method;
    patch.updated_at = new Date().toISOString();
    const { error } = await context.supabase
      .from("user_subscriptions").update(patch).eq("user_id", context.userId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const payInvoiceWithWallet = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string; wallet_source: "coach"|"partner"|"professional" }) =>
    z.object({ invoice_id: z.string().uuid(), wallet_source: z.enum(["coach","partner","professional"]) }).parse(d))
  .handler(async ({ data, context }) => {
    // valida que a fatura pertence ao usuário
    const { data: inv } = await context.supabase
      .from("subscription_invoices").select("id, user_id, status")
      .eq("id", data.invoice_id).maybeSingle();
    if (!inv || inv.user_id !== context.userId) throw new Error("Fatura não encontrada");
    if (inv.status === "paid") throw new Error("Fatura já paga");

    const { data: result, error } = await context.supabase.rpc("process_subscription_invoice_payment", {
      _invoice_id: data.invoice_id,
      _method: "wallet",
      _wallet_source: data.wallet_source,
      _performed_by: context.userId,
      _fee_amount: 0,
      _mp_payment_id: undefined,
    });
    if (error) throw new Error(error.message);
    return result;
  });

export const ensureMySubscription = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { billing_day?: number }) =>
    z.object({ billing_day: z.number().int().min(1).max(28).optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    const { data: id, error } = await context.supabase.rpc("ensure_user_subscription", {
      _user_id: context.userId,
      _billing_day: data.billing_day ?? 5,
    });
    if (error) throw new Error(error.message);
    return { id };
  });

export const checkMyBlockStatus = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { data, error } = await context.supabase.rpc("is_user_blocked_by_subscription", {
      _user_id: context.userId,
    });
    if (error) return { blocked: false };
    return { blocked: Boolean(data) };
  });
