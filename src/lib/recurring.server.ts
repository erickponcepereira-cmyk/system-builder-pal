import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { nextChargeDate as computeNextChargeDate } from "./recurring-dates";

type Sub = {
  id: string;
  user_id: string;
  profile_id: string | null;
  student_id: string | null;
  product_kind: string;
  product_id: string | null;
  title: string;
  amount: number;
  interval_type: string;
  billing_day: number;
  engine: string;
  saved_card_id: string | null;
  status: string;
  next_charge_at: string | null;
  failure_count: number;
};

type CardRow = {
  id: string;
  mp_customer_id: string;
  mp_card_id: string;
  payment_method_id: string | null;
  issuer_id: string | null;
  cardholder_name: string | null;
  cardholder_doc: string | null;
  payer_email: string | null;
};

const RETRY_DAYS = [3, 7];
const MAX_ATTEMPTS = 3;
/** Status do MP que ainda podem virar `approved` via webhook. */
const WAITING_STATUSES = new Set(["in_process", "pending", "authorized"]);
const CONCURRENCY = 6;
const PAGE_SIZE = 200;
/** Teto de segurança por execução para não estourar o tempo da função. */
const MAX_PER_RUN = 1000;

function nextChargeDate(sub: Sub, from = new Date()) {
  return computeNextChargeDate(sub, from);
}

/**
 * Pagador das cobranças recorrentes: usa o TITULAR salvo junto do cartão.
 * Se o cartão for de outra pessoa, usar o `profiles` do assinante repetiria
 * a divergência de documento em toda cobrança e derruba no antifraude.
 */
async function loadPayer(sub: Sub, card?: CardRow | null) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, cpf")
    .eq("user_id", sub.user_id)
    .maybeSingle();
  const accountEmail = (prof as any)?.email || card?.payer_email || "";
  return {
    email: accountEmail,
    name: card?.cardholder_name || (prof as any)?.name || undefined,
    doc: card?.cardholder_doc || (prof as any)?.cpf || undefined,
  };
}

/** Fatura pendente mais antiga da mensalidade da plataforma. */
async function findPlatformInvoice(userId: string) {
  const { data } = await supabaseAdmin
    .from("subscription_invoices" as never)
    .select("id, amount, status, due_date" as never)
    .eq("user_id" as never, userId as never)
    .in("status" as never, ["pending", "overdue", "blocked"] as never)
    .order("due_date" as never, { ascending: true } as never)
    .limit(1)
    .maybeSingle();
  return data as unknown as { id: string; amount: number } | null;
}

async function registerCharge(subId: string, attempt: number, amount: number, patch: Record<string, unknown>) {
  const { data } = await supabaseAdmin.from("recurring_charges" as never).upsert(
    {
      subscription_id: subId,
      reference_date: new Date().toISOString().slice(0, 10),
      attempt,
      amount,
      ...patch,
    } as never,
    { onConflict: "subscription_id,reference_date,attempt" } as never,
  ).select("id").maybeSingle();
  return (data as any)?.id as string | undefined;
}

type ChargeOutcome =
  | { state: "approved" }
  | { state: "skipped" }
  | { state: "waiting"; chargeId?: string; mpPaymentId?: string; detail?: string | null }
  | { state: "rejected"; reason: string };

