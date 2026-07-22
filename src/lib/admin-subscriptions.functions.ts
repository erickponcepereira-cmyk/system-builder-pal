import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { getServerCutoffIso } from "@/lib/test-mode.functions";

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase.rpc("is_admin", { _user_id: ctx.userId });
  if (!data) throw new Error("Forbidden");
}

export const listAdminSubscriptions = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data: subs, error } = await context.supabase
      .from("user_subscriptions")
      .select("*, plan:subscription_plans(*)")
      .order("created_at", { ascending: false });
    if (error) throw new Error(error.message);

    const userIds = (subs ?? []).map((s: any) => s.user_id);
    const { data: profs } = await context.supabase
      .from("profiles")
      .select("user_id, name, email, role")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));

    return (subs ?? []).map((s: any) => ({
      ...s,
      profile: profMap.get(s.user_id) ?? null,
      effective_amount: Number(s.custom_amount ?? s.plan?.default_amount ?? 0),
    }));
  });

export const listAdminInvoices = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { status?: string; month?: string } | undefined) =>
    z.object({ status: z.string().optional(), month: z.string().optional() }).parse(d ?? {}))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let q: any = context.supabase
      .from("subscription_invoices")
      .select("*")
      .order("reference_month", { ascending: false })
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.status) q = q.eq("status", data.status);
    if (data.month) q = q.eq("reference_month", data.month);
    const cutoff = await getServerCutoffIso();
    if (cutoff) q = q.gte("created_at", cutoff);
    const { data: invs, error } = await q;
    if (error) throw new Error(error.message);

    const userIds = Array.from(new Set((invs ?? []).map((i: any) => i.user_id))) as string[];
    const { data: profs } = await context.supabase
      .from("profiles").select("user_id, name, email")
      .in("user_id", userIds.length ? userIds : ["00000000-0000-0000-0000-000000000000"]);
    const profMap = new Map((profs ?? []).map((p: any) => [p.user_id, p]));
    return (invs ?? []).map((i: any) => ({ ...i, profile: profMap.get(i.user_id) ?? null }));
  });

export const updateSubscriptionAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid(),
    custom_amount: z.number().nullable().optional(),
    billing_day: z.number().int().min(1).max(31).optional(),
    status: z.enum(["active","exempt_monthly","exempt_annual","exempt_permanent","cancelled"]).optional(),
    exempt_until: z.string().nullable().optional(),
    notes: z.string().nullable().optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    (patch as any).updated_at = new Date().toISOString();
    const { error } = await (context.supabase.from("user_subscriptions") as any).update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const updatePlanAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    id: z.string().uuid(),
    default_amount: z.number().min(0).optional(),
    grace_days: z.number().int().min(0).max(30).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { id, ...patch } = data;
    (patch as any).updated_at = new Date().toISOString();
    const { error } = await context.supabase.from("subscription_plans").update(patch).eq("id", id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const listPlansAdmin = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data } = await context.supabase.from("subscription_plans").select("*").order("created_at");
    return data ?? [];
  });

export const markInvoicePaidAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    invoice_id: z.string().uuid(),
    method: z.enum(["pix","card","auto_debit","wallet","manual_admin"]).default("manual_admin"),
    wallet_source: z.enum(["coach","partner","professional","external"]).optional(),
    fee_amount: z.number().min(0).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    let feeAmount = Number(data.fee_amount ?? 0);
    // Auto-calcula taxa da maquininha quando admin marca pago via pix/card sem informar
    if (!feeAmount && (data.method === "pix" || data.method === "card")) {
      const { data: inv } = await context.supabase
        .from("subscription_invoices").select("amount").eq("id", data.invoice_id).maybeSingle();
      const { data: cfg } = await context.supabase
        .from("payment_fee_configs").select("pix_fee_percentage, card_fee_percentage").eq("is_default", true).maybeSingle();
      const pct = data.method === "card"
        ? Number((cfg as any)?.card_fee_percentage ?? 4.98)
        : Number((cfg as any)?.pix_fee_percentage ?? 0.99);
      const amt = Number((inv as any)?.amount || 0);
      feeAmount = Math.round(amt * pct) / 100;
    }
    const { data: r, error } = await context.supabase.rpc("process_subscription_invoice_payment", {
      _invoice_id: data.invoice_id,
      _method: data.method,
      _wallet_source: data.wallet_source ?? "external",
      _performed_by: context.userId,
      _fee_amount: feeAmount,
      _mp_payment_id: undefined,
    });
    if (error) throw new Error(error.message);
    return r;
  });

