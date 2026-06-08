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

export type PayoutGroup = "coach" | "partner" | "professional";

const n = (v: unknown) => Number(v || 0);

// ============= Helpers =============

async function fetchCoachProfileIds(opts: { onlyProfessionals?: boolean } = {}) {
  const { data } = await supabaseAdmin
    .from("coaches")
    .select("id,profile_id,is_professional")
    .not("profile_id", "is", null);
  const rows = (data || []) as Array<{ id: string; profile_id: string; is_professional: boolean | null }>;
  return opts.onlyProfessionals
    ? rows.filter((r) => r.is_professional === true)
    : rows.filter((r) => r.is_professional !== true);
}

async function fetchPartnerProfileIds() {
  const { data } = await supabaseAdmin
    .from("partners" as never)
    .select("id,profile_id" as never)
    .not("profile_id" as never, "is" as never, null as never);
  return ((data as unknown as Array<{ id: string; profile_id: string }>) || []);
}

// ============= Dashboard =============

export interface PayoutsDashboard {
  groups: Record<PayoutGroup, {
    label: string;
    availableTotal: number;
    blockedTotal: number;
    pendingRequestsCount: number;
    pendingRequestsTotal: number;
    peopleCount: number;
  }>;
}

export const getPayoutsDashboard = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayoutsDashboard> => {
    await assertAdmin(context.userId);
    const [coachesRaw, profsRaw, partners] = await Promise.all([
      fetchCoachProfileIds({ onlyProfessionals: false }),
      fetchCoachProfileIds({ onlyProfessionals: true }),
      fetchPartnerProfileIds(),
    ]);
    const coachProfileIds = coachesRaw.map((c) => c.profile_id);
    const professionalProfileIds = profsRaw.map((c) => c.profile_id);
    const partnerProfileIds = partners.map((p) => p.profile_id);

    const allProfileIds = Array.from(new Set([...coachProfileIds, ...professionalProfileIds, ...partnerProfileIds]));

    const { data: walletsRaw } = await supabaseAdmin
      .from("wallets")
      .select("profile_id,available_balance,pending_balance")
      .in("profile_id", allProfileIds.length ? allProfileIds : ["00000000-0000-0000-0000-000000000000"]);
    const wallets = ((walletsRaw as Array<{ profile_id: string; available_balance: number; pending_balance: number }>) || []);
    const walletByProfile = new Map(wallets.map((w) => [w.profile_id, w]));

    // Nutricionistas (profissionais) usam nutritionist_wallets também
    const { data: nutriWalletsRaw } = await supabaseAdmin
      .from("nutritionist_wallets" as never)
      .select("profile_id,available_balance,blocked_balance" as never)
      .in("profile_id" as never, (professionalProfileIds.length ? professionalProfileIds : ["00000000-0000-0000-0000-000000000000"]) as never);
    const nutriByProfile = new Map(
      ((nutriWalletsRaw as unknown as Array<{ profile_id: string; available_balance: number; blocked_balance: number }>) || [])
        .map((w) => [w.profile_id, w])
    );

    const { data: pendingReqRaw } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("profile_id,amount,status")
      .in("status", ["requested", "approved", "processing"]);
    const pendingReqs = ((pendingReqRaw as Array<{ profile_id: string; amount: number; status: string }>) || []);

    const sumGroup = (ids: string[], extraWalletMap?: Map<string, { available_balance: number; blocked_balance: number }>) => {
      const idSet = new Set(ids);
      let available = 0, blocked = 0;
      for (const id of ids) {
        const w = walletByProfile.get(id);
        if (w) { available += n(w.available_balance); blocked += n(w.pending_balance); }
        const ex = extraWalletMap?.get(id);
        if (ex) { available += n(ex.available_balance); blocked += n(ex.blocked_balance); }
      }
      const reqs = pendingReqs.filter((r) => idSet.has(r.profile_id));
      return {
        availableTotal: available,
        blockedTotal: blocked,
        pendingRequestsCount: reqs.length,
        pendingRequestsTotal: reqs.reduce((s, r) => s + n(r.amount), 0),
        peopleCount: ids.length,
      };
    };

    return {
      groups: {
        coach: { label: "Coaches", ...sumGroup(coachProfileIds) },
        partner: { label: "Parceiros", ...sumGroup(partnerProfileIds) },
        professional: { label: "Profissionais", ...sumGroup(professionalProfileIds, nutriByProfile) },
      },
    };
  });

