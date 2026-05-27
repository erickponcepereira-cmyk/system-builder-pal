import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

export interface RecipientTotal {
  profileId: string;
  name: string;
  email: string | null;
  role: string | null;
  pending: number;
  available: number;
  paid: number;
  total: number;
}

export interface AdminFinancialOverview {
  coaches: { total: number; pending: number; available: number; paid: number; recipients: RecipientTotal[] };
  network: { total: number; pending: number; available: number; paid: number; recipients: RecipientTotal[] };
  nutritionists: { total: number; pending: number; available: number; paid: number; recipients: RecipientTotal[] };
  system: { total: number; pending: number; available: number; paid: number; recipients: RecipientTotal[] };
  productCosts: { total: number; pending: number; preparing: number; shipped: number; delivered: number; cancelled: number };
}

export const getAdminFinancialOverview = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Commissions grouped by beneficiary
    const { data: commissions, error: cErr } = await supabaseAdmin
      .from("commissions")
      .select("amount, status, slot_label, level, beneficiary_profile_id, beneficiary_coach_id, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email,role)");
    if (cErr) throw new Error(cErr.message);

    const coachesMap = new Map<string, RecipientTotal>();
    const networkMap = new Map<string, RecipientTotal>();
    const systemMap = new Map<string, RecipientTotal>();
    let networkPending = 0, networkAvailable = 0, networkPaid = 0;

    for (const c of commissions || []) {
      const pid = (c as any).beneficiary_profile_id as string | null;
      if (!pid) continue;
      const prof = (c as any).profiles as { name?: string; email?: string; role?: string } | null;
      const amt = Number((c as any).amount || 0);
      const status = String((c as any).status || "pending");
      const level = Number((c as any).level || 0);
      const slotLabel = String((c as any).slot_label || "").toLowerCase();
      const benefCoachId = (c as any).beneficiary_coach_id as string | null;

      // Network (level 1/2/3)
      if (level > 0) {
        if (status === "pending") networkPending += amt;
        else if (status === "available") networkAvailable += amt;
        else if (status === "paid" || status === "withdrawn") networkPaid += amt;

        const cur = networkMap.get(pid) || {
          profileId: pid,
          name: prof?.name || "—",
          email: prof?.email || null,
          role: prof?.role || null,
          pending: 0, available: 0, paid: 0, total: 0,
        };
        if (status === "pending") cur.pending += amt;
        else if (status === "available") cur.available += amt;
        else if (status === "paid" || status === "withdrawn") cur.paid += amt;
        cur.total = cur.pending + cur.available + cur.paid;
        networkMap.set(pid, cur);
      }

      // Network já tratado acima. Comissões de "sistema" agora vão para
      // a carteira compartilhada admin_system_wallet (tratada abaixo) e
      // não devem aparecer mais aqui — caso restem registros antigos,
      // são ignorados pelo bucket "system".
      const isSystem =
        slotLabel.includes("sistema") ||
        slotLabel.includes("admin") ||
        (!benefCoachId && !slotLabel);
      if (isSystem) continue;
      const target = level > 0 ? null : coachesMap;
      if (!target) continue;
      const cur = target.get(pid) || {
        profileId: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        role: prof?.role || null,
        pending: 0, available: 0, paid: 0, total: 0,
      };
      if (status === "pending") cur.pending += amt;
      else if (status === "available") cur.available += amt;
      else if (status === "paid" || status === "withdrawn") cur.paid += amt;
      cur.total = cur.pending + cur.available + cur.paid;
      target.set(pid, cur);
    }


    const sumGroup = (rs: RecipientTotal[]) => ({
      pending: rs.reduce((s, r) => s + r.pending, 0),
      available: rs.reduce((s, r) => s + r.available, 0),
      paid: rs.reduce((s, r) => s + r.paid, 0),
      total: rs.reduce((s, r) => s + r.total, 0),
    });

    const coachesList = Array.from(coachesMap.values()).sort((a, b) => (b.pending + b.available) - (a.pending + a.available));
    const networkList = Array.from(networkMap.values()).sort((a, b) => (b.pending + b.available) - (a.pending + a.available));
    const systemList = Array.from(systemMap.values()).sort((a, b) => (b.pending + b.available) - (a.pending + a.available));
    const coachesAgg = sumGroup(coachesList);
    const networkAgg = sumGroup(networkList);
    const systemAgg = sumGroup(systemList);

    // Nutricionistas: não usa join embutido aqui porque a carteira pode não
    // ter FK exposta no Data API; busca perfis separadamente para não zerar o bucket.
    const { data: nutriWallets, error: nutriErr } = await supabaseAdmin
      .from("nutritionist_wallets")
      .select("profile_id, available_balance, blocked_balance, total_earned, total_withdrawn");
    if (nutriErr) throw new Error(nutriErr.message);
    const nutriProfileIds = Array.from(new Set((nutriWallets || []).map((w: any) => w.profile_id).filter(Boolean)));
    const { data: nutriProfiles } = nutriProfileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,email,role").in("id", nutriProfileIds)
      : { data: [] as any[] };
    const nutriProfileMap = new Map<string, { name?: string; email?: string; role?: string }>();
    (nutriProfiles || []).forEach((p: any) => nutriProfileMap.set(p.id, p));
    const nutriList: RecipientTotal[] = (nutriWallets || []).map((w: any) => {
      const prof = nutriProfileMap.get(w.profile_id);
      const pending = Number(w.blocked_balance || 0);
      const available = Number(w.available_balance || 0);
      const paid = Number(w.total_withdrawn || 0);
      return {
        profileId: w.profile_id,
        name: prof?.name || "—",
        email: prof?.email || null,
        role: prof?.role || "nutritionist",
        pending,
        available,
        paid,
        total: pending + available + paid,
      };
    });
    const nutriAgg = sumGroup(nutriList);

    // Custos / pool de produtos
    const { data: pool } = await supabaseAdmin
      .from("product_order_pool_entries")
      .select("amount, status");
    const buckets = { pending: 0, preparing: 0, shipped: 0, delivered: 0, cancelled: 0, total: 0 };
    for (const e of pool || []) {
      const amt = Number((e as any).amount || 0);
      const st = String((e as any).status || "pending");
      if (st in buckets) (buckets as any)[st] += amt;
      buckets.total += amt;
    }

    const overview: AdminFinancialOverview = {
      coaches: { ...coachesAgg, recipients: coachesList },
      network: { ...networkAgg, pending: networkPending, available: networkAvailable, paid: networkPaid, total: networkPending + networkAvailable + networkPaid, recipients: networkList },
      nutritionists: { ...nutriAgg, recipients: nutriList },
      system: { ...systemAgg, recipients: systemList },
      productCosts: buckets,
    };
    return overview;
  });

