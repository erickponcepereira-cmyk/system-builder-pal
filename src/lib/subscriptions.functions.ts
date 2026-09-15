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
      .from("profiles").select("id, name, email").eq("user_id", userId).maybeSingle();


    // O saldo é um só, derivado do ledger. As chaves por origem dizem de onde o
    // dinheiro veio; quem paga a fatura é o total, e a cascata decide de qual
    // carteira sai. Ler as tabelas aqui trazia número velho toda vez que um
    // prazo de liberação vencia.
    const wallets: Record<string, number> = { coach: 0, partner: 0, professional: 0, total: 0 };
    if (profile?.id) {
      const { data: linhas } = await supabase.rpc("carteira_atual" as never, { _profile_id: profile.id } as never);
      const c = ((linhas as Array<{
        disponivel: number; ganho_coach: number; ganho_parceiro: number; ganho_profissional: number;
      }> | null) ?? [])[0];
      wallets.coach = Number(c?.ganho_coach || 0);
      wallets.partner = Number(c?.ganho_parceiro || 0);
      wallets.professional = Number(c?.ganho_profissional || 0);
      wallets.total = Number(c?.disponivel || 0);
    }

    const amount = Number((sub as any).custom_amount ?? (sub as any).plan?.default_amount ?? 100);
    return { subscription: sub, invoices: invoices ?? [], wallets, effectiveAmount: amount, payer: profile ? { email: (profile as any).email, name: (profile as any).name } : null };
  });

export const updateMySubscriptionPrefs = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { billing_day?: number; preferred_payment_method?: string }) =>
    z.object({
      billing_day: z.number().int().min(1).max(31).optional(),
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
    z.object({ billing_day: z.number().int().min(1).max(31).optional() }).parse(d ?? {}))
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

export const getMyBillingOverview = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const [subRes, invsRes, profRes] = await Promise.all([
      supabase.from("user_subscriptions").select("*, plan:subscription_plans(*)").eq("user_id", userId).maybeSingle(),
      supabase.from("subscription_invoices").select("*").eq("user_id", userId).order("reference_month", { ascending: false }).limit(36),
      supabase.from("profiles").select("id, name, email, created_at").eq("user_id", userId).maybeSingle(),
    ]);
    const sub = subRes.data;
    const invs = invsRes.data ?? [];
    // CPF não é legível pelo cliente/RLS: buscamos no servidor, só do próprio usuário.
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: cpfRow } = await supabaseAdmin.from("profiles").select("cpf").eq("user_id", userId).maybeSingle();
    const profile = profRes.data ? { ...profRes.data, cpf: (cpfRow as { cpf: string | null } | null)?.cpf ?? null } : null;

    const firstInvoice = invs[invs.length - 1] ?? null;
    const lastPaid = invs.find((i: any) => i.status === "paid") ?? null;
    const nextInvoice = invs.find((i: any) => i.status === "pending" || i.status === "overdue" || i.status === "blocked") ?? null;

    const methodCount = new Map<string, number>();
    invs.slice(0, 12).filter((i: any) => i.status === "paid" && i.payment_method).forEach((i: any) => {
      methodCount.set(i.payment_method, (methodCount.get(i.payment_method) ?? 0) + 1);
    });
    let preferredMethod: string | null = null;
    let max = 0;
    methodCount.forEach((c, m) => { if (c > max) { max = c; preferredMethod = m; }});

    return {
      subscription: sub,
      profile,
      firstInvoice,
      lastPaid,
      nextInvoice,
      preferredMethod,
      subscriberSince: firstInvoice?.reference_month ?? sub?.created_at ?? profile?.created_at ?? null,
      registeredAt: profile?.created_at ?? null,
    };
  });

export const getInvoiceReceiptData = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { invoice_id: string }) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: inv, error } = await supabase
      .from("subscription_invoices")
      .select("id, user_id, reference_month, due_date, amount, status, paid_at, payment_method, wallet_source, mp_payment_id")
      .eq("id", data.invoice_id).maybeSingle();
    if (error) throw new Error(error.message);
    if (!inv) throw new Error("Fatura não encontrada");
    const { data: isAdmin } = await supabase.rpc("is_admin", { _user_id: userId });
    if (inv.user_id !== userId && !isAdmin) throw new Error("Sem acesso a esta fatura");
    if (inv.status !== "paid" && inv.status !== "exempted") throw new Error("Apenas faturas pagas geram recibo");
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("name, email, cpf").eq("user_id", inv.user_id).maybeSingle();
    return { invoice: inv, profile };
  });