// ============= Lista de pessoas por grupo =============

export interface PayoutPersonRow {
  profileId: string;
  name: string;
  email: string | null;
  available: number;
  blocked: number;
  totalEarned: number;
  totalWithdrawn: number;
  pendingRequestId: string | null;
  pendingRequestAmount: number;
  pendingRequestStatus: string | null;
}

export const listPayoutPeople = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { group: PayoutGroup; search?: string }) => data)
  .handler(async ({ context, data }): Promise<PayoutPersonRow[]> => {
    await assertAdmin(context.userId);
    let profileIds: string[] = [];
    if (data.group === "coach") {
      profileIds = (await fetchCoachProfileIds({ onlyProfessionals: false })).map((r) => r.profile_id);
    } else if (data.group === "professional") {
      profileIds = (await fetchCoachProfileIds({ onlyProfessionals: true })).map((r) => r.profile_id);
    } else {
      profileIds = (await fetchPartnerProfileIds()).map((r) => r.profile_id);
    }
    if (profileIds.length === 0) return [];

    const [{ data: profs }, { data: wallets }, { data: pendingReqs }, { data: nutriW }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds),
      supabaseAdmin.from("wallets").select("profile_id,available_balance,pending_balance,total_earned,total_withdrawn").in("profile_id", profileIds),
      supabaseAdmin.from("withdrawal_requests").select("id,profile_id,amount,status,requested_at").in("profile_id", profileIds).in("status", ["requested", "approved", "processing"]),
      data.group === "professional"
        ? supabaseAdmin.from("nutritionist_wallets" as never).select("profile_id,available_balance,blocked_balance,total_earned,total_withdrawn" as never).in("profile_id" as never, profileIds as never)
        : Promise.resolve({ data: [] as unknown }),
    ]);

    const wMap = new Map(((wallets as unknown as Array<Record<string, number | string>>) || []).map((w) => [w.profile_id as string, w]));
    const nMap = new Map(((nutriW as unknown as Array<Record<string, number | string>>) || []).map((w) => [w.profile_id as string, w]));
    const reqMap = new Map<string, { id: string; amount: number; status: string }>();
    for (const r of ((pendingReqs as Array<{ id: string; profile_id: string; amount: number; status: string }>) || [])) {
      if (!reqMap.has(r.profile_id)) reqMap.set(r.profile_id, { id: r.id, amount: n(r.amount), status: r.status });
    }

    const rows: PayoutPersonRow[] = ((profs as Array<{ id: string; name: string; email: string | null }>) || []).map((p) => {
      const w = wMap.get(p.id);
      const nw = nMap.get(p.id);
      const r = reqMap.get(p.id);
      return {
        profileId: p.id,
        name: p.name || "—",
        email: p.email,
        available: n(w?.available_balance) + n(nw?.available_balance),
        blocked: n(w?.pending_balance) + n(nw?.blocked_balance),
        totalEarned: n(w?.total_earned) + n(nw?.total_earned),
        totalWithdrawn: n(w?.total_withdrawn) + n(nw?.total_withdrawn),
        pendingRequestId: r?.id || null,
        pendingRequestAmount: r?.amount || 0,
        pendingRequestStatus: r?.status || null,
      };
    });

    const q = (data.search || "").trim().toLowerCase();
    const filtered = q ? rows.filter((r) => r.name.toLowerCase().includes(q) || (r.email || "").toLowerCase().includes(q)) : rows;
    return filtered.sort((a, b) => b.available - a.available);
  });

// ============= Detalhes de uma pessoa =============

export interface PayoutDetails {
  profile: { id: string; name: string; email: string | null };
  wallet: { available: number; blocked: number; totalEarned: number; totalWithdrawn: number };
  sales: Array<{ id: string; date: string | null; amount: number; status: string | null; product: string | null; student: string | null }>;
  commissions: Array<{ id: string; date: string | null; amount: number; status: string | null; level: number | null; transactionId: string | null }>;
  withdrawals: Array<{ id: string; amount: number; status: string | null; requested_at: string | null; paid_at: string | null; notes: string | null; pix_key: string | null }>;
  totals: { salesCount: number; salesAmount: number; commissionsAvailable: number; commissionsPending: number; commissionsPaid: number };
}

