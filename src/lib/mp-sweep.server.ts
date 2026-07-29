// ============================================================
// VARREDURA AUTOMÁTICA DE PAGAMENTOS MERCADO PAGO
// Rede de segurança para quando o webhook não chega.
// Reutiliza exatamente o mesmo caminho do webhook: getPayment + applyApproval.
// NÃO altera valores nem regras de comissão.
// ============================================================
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getPayment, mapMpStatus } from "@/server/mercadopago.server";
import { applyApproval, loadSource, type SourceKind } from "@/lib/mercadopago-impl.server";

const ALLOWED_KINDS = new Set<SourceKind>([
  "store_order",
  "transaction",
  "partner_product_order",
  "subscription_invoice",
]);

export const MP_SWEEP_SETTING_KEY = "mp_sweep_last_run";

export interface MpSweepSummary {
  checked: number;
  approved: number;
  applied: number;
  failed: number;
  /** Reprocessamento de aprovados cuja origem continuava pendente. */
  rescued: number;
  errors: string[];
  finishedAt: string;
}

/** Aplica a aprovação de um pagamento respeitando a idempotência da origem. */
async function applyIfNeeded(kind: string, sourceId: string): Promise<"applied" | "skipped"> {
  if (!ALLOWED_KINDS.has(kind as SourceKind) || !sourceId) return "skipped";
  const src = await loadSource(kind as SourceKind, sourceId);
  if (src.alreadyPaid) return "skipped";
  await applyApproval(kind as SourceKind, sourceId);
  return "applied";
}

/**
 * 1) Consulta no MP os pagamentos locais ainda pendentes/em análise dos
 *    últimos 7 dias e aplica os que já foram aprovados.
 * 2) Reprocessa pagamentos aprovados cuja origem continua pendente.
 */
export async function sweepMpPayments(): Promise<MpSweepSummary> {
  const errors: string[] = [];
  let checked = 0;
  let approved = 0;
  let applied = 0;
  let failed = 0;
  let rescued = 0;

  const since = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  // ── Fase 1: pendentes / em análise ──
  const { data: pendings, error: pendErr } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("id, mp_payment_id, source_kind, source_id, amount, status")
    .in("status", ["pending", "in_process"])
    .gte("created_at", since)
    .order("created_at", { ascending: true })
    .limit(200);
  if (pendErr) throw new Error(pendErr.message);

  for (const p of (pendings || []) as Array<{
    id: string;
    mp_payment_id: string | null;
    source_kind: string;
    source_id: string;
    status: string;
  }>) {
    if (!p.mp_payment_id) continue;
    checked += 1;
    try {
      const payment = await getPayment(String(p.mp_payment_id));
      const status = mapMpStatus(payment.status || "pending");
      if (status === p.status) continue;

      await supabaseAdmin
        .from("mercadopago_payments")
        .update({
          status,
          status_detail: payment.status_detail || null,
          paid_at: status === "approved" ? new Date().toISOString() : null,
          raw_webhook: payment,
        })
        .eq("id", p.id);

      if (status !== "approved") continue;
      approved += 1;

      const paidAmount = Number(payment.transaction_amount || 0);
      const src = await loadSource(p.source_kind as SourceKind, p.source_id);
      if (src.alreadyPaid) continue;
      if (Math.abs(paidAmount - Number(src.amount)) > 0.05) {
        failed += 1;
        errors.push(`${p.mp_payment_id}: valor divergente (pago ${paidAmount} / esperado ${src.amount})`);
        continue;
      }
      const r = await applyIfNeeded(p.source_kind, p.source_id);
      if (r === "applied") applied += 1;
    } catch (e) {
      failed += 1;
      const msg = `${p.mp_payment_id}: ${(e as Error)?.message || e}`;
      errors.push(msg);
      console.error("[mp-sweep] pendente falhou:", msg);
    }
  }

  // ── Fase 2: aprovados no MP cuja origem continua pendente ──
  const cutoff = new Date(Date.now() - 2 * 60 * 1000).toISOString();
  const { data: approvedRows, error: apprErr } = await supabaseAdmin
    .from("mercadopago_payments")
    .select("mp_payment_id, source_kind, source_id")
    .eq("status", "approved")
    .lte("created_at", cutoff)
    .gte("created_at", since)
    .order("created_at", { ascending: false })
    .limit(300);
  if (apprErr) throw new Error(apprErr.message);

  for (const p of (approvedRows || []) as Array<{
    mp_payment_id: string | null;
    source_kind: string;
    source_id: string;
  }>) {
    try {
      const r = await applyIfNeeded(p.source_kind, p.source_id);
      if (r === "applied") rescued += 1;
    } catch (e) {
      failed += 1;
      const msg = `${p.mp_payment_id}: ${(e as Error)?.message || e}`;
      errors.push(msg);
      console.error("[mp-sweep] aprovado pendente falhou:", msg);
    }
  }

  const summary: MpSweepSummary = {
    checked,
    approved,
    applied,
    failed,
    rescued,
    errors: errors.slice(0, 20),
    finishedAt: new Date().toISOString(),
  };

  const { error: logErr } = await supabaseAdmin
    .from("app_settings")
    .upsert(
      {
        key: MP_SWEEP_SETTING_KEY,
        value: JSON.stringify(summary),
        description: "Última varredura automática de pagamentos Mercado Pago",
        updated_at: new Date().toISOString(),
      } as never,
      { onConflict: "key" } as never,
    );
  if (logErr) console.error("[mp-sweep] falha ao registrar resumo:", logErr.message);

  return summary;
}
