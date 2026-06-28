import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { getServerCutoffIso } from "@/lib/test-mode.functions";

async function ensureAdmin(userId: string) {
  const { data } = await supabaseAdmin
    .from("profiles")
    .select("role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!data || (data as any).role !== "admin") throw new Error("Acesso negado");
}

export type CreatorWalletRow = {
  id: string; // wallet owner id (partner.id or coach.id)
  profile_id: string | null;
  name: string;
  email: string | null;
  available_balance: number;
  pending_balance: number;
  total_earned: number;
  total_withdrawn: number;
};

export type CreatorEntryRow = {
  id: string;
  order_number: string;
  owner_id: string; // partner.id or coach.id
  owner_name: string;
  student_name: string | null;
  product_name: string | null;
  gross_amount: number;
  net_amount: number;
  status: string;
  payment_method: string | null;
  created_at: string;
  paid_at: string | null;
  sale_channel: "store" | "coach" | null;
};

const SEVEN_DAYS_MS = 7 * 24 * 60 * 60 * 1000;

async function recomputeAggregatesByOwner(opts: {
  ownerCol: "partner_id" | "professional_coach_id";
  ownerIds: string[];
  cutoffIso: string;
}): Promise<Map<string, { available: number; pending: number; earned: number }>> {
  const { ownerCol, ownerIds, cutoffIso } = opts;
  const map = new Map<string, { available: number; pending: number; earned: number }>();
  if (!ownerIds.length) return map;
  const { data } = await (supabaseAdmin as any)
    .from("partner_product_orders")
    .select(`id, ${ownerCol}, status, partner_net_amount, paid_at, created_at`)
    .in(ownerCol, ownerIds)
    .eq("status", "paid")
    .gte("created_at", cutoffIso);
  const now = Date.now();
  for (const r of (data as any[]) || []) {
    const id = r[ownerCol] as string;
    const cur = map.get(id) || { available: 0, pending: 0, earned: 0 };
    const amt = Number(r.partner_net_amount || 0);
    cur.earned += amt;
    const paid = r.paid_at ? new Date(r.paid_at).getTime() : null;
    if (paid && now - paid >= SEVEN_DAYS_MS) cur.available += amt;
    else cur.pending += amt;
    map.set(id, cur);
  }
  return map;
}

export const listPartnerCreatorWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorWalletRow[]> => {
    await ensureAdmin(context.userId);
    const cutoff = await getServerCutoffIso();
    const { data: wallets } = await (supabaseAdmin as any)
      .from("partner_wallets")
      .select("*");
    const rows = (wallets as any[]) || [];
    if (!rows.length) return [];
    const partnerIds = rows.map((r) => r.partner_id);
    const { data: partners } = await supabaseAdmin
      .from("partners")
      .select("id, profile_id")
      .in("id", partnerIds);
    const profileIds = ((partners as any[]) || []).map((p) => p.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds)
      : { data: [] as any[] };
    const partnerMap = new Map<string, string | null>();
    ((partners as any[]) || []).forEach((p) => partnerMap.set(p.id, p.profile_id || null));
    const profMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profMap.set(p.id, p));

    const recompute = cutoff
      ? await recomputeAggregatesByOwner({ ownerCol: "partner_id", ownerIds: partnerIds, cutoffIso: cutoff })
      : null;

    const mapped = rows.map((w) => {
      const pid = partnerMap.get(w.partner_id) || null;
      const prof = pid ? profMap.get(pid) : null;
      const agg = recompute?.get(w.partner_id);
      return {
        id: w.partner_id,
        profile_id: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        available_balance: recompute ? (agg?.available || 0) : Number(w.available_balance || 0),
        pending_balance: recompute ? (agg?.pending || 0) : Number(w.pending_balance || 0),
        total_earned: recompute ? (agg?.earned || 0) : Number(w.total_earned || 0),
        total_withdrawn: recompute ? 0 : Number(w.total_withdrawn || 0),
      };
    });
    // when in test mode, hide owners with no post-cutoff activity
    return recompute ? mapped.filter((m) => m.total_earned > 0) : mapped;
  });

export const listProfessionalCreatorWallets = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorWalletRow[]> => {
    await ensureAdmin(context.userId);
    const cutoff = await getServerCutoffIso();
    const { data: wallets } = await (supabaseAdmin as any)
      .from("professional_wallets")
      .select("*");
    const rows = (wallets as any[]) || [];
    if (!rows.length) return [];
    const coachIds = rows.map((r) => r.professional_coach_id);
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id")
      .in("id", coachIds);
    const profileIds = ((coaches as any[]) || []).map((c) => c.profile_id).filter(Boolean);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds)
      : { data: [] as any[] };
    const coachMap = new Map<string, string | null>();
    ((coaches as any[]) || []).forEach((c) => coachMap.set(c.id, c.profile_id || null));
    const profMap = new Map<string, any>();
    (profiles || []).forEach((p: any) => profMap.set(p.id, p));

    const recompute = cutoff
      ? await recomputeAggregatesByOwner({ ownerCol: "professional_coach_id", ownerIds: coachIds, cutoffIso: cutoff })
      : null;

    const mapped = rows.map((w) => {
      const pid = coachMap.get(w.professional_coach_id) || null;
      const prof = pid ? profMap.get(pid) : null;
      const agg = recompute?.get(w.professional_coach_id);
      return {
        id: w.professional_coach_id,
        profile_id: pid,
        name: prof?.name || "—",
        email: prof?.email || null,
        available_balance: recompute ? (agg?.available || 0) : Number(w.available_balance || 0),
        pending_balance: recompute ? (agg?.pending || 0) : Number(w.pending_balance || 0),
        total_earned: recompute ? (agg?.earned || 0) : Number(w.total_earned || 0),
        total_withdrawn: recompute ? 0 : Number(w.total_withdrawn || 0),
      };
    });
    return recompute ? mapped.filter((m) => m.total_earned > 0) : mapped;
  });