export const getPayoutDetails = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { profileId: string; group: PayoutGroup; fromDate?: string; toDate?: string }) => data)
  .handler(async ({ context, data }): Promise<PayoutDetails> => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id,name,email")
      .eq("id", data.profileId)
      .maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");

    const { data: w } = await supabaseAdmin
      .from("wallets")
      .select("available_balance,pending_balance,total_earned,total_withdrawn")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    const { data: nw } = data.group === "professional"
      ? await supabaseAdmin.from("nutritionist_wallets" as never).select("available_balance,blocked_balance,total_earned,total_withdrawn" as never).eq("profile_id" as never, data.profileId as never).maybeSingle()
      : { data: null };

    // Vendas (transações onde a pessoa é vendedora)
    // - Coach/Profissional: via students.coach_id quando coach_id casa com o coach desse profile
    // - Partner: via partner_product_orders.partner_id
    let sales: PayoutDetails["sales"] = [];

    const { data: coachRow } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    const coachId = (coachRow as { id?: string } | null)?.id;

    if (coachId) {
      const { data: stuRows } = await supabaseAdmin.from("students").select("id,profiles!students_profile_id_fkey(name)").eq("coach_id", coachId);
      const studentIds = ((stuRows as Array<{ id: string; profiles?: { name: string } | null }>) || []).map((s) => s.id);
      const studentNameById = new Map(((stuRows as Array<{ id: string; profiles?: { name: string } | null }>) || []).map((s) => [s.id, s.profiles?.name || ""]));
      if (studentIds.length) {
        let q = supabaseAdmin
          .from("transactions")
          .select("id,gross_amount,status,created_at,paid_at,student_id,products!transactions_product_id_fkey(name)")
          .in("student_id", studentIds)
          .order("created_at", { ascending: false })
          .limit(200);
        if (data.fromDate) q = q.gte("created_at", data.fromDate);
        if (data.toDate) q = q.lte("created_at", data.toDate);
        const { data: txs } = await q;
        sales = ((txs as Array<{ id: string; gross_amount: number; status: string; created_at: string | null; paid_at: string | null; student_id: string; products?: { name: string } | null }>) || []).map((t) => ({
          id: t.id,
          date: t.paid_at || t.created_at,
          amount: n(t.gross_amount),
          status: t.status,
          product: t.products?.name || null,
          student: studentNameById.get(t.student_id) || null,
        }));
      }
    }

    // Comissões
    let qc = supabaseAdmin
      .from("commissions")
      .select("id,amount,status,level,created_at,transaction_id")
      .eq("beneficiary_profile_id", data.profileId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (data.fromDate) qc = qc.gte("created_at", data.fromDate);
    if (data.toDate) qc = qc.lte("created_at", data.toDate);
    const { data: commsRaw } = await qc;
    const commissions = ((commsRaw as Array<{ id: string; amount: number; status: string; level: number | null; created_at: string | null; transaction_id: string | null }>) || []).map((c) => ({
      id: c.id, date: c.created_at, amount: n(c.amount), status: c.status, level: c.level, transactionId: c.transaction_id,
    }));

    // Histórico de saques
    const { data: wdRaw } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,amount,status,requested_at,paid_at,notes,pix_key")
      .eq("profile_id", data.profileId)
      .order("requested_at", { ascending: false });
    const withdrawals = ((wdRaw as Array<PayoutDetails["withdrawals"][number]>) || []);

    const commissionsAvailable = commissions.filter((c) => c.status === "available").reduce((s, c) => s + c.amount, 0);
    const commissionsPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const commissionsPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    return {
      profile: profile as { id: string; name: string; email: string | null },
      wallet: {
        available: n((w as Record<string, number> | null)?.available_balance) + n((nw as Record<string, number> | null)?.available_balance),
        blocked: n((w as Record<string, number> | null)?.pending_balance) + n((nw as Record<string, number> | null)?.blocked_balance),
        totalEarned: n((w as Record<string, number> | null)?.total_earned) + n((nw as Record<string, number> | null)?.total_earned),
        totalWithdrawn: n((w as Record<string, number> | null)?.total_withdrawn) + n((nw as Record<string, number> | null)?.total_withdrawn),
      },
      sales,
      commissions,
      withdrawals,
      totals: {
        salesCount: sales.length,
        salesAmount: sales.reduce((s, x) => s + x.amount, 0),
        commissionsAvailable, commissionsPending, commissionsPaid,
      },
    };
  });

