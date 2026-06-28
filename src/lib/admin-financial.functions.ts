import { createServerFn } from "@tanstack/react-start";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-attacher";
import { getServerCutoffIso } from "@/lib/test-mode.functions";

/** Aplica filtro do Modo de Testes quando ativo: only registros após o marco. */
function applyCutoff<T>(q: T, col: string, cutoff: string | null): T {
  if (!cutoff) return q;
  return (q as any).gte(col, cutoff) as T;
}

async function assertAdmin(userId: string) {
  const { data, error } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

function isAdminSystemSlot(slotLabel: unknown) {
  const slot = String(slotLabel || "").toLowerCase();
  return !slot.includes("nutricion") && !slot.includes("professor") && !slot.includes("taxa de pagamento") && !slot.includes("imposto");
}

async function resolvePartnerOrderContext(orderIds: string[]) {
  const ids = Array.from(new Set(orderIds.filter(Boolean)));
  const map = new Map<string, { studentName: string | null; productName: string | null }>();
  if (!ids.length) return map;
  const { data: orders } = await supabaseAdmin
    .from("partner_product_orders" as never)
    .select("id, order_number, student_id, partner_product_id, professional_product_id" as never)
    .in("id" as never, ids as never);
  const rows = (orders as unknown as Array<{ id: string; order_number: string; student_id: string | null; partner_product_id: string | null; professional_product_id: string | null }>) || [];
  const studentIds = Array.from(new Set(rows.map((o) => o.student_id).filter(Boolean))) as string[];
  const partnerProductIds = Array.from(new Set(rows.map((o) => o.partner_product_id).filter(Boolean))) as string[];
  const professionalProductIds = Array.from(new Set(rows.map((o) => o.professional_product_id).filter(Boolean))) as string[];
  const [{ data: students }, { data: partnerProducts }, { data: professionalProducts }] = await Promise.all([
    studentIds.length ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", studentIds) : Promise.resolve({ data: [] as any[] }),
    partnerProductIds.length ? supabaseAdmin.from("partner_products" as never).select("id, name" as never).in("id" as never, partnerProductIds as never) : Promise.resolve({ data: [] as any[] }),
    professionalProductIds.length ? supabaseAdmin.from("professional_products" as never).select("id, name" as never).in("id" as never, professionalProductIds as never) : Promise.resolve({ data: [] as any[] }),
  ]);
  const sMap = new Map<string, string>();
  (students || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
  const pMap = new Map<string, string>();
  ((partnerProducts as any[]) || []).forEach((p: any) => pMap.set(p.id, p.name));
  ((professionalProducts as any[]) || []).forEach((p: any) => pMap.set(p.id, p.name));
  rows.forEach((o) => map.set(o.id, {
    studentName: o.student_id ? sMap.get(o.student_id) || null : null,
    productName: (o.partner_product_id ? pMap.get(o.partner_product_id) : null) || (o.professional_product_id ? pMap.get(o.professional_product_id) : null) || o.order_number,
  }));
  return map;
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
  referrals: { total: number; pending: number; available: number; paid: number; recipients: RecipientTotal[] };
  productCosts: { total: number; pending: number; preparing: number; shipped: number; delivered: number; cancelled: number };
}

export const getAdminFinancialOverview = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    await assertAdmin(context.userId);

    // Commissions grouped by beneficiary
    const _cutoffComm = await getServerCutoffIso();
    let _commQ = supabaseAdmin
      .from("commissions")
      .select("amount, status, slot_label, level, beneficiary_profile_id, beneficiary_coach_id, created_at, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email,role)");
    if (_cutoffComm) _commQ = _commQ.gte("created_at", _cutoffComm);
    const { data: commissions, error: cErr } = await _commQ;
    if (cErr) throw new Error(cErr.message);

    const coachesMap = new Map<string, RecipientTotal>();
    const networkMap = new Map<string, RecipientTotal>();
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
    const coachesAgg = sumGroup(coachesList);
    const networkAgg = sumGroup(networkList);

    // Carteira compartilhada do admin (taxas de sistema). Administrada pelos master admins.
    // Separa o "slot" nutricionista do "slot" sistema usando os lançamentos da carteira:
    // o que for de nutricionista (ainda não atribuído) vai para o bucket Nutricionistas,
    // o restante (sistema) fica no bucket Sistema (Admin).
    const cutoff = await getServerCutoffIso();
    const { data: walletEntries } = await applyCutoff(supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("slot_label, kind, amount, created_at"), "created_at", cutoff);
    let sysCredits = 0, sysDebits = 0;
    let nutriAdminCredits = 0, nutriAdminDebits = 0;
    for (const e of walletEntries || []) {
      const slot = String((e as any).slot_label || "").toLowerCase();
      const kind = String((e as any).kind || "credit");
      const amt = Number((e as any).amount || 0);
      const isNutri = slot.includes("nutricion");
      // Apenas kind "debit" (saques/baixas) é débito; demais (credit, subscription...)
      // contam como crédito. Slots de imposto/taxa já foram filtrados.
      const isDebit = kind === "debit";
      if (isNutri) {
        if (isDebit) nutriAdminDebits += amt;
        else nutriAdminCredits += amt;
      } else if (isAdminSystemSlot((e as any).slot_label)) {
        if (isDebit) sysDebits += amt;
        else sysCredits += amt;
      }
    }
    const { data: masterAdmins } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email, role")
      .eq("role", "admin")
      .eq("is_master_admin", true);
    const sysAvailable = Math.max(0, sysCredits - sysDebits);
    const sysPaid = sysDebits;
    const sysTotal = sysCredits;
    const systemList: RecipientTotal[] = (masterAdmins || []).map((p: any) => ({
      profileId: p.id,
      name: p.name || "—",
      email: p.email || null,
      role: p.role || "admin",
      pending: 0,
      available: sysAvailable,
      paid: sysPaid,
      total: sysTotal,
    }));
    const systemAgg = { pending: 0, available: sysAvailable, paid: sysPaid, total: sysTotal };


    // Nutricionistas: carteiras individuais + slot "Admin Nutricionista (não atribuído)".
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
      const pending = cutoff ? 0 : Number(w.blocked_balance || 0);
      const available = cutoff ? 0 : Number(w.available_balance || 0);
      const paid = cutoff ? 0 : Number(w.total_withdrawn || 0);
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
    // Adiciona o saldo da fatia "Admin Nutricionista (não atribuído)" no bucket Nutricionistas.
    const nutriAdminAvailable = Math.max(0, nutriAdminCredits - nutriAdminDebits);
    if (nutriAdminCredits > 0 || nutriAdminDebits > 0) {
      nutriList.unshift({
        profileId: "admin-nutricionista",
        name: "Admin Nutricionista (não atribuído)",
        email: null,
        role: "admin",
        pending: 0,
        available: nutriAdminAvailable,
        paid: nutriAdminDebits,
        total: nutriAdminCredits,
      });
    }
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

    // Referrals (aluno → aluno) — apenas a comissão do próprio aluno indicador
    // (slot "aluno indicador"). Linhas/Vendedor da mesma venda vão para os buckets
    // de coaches/rede.
    const { data: refRows } = await supabaseAdmin
      .from("commissions")
      .select("amount, status, referred_by_student_id, beneficiary_profile_id, slot_label, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email)")
      .eq("is_referral", true)
      .ilike("slot_label", "aluno indicador%");
    const refMap = new Map<string, RecipientTotal>();
    let refPending = 0, refAvailable = 0, refPaid = 0;
    for (const r of refRows || []) {
      const pid = (r as any).beneficiary_profile_id as string | null;
      if (!pid) continue;
      const amt = Number((r as any).amount || 0);
      const status = String((r as any).status || "pending");
      const prof = (r as any).profiles as { name?: string; email?: string } | null;
      const cur = refMap.get(pid) || { profileId: pid, name: prof?.name || "—", email: prof?.email || null, role: "student", pending: 0, available: 0, paid: 0, total: 0 };
      if (status === "pending" || status === "blocked") { cur.pending += amt; refPending += amt; }
      else if (status === "available") { cur.available += amt; refAvailable += amt; }
      else if (status === "paid" || status === "withdrawn") { cur.paid += amt; refPaid += amt; }
      cur.total = cur.pending + cur.available + cur.paid;
      refMap.set(pid, cur);
    }
    const referralsList = Array.from(refMap.values()).sort((a, b) => (b.pending + b.available) - (a.pending + a.available));

    const overview: AdminFinancialOverview = {
      coaches: { ...coachesAgg, recipients: coachesList },
      network: { ...networkAgg, pending: networkPending, available: networkAvailable, paid: networkPaid, total: networkPending + networkAvailable + networkPaid, recipients: networkList },
      nutritionists: { ...nutriAgg, recipients: nutriList },
      system: { ...systemAgg, recipients: systemList },
      referrals: { pending: refPending, available: refAvailable, paid: refPaid, total: refPending + refAvailable + refPaid, recipients: referralsList },
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

export type BucketKind = "coaches" | "network" | "system" | "referrals";

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
  referrerTitle?: "subcoach" | "influencer" | null;
}

export const listBucketCommissions = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { bucket: BucketKind; statuses?: Array<"pending" | "available" | "paid"> })
  .handler(async ({ context, data }): Promise<BucketCommissionRow[]> => {
    await assertAdmin(context.userId);

    // Bucket "system" = carteira compartilhada do admin (admin_system_wallet)
    if (data.bucket === "system") {
      const cutoff = await getServerCutoffIso();
      const { data: entriesRaw, error } = await applyCutoff(supabaseAdmin
        .from("admin_system_wallet_entries")
        .select("id, transaction_id, partner_order_id, subscription_invoice_id, slot_label, amount, kind, created_at")
        .not("slot_label", "ilike", "%nutricion%")
        .not("slot_label", "ilike", "%professor%")
        .not("slot_label", "ilike", "%taxa de pagamento%")
        .not("slot_label", "ilike", "%imposto%")
        .order("created_at", { ascending: false })
        .limit(500), "created_at", cutoff);
      if (error) throw new Error(error.message);
      const entries = (entriesRaw || []).filter((e: any) => isAdminSystemSlot(e.slot_label));

      const txIds = Array.from(new Set((entries || []).map((e: any) => e.transaction_id).filter(Boolean)));
      const partnerOrderIds = Array.from(new Set((entries || []).map((e: any) => e.partner_order_id).filter(Boolean)));
      const subInvoiceIds = Array.from(new Set((entries || []).map((e: any) => e.subscription_invoice_id).filter(Boolean))) as string[];
      let txMap = new Map<string, { studentName: string | null; productName: string | null }>();
      if (txIds.length) {
        const { data: txs } = await supabaseAdmin
          .from("transactions")
          .select("id, product_id, student_id")
          .in("id", txIds);
        const sIds = Array.from(new Set((txs || []).map((t: any) => t.student_id).filter(Boolean)));
        const pIds = Array.from(new Set((txs || []).map((t: any) => t.product_id).filter(Boolean)));
        const [{ data: students }, { data: products }] = await Promise.all([
          sIds.length ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
          pIds.length ? supabaseAdmin.from("products").select("id, name").in("id", pIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const sMap = new Map<string, string>();
        (students || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
        const pMap = new Map<string, string>();
        (products || []).forEach((p: any) => pMap.set(p.id, p.name));
        (txs || []).forEach((t: any) => txMap.set(t.id, {
          studentName: t.student_id ? sMap.get(t.student_id) || null : null,
          productName: t.product_id ? pMap.get(t.product_id) || null : null,
        }));
      }
      const partnerOrderMap = await resolvePartnerOrderContext(partnerOrderIds);

      // Subscription invoices → resolve cliente + produto ("Mensalidade MM/YYYY")
      const subMap = new Map<string, { studentName: string | null; productName: string | null }>();
      if (subInvoiceIds.length) {
        const { data: invs } = await supabaseAdmin
          .from("subscription_invoices")
          .select("id, user_id, reference_month")
          .in("id", subInvoiceIds);
        const userIds = Array.from(new Set((invs || []).map((i: any) => i.user_id).filter(Boolean)));
        const { data: profs } = userIds.length
          ? await supabaseAdmin.from("profiles").select("user_id, name").in("user_id", userIds)
          : { data: [] as any[] };
        const nameMap = new Map<string, string>();
        (profs || []).forEach((p: any) => nameMap.set(p.user_id, p.name || ""));
        (invs || []).forEach((i: any) => {
          const ref = i.reference_month ? new Date(i.reference_month).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "";
          subMap.set(i.id, {
            studentName: nameMap.get(i.user_id) || null,
            productName: ref ? `Mensalidade ${ref}` : "Mensalidade",
          });
        });
      }

      return (entries || []).map((e: any) => {
        const tx = e.transaction_id ? txMap.get(e.transaction_id) : null;
        const po = e.partner_order_id ? partnerOrderMap.get(e.partner_order_id) : null;
        const sub = e.subscription_invoice_id ? subMap.get(e.subscription_invoice_id) : null;
        const slot = String(e.slot_label || "").toLowerCase();
        const isNutri = slot.includes("nutricion");
        return {
          commissionId: e.id,
          transactionId: e.transaction_id || e.partner_order_id || e.subscription_invoice_id,
          beneficiaryName: isNutri ? "Admin Nutricionista (não atribuído)" : "Carteira do Admin",
          beneficiaryEmail: null,
          clientName: tx?.studentName ?? po?.studentName ?? sub?.studentName ?? null,
          productName: tx?.productName ?? po?.productName ?? sub?.productName ?? null,
          slotLabel: e.slot_label,
          level: 0,
          amount: Number(e.amount || 0) * (e.kind === "debit" ? -1 : 1),
          status: e.kind === "debit" ? "paid" : "available",
          createdAt: e.created_at,
        };
      });
    }

    const statuses = (data.statuses?.length ? data.statuses : ["pending", "available"]) as Array<"pending" | "available">;

    const cutoffIso = await getServerCutoffIso();

    // Bucket "referrals" = comissões com is_referral=true (alunos indicadores)
    if (data.bucket === "referrals") {
      const { data: rows, error } = await applyCutoff(supabaseAdmin
        .from("commissions")
        .select("id, transaction_id, partner_order_id, slot_label, level, amount, status, created_at, beneficiary_profile_id, referred_by_student_id, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email)")
        .eq("is_referral", true)
        .ilike("slot_label", "aluno indicador%")
        .in("status", statuses as any)
        .order("created_at", { ascending: false })
        .limit(500), "created_at", cutoffIso);
      if (error) throw new Error(error.message);
      const txIds = Array.from(new Set((rows || []).map((c: any) => c.transaction_id).filter(Boolean)));
      const referrerIds = Array.from(new Set((rows || []).map((c: any) => c.referred_by_student_id).filter(Boolean)));
      let txMap = new Map<string, { studentName: string | null; productName: string | null }>();
      const referrerTitleMap = new Map<string, "subcoach" | "influencer">();
      if (referrerIds.length) {
        const { data: refs } = await supabaseAdmin
          .from("students")
          .select("id, is_influencer")
          .in("id", referrerIds);
        (refs || []).forEach((r: any) => {
          referrerTitleMap.set(r.id, r.is_influencer ? "influencer" : "subcoach");
        });
      }
      if (txIds.length) {
        const { data: txs } = await supabaseAdmin
          .from("transactions")
          .select("id, product_id, student_id")
          .in("id", txIds);
        const sIds = Array.from(new Set((txs || []).map((t: any) => t.student_id).filter(Boolean)));
        const pIds = Array.from(new Set((txs || []).map((t: any) => t.product_id).filter(Boolean)));
        const [{ data: students }, { data: products }] = await Promise.all([
          sIds.length ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
          pIds.length ? supabaseAdmin.from("products").select("id, name").in("id", pIds) : Promise.resolve({ data: [] as any[] }),
        ]);
        const sMap = new Map<string, string>();
        (students || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
        const pMap = new Map<string, string>();
        (products || []).forEach((p: any) => pMap.set(p.id, p.name));
        (txs || []).forEach((t: any) => txMap.set(t.id, {
          studentName: t.student_id ? sMap.get(t.student_id) || null : null,
          productName: t.product_id ? pMap.get(t.product_id) || null : null,
        }));
      }
      return (rows || []).map((c: any) => {
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
          referrerTitle: c.referred_by_student_id ? (referrerTitleMap.get(c.referred_by_student_id) || "subcoach") : null,
        };
      });
    }

    const { data: rows, error } = await applyCutoff(supabaseAdmin
      .from("commissions")
      .select(
        "id, transaction_id, partner_order_id, slot_label, level, amount, status, created_at, beneficiary_coach_id, beneficiary_profile_id, is_referral, profiles:profiles!commissions_beneficiary_profile_id_fkey(name,email)",
      )
      .in("status", statuses)
      .order("created_at", { ascending: false })
      .limit(500), "created_at", cutoffIso);
    if (error) throw new Error(error.message);

    const filtered = (rows || []).filter((c: any) => {
      const slot = String(c.slot_label || "").toLowerCase();
      // Apenas a comissão do aluno indicador vai para o bucket "referrals".
      if (slot.startsWith("aluno indicador")) return false;
      const isSystem = slot.includes("sistema") || slot.includes("admin") || (!c.beneficiary_coach_id && !slot);
      const isNetwork = Number(c.level || 0) > 0;
      if (data.bucket === "network") return isNetwork && !isSystem;
      // coaches
      return !isSystem && !isNetwork;
    });

    // Resolve transactions → student + product names
    const txIds = Array.from(new Set(filtered.map((c: any) => c.transaction_id).filter(Boolean)));
    const partnerOrderIds = Array.from(new Set(filtered.map((c: any) => c.partner_order_id).filter(Boolean))) as string[];
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
    const partnerOrderMap = await resolvePartnerOrderContext(partnerOrderIds);

    return filtered.map((c: any) => {
      const tx = c.transaction_id ? txMap.get(c.transaction_id) : null;
      const po = c.partner_order_id ? partnerOrderMap.get(c.partner_order_id) : null;
      return {
        commissionId: c.id,
        transactionId: c.transaction_id || c.partner_order_id,
        beneficiaryName: c.profiles?.name || "—",
        beneficiaryEmail: c.profiles?.email || null,
        clientName: tx?.studentName ?? po?.studentName ?? null,
        productName: tx?.productName ?? po?.productName ?? null,
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

    const cutoff = await getServerCutoffIso();
    const { data: txs, error } = await applyCutoff(supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status, created_at")
      .eq("status", "paid"), "created_at", cutoff);
    if (error) throw new Error(error.message);

    const { data: partnerOrders } = await applyCutoff(supabaseAdmin
      .from("partner_product_orders" as never)
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status, created_at" as never)
      .eq("status" as never, "paid" as never), "created_at", cutoff);

    const { data: payouts } = await supabaseAdmin
      .from("system_fee_payouts")
      .select("transaction_id, partner_order_id, subscription_invoice_id, kind, amount");

    const paidTax = new Map<string, number>();
    const paidFee = new Map<string, number>();
    for (const p of payouts || []) {
      const r = p as any;
      const key = r.transaction_id || r.partner_order_id || r.subscription_invoice_id;
      if (!key) continue;
      if (r.kind === "tax") paidTax.set(key, Number(r.amount || 0));
      else if (r.kind === "payment_fee") paidFee.set(key, Number(r.amount || 0));
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

    for (const t of ((partnerOrders as any[]) || [])) {
      const taxAmt = Number(t.tax_amount || 0);
      const feeAmt = Number(t.payment_fee || 0);
      const method = String(t.payment_method || "other").toLowerCase();
      const isCard = method === "credit_card" || method === "debit_card" || method === "card";
      tax.total += taxAmt;
      fee.total += feeAmt;
      if (isCard) {
        tax.autoPaidCard += taxAmt;
        fee.autoPaidCard += feeAmt;
        sales.card += Number(t.gross_amount || 0);
      } else {
        if (paidTax.has(t.id)) tax.manualPaid += taxAmt; else tax.manualPending += taxAmt;
        if (paidFee.has(t.id)) fee.manualPaid += feeAmt; else fee.manualPending += feeAmt;
        if (method === "pix") sales.pix += Number(t.gross_amount || 0);
        else if (method === "boleto") sales.boleto += Number(t.gross_amount || 0);
        else sales.other += Number(t.gross_amount || 0);
      }
    }

    // Subscription invoices (mensalidades pagas)
    const { data: subInvoices } = await applyCutoff(supabaseAdmin
      .from("subscription_invoices")
      .select("id, amount, tax_amount, fee_amount, payment_method, status, created_at")
      .eq("status", "paid"), "created_at", cutoff);
    for (const t of ((subInvoices as any[]) || [])) {
      const taxAmt = Number(t.tax_amount || 0);
      const feeAmt = Number(t.fee_amount || 0);
      const method = String(t.payment_method || "other").toLowerCase();
      const isCard = method === "credit_card" || method === "debit_card" || method === "card";
      tax.total += taxAmt;
      fee.total += feeAmt;
      if (isCard) {
        tax.autoPaidCard += taxAmt;
        fee.autoPaidCard += feeAmt;
        sales.card += Number(t.amount || 0);
      } else {
        if (paidTax.has(t.id)) tax.manualPaid += taxAmt; else tax.manualPending += taxAmt;
        if (paidFee.has(t.id)) fee.manualPaid += feeAmt; else fee.manualPending += feeAmt;
        if (method === "pix") sales.pix += Number(t.amount || 0);
        else if (method === "boleto") sales.boleto += Number(t.amount || 0);
        else sales.other += Number(t.amount || 0);
      }
    }

    return { tax, paymentFee: fee, sales };
  });

export interface PendingFeeRow {
  transactionId: string;
  sourceKind: "transaction" | "partner_order" | "subscription_invoice";
  sourceId: string;
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

    const cutoff = await getServerCutoffIso();
    const { data: txs, error } = await applyCutoff(supabaseAdmin
      .from("transactions")
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status, paid_at, created_at, product_id, student_id")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(500), "created_at", cutoff);
    if (error) throw new Error(error.message);

    const { data: partnerOrders } = await applyCutoff(supabaseAdmin
      .from("partner_product_orders" as never)
      .select("id, gross_amount, tax_amount, payment_fee, payment_method, status, paid_at, created_at, student_id" as never)
      .eq("status" as never, "paid" as never)
      .order("paid_at" as never, { ascending: false })
      .limit(500), "created_at", cutoff);

    const { data: subInvoices } = await applyCutoff(supabaseAdmin
      .from("subscription_invoices")
      .select("id, amount, tax_amount, fee_amount, payment_method, status, paid_at, created_at, user_id, reference_month")
      .eq("status", "paid")
      .order("paid_at", { ascending: false })
      .limit(500), "created_at", cutoff);

    const nonCard = (txs || []).filter((t: any) => {
      const m = String(t.payment_method || "").toLowerCase();
      return !(m === "credit_card" || m === "debit_card" || m === "card");
    });
    const nonCardPartnerOrders = ((partnerOrders as any[]) || []).filter((t: any) => {
      const m = String(t.payment_method || "").toLowerCase();
      return !(m === "credit_card" || m === "debit_card" || m === "card");
    });
    const nonCardSubs = ((subInvoices as any[]) || []).filter((t: any) => {
      const m = String(t.payment_method || "").toLowerCase();
      return !(m === "credit_card" || m === "debit_card" || m === "card");
    });

    const txIds = nonCard.map((t: any) => t.id);
    const partnerOrderIds = nonCardPartnerOrders.map((t: any) => t.id);
    const subIds = nonCardSubs.map((t: any) => t.id);
    const productIds = Array.from(new Set(nonCard.map((t: any) => t.product_id).filter(Boolean)));
    const studentIds = Array.from(new Set(nonCard.map((t: any) => t.student_id).filter(Boolean)));
    const subUserIds = Array.from(new Set(nonCardSubs.map((t: any) => t.user_id).filter(Boolean))) as string[];

    const [{ data: txPayouts }, { data: partnerPayouts }, { data: subPayouts }, { data: products }, { data: students }, { data: subProfiles }] = await Promise.all([
      txIds.length
        ? supabaseAdmin.from("system_fee_payouts").select("transaction_id, kind").in("transaction_id", txIds)
        : Promise.resolve({ data: [] as any[] }),
      partnerOrderIds.length
        ? supabaseAdmin.from("system_fee_payouts" as never).select("partner_order_id, kind" as never).in("partner_order_id" as never, partnerOrderIds as never)
        : Promise.resolve({ data: [] as any[] }),
      subIds.length
        ? supabaseAdmin.from("system_fee_payouts" as never).select("subscription_invoice_id, kind" as never).in("subscription_invoice_id" as never, subIds as never)
        : Promise.resolve({ data: [] as any[] }),
      productIds.length
        ? supabaseAdmin.from("products").select("id, name").in("id", productIds)
        : Promise.resolve({ data: [] as any[] }),
      studentIds.length
        ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", studentIds)
        : Promise.resolve({ data: [] as any[] }),
      subUserIds.length
        ? supabaseAdmin.from("profiles").select("user_id, name").in("user_id", subUserIds)
        : Promise.resolve({ data: [] as any[] }),
    ]);

    const taxPaid = new Set<string>();
    const feePaid = new Set<string>();
    for (const p of txPayouts || []) {
      const r = p as any;
      if (r.kind === "tax") taxPaid.add(r.transaction_id);
      else if (r.kind === "payment_fee") feePaid.add(r.transaction_id);
    }
    for (const p of (partnerPayouts as any[]) || []) {
      const r = p as any;
      if (r.kind === "tax") taxPaid.add(r.partner_order_id);
      else if (r.kind === "payment_fee") feePaid.add(r.partner_order_id);
    }
    for (const p of (subPayouts as any[]) || []) {
      const r = p as any;
      if (r.kind === "tax") taxPaid.add(r.subscription_invoice_id);
      else if (r.kind === "payment_fee") feePaid.add(r.subscription_invoice_id);
    }
    const pName = new Map<string, string>();
    (products || []).forEach((p: any) => pName.set(p.id, p.name));
    const sName = new Map<string, string>();
    (students || []).forEach((s: any) => sName.set(s.id, s.profiles?.name || ""));
    const subUserName = new Map<string, string>();
    (subProfiles || []).forEach((p: any) => subUserName.set(p.user_id, p.name || ""));
    const partnerOrderMap = await resolvePartnerOrderContext(partnerOrderIds);

    const txRows: PendingFeeRow[] = nonCard.map((t: any) => ({
      transactionId: t.id,
      sourceKind: "transaction",
      sourceId: t.id,
      date: t.paid_at,
      productName: t.product_id ? pName.get(t.product_id) || null : null,
      clientName: t.student_id ? sName.get(t.student_id) || null : null,
      paymentMethod: t.payment_method,
      taxAmount: Number(t.tax_amount || 0),
      feeAmount: Number(t.payment_fee || 0),
      taxPaid: taxPaid.has(t.id),
      feePaid: feePaid.has(t.id),
    }));
    const partnerRows: PendingFeeRow[] = nonCardPartnerOrders.map((t: any) => {
      const ctx = partnerOrderMap.get(t.id);
      return {
        transactionId: t.id,
        sourceKind: "partner_order",
        sourceId: t.id,
        date: t.paid_at,
        productName: ctx?.productName ?? null,
        clientName: ctx?.studentName ?? null,
        paymentMethod: t.payment_method,
        taxAmount: Number(t.tax_amount || 0),
        feeAmount: Number(t.payment_fee || 0),
        taxPaid: taxPaid.has(t.id),
        feePaid: feePaid.has(t.id),
      };
    });
    const subRows: PendingFeeRow[] = nonCardSubs.map((t: any) => {
      const ref = t.reference_month ? new Date(t.reference_month).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "";
      return {
        transactionId: t.id,
        sourceKind: "subscription_invoice" as any,
        sourceId: t.id,
        date: t.paid_at,
        productName: ref ? `Mensalidade ${ref}` : "Mensalidade",
        clientName: subUserName.get(t.user_id) || null,
        paymentMethod: t.payment_method,
        taxAmount: Number(t.tax_amount || 0),
        feeAmount: Number(t.fee_amount || 0),
        taxPaid: taxPaid.has(t.id),
        feePaid: feePaid.has(t.id),
      };
    });
    return [...txRows, ...partnerRows, ...subRows].sort((a, b) => (b.date || "").localeCompare(a.date || ""));
  });

export const payManualSystemFee = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { transactionId?: string; partnerOrderId?: string; subscriptionInvoiceId?: string; kind: "tax" | "payment_fee" })
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);

    if (data.partnerOrderId) {
      const { data: order, error: orderErr } = await supabaseAdmin
        .from("partner_product_orders" as never)
        .select("id, tax_amount, payment_fee, payment_method" as never)
        .eq("id" as never, data.partnerOrderId as never)
        .maybeSingle();
      if (orderErr) throw new Error(orderErr.message);
      if (!order) throw new Error("Pedido de parceiro/profissional não encontrado");
      const r = order as unknown as { tax_amount?: number; payment_fee?: number; payment_method?: string };
      const amount = data.kind === "tax" ? Number(r.tax_amount || 0) : Number(r.payment_fee || 0);
      if (amount <= 0) throw new Error("Valor zero — nada a pagar");
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
      const { error } = await supabaseAdmin.from("system_fee_payouts" as never).insert({
        transaction_id: null,
        partner_order_id: data.partnerOrderId,
        kind: data.kind,
        amount,
        payment_method: r.payment_method,
        paid_by: (prof as any)?.id ?? null,
      } as never);
      if (error) throw new Error(error.message);
      return { ok: true, amount };
    }

    if (data.subscriptionInvoiceId) {
      const { data: inv, error: invErr } = await supabaseAdmin
        .from("subscription_invoices")
        .select("id, tax_amount, fee_amount, payment_method")
        .eq("id", data.subscriptionInvoiceId)
        .maybeSingle();
      if (invErr) throw new Error(invErr.message);
      if (!inv) throw new Error("Fatura não encontrada");
      const r = inv as any;
      const amount = data.kind === "tax" ? Number(r.tax_amount || 0) : Number(r.fee_amount || 0);
      if (amount <= 0) throw new Error("Valor zero — nada a pagar");
      const { data: prof } = await supabaseAdmin
        .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
      const { error } = await supabaseAdmin.from("system_fee_payouts" as never).insert({
        transaction_id: null,
        partner_order_id: null,
        subscription_invoice_id: data.subscriptionInvoiceId,
        kind: data.kind,
        amount,
        payment_method: r.payment_method,
        paid_by: (prof as any)?.id ?? null,
      } as never);
      if (error) throw new Error(error.message);
      return { ok: true, amount };
    }

    if (!data.transactionId) throw new Error("Origem não informada");
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
  .inputValidator((d: unknown) => d as { profileId: string; kind: "coach" | "network" | "nutritionist" | "system" | "student"; notes?: string })
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

    const rpcKind = data.kind === "student" ? "student_referral" : data.kind;
    const { data: out, error } = await context.supabase.rpc("pay_coach_available", {
      _profile_id: data.profileId,
      _kind: rpcKind,
      _notes: data.notes ?? undefined,
    });
    if (error) throw new Error(error.message);
    return { ok: true, amount: Number(out || 0) };
  });

// ───── Admin Wallet (carteira compartilhada das taxas do sistema) ─────

export type AdminWalletEntry = {
  id: string;
  transactionId: string | null;
  description: string;
  amount: number;
  kind: "credit" | "debit";
  studentName: string | null;
  productName: string | null;
  createdAt: string | null;
};

export type AdminWalletSummary = {
  available: number;
  totalEarned: number;
  totalWithdrawn: number;
  masters: Array<{ id: string; name: string; email: string | null }>;
  isMaster: boolean;
};

async function assertMasterAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role, is_master_admin")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || data.role !== "admin" || !(data as any).is_master_admin) {
    throw new Error("Acesso negado: apenas master admins");
  }
}

export const getAdminWallet = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<AdminWalletSummary> => {
    await assertAdmin(context.userId);
    // Soma somente entradas do sistema (exclui nutricionista, imposto e taxa de pagamento)
    const cutoff = await getServerCutoffIso();
    const { data: sysEntries } = await applyCutoff(supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("kind, amount, slot_label, created_at")
      .not("slot_label", "ilike", "%nutricion%")
      .not("slot_label", "ilike", "%imposto%")
      .not("slot_label", "ilike", "%taxa de pagamento%"), "created_at", cutoff);

    let credits = 0;
    let debits = 0;
    (sysEntries || []).forEach((e: any) => {
      const amt = Number(e.amount || 0);
      if (e.kind === "debit") debits += amt;
      else credits += amt;
    });
    const { data: masters } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .eq("role", "admin")
      .eq("is_master_admin", true);
    const { data: me } = await supabaseAdmin
      .from("profiles")
      .select("is_master_admin")
      .eq("user_id", context.userId)
      .maybeSingle();
    return {
      available: Math.max(0, credits - debits),
      totalEarned: credits,
      totalWithdrawn: debits,
      masters: (masters || []).map((p: any) => ({ id: p.id, name: p.name || "—", email: p.email || null })),
      isMaster: !!(me as any)?.is_master_admin,
    };
  });


export const listAdminWalletEntries = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { filter?: "all" | "credit" | "debit" })
  .handler(async ({ context, data }): Promise<AdminWalletEntry[]> => {
    await assertAdmin(context.userId);
    const cutoff = await getServerCutoffIso();
    let q = supabaseAdmin
      .from("admin_system_wallet_entries")
      .select("id, transaction_id, subscription_invoice_id, slot_label, amount, kind, created_at")
      .not("slot_label", "ilike", "%nutricion%")
      .not("slot_label", "ilike", "%imposto%")
      .not("slot_label", "ilike", "%taxa de pagamento%")
      .order("created_at", { ascending: false })
      .limit(500);
    if (cutoff) q = q.gte("created_at", cutoff);

    if (data.filter === "credit" || data.filter === "debit") {
      q = q.eq("kind", data.filter);
    }

    const { data: entries, error } = await q;
    if (error) throw new Error(error.message);
    const txIds = Array.from(new Set((entries || []).map((e: any) => e.transaction_id).filter(Boolean)));
    const subIds = Array.from(new Set((entries || []).map((e: any) => e.subscription_invoice_id).filter(Boolean))) as string[];
    const txMap = new Map<string, { studentName: string | null; productName: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id, product_id, student_id")
        .in("id", txIds);
      const sIds = Array.from(new Set((txs || []).map((t: any) => t.student_id).filter(Boolean)));
      const pIds = Array.from(new Set((txs || []).map((t: any) => t.product_id).filter(Boolean)));
      const [{ data: students }, { data: products }] = await Promise.all([
        sIds.length ? supabaseAdmin.from("students").select("id, profiles(name)").in("id", sIds) : Promise.resolve({ data: [] as any[] }),
        pIds.length ? supabaseAdmin.from("products").select("id, name").in("id", pIds) : Promise.resolve({ data: [] as any[] }),
      ]);
      const sMap = new Map<string, string>();
      (students || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
      const pMap = new Map<string, string>();
      (products || []).forEach((p: any) => pMap.set(p.id, p.name));
      (txs || []).forEach((t: any) => txMap.set(t.id, {
        studentName: t.student_id ? sMap.get(t.student_id) || null : null,
        productName: t.product_id ? pMap.get(t.product_id) || null : null,
      }));
    }
    const subMap = new Map<string, { studentName: string | null; productName: string | null }>();
    if (subIds.length) {
      const { data: invs } = await supabaseAdmin
        .from("subscription_invoices")
        .select("id, user_id, reference_month")
        .in("id", subIds);
      const userIds = Array.from(new Set((invs || []).map((i: any) => i.user_id).filter(Boolean)));
      const { data: profs } = userIds.length
        ? await supabaseAdmin.from("profiles").select("user_id, name").in("user_id", userIds)
        : { data: [] as any[] };
      const nameMap = new Map<string, string>();
      (profs || []).forEach((p: any) => nameMap.set(p.user_id, p.name || ""));
      (invs || []).forEach((i: any) => {
        const ref = i.reference_month ? new Date(i.reference_month).toLocaleDateString("pt-BR", { month: "2-digit", year: "numeric" }) : "";
        subMap.set(i.id, {
          studentName: nameMap.get(i.user_id) || null,
          productName: ref ? `Mensalidade ${ref}` : "Mensalidade",
        });
      });
    }
    return (entries || []).map((e: any) => {
      const tx = e.transaction_id ? txMap.get(e.transaction_id) : null;
      const sub = e.subscription_invoice_id ? subMap.get(e.subscription_invoice_id) : null;
      return {
        id: e.id,
        transactionId: e.transaction_id || e.subscription_invoice_id,
        description: e.slot_label || (e.kind === "debit" ? "Saque/Repasse" : "Crédito"),
        amount: Number(e.amount || 0),
        kind: (e.kind === "debit" ? "debit" : "credit") as "credit" | "debit",
        studentName: tx?.studentName ?? sub?.studentName ?? null,
        productName: tx?.productName ?? sub?.productName ?? null,
        createdAt: e.created_at,
      };
    });
  });

export const registerAdminWalletDebit = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: unknown) => d as { amount: number; description: string })
  .handler(async ({ context, data }) => {
    await assertMasterAdmin(context.userId);
    if (!data.amount || data.amount <= 0) throw new Error("Valor inválido");
    const { data: out, error } = await context.supabase.rpc("register_admin_wallet_debit", {
      p_amount: data.amount,
      p_description: data.description || "Saque/Repasse",
    });
    if (error) throw new Error(error.message);
    return { ok: true, entryId: out as string };
  });
