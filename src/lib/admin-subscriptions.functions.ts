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
    billing_day: z.number().int().min(1).max(28).optional(),
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