export const exemptInvoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase
      .from("subscription_invoices")
      .update({ status: "exempted", paid_at: new Date().toISOString(), updated_at: new Date().toISOString() })
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const generateInvoicesNow = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const { data, error } = await context.supabase.rpc("generate_monthly_invoices");
    if (error) throw new Error(error.message);
    await context.supabase.rpc("mark_overdue_invoices");
    return { generated: data };
  });

export const revertInvoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("revert_subscription_invoice_payment", {
      _invoice_id: data.invoice_id,
      _performed_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const postponeInvoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    invoice_id: z.string().uuid(),
    new_due_date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("postpone_subscription_invoice", {
      _invoice_id: data.invoice_id,
      _new_due_date: data.new_due_date,
      _performed_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetInvoiceDueDateAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("reset_subscription_invoice_due_date", {
      _invoice_id: data.invoice_id,
      _performed_by: context.userId,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const resetInvoicePaymentAttemptAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: invoice, error: invError } = await context.supabase
      .from("subscription_invoices")
      .select("id, status, mp_payment_id")
      .eq("id", data.invoice_id)
      .maybeSingle();
    if (invError) throw new Error(invError.message);
    if (!invoice) throw new Error("Fatura não encontrada");
    if ((invoice as any).status === "paid") throw new Error("Fatura já está paga");

    if ((invoice as any).mp_payment_id) {
      const { data: payment } = await context.supabase
        .from("mercadopago_payments")
        .select("status")
        .eq("id", (invoice as any).mp_payment_id)
        .maybeSingle();
      if ((payment as any)?.status === "approved") throw new Error("Pagamento aprovado encontrado para esta fatura");
    }

    const { error } = await context.supabase
      .from("subscription_invoices")
      .update({ mp_payment_id: null, updated_at: new Date().toISOString() } as any)
      .eq("id", data.invoice_id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// ---------- New: Skip month, audit log, dashboard KPIs ----------

export const skipInvoiceAdmin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({
    invoice_id: z.string().uuid(),
    reason: z.string().max(500).optional(),
  }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { error } = await context.supabase.rpc("admin_skip_invoice", {
      _invoice_id: data.invoice_id,
      _reason: data.reason ?? null,
    });
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export const getInvoiceAuditLog = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ invoice_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { data: rows, error } = await context.supabase
      .from("subscription_invoice_audit")
      .select("id, actor_id, action, from_status, to_status, meta, created_at")
      .eq("invoice_id", data.invoice_id)
      .order("created_at", { ascending: false })
      .limit(200);
    if (error) throw new Error(error.message);
    const actorIds = Array.from(new Set((rows ?? []).map((r: any) => r.actor_id).filter(Boolean))) as string[];
    let actors = new Map<string, { name: string; email: string }>();
    if (actorIds.length) {
      const { data: profs } = await context.supabase
        .from("profiles").select("user_id, name, email").in("user_id", actorIds);
      actors = new Map((profs ?? []).map((p: any) => [p.user_id, { name: p.name, email: p.email }]));
    }
    return (rows ?? []).map((r: any) => ({ ...r, actor: r.actor_id ? actors.get(r.actor_id) ?? null : null }));
  });

export const getSubscriptionsDashboard = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context);
    const now = new Date();
    const startOfMonth = new Date(now.getFullYear(), now.getMonth(), 1).toISOString().slice(0, 10);
    const sixMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 5, 1).toISOString().slice(0, 10);

    const [subsRes, invsRes] = await Promise.all([
      context.supabase
        .from("user_subscriptions")
        .select("id, status, custom_amount, plan:subscription_plans(default_amount)"),
      context.supabase
        .from("subscription_invoices")
        .select("id, user_id, reference_month, amount, status, paid_at, payment_method")
        .gte("reference_month", sixMonthsAgo)
        .order("reference_month", { ascending: true }),
    ]);
    if (subsRes.error) throw new Error(subsRes.error.message);
    if (invsRes.error) throw new Error(invsRes.error.message);

    const subs = subsRes.data ?? [];
    const invs = invsRes.data ?? [];

    // KPIs
    const activeSubs = subs.filter((s: any) => s.status === "active");
    const activeCount = activeSubs.length;
    const mrrProjected = activeSubs.reduce((acc: number, s: any) => {
      const amt = Number(s.custom_amount ?? s.plan?.default_amount ?? 0);
      return acc + amt;
    }, 0);

    const currentMonthInvs = invs.filter((i: any) => i.reference_month === startOfMonth);
    const mrrRealized = currentMonthInvs
      .filter((i: any) => i.status === "paid")
      .reduce((acc: number, i: any) => acc + Number(i.amount), 0);
    const overdueInvs = currentMonthInvs.filter((i: any) => i.status === "overdue" || i.status === "blocked");
    const overdueAmount = overdueInvs.reduce((acc: number, i: any) => acc + Number(i.amount), 0);
    const overduePct = mrrProjected > 0 ? (overdueAmount / mrrProjected) * 100 : 0;
    const churnCount = subs.filter((s: any) => s.status === "cancelled").length;
    const skippedCount = currentMonthInvs.filter((i: any) => i.status === "exempted").length;
    const blockedCount = currentMonthInvs.filter((i: any) => i.status === "blocked").length;

    // Series by month
    const byMonth = new Map<string, { paid: number; pending: number }>();
    invs.forEach((i: any) => {
      const key = String(i.reference_month).slice(0, 7);
      const cur = byMonth.get(key) ?? { paid: 0, pending: 0 };
      if (i.status === "paid") cur.paid += Number(i.amount);
      else if (i.status === "pending" || i.status === "overdue" || i.status === "blocked") cur.pending += Number(i.amount);
      byMonth.set(key, cur);
    });
    const series = Array.from(byMonth.entries()).sort(([a],[b]) => a.localeCompare(b)).map(([month, v]) => ({ month, ...v }));

    // Method breakdown (paid invoices, last 6 months)
    const methodMap = new Map<string, number>();
    invs.filter((i: any) => i.status === "paid" && i.payment_method).forEach((i: any) => {
      methodMap.set(i.payment_method, (methodMap.get(i.payment_method) ?? 0) + 1);
    });
    const methodBreakdown = Array.from(methodMap.entries()).map(([method, count]) => ({ method, count }));

    return {
      activeCount, mrrProjected, mrrRealized, overdueAmount, overduePct,
      churnCount, skippedCount, blockedCount,
      series, methodBreakdown,
    };
  });

export const getSubscriberDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: any) => z.object({ user_id: z.string().uuid() }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const [profileRes, subRes, invsRes] = await Promise.all([
      context.supabase.from("profiles").select("user_id, name, email, role, created_at").eq("user_id", data.user_id).maybeSingle(),
      context.supabase.from("user_subscriptions").select("*, plan:subscription_plans(*)").eq("user_id", data.user_id).maybeSingle(),
      context.supabase.from("subscription_invoices").select("id, reference_month, due_date, amount, status, paid_at, payment_method, wallet_source").eq("user_id", data.user_id).order("reference_month", { ascending: false }),
    ]);

    const invs = invsRes.data ?? [];
    const firstInvoice = invs[invs.length - 1] ?? null;
    const lastPaid = invs.find((i: any) => i.status === "paid") ?? null;
    const nextInvoice = invs.find((i: any) => i.status === "pending" || i.status === "overdue" || i.status === "blocked") ?? null;
    // Preferred method: most common in paid last 6 months
    const methodCount = new Map<string, number>();
    invs.slice(0, 12).filter((i: any) => i.status === "paid" && i.payment_method).forEach((i: any) => {
      methodCount.set(i.payment_method, (methodCount.get(i.payment_method) ?? 0) + 1);
    });
    let preferredMethod: string | null = null;
    let max = 0;
    methodCount.forEach((c, m) => { if (c > max) { max = c; preferredMethod = m; }});

    return {
      profile: profileRes.data,
      subscription: subRes.data,
      invoices: invs,
      firstInvoice, lastPaid, nextInvoice, preferredMethod,
    };
  });


