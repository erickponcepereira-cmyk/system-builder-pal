import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type StudentGroup = "aluno" | "aluno_coach" | "aluno_profissional" | "aluno_parceiro";

export type SaleRow = {
  id: string;
  source: "transaction" | "store";
  student_id: string;
  student_name: string;
  student_email: string;
  student_group: StudentGroup;
  product_id: string | null;
  product_name: string;
  quantity: number;
  amount: number;
  paid_at: string;
};

export type SalesReport = {
  range: { from: string; to: string };
  totals: { revenue: number; orders: number; itemsSold: number; uniqueCustomers: number };
  byMonth: { month: string; revenue: number; orders: number }[];
  byProduct: { product_id: string | null; name: string; quantity: number; revenue: number }[];
  byCustomer: { student_id: string; name: string; email: string; group: StudentGroup; orders: number; revenue: number }[];
  rows: SaleRow[];
  compare?: SalesReport;
};


export type ChallengeRankingRow = {
  student_id: string;
  name: string;
  email: string;
  competition_id: string | null;
  initial_weight: number | null;
  final_weight: number | null;
  result_kg: number | null;
  result_pct: number | null;
  final_date: string | null;
};

export type ReferralTitle = "subcoach" | "influencer" | "none";

export type ReferralSaleRow = {
  commission_id: string;
  transaction_id: string | null;
  paid_at: string | null;
  amount: number;
  status: string;
  product_id: string | null;
  product_name: string;
  buyer_id: string | null;
  buyer_name: string;
  buyer_email: string;
  referrer_id: string;
  referrer_name: string;
  referrer_email: string;
  referrer_title: ReferralTitle;
};

async function resolveCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

