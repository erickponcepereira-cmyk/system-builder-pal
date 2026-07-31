import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

export interface ReconcileApprovedItem {
  mpPaymentId: string | null;
  sourceKind: string;
  sourceId: string;
  amount: number;
  ok: boolean;
  message: string;
}

export interface ReconcileApprovedSummary {
  candidates: number;
  processed: number;
  failed: number;
  details: ReconcileApprovedItem[];
}

const SOURCE_TABLE: Record<string, { table: string; statusPaid: string }> = {
  store_order: { table: "store_orders", statusPaid: "paid" },
  partner_product_order: { table: "partner_product_orders", statusPaid: "paid" },
  subscription_invoice: { table: "subscription_invoices", statusPaid: "paid" },
  transaction: { table: "transactions", statusPaid: "paid" },
};

export interface StuckApprovedPayment {
  mpPaymentId: string | null;
  sourceKind: string;
  sourceId: string;
  amount: number;
  createdAt: string;
}

/** Lista pagamentos aprovados no Mercado Pago cuja origem continua pendente. */
export const listStuckApprovedPayments = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<StuckApprovedPayment[]> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: payments, error } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("mp_payment_id, source_kind, source_id, amount, created_at")
      .eq("status", "approved")
      .lte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const out: StuckApprovedPayment[] = [];
    for (const p of (payments || []) as Array<{
      mp_payment_id: string | null;
      source_kind: string;
      source_id: string;
      amount: number;
      created_at: string;
    }>) {
      const meta = SOURCE_TABLE[p.source_kind];
      if (!meta || !p.source_id) continue;
      const { data: srcRow } = await supabaseAdmin
        .from(meta.table as never)
        .select("id, status" as never)
        .eq("id" as never, p.source_id as never)
        .maybeSingle();
      const status = (srcRow as unknown as { status?: string } | null)?.status;
      if (!srcRow || status === meta.statusPaid || status === "cancelled") continue;
      out.push({
        mpPaymentId: p.mp_payment_id,
        sourceKind: p.source_kind,
        sourceId: p.source_id,
        amount: Number(p.amount || 0),
        createdAt: p.created_at,
      });
    }
    return out;
  });


/**
 * Reprocessa pagamentos que o Mercado Pago já aprovou mas cuja origem
 * (pedido / fatura) continua pendente — tipicamente quando o webhook chegou
 * mas o motor financeiro falhou no meio do caminho.
 */
export const reconcileApprovedPendingPayments = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<ReconcileApprovedSummary> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { applyApproval } = await import("@/lib/mercadopago-impl.server");

    const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
    const { data: payments, error } = await supabaseAdmin
      .from("mercadopago_payments")
      .select("id, mp_payment_id, source_kind, source_id, amount, paid_at, created_at")
      .eq("status", "approved")
      .lte("created_at", cutoff)
      .order("created_at", { ascending: false })
      .limit(300);
    if (error) throw new Error(error.message);

    const details: ReconcileApprovedItem[] = [];
    let processed = 0;
    let failed = 0;
    let candidates = 0;

    for (const p of (payments || []) as Array<{
      mp_payment_id: string | null;
      source_kind: string;
      source_id: string;
      amount: number;
    }>) {
      const meta = SOURCE_TABLE[p.source_kind];
      if (!meta || !p.source_id) continue;

      const { data: srcRow } = await supabaseAdmin
        .from(meta.table as never)
        .select("id, status" as never)
        .eq("id" as never, p.source_id as never)
        .maybeSingle();
      const status = (srcRow as unknown as { status?: string } | null)?.status;
      if (!srcRow || status === meta.statusPaid || status === "cancelled") continue;

      candidates += 1;
      try {
        await applyApproval(p.source_kind as never, p.source_id);
        processed += 1;
        details.push({
          mpPaymentId: p.mp_payment_id,
          sourceKind: p.source_kind,
          sourceId: p.source_id,
          amount: Number(p.amount || 0),
          ok: true,
          message: "Reprocessado com sucesso",
        });
      } catch (e) {
        failed += 1;
        details.push({
          mpPaymentId: p.mp_payment_id,
          sourceKind: p.source_kind,
          sourceId: p.source_id,
          amount: Number(p.amount || 0),
          ok: false,
          message: (e as Error)?.message || "Falha desconhecida",
        });
      }
    }

    return { candidates, processed, failed, details };
  });

/**
 * Reexecuta o gancho de anuidade para pedidos de ativação já pagos cujo
 * cadastro (coach/parceiro) continua sem a anuidade registrada.
 */
export const reconcileAnnualActivations = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ fixed: number }> => {
    const { data: isAdmin } = await context.supabase.rpc("is_admin", { _user_id: context.userId });
    if (!isAdmin) throw new Error("Acesso negado");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { handlePaidStoreOrderForActivation, ACTIVATION_PRODUCT_ID } = await import(
      "@/lib/coach-onboarding.server"
    );

    const { data: items } = await supabaseAdmin
      .from("store_order_items")
      .select("order_id, order:store_orders!inner(id, status)")
      .eq("product_id", ACTIVATION_PRODUCT_ID)
      .limit(500);

    let fixed = 0;
    const seen = new Set<string>();
    for (const it of (items || []) as Array<{ order_id: string; order?: { status?: string } | null }>) {
      if (seen.has(it.order_id)) continue;
      seen.add(it.order_id);
      if (it.order?.status !== "paid") continue;
      try {
        await handlePaidStoreOrderForActivation(it.order_id);
        fixed += 1;
      } catch {
        /* segue para o próximo */
      }
    }
    return { fixed };
  });
