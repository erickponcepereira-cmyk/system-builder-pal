import { supabaseAdmin } from "@/integrations/supabase/client.server";

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

const RETRY_DAYS = [3, 7];
const MAX_ATTEMPTS = 3;

function addMonths(date: Date, n: number) {
  const d = new Date(date);
  d.setMonth(d.getMonth() + n);
  return d;
}

function nextChargeDate(sub: Sub, from = new Date()) {
  const months = sub.interval_type === "yearly" ? 12 : 1;
  const base = addMonths(from, months);
  const day = Math.min(sub.billing_day, 28);
  base.setDate(day);
  return base.toISOString().slice(0, 10);
}

async function loadPayer(sub: Sub) {
  const { data: prof } = await supabaseAdmin
    .from("profiles")
    .select("id, name, email, cpf")
    .eq("user_id", sub.user_id)
    .maybeSingle();
  return {
    email: (prof as any)?.email || "",
    name: (prof as any)?.name || undefined,
    doc: (prof as any)?.cpf || undefined,
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
  await supabaseAdmin.from("recurring_charges" as never).upsert(
    {
      subscription_id: subId,
      reference_date: new Date().toISOString().slice(0, 10),
      attempt,
      amount,
      ...patch,
    } as never,
    { onConflict: "subscription_id,reference_date,attempt" } as never,
  );
}

async function chargeOne(sub: Sub) {
  const attempt = sub.failure_count + 1;
  const payer = await loadPayer(sub);
  if (!payer.email) throw new Error("Assinante sem e-mail");

  const { data: card } = await supabaseAdmin
    .from("saved_payment_cards" as never)
    .select("id, mp_customer_id, mp_card_id, payment_method_id, issuer_id" as never)
    .eq("id" as never, sub.saved_card_id as never)
    .maybeSingle();
  const cardRow = card as unknown as {
    mp_customer_id: string; mp_card_id: string; payment_method_id: string | null; issuer_id: string | null;
  } | null;
  if (!cardRow) throw new Error("Cartão salvo não encontrado");

  const { createTokenFromSavedCard } = await import("@/server/mercadopago.server");
  const token = await createTokenFromSavedCard(cardRow.mp_card_id, cardRow.mp_customer_id);

  // Mensalidade da plataforma usa o fluxo de faturas já existente (comissões,
  // desbloqueio e recibo continuam funcionando igual ao pagamento manual).
  if (sub.product_kind === "platform_subscription") {
    const invoice = await findPlatformInvoice(sub.user_id);
    if (!invoice) {
      await registerCharge(sub.id, attempt, sub.amount, { status: "skipped", status_detail: "sem fatura pendente" });
      return { ok: true, skipped: true };
    }
    const { handleCreateCard } = await import("./mercadopago-impl.server");
    const res = await handleCreateCard({
      source: { kind: "subscription_invoice", id: invoice.id },
      payer,
      card: {
        token: String(token.id),
        installments: 1,
        paymentMethodId: cardRow.payment_method_id || "master",
        issuerId: cardRow.issuer_id || undefined,
      },
    });
    const approved = res.status === "approved";
    await registerCharge(sub.id, attempt, Number(invoice.amount), {
      status: approved ? "approved" : "rejected",
      status_detail: res.statusDetail,
      mp_payment_id: res.mpPaymentId,
      invoice_id: invoice.id,
    });
    if (!approved) throw new Error(res.statusDetail || "Pagamento recusado");
    return { ok: true };
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
  const approved = mp?.status === "approved";
  await registerCharge(sub.id, attempt, Number(sub.amount), {
    status: approved ? "approved" : "rejected",
    status_detail: mp?.status_detail || null,
    mp_payment_id: String(mp?.id || ""),
  });
  if (!approved) throw new Error(mp?.status_detail || "Pagamento recusado");
  return { ok: true };
}

/** Executa a cobrança de uma assinatura (com update de próxima data / falhas). */
async function runChargeCycle(sub: Sub) {
  try {
    await chargeOne(sub);
    await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .update({
        failure_count: 0,
        last_failure_reason: null,
        last_charge_at: new Date().toISOString(),
        next_charge_at: nextChargeDate(sub),
      } as never)
      .eq("id" as never, sub.id as never);
    return { id: sub.id, ok: true as const };
  } catch (e: any) {
    const failures = sub.failure_count + 1;
    const exhausted = failures >= MAX_ATTEMPTS;
    const retryIn = RETRY_DAYS[Math.min(failures - 1, RETRY_DAYS.length - 1)];
    const retryDate = new Date();
    retryDate.setDate(retryDate.getDate() + retryIn);
    await supabaseAdmin
      .from("recurring_subscriptions" as never)
      .update({
        failure_count: failures,
        last_failure_reason: String(e?.message || e).slice(0, 300),
        status: exhausted ? "past_due" : "active",
        next_charge_at: exhausted ? null : retryDate.toISOString().slice(0, 10),
      } as never)
      .eq("id" as never, sub.id as never);
    return { id: sub.id, ok: false as const, error: String(e?.message || e) };
  }
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

/** Executado diariamente pelo cron: cobra todas as assinaturas vencidas. */
export async function chargeDueSubscriptions() {
  const today = new Date().toISOString().slice(0, 10);
  const { data } = await supabaseAdmin
    .from("recurring_subscriptions" as never)
    .select("*" as never)
    .eq("status" as never, "active" as never)
    .eq("engine" as never, "saved_card" as never)
    .lte("next_charge_at" as never, today as never)
    .limit(200);
  const subs = (data || []) as unknown as Sub[];

  const results: Array<{ id: string; ok: boolean; error?: string }> = [];
  for (const sub of subs) {
    results.push(await runChargeCycle(sub));
  }
  return { processed: subs.length, results };
}