async function buildSalesReportForRange(
  coachId: string,
  from: string,
  to: string,
): Promise<SalesReport> {
  const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
  const cutoff = await getServerCutoffIso();
  const fromIsoRaw = new Date(from + "T00:00:00").toISOString();
  const toIso = new Date(to + "T23:59:59").toISOString();
  const fromIso = cutoff && cutoff > fromIsoRaw ? cutoff : fromIsoRaw;

  // Students of this coach
  const { data: studentRows } = await supabaseAdmin
    .from("students")
    .select("id, profile_id, profiles!students_profile_id_fkey(name,email)")
    .eq("coach_id", coachId);
  type SR = { id: string; profile_id: string | null; profiles: { name: string; email: string } | null };
  const students = (studentRows as unknown as SR[]) || [];
  const studentIds = students.map((s) => s.id);
  const studentMap = new Map(students.map((s) => [s.id, s.profiles]));
  if (studentIds.length === 0) {
    return emptyReport(from, to);
  }

  // Classify each student by profile (coach / professional / partner / pure aluno)
  const profileIds = students.map((s) => s.profile_id).filter(Boolean) as string[];
  const coachProfiles = new Set<string>();
  const proProfiles = new Set<string>();
  const partnerProfiles = new Set<string>();
  if (profileIds.length) {
    const [coachesRes, partnersRes] = await Promise.all([
      supabaseAdmin.from("coaches").select("profile_id,is_professional").in("profile_id", profileIds),
      supabaseAdmin.from("partners").select("profile_id").in("profile_id", profileIds),
    ]);
    ((coachesRes.data as Array<{ profile_id: string; is_professional: boolean | null }> | null) || []).forEach((c) => {
      if (c.is_professional) proProfiles.add(c.profile_id); else coachProfiles.add(c.profile_id);
    });
    ((partnersRes.data as Array<{ profile_id: string }> | null) || []).forEach((p) => partnerProfiles.add(p.profile_id));
  }
  const studentGroup = new Map<string, StudentGroup>();
  for (const s of students) {
    const pid = s.profile_id;
    let g: StudentGroup = "aluno";
    if (pid) {
      if (proProfiles.has(pid)) g = "aluno_profissional";
      else if (coachProfiles.has(pid)) g = "aluno_coach";
      else if (partnerProfiles.has(pid)) g = "aluno_parceiro";
    }
    studentGroup.set(s.id, g);
  }


  // Transactions (paid) — exclui as que são "espelho" de um store_order
  // (cada store_order pago gera uma transação com metadata.store_order_id;
  // contar ambos duplicaria a venda em receita, pedidos e itens vendidos).
  const { data: txData } = await supabaseAdmin
    .from("transactions")
    .select("id, student_id, product_id, gross_amount, paid_at, status, metadata")
    .in("student_id", studentIds)
    .eq("status", "paid")
    .not("paid_at", "is", null)
    .gte("paid_at", fromIso)
    .lte("paid_at", toIso);
  type Tx = { id: string; student_id: string; product_id: string | null; gross_amount: number; paid_at: string; metadata: { store_order_id?: string } | null };
  const txs = ((txData as Tx[] | null) || []).filter((t) => !t.metadata?.store_order_id);

  // Product names for transactions
  const productIds = Array.from(new Set(txs.map((t) => t.product_id).filter(Boolean))) as string[];
  const productMap = new Map<string, string>();
  if (productIds.length) {
    const { data: prods } = await supabaseAdmin
      .from("products").select("id,name").in("id", productIds);
    ((prods as { id: string; name: string }[] | null) || []).forEach((p) => productMap.set(p.id, p.name));
  }

  // Store orders (paid)
  const { data: orderData } = await supabaseAdmin
    .from("store_orders")
    .select("id, student_id, total_amount, updated_at, status")
    .in("student_id", studentIds)
    .eq("status", "paid")
    .gte("updated_at", fromIso)
    .lte("updated_at", toIso);
  type SO = { id: string; student_id: string; total_amount: number; updated_at: string };
  const orders = (orderData as SO[] | null) || [];
  const orderIds = orders.map((o) => o.id);
  let orderItemsMap = new Map<string, { name: string; qty: number; product_id: string | null }[]>();
  if (orderIds.length) {
    const { data: items } = await supabaseAdmin
      .from("store_order_items")
      .select("order_id, title, quantity, store_product_id, product_id")
      .in("order_id", orderIds);
    type OI = { order_id: string; title: string; quantity: number; store_product_id: string | null; product_id: string | null };
    ((items as OI[] | null) || []).forEach((it) => {
      const arr = orderItemsMap.get(it.order_id) || [];
      arr.push({ name: it.title, qty: it.quantity, product_id: it.store_product_id || it.product_id || null });
      orderItemsMap.set(it.order_id, arr);
    });
  }

  // Build unified rows
  const rows: SaleRow[] = [];
  for (const t of txs) {
    const sp = studentMap.get(t.student_id);
    rows.push({
      id: t.id,
      source: "transaction",
      student_id: t.student_id,
      student_name: sp?.name || "—",
      student_email: sp?.email || "",
      student_group: studentGroup.get(t.student_id) || "aluno",
      product_id: t.product_id,
      product_name: t.product_id ? (productMap.get(t.product_id) || "Produto") : "Produto",
      quantity: 1,
      amount: Number(t.gross_amount) || 0,
      paid_at: t.paid_at,
    });

  }
  for (const o of orders) {
    const sp = studentMap.get(o.student_id);
    const its = orderItemsMap.get(o.id) || [];
    const totalQty = its.reduce((s, x) => s + x.qty, 0) || 1;
    const label = its.length === 0 ? "Pedido da loja" : its.map((x) => `${x.qty}× ${x.name}`).join(", ");
    rows.push({
      id: o.id,
      source: "store",
      student_id: o.student_id,
      student_name: sp?.name || "—",
      student_email: sp?.email || "",
      student_group: studentGroup.get(o.student_id) || "aluno",
      product_id: its[0]?.product_id || null,
      product_name: label,
      quantity: totalQty,
      amount: Number(o.total_amount) || 0,
      paid_at: o.updated_at,
    });

  }

  rows.sort((a, b) => b.paid_at.localeCompare(a.paid_at));

  // Aggregations
  const monthMap = new Map<string, { revenue: number; orders: number }>();
  rows.forEach((r) => {
    const m = r.paid_at.slice(0, 7);
    const cur = monthMap.get(m) || { revenue: 0, orders: 0 };
    cur.revenue += r.amount; cur.orders += 1;
    monthMap.set(m, cur);
  });

  const productAgg = new Map<string, { product_id: string | null; name: string; quantity: number; revenue: number }>();
  rows.forEach((r) => {
    // Expand store order rows into items for product accuracy
    if (r.source === "store") {
      const its = orderItemsMap.get(r.id) || [];
      if (its.length === 0) {
        const k = "__store__";
        const c = productAgg.get(k) || { product_id: null, name: "Pedido da loja", quantity: 0, revenue: 0 };
        c.quantity += r.quantity; c.revenue += r.amount;
        productAgg.set(k, c);
      } else {
        const totalQty = its.reduce((s, x) => s + x.qty, 0) || 1;
        its.forEach((it) => {
          const key = it.product_id || it.name;
          const c = productAgg.get(key) || { product_id: it.product_id, name: it.name, quantity: 0, revenue: 0 };
          c.quantity += it.qty;
          c.revenue += (r.amount * it.qty) / totalQty;
          productAgg.set(key, c);
        });
      }
    } else {
      const key = r.product_id || r.product_name;
      const c = productAgg.get(key) || { product_id: r.product_id, name: r.product_name, quantity: 0, revenue: 0 };
      c.quantity += r.quantity; c.revenue += r.amount;
      productAgg.set(key, c);
    }
  });

  const customerAgg = new Map<string, { student_id: string; name: string; email: string; group: StudentGroup; orders: number; revenue: number }>();
  rows.forEach((r) => {
    const c = customerAgg.get(r.student_id) || {
      student_id: r.student_id, name: r.student_name, email: r.student_email, group: r.student_group, orders: 0, revenue: 0,
    };
    c.orders += 1; c.revenue += r.amount;
    customerAgg.set(r.student_id, c);
  });


  const revenue = rows.reduce((s, r) => s + r.amount, 0);
  const itemsSold = rows.reduce((s, r) => s + r.quantity, 0);

  return {
    range: { from, to },
    totals: {
      revenue,
      orders: rows.length,
      itemsSold,
      uniqueCustomers: customerAgg.size,
    },
    byMonth: Array.from(monthMap.entries())
      .map(([month, v]) => ({ month, ...v }))
      .sort((a, b) => a.month.localeCompare(b.month)),
    byProduct: Array.from(productAgg.values()).sort((a, b) => b.revenue - a.revenue),
    byCustomer: Array.from(customerAgg.values()).sort((a, b) => b.revenue - a.revenue),
    rows,
  };
}