async function chargeOne(sub: Sub): Promise<ChargeOutcome> {
  const attempt = sub.failure_count + 1;

  const { data: card } = await supabaseAdmin
    .from("saved_payment_cards" as never)
    .select("id, mp_customer_id, mp_card_id, payment_method_id, issuer_id, cardholder_name, cardholder_doc, payer_email" as never)
    .eq("id" as never, sub.saved_card_id as never)
    .maybeSingle();
  const cardRow = card as unknown as CardRow | null;
  if (!cardRow) throw new Error("Cartão salvo não encontrado");

  const payer = await loadPayer(sub, cardRow);
  if (!payer.email) throw new Error("Assinante sem e-mail");

  const { createTokenFromSavedCard } = await import("@/server/mercadopago.server");
  const token = await createTokenFromSavedCard(cardRow.mp_card_id, cardRow.mp_customer_id);

  // Mensalidade da plataforma usa o fluxo de faturas já existente (comissões,
  // desbloqueio e recibo continuam funcionando igual ao pagamento manual).
  if (sub.product_kind === "platform_subscription") {
    const invoice = await findPlatformInvoice(sub.user_id);
    if (!invoice) {
      await registerCharge(sub.id, attempt, sub.amount, { status: "skipped", status_detail: "sem fatura pendente" });
      return { state: "skipped" };
    }
    const { handleCreateCard } = await import("./mercadopago-impl.server");
    const res = await handleCreateCard({
      source: { kind: "subscription_invoice", id: invoice.id },
      payer,
      holder: { name: cardRow.cardholder_name || undefined, doc: cardRow.cardholder_doc || undefined },
      card: {
        token: String(token.id),
        installments: 1,
        paymentMethodId: cardRow.payment_method_id || "master",
        issuerId: cardRow.issuer_id || undefined,
      },
      threeDs: false,
    });
    const waiting = WAITING_STATUSES.has(String(res.status));
    const chargeId = await registerCharge(sub.id, attempt, Number(invoice.amount), {
      status: res.status === "approved" ? "approved" : waiting ? "pending" : "rejected",
      status_detail: res.statusDetail,
      mp_payment_id: res.mpPaymentId,
      invoice_id: invoice.id,
    });
    if (res.status === "approved") return { state: "approved" };
    if (waiting) return { state: "waiting", chargeId, mpPaymentId: res.mpPaymentId, detail: res.statusDetail };
    return { state: "rejected", reason: res.statusDetail || "Pagamento recusado" };
  }

  // Demais recorrências: cobrança direta no Mercado Pago.
  const { createCardPayment } = await import("@/server/mercadopago.server");
  const { siteUrl } = await import("./mercadopago-impl.server");
  const mp = await createCardPayment(
    {
      amount: Number(sub.amount),
      description: sub.title,
      token: String(token.id),
      installments: 1,
      paymentMethodId: cardRow.payment_method_id || "master",
      issuerId: cardRow.issuer_id || undefined,
      customerId: cardRow.mp_customer_id,
      payerEmail: payer.email,
      payerName: payer.name,
      payerDoc: payer.doc,
      externalReference: `recurring:${sub.id}`,
      notificationUrl: `${siteUrl()}/api/public/mp/webhook`,
      statementDescriptor: "FITMINDCLUB",
    },
    `recurring-${sub.id}-${new Date().toISOString().slice(0, 10)}-${attempt}`,
  );
  const mpStatus = String(mp?.status || "pending");
  const waiting = WAITING_STATUSES.has(mpStatus);
  const chargeId = await registerCharge(sub.id, attempt, Number(sub.amount), {
    status: mpStatus === "approved" ? "approved" : waiting ? "pending" : "rejected",
    status_detail: mp?.status_detail || null,
    mp_payment_id: String(mp?.id || ""),
  });
  if (mpStatus === "approved") return { state: "approved" };
  if (waiting) return { state: "waiting", chargeId, mpPaymentId: String(mp?.id || ""), detail: mp?.status_detail || null };
  return { state: "rejected", reason: mp?.status_detail || "Pagamento recusado" };
}

/**
 * Renovação de produto de parceiro/profissional precisa gerar um NOVO pedido
 * pago: é o pedido que dispara a entrega (dias de carteirinha, tickets) e as
 * comissões. Sem isso a cobrança acontece mas o benefício não é renovado.
 */
async function entregarRenovacao(sub: Sub) {
  if (sub.product_kind !== "professional_product" && sub.product_kind !== "partner_product") return;
  if (!sub.student_id || !sub.product_id) return;
  try {
    await supabaseAdmin.rpc("renovar_pedido_recorrente" as never, {
      _student_id: sub.student_id,
      _product_kind: sub.product_kind,
      _product_id: sub.product_id,
      _amount: Number(sub.amount) || null,
      _mp_payment_id: null,
    } as never);
  } catch (e) {
    console.error("[recurring] falha ao renovar pedido", sub.id, e);
  }
}