export interface PayoutHistoryItem {
  id: string;
  kind: "coach" | "student" | "nutritionist" | "system";
  profileId: string;
  name: string;
  email: string | null;
  amount: number;
  status: string;
  paidAt: string | null;
  requestedAt: string | null;
}

export const listPayoutHistory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    const [{ data: coachW }, { data: studentW }] = await Promise.all([
      supabaseAdmin
        .from("withdrawal_requests")
        .select("id, amount, status, paid_at, requested_at, profile_id, profiles(name,email)")
        .order("requested_at", { ascending: false })
        .limit(200),
      supabaseAdmin
        .from("student_withdrawal_requests")
        .select("id, amount, status, paid_at, requested_at, student_id, students(profiles(name,email))")
        .order("requested_at", { ascending: false })
        .limit(200),
    ]);

    const items: PayoutHistoryItem[] = [];
    for (const w of coachW || []) {
      const r = w as any;
      items.push({
        id: r.id, kind: "coach", profileId: r.profile_id,
        name: r.profiles?.name || "—", email: r.profiles?.email || null,
        amount: Number(r.amount || 0), status: r.status || "pending",
        paidAt: r.paid_at, requestedAt: r.requested_at,
      });
    }
    for (const w of studentW || []) {
      const r = w as any;
      items.push({
        id: r.id, kind: "student", profileId: r.student_id,
        name: r.students?.profiles?.name || "—", email: r.students?.profiles?.email || null,
        amount: Number(r.amount || 0), status: r.status || "pending",
        paidAt: r.paid_at, requestedAt: r.requested_at,
      });
    }
    items.sort((a, b) => (b.requestedAt || "").localeCompare(a.requestedAt || ""));
    return items;
  });

// ---------------------------------------------------------------------------
// Breakdown por bucket: lista de comissões pendentes/disponíveis agrupadas
// por venda, com nome do coach beneficiário e cliente vinculado. Usado nos
// modais ao clicar em cada bucket do painel Financeiro.
// ---------------------------------------------------------------------------

export type BucketKind = "coaches" | "network" | "system";

export interface BucketCommissionRow {
  commissionId: string;
  transactionId: string | null;
  beneficiaryName: string;
  beneficiaryEmail: string | null;
  clientName: string | null;
  productName: string | null;
  slotLabel: string | null;
  level: number;
  amount: number;
  status: string;
  createdAt: string | null;
}

