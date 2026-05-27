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
  network: { total: number; pending: number; available: number; paid: number };
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
        else if (status === "paid") networkPaid += amt;
      }

      // Classifica APENAS pelo slot/contexto da comissão (nunca pelo role do usuário).
      // Um admin pode atuar como coach e suas comissões de venda vão para "Coaches".
      const isSystem =
        slotLabel.includes("sistema") ||
        slotLabel.includes("admin") ||
        (!benefCoachId && !slotLabel);
      const target = isSystem ? systemMap : coachesMap;
      const cur = target.get(pid) || {
        profileId: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        role: prof?.role || null,
        pending: 0, available: 0, paid: 0, total: 0,
      };
      if (status === "pending") cur.pending += amt;
      else if (status === "available") cur.available += amt;
      else if (status === "paid") cur.paid += amt;
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
    const systemList = Array.from(systemMap.values()).sort((a, b) => (b.pending + b.available) - (a.pending + a.available));
    const coachesAgg = sumGroup(coachesList);
    const systemAgg = sumGroup(systemList);

    // Nutricionistas
    const { data: nutriWallets } = await supabaseAdmin
      .from("nutritionist_wallets")
      .select("profile_id, available_balance, blocked_balance, total_earned, total_withdrawn, profiles(name,email,role)");
    const nutriList: RecipientTotal[] = (nutriWallets || []).map((w: any) => ({
      profileId: w.profile_id,
      name: w.profiles?.name || "—",
      email: w.profiles?.email || null,
      role: w.profiles?.role || "nutritionist",
      pending: Number(w.blocked_balance || 0),
      available: Number(w.available_balance || 0),
      paid: Number(w.total_withdrawn || 0),
      total: Number(w.total_earned || 0),
    }));
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
      network: { pending: networkPending, available: networkAvailable, paid: networkPaid, total: networkPending + networkAvailable + networkPaid },
      nutritionists: { ...nutriAgg, recipients: nutriList },
      system: { ...systemAgg, recipients: systemList },
      productCosts: buckets,
    };
    return overview;
  });

export interface PayoutHistoryItem {
  id: string;
  kind: "coach" | "student" | "nutritionist";
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
  .inputValidator((d: unknown) => d as { bucket: BucketKind })
  .handler(async ({ context, data }): Promise<BucketCommissionRow[]> => {
    await assertAdmin(context.userId);

    const { data: rows, error } = await supabaseAdmin
      .from("commissions")
      .select(
        "id, transaction_id, slot_label, level, amount, status, created_at, beneficiary_coach_id, beneficiary_profile_id, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email)",
      )
      .in("status", ["pending", "available"])
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
      return !isSystem;
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