async function markSuccess(sub: Sub) {
  await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .update({
      status: "active",
      failure_count: 0,
      last_failure_reason: null,
      last_charge_at: new Date().toISOString(),
      next_charge_at: nextChargeDate(sub),
      pending_charge_id: null,
      pending_since: null,
      charge_claimed_at: null,
    } as never)
    .eq("id" as never, sub.id as never);
  await entregarRenovacao(sub);
}


async function markFailure(sub: Sub, reason: string) {
  const failures = sub.failure_count + 1;
  const exhausted = failures >= MAX_ATTEMPTS;
  const retryIn = RETRY_DAYS[Math.min(failures - 1, RETRY_DAYS.length - 1)];
  const retryDate = new Date();
  retryDate.setDate(retryDate.getDate() + retryIn);
  await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .update({
      failure_count: failures,
      last_failure_reason: reason.slice(0, 300),
      status: exhausted ? "past_due" : "active",
      next_charge_at: exhausted ? null : retryDate.toISOString().slice(0, 10),
      pending_charge_id: null,
      pending_since: null,
      charge_claimed_at: null,
    } as never)
    .eq("id" as never, sub.id as never);
}

/**
 * Cobrança em análise: NÃO é falha. Congela a assinatura em `processing` para
 * não gerar segunda cobrança e espera o webhook fechar o ciclo.
 */
async function markWaiting(sub: Sub, chargeId?: string, detail?: string | null) {
  await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .update({
      status: "processing",
      last_failure_reason: detail ? `aguardando: ${String(detail).slice(0, 280)}` : "aguardando análise do Mercado Pago",
      pending_charge_id: chargeId || null,
      pending_since: new Date().toISOString(),
      charge_claimed_at: null,
    } as never)
    .eq("id" as never, sub.id as never);
}

/** Executa a cobrança de uma assinatura (com update de próxima data / falhas). */
async function runChargeCycle(sub: Sub) {
  const { data: claimed, error: claimError } = await supabaseAdmin.rpc(
    "account_deletion_claim_recurring_charge" as never,
    { _subscription_id: sub.id } as never,
  );
  if (claimError) {
    return { id: sub.id, ok: false as const, error: "falha ao reservar cobrança" };
  }
  if (claimed !== true) {
    return { id: sub.id, ok: true as const, skipped: true as const };
  }

  try {
    const outcome = await chargeOne(sub);
    if (outcome.state === "waiting") {
      await markWaiting(sub, outcome.chargeId, outcome.detail);
      return { id: sub.id, ok: true as const, waiting: true as const };
    }
    if (outcome.state === "rejected") {
      await markFailure(sub, outcome.reason);
      return { id: sub.id, ok: false as const, error: outcome.reason };
    }
    await markSuccess(sub);
    return { id: sub.id, ok: true as const };
  } catch (e: any) {
    const reason = String(e?.message || e);
    await markFailure(sub, reason);
    return { id: sub.id, ok: false as const, error: reason };
  }
}

/** Fecha o ciclo de uma cobrança que estava "aguardando" (chamado pelo webhook). */
export async function settleRecurringCharge(
  subscriptionId: string,
  mpPaymentId: string,
  finalStatus: "approved" | "rejected" | "cancelled" | "refunded" | "pending" | "in_process",
  statusDetail?: string | null,
) {
  const { data } = await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .select("*" as never)
    .eq("id" as never, subscriptionId as never)
    .maybeSingle();
  const sub = data as unknown as (Sub & { pending_charge_id: string | null }) | null;
  if (!sub) return { ok: false, error: "assinatura não encontrada" };
  if (sub.status === "deletion_pending") {
    return { ok: false, error: "assinatura congelada para exclusão de conta" };
  }

  if (finalStatus === "pending" || finalStatus === "in_process") {
    return { ok: true, waiting: true };
  }

  const approved = finalStatus === "approved";
  if (mpPaymentId) {
    await supabaseAdmin
      .from("recurring_charges" as never)
      .update({
        status: approved ? "approved" : "rejected",
        status_detail: statusDetail || finalStatus,
      } as never)
      .eq("subscription_id" as never, subscriptionId as never)
      .eq("mp_payment_id" as never, String(mpPaymentId) as never);
  }

  if (approved) {
    await markSuccess(sub);
  } else {
    // O contador de falhas só avança agora; a tentativa em análise não contou.
    await markFailure(sub, statusDetail || `pagamento ${finalStatus}`);
  }
  return { ok: true, approved };
}