function emptyReport(from: string, to: string): SalesReport {
  return {
    range: { from, to },
    totals: { revenue: 0, orders: 0, itemsSold: 0, uniqueCustomers: 0 },
    byMonth: [], byProduct: [], byCustomer: [], rows: [],
  };
}

export const getCoachSalesReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string; compareFrom?: string; compareTo?: string }) => data)
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    if (!coachId) return emptyReport(data.from, data.to);
    const main = await buildSalesReportForRange(coachId, data.from, data.to);
    if (data.compareFrom && data.compareTo) {
      main.compare = await buildSalesReportForRange(coachId, data.compareFrom, data.compareTo);
    }
    return main;
  });

export const getCoachChallengeRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string }) => data)
  .handler(async ({ data, context }) => {
    const coachId = await resolveCoachId(context.userId);
    if (!coachId) return [] as ChallengeRankingRow[];

    const { data: enrolls } = await supabaseAdmin
      .from("competition_enrollments")
      .select("student_id, competition_id, initial_weight, final_weight, result_kg, result_pct, final_date, initial_date")
      .eq("coach_id", coachId)
      .gte("initial_date", data.from)
      .lte("initial_date", data.to);

    type Row = {
      student_id: string; competition_id: string;
      initial_weight: number | null; final_weight: number | null;
      result_kg: number | null; result_pct: number | null;
      final_date: string | null; initial_date: string | null;
    };
    const rows = (enrolls as Row[] | null) || [];
    if (rows.length === 0) return [];

    const studentIds = Array.from(new Set(rows.map((r) => r.student_id)));
    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, profiles!students_profile_id_fkey(name,email)")
      .in("id", studentIds);
    type SR = { id: string; profiles: { name: string; email: string } | null };
    const sMap = new Map(((students as unknown as SR[]) || []).map((s) => [s.id, s.profiles]));

    return rows
      .map<ChallengeRankingRow>((r) => ({
        student_id: r.student_id,
        name: sMap.get(r.student_id)?.name || "—",
        email: sMap.get(r.student_id)?.email || "",
        competition_id: r.competition_id,
        initial_weight: r.initial_weight,
        final_weight: r.final_weight,
        result_kg: r.result_kg,
        result_pct: r.result_pct,
        final_date: r.final_date,
      }))
      .sort((a, b) => (b.result_pct ?? -999) - (a.result_pct ?? -999));
  });