export const listBucketCommissions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { bucket: BucketKind; statuses?: Array<"pending" | "available" | "paid"> })
  .handler(async ({ context, data }): Promise<BucketCommissionRow[]> => {
    await assertAdmin(context.userId);
    const statuses = (data.statuses?.length ? data.statuses : ["pending", "available"]) as Array<"pending" | "available">;

    const { data: rows, error } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, transaction_id, slot_label, level, amount, status, created_at, beneficiary_coach_id, beneficiary_profile_id, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email)",
      )
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const filtered = (rows || []).filter((c: any) => {
      const slot = String(c.slot_label || "").toLowerCase();
      const isSystem = slot.includes("sistema") || slot.includes("admin") || (!c.beneficiary_coach_id && !slot);
      const isNetwork = Number(c.level || 0) > 0;
      if (data.bucket === "system") return isSystem;
      if (data.bucket === "network") return isNetwork && !isSystem;
      // coaches
      return !isSystem && !isNetwork;
    });

    // Resolve transactions → student + product names
    const txIds = Array.from(new Set(filtered.map((c: any) => c.transaction_id).filter(Boolean)));
    let txMap = new Map<string, { studentName: string | null; productName: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id, product_id, student_id")
        .in("id", txIds);
      const studentIds = Array.from(new Set((txs || []).map((t: any) => t.student_id).filter(Boolean)));
      const productIds = Array.from(new Set((txs || []).map((t: any) => t.product_id).filter(Boolean)));
      const [{ data: students }, { data: products }] = await Promise.all([
        studentIds.length
          ? supabaseAdmin.from("students").select("id, profile_id, profiles(name)").in("id", studentIds)
          : Promise.resolve({ data: [] as any[] }),
        productIds.length
          ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
          : Promise.resolve({ data: [] as any[] }),
      ]);
      const sNameMap = new Map<string, string>();
      (students || []).forEach((s: any) => sNameMap.set(s.id, s.profiles?.name || ""));
      const pNameMap = new Map<string, string>();
      (products || []).forEach((p: any) => pNameMap.set(p.id, p.name));
      (txs || []).forEach((t: any) => {
        txMap.set(t.id, {
          studentName: t.student_id ? sNameMap.get(t.student_id) || null : null,
          productName: t.product_id ? pNameMap.get(t.product_id) || null : null,
        });
      });
    }

    return filtered.map((c: any) => {
      const tx = c.transaction_id ? txMap.get(c.transaction_id) : null;
      return {
        commissionId: c.id,
        transactionId: c.transaction_id,
        beneficiaryName: c.profiles?.name || "—",
        beneficiaryEmail: c.profiles?.email || null,
        clientName: tx?.studentName ?? null,
        productName: tx?.productName ?? null,
        slotLabel: c.slot_label,
        level: Number(c.level || 0),
        amount: Number(c.amount || 0),
        status: c.status,
        createdAt: c.created_at,
      };
    });
  });

// ---------------------------------------------------------------------------
// Impostos e taxas de pagamento
// ---------------------------------------------------------------------------

export interface FeeBreakdown {
  total: number;
  autoPaidCard: number;
  manualPaid: number;
  manualPending: number;
}

export interface FeesAndTaxesOverview {
  tax: FeeBreakdown;
  paymentFee: FeeBreakdown;
  sales: { card: number; pix: number; boleto: number; other: number };
}

export const getFeesAndTaxesBreakdown = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<FeesAndTaxesOverview> => {
    await assertAdmin(context.userId);

    const { data: txs, error } = await supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status")
      .eq("status", "paid");
    if (error) throw new Error(error.message);

    const { data: payouts } = await supabaseAdmin
      .from("system_fee_payouts")
      .select("transaction_id, kind, amount");

    const paidTax = new Map<string, number>();
    const paidFee = new Map<string, number>();
    for (const p of payouts || []) {
      const r = p as any;
      if (r.kind === "tax") paidTax.set(r.transaction_id, Number(r.amount || 0));
      else if (r.kind === "payment_fee") paidFee.set(r.transaction_id, Number(r.amount || 0));
    }

    const tax: FeeBreakdown = { total: 0, autoPaidCard: 0, manualPaid: 0, manualPending: 0 };
    const fee: FeeBreakdown = { total: 0, autoPaidCard: 0, manualPaid: 0, manualPending: 0 };
    const sales = { card: 0, pix: 0, boleto: 0, other: 0 };

    for (const t of txs || []) {
      const r = t as any;
      const taxAmt = Number(r.tax_amount || 0);
      const feeAmt = Number(r.payment_fee || 0);
      const method = String(r.payment_method || "other").toLowerCase();
      const isCard = method === "credit_card" || method === "debit_card" || method === "card";

      tax.total += taxAmt;
      fee.total += feeAmt;

      if (isCard) {
        tax.autoPaidCard += taxAmt;
        fee.autoPaidCard += feeAmt;
        sales.card += Number(r.gross_amount || 0);
      } else {
        if (paidTax.has(r.id)) tax.manualPaid += taxAmt; else tax.manualPending += taxAmt;
        if (paidFee.has(r.id)) fee.manualPaid += feeAmt; else fee.manualPending += feeAmt;
        if (method === "pix") sales.pix += Number(r.gross_amount || 0);
        else if (method === "boleto") sales.boleto += Number(r.gross_amount || 0);
        else sales.other += Number(r.gross_amount || 0);
      }
    }

    return { tax, paymentFee: fee, sales };
  });