// ============= Listagem de solicitações pendentes =============

export interface PendingWithdrawalRow {
  id: string;
  profileId: string;
  name: string;
  email: string | null;
  amount: number;
  status: string | null;
  pix_key: string | null;
  pix_key_type: string | null;
  requested_at: string | null;
  group: PayoutGroup | null;
}

export const listPendingWithdrawals = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PendingWithdrawalRow[]> => {
    await assertAdmin(context.userId);
    const { data: rows } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,profile_id,amount,status,pix_key,pix_key_type,requested_at,profiles!withdrawal_requests_profile_id_fkey(name,email)")
      .in("status", ["requested", "approved", "processing"])
      .order("requested_at", { ascending: false });

    const profileIds = Array.from(new Set(((rows as Array<{ profile_id: string }>) || []).map((r) => r.profile_id)));
    const [coachesPro, partners] = await Promise.all([
      fetchCoachProfileIds({ onlyProfessionals: true }),
      fetchPartnerProfileIds(),
    ]);
    const professionalSet = new Set(coachesPro.map((c) => c.profile_id));
    const partnerSet = new Set(partners.map((p) => p.profile_id));

    return ((rows as Array<{ id: string; profile_id: string; amount: number; status: string | null; pix_key: string | null; pix_key_type: string | null; requested_at: string | null; profiles: { name: string; email: string | null } | null }>) || []).map((r) => ({
      id: r.id,
      profileId: r.profile_id,
      name: r.profiles?.name || "—",
      email: r.profiles?.email || null,
      amount: n(r.amount),
      status: r.status,
      pix_key: r.pix_key,
      pix_key_type: r.pix_key_type,
      requested_at: r.requested_at,
      group: professionalSet.has(r.profile_id) ? "professional" : partnerSet.has(r.profile_id) ? "partner" : profileIds.includes(r.profile_id) ? "coach" : null,
    }));
  });

// ============= Baixar saque manualmente =============

export const registerManualPayout = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { profileId: string; amount: number; notes?: string }) => data)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    if (!(data.amount > 0)) throw new Error("Informe um valor maior que zero");

    const { data: w } = await supabaseAdmin
      .from("wallets")
      .select("available_balance")
      .eq("profile_id", data.profileId)
      .maybeSingle();
    const available = n((w as { available_balance?: number } | null)?.available_balance);
    if (available < data.amount) throw new Error(`Saldo disponível insuficiente (R$ ${available.toFixed(2)})`);

    // Cria solicitação já aprovada e marca como paga via RPC (debita a carteira automaticamente)
    const { data: ins, error: insErr } = await supabaseAdmin
      .from("withdrawal_requests")
      .insert({
        profile_id: data.profileId,
        amount: data.amount,
        status: "approved",
        notes: data.notes || "Baixa manual lançada pelo admin",
      } as never)
      .select("id")
      .single();
    if (insErr || !ins) throw new Error(insErr?.message || "Erro ao criar solicitação");

    const { error: rpcErr } = await supabaseAdmin.rpc("update_coach_withdrawal_status" as never, {
      _withdrawal_id: (ins as { id: string }).id,
      _status: "paid",
      _notes: data.notes || null,
    } as never);
    if (rpcErr) throw new Error(rpcErr.message);
    return { ok: true, withdrawalId: (ins as { id: string }).id };
  });

export const updateWithdrawalStatus = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { withdrawalId: string; status: "approved" | "paid" | "rejected"; notes?: string }) => data)
  .handler(async ({ context, data }) => {
    await assertAdmin(context.userId);
    const { error } = await supabaseAdmin.rpc("update_coach_withdrawal_status" as never, {
      _withdrawal_id: data.withdrawalId,
      _status: data.status,
      _notes: data.notes || null,
    } as never);
    if (error) throw new Error(error.message);
    return { ok: true };
  });