/* ---------- Referral sales (aluno-aluno) ---------- */

export const getCoachReferralSales = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((data: { from: string; to: string; productId?: string | null }) => data)
  .handler(async ({ data, context }): Promise<ReferralSaleRow[]> => {
    const coachId = await resolveCoachId(context.userId);
    if (!coachId) return [];

    const fromIso = new Date(data.from + "T00:00:00").toISOString();
    const toIso = new Date(data.to + "T23:59:59").toISOString();

    // All students belonging to this coach (potential referrers)
    const { data: myStudents } = await supabaseAdmin
      .from("students")
      .select("id, is_influencer, profile_id, profiles!students_profile_id_fkey(name,email)")
      .eq("coach_id", coachId);
    type MS = { id: string; is_influencer: boolean | null; profile_id: string | null; profiles: { name: string; email: string } | null };
    const refList = (myStudents as unknown as MS[]) || [];
    if (refList.length === 0) return [];
    const refIds = refList.map((r) => r.id);
    const refMap = new Map(refList.map((r) => [r.id, r]));

    // Referral commissions where referrer is one of my students
    const { data: comms } = await supabaseAdmin
      .from("commissions")
      .select("id, transaction_id, amount, status, created_at, referred_by_student_id")
      .eq("is_referral", true)
      .in("referred_by_student_id", refIds)
      .order("created_at", { ascending: false })
      .limit(1000);
    type Comm = { id: string; transaction_id: string | null; amount: number; status: string; created_at: string; referred_by_student_id: string };
    const commissions = (comms as Comm[] | null) || [];
    if (commissions.length === 0) return [];

    // Load related transactions
    const txIds = Array.from(new Set(commissions.map((c) => c.transaction_id).filter(Boolean))) as string[];
    type Tx = { id: string; student_id: string | null; product_id: string | null; paid_at: string | null; status: string };
    let txs: Tx[] = [];
    if (txIds.length) {
      const { data: txd } = await supabaseAdmin
        .from("transactions")
        .select("id, student_id, product_id, paid_at, status")
        .in("id", txIds);
      txs = (txd as Tx[] | null) || [];
    }
    const txMap = new Map(txs.map((t) => [t.id, t]));

    // Buyers + products
    const buyerIds = Array.from(new Set(txs.map((t) => t.student_id).filter(Boolean))) as string[];
    const productIds = Array.from(new Set(txs.map((t) => t.product_id).filter(Boolean))) as string[];
    const [buyersRes, prodsRes] = await Promise.all([
      buyerIds.length
        ? supabaseAdmin.from("students").select("id, profiles!students_profile_id_fkey(name,email)").in("id", buyerIds)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id,name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);
    type BR = { id: string; profiles: { name: string; email: string } | null };
    const buyerMap = new Map(((buyersRes.data as unknown as BR[]) || []).map((b) => [b.id, b.profiles]));
    const productMap = new Map(((prodsRes.data as { id: string; name: string }[]) || []).map((p) => [p.id, p.name]));

    return commissions
      .map<ReferralSaleRow | null>((c) => {
        const tx = c.transaction_id ? txMap.get(c.transaction_id) : null;
        if (!tx || tx.status !== "paid" || !tx.paid_at) return null;
        if (tx.paid_at < fromIso || tx.paid_at > toIso) return null;
        if (data.productId && tx.product_id !== data.productId) return null;
        const ref = refMap.get(c.referred_by_student_id)!;
        const buyer = tx.student_id ? buyerMap.get(tx.student_id) : null;
        const title: ReferralTitle = ref.is_influencer ? "influencer" : "subcoach";
        return {
          commission_id: c.id,
          transaction_id: c.transaction_id,
          paid_at: tx.paid_at,
          amount: Number(c.amount) || 0,
          status: c.status,
          product_id: tx.product_id,
          product_name: tx.product_id ? (productMap.get(tx.product_id) || "Produto") : "Produto",
          buyer_id: tx.student_id,
          buyer_name: buyer?.name || "—",
          buyer_email: buyer?.email || "",
          referrer_id: ref.id,
          referrer_name: ref.profiles?.name || "—",
          referrer_email: ref.profiles?.email || "",
          referrer_title: title,
        };
      })
      .filter((r): r is ReferralSaleRow => r !== null);
  });

