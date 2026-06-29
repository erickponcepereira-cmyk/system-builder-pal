import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";

export type FitcoinFilter = "all" | "with_balance" | "used" | "auto_credited" | "with_other_role";

export interface AdminFitcoinRow {
  studentId: string;
  profileId: string;
  name: string;
  email: string | null;
  available: number;
  pending: number;
  totalEarned: number;
  used: number;
  creditedCount: number;
  lastCreditAt: string | null;
  hasOtherRole: boolean;
  roles: string[]; // ["coach","partner","professional"]
}

async function assertAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (!data || (data as any).role !== "admin") throw new Error("Acesso negado");
}

export const listAdminFitcoinWallets = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { filter?: FitcoinFilter; search?: string; sort?: "available_desc" | "earned_desc" | "used_desc" | "recent" }) => d)
  .handler(async ({ context, data }): Promise<AdminFitcoinRow[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoffIso = await getServerCutoffIso();
    const cutoffMs = cutoffIso ? new Date(cutoffIso).getTime() : null;

    // 1) Fetch all referral commissions (the source of fitcoin)
    let commQ = supabaseAdmin
      .from("commissions")
      .select("id, amount, status, available_at, created_at, beneficiary_profile_id, referred_by_student_id, fitcoin_credited")
      .eq("is_referral", true as never);
    if (cutoffIso) commQ = commQ.gte("created_at", cutoffIso);
    const { data: commsRaw } = await commQ;
    const comms = (commsRaw as any[]) || [];

    // 2) Group by student
    type Acc = { profileId: string; available: number; pending: number; totalEarned: number; creditedCount: number; lastCreditAt: string | null };
    const byStudent = new Map<string, Acc>();
    const nowMs = Date.now();
    for (const c of comms) {
      const sid = c.referred_by_student_id;
      if (!sid || !c.beneficiary_profile_id) continue;
      const amt = Number(c.amount || 0);
      if (amt <= 0) continue;
      const acc = byStudent.get(sid) || { profileId: c.beneficiary_profile_id, available: 0, pending: 0, totalEarned: 0, creditedCount: 0, lastCreditAt: null };
      const availAtMs = c.available_at ? new Date(c.available_at).getTime() : 0;
      const isAvailable = String(c.status) === "available" || String(c.status) === "paid" || (availAtMs > 0 && availAtMs <= nowMs);
      acc.totalEarned += amt;
      if (isAvailable) acc.available += amt; else acc.pending += amt;
      acc.creditedCount += 1;
      const created = c.created_at as string | null;
      if (created && (!acc.lastCreditAt || created > acc.lastCreditAt)) acc.lastCreditAt = created;
      byStudent.set(sid, acc);
    }

    const studentIds = Array.from(byStudent.keys());
    if (studentIds.length === 0) return [];

    // 3) Fetch student wallets for "used" (total_withdrawn) and profile data
    const [{ data: studs }, { data: wallets }] = await Promise.all([
      supabaseAdmin.from("students").select("id, profile_id, profile:profiles!students_profile_id_fkey(id, name, email)").in("id", studentIds),
      supabaseAdmin.from("student_wallets").select("student_id, total_withdrawn, fitcoin_balance").in("student_id", studentIds),
    ]);
    const walletMap = new Map<string, any>(((wallets as any[]) || []).map((w) => [w.student_id, w]));
    const profileIds = ((studs as any[]) || []).map((s) => s.profile_id).filter(Boolean);

    // 4) Determine which profiles also have coach/partner/professional roles
    const [coachRows, partnerRows] = await Promise.all([
      supabaseAdmin.from("coaches" as never).select("profile_id, is_professional" as never).in("profile_id" as never, profileIds as never),
      supabaseAdmin.from("partners" as never).select("profile_id" as never).in("profile_id" as never, profileIds as never),
    ]);
    const coachProfiles = new Map<string, boolean>();
    ((coachRows.data as any[]) || []).forEach((c) => coachProfiles.set(c.profile_id, !!c.is_professional));
    const partnerProfiles = new Set<string>(((partnerRows.data as any[]) || []).map((p) => p.profile_id));

    const rows: AdminFitcoinRow[] = ((studs as any[]) || []).map((s) => {
      const acc = byStudent.get(s.id)!;
      const w = walletMap.get(s.id);
      const pid = s.profile_id as string;
      const roles: string[] = [];
      if (coachProfiles.has(pid)) {
        roles.push(coachProfiles.get(pid) ? "professional" : "coach");
      }
      if (partnerProfiles.has(pid)) roles.push("partner");
      return {
        studentId: s.id,
        profileId: pid,
        name: s.profile?.name || "—",
        email: s.profile?.email || null,
        available: acc.available,
        pending: acc.pending,
        totalEarned: acc.totalEarned,
        used: Number(w?.total_withdrawn || 0),
        creditedCount: acc.creditedCount,
        lastCreditAt: acc.lastCreditAt,
        hasOtherRole: roles.length > 0,
        roles,
      };
    });

    // 5) Filters
    const search = (data.search || "").trim().toLowerCase();
    const filter = data.filter || "all";
    let filtered = rows.filter((r) => {
      if (search && !(r.name.toLowerCase().includes(search) || (r.email || "").toLowerCase().includes(search))) return false;
      if (filter === "with_balance" && r.available <= 0) return false;
      if (filter === "used" && r.used <= 0) return false;
      if (filter === "auto_credited" && r.creditedCount <= 0) return false;
      if (filter === "with_other_role" && !r.hasOtherRole) return false;
      return true;
    });

    // 6) Sort
    const sort = data.sort || "available_desc";
    filtered.sort((a, b) => {
      if (sort === "earned_desc") return b.totalEarned - a.totalEarned;
      if (sort === "used_desc") return b.used - a.used;
      if (sort === "recent") return (b.lastCreditAt || "").localeCompare(a.lastCreditAt || "");
      return b.available - a.available;
    });

    return filtered;
  });