/** Cobra uma assinatura específica imediatamente (usado no teste manual do admin). */
export async function chargeSubscriptionNow(id: string) {
  const { data } = await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .select("*" as never)
    .eq("id" as never, id as never)
    .maybeSingle();
  const sub = data as unknown as Sub | null;
  if (!sub) throw new Error("Assinatura não encontrada");
  if ((sub as any).engine !== "saved_card") throw new Error("Só é possível forçar cobrança de assinaturas com cartão salvo");
  return runChargeCycle(sub);
}

/** Processa uma lista com concorrência limitada. */
async function runPool<T, R>(items: T[], limit: number, worker: (item: T) => Promise<R>): Promise<R[]> {
  const results: R[] = new Array(items.length);
  let cursor = 0;
  const runners = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (cursor < items.length) {
      const index = cursor++;
      results[index] = await worker(items[index]);
    }
  });
  await Promise.all(runners);
  return results;
}

async function fetchDuePage(today: string, offset: number) {
  const staleClaim = new Date(Date.now() - 20 * 60_000).toISOString();
  const { data } = await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .select("*" as never)
    .or(
      `status.eq.active,and(status.eq.charging,charge_claimed_at.lt.${staleClaim})` as never,
    )
    .eq("engine" as never, "saved_card" as never)
    .lte("next_charge_at" as never, today as never)
    .order("next_charge_at" as never, { ascending: true } as never)
    .range(offset, offset + PAGE_SIZE - 1);
  return (data || []) as unknown as Sub[];
}

/**
 * Executado diariamente pelo cron: cobra todas as assinaturas vencidas.
 * Pagina até esvaziar a fila e processa em lotes concorrentes. Se o teto da
 * execução for atingido, informa quantas ficaram para a próxima rodada.
 */
export async function chargeDueSubscriptions() {
  const today = new Date().toISOString().slice(0, 10);
  const results: Array<{
    id: string;
    ok: boolean;
    error?: string;
    waiting?: boolean;
    skipped?: boolean;
  }> = [];
  let processed = 0;
  let offset = 0;
  let remaining = 0;

  while (processed < MAX_PER_RUN) {
    // As cobradas saem do filtro (next_charge_at futuro / status alterado),
    // então o offset só avança quando o lote não muda de estado.
    const page = await fetchDuePage(today, offset);
    if (!page.length) break;

    const batch = page.slice(0, Math.min(page.length, MAX_PER_RUN - processed));
    const batchResults = await runPool(batch, CONCURRENCY, runChargeCycle);
    results.push(...batchResults);
    processed += batch.length;

    // Assinaturas que continuam vencidas (falha com retentativa hoje) não podem
    // ser relidas em loop infinito — avançamos o cursor sobre elas.
    const stillDue = batchResults.filter((r) => !r.ok || r.skipped).length;
    offset += stillDue;
    if (batch.length < PAGE_SIZE && stillDue === 0) {
      // Fila drenada nesta página; próxima iteração confirma se sobrou algo.
      offset = Math.max(0, offset);
    }
  }

  if (processed >= MAX_PER_RUN) {
    const pending = await fetchDuePage(today, 0);
    remaining = pending.length;
    console.warn("[recurring] teto da execução atingido; restantes para a próxima rodada:", remaining);
  }

  return {
    processed,
    approved: results.filter((r) => r.ok && !r.waiting && !r.skipped).length,
    waiting: results.filter((r) => r.waiting).length,
    skipped: results.filter((r) => r.skipped).length,
    failed: results.filter((r) => !r.ok).length,
    remaining,
    results,
  };
}