export interface PendingFeeRow {
  transactionId: string;
  date: string | null;
  productName: string | null;
  clientName: string | null;
  paymentMethod: string | null;
  taxAmount: number;
  feeAmount: number;
  taxPaid: boolean;
  feePaid: boolean;
}

export const listPendingSystemFees = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingFeeRow[]> => {
    await assertAdmin(context.userId);

    const { data: txs, error } = await supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status, paid_at, product_id, student_id")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(500);
    if (error) throw new Error(error.message);

    const nonCard = (txs || []).filter((t: any) => {
      const m = String(t.payment_method || "").toLowerCase();
      return !(m === "credit_card" || m === "debit_card" || m === "card");
    });

    const txIds = nonCard.map((t: any) => t.id);
    const productIds = Array.from(new Set(nonCard.map((t: any) => t.product_id).filter(Boolean)));
    const studentIds = Array.from(new Set(nonCard.map((t: any) => t.student_id).filter(Boolean)));

    const [{ data: payouts }, { data: products }, { data: students }] = await Promise.all([
      txIds.length
        ? supabaseAdmin.from("system_fee_payouts").select("transaction_id, kind").in("transaction_id", txIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      studentIds.length
        ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const taxPaid = new Set<string>();
    const feePaid = new Set<string>();
    for (const p of payouts || []) {
      const r = p as any;
      if (r.kind === "tax") taxPaid.add(r.transaction_id);
      else if (r.kind === "payment_fee") feePaid.add(r.transaction_id);
    }
    const pName = new Map<string, string>();
    (products || []).forEach((p: any) => pName.set(p.id, p.name));
    const sName = new Map<string, string>();
    (students || []).forEach((s: any) => sName.set(s.id, s.profiles?.name || ""));

    return nonCard.map((t: any) => ({
      transactionId: t.id,
      date: t.paid_at,
      productName: t.product_id ? pName.get(t.product_id) || null : null,
      clientName: t.student_id ? sName.get(t.student_id) || null : null,
      paymentMethod: t.payment_method,
      taxAmount: Number(t.tax_amount || 0),
      feeAmount: Number(t.payment_fee || 0),
      taxPaid: taxPaid.has(t.id),
      feePaid: feePaid.has(t.id),
    }));
  });

export const payManualSystemFee = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { transactionId: string; kind: "tax" | "payment_fee" })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    const { data: tx, error: txErr } = await supabaseAdmin
      .from("transactions")
      .select("id, tax_amount, payment_fee, payment_method")
      .eq("id", data.transactionId)
      .maybeSingle();
    if (txErr) throw new Error(txErr.message);
    if (!tx) throw new Error("Transação não encontrada");

    const amount = data.kind === "tax" ? Number((tx as any).tax_amount || 0) : Number((tx as any).payment_fee || 0);
    if (amount <= 0) throw new Error("Valor zero — nada a pagar");

    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();

    const { error } = await supabaseAdmin.from("system_fee_payouts").insert({
      transaction_id: data.transactionId,
      kind: data.kind,
      amount,
      payment_method: (tx as any).payment_method,
      paid_by: (prof as any)?.id ?? null,
    });
    if (error) throw new Error(error.message);

    return { ok: true, amount };
  });

export const payRecipientAvailable = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { profileId: string; kind: "coach" | "network" | "nutritionist" | "system"; notes?: string })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    if (data.kind === "nutritionist") {
      const { data: out, error } = await context.supabase.rpc("pay_nutritionist_available", {
        _profile_id: data.profileId,
        _notes: data.notes ?? undefined,
      });
      if (error) throw new Error(error.message);
      return { ok: true, amount: Number(out || 0) };
    }

    const { data: out, error } = await context.supabase.rpc("pay_coach_available", {
      _profile_id: data.profileId,
      _kind: data.kind,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, amount: Number(out || 0) };
  });