async function listEntriesByOwner(opts: {
  ownerCol: "partner_id" | "professional_coach_id";
}): Promise<CreatorEntryRow[]> {
  const cutoff = await getServerCutoffIso();
  let q = (supabaseAdmin as any)
    .from("partner_product_orders")
    .select(`id, order_number, status, gross_amount, partner_net_amount, payment_method, paid_at, created_at, student_id, partner_product_id, professional_product_id, sale_channel, ${opts.ownerCol}`)
    .eq("status", "paid")
    .not(opts.ownerCol, "is", null)
    .order("created_at", { ascending: false })
    .limit(500);
  if (cutoff) q = q.gte("created_at", cutoff);
  const { data: orders } = await q;
  const rows = (orders as any[]) || [];
  if (!rows.length) return [];

  const ownerIds = Array.from(new Set(rows.map((r) => r[opts.ownerCol]).filter(Boolean))) as string[];
  const studentIds = Array.from(new Set(rows.map((r) => r.student_id).filter(Boolean))) as string[];
  const partnerProductIds = Array.from(new Set(rows.map((r) => r.partner_product_id).filter(Boolean))) as string[];
  const professionalProductIds = Array.from(new Set(rows.map((r) => r.professional_product_id).filter(Boolean))) as string[];

  let ownerNameMap = new Map<string, string>();
  if (opts.ownerCol === "partner_id" && ownerIds.length) {
    const { data: ps } = await supabaseAdmin
      .from("partners")
      .select("id, profile_id, profiles!partners_profile_id_fkey(name)")
      .in("id", ownerIds);
    ((ps as any[]) || []).forEach((p: any) => ownerNameMap.set(p.id, p.profiles?.name || "—"));
  } else if (opts.ownerCol === "professional_coach_id" && ownerIds.length) {
    const { data: cs } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, profiles!coaches_profile_id_fkey(name)")
      .in("id", ownerIds);
    ((cs as any[]) || []).forEach((c: any) => ownerNameMap.set(c.id, c.profiles?.name || "—"));
  }

  const [studentsRes, ppRes, profProdRes] = await Promise.all([
    studentIds.length
      ? supabaseAdmin.from("students").select("id, profiles!inner(name)").in("id", studentIds)
      : Promise.resolve({ data: [] as any[] }),
    partnerProductIds.length
      ? (supabaseAdmin as any).from("partner_products").select("id, name").in("id", partnerProductIds)
      : Promise.resolve({ data: [] as any[] }),
    professionalProductIds.length
      ? (supabaseAdmin as any).from("professional_products").select("id, name").in("id", professionalProductIds)
      : Promise.resolve({ data: [] as any[] }),
  ]);
  const sMap = new Map<string, string>();
  ((studentsRes.data as any[]) || []).forEach((s: any) => sMap.set(s.id, s.profiles?.name || ""));
  const prodMap = new Map<string, string>();
  ((ppRes.data as any[]) || []).forEach((p: any) => prodMap.set(p.id, p.name));
  ((profProdRes.data as any[]) || []).forEach((p: any) => prodMap.set(p.id, p.name));

  return rows.map((r) => ({
    id: r.id,
    order_number: r.order_number,
    owner_id: r[opts.ownerCol],
    owner_name: ownerNameMap.get(r[opts.ownerCol]) || "—",
    student_name: r.student_id ? sMap.get(r.student_id) || null : null,
    product_name:
      (r.partner_product_id ? prodMap.get(r.partner_product_id) : null) ||
      (r.professional_product_id ? prodMap.get(r.professional_product_id) : null) ||
      null,
    gross_amount: Number(r.gross_amount || 0),
    net_amount: Number(r.partner_net_amount || 0),
    status: r.status,
    payment_method: r.payment_method || null,
    created_at: r.created_at,
    paid_at: r.paid_at,
  }));
}

export const listPartnerCreatorEntries = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorEntryRow[]> => {
    await ensureAdmin(context.userId);
    return listEntriesByOwner({ ownerCol: "partner_id" });
  });

export const listProfessionalCreatorEntries = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<CreatorEntryRow[]> => {
    await ensureAdmin(context.userId);
    return listEntriesByOwner({ ownerCol: "professional_coach_id" });
  });