export interface FitcoinLedgerEntry {
  id: string;
  amount: number;
  status: string;
  availableAt: string | null;
  createdAt: string;
  productLabel: string | null;
  buyerName: string | null;
}

export const getStudentFitcoinDetail = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { studentId: string }) => d)
  .handler(async ({ context, data }): Promise<FitcoinLedgerEntry[]> => {
    await assertAdmin(context.userId);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();

    let q = supabaseAdmin
      .from("commissions")
      .select("id, amount, status, available_at, created_at, transaction_id")
      .eq("is_referral", true as never)
      .eq("referred_by_student_id", data.studentId as never)
      .order("created_at", { ascending: false });
    if (cutoff) q = q.gte("created_at", cutoff);
    const { data: rows } = await q;
    const list = (rows as any[]) || [];
    const txIds = Array.from(new Set(list.map((r) => r.transaction_id).filter(Boolean)));
    const txMap = new Map<string, any>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id, product_id, store_product_id, student_id, purchase_type")
        .in("id", txIds);
      ((txs as any[]) || []).forEach((t) => txMap.set(t.id, t));
    }
    const prodIds = Array.from(new Set([...txMap.values()].map((t) => t.product_id).filter(Boolean)));
    const spIds = Array.from(new Set([...txMap.values()].map((t) => t.store_product_id).filter(Boolean)));
    const buyerIds = Array.from(new Set([...txMap.values()].map((t) => t.student_id).filter(Boolean)));
    const prodMap = new Map<string, string>();
    if (prodIds.length) ((await supabaseAdmin.from("products").select("id,name").in("id", prodIds)).data as any[] || []).forEach((p) => prodMap.set(p.id, p.name));
    if (spIds.length) ((await supabaseAdmin.from("store_products").select("id,name").in("id", spIds)).data as any[] || []).forEach((p) => prodMap.set(`sp:${p.id}`, p.name));
    const buyerMap = new Map<string, string>();
    if (buyerIds.length) {
      const { data: buyers } = await supabaseAdmin
        .from("students").select("id, profile:profiles!students_profile_id_fkey(name)").in("id", buyerIds);
      ((buyers as any[]) || []).forEach((b) => buyerMap.set(b.id, b.profile?.name || ""));
    }
    return list.map((c) => {
      const tx = txMap.get(c.transaction_id);
      const productLabel = tx ? (prodMap.get(tx.product_id) || prodMap.get(`sp:${tx.store_product_id}`) || (tx.purchase_type ? String(tx.purchase_type).replace(/_/g, " ") : null)) : null;
      return {
        id: c.id,
        amount: Number(c.amount || 0),
        status: String(c.status || ""),
        availableAt: c.available_at,
        createdAt: c.created_at,
        productLabel,
        buyerName: tx ? (buyerMap.get(tx.student_id) || null) : null,
      };
    });
  });
