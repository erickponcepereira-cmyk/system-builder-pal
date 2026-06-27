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

// Dois grupos: "seller" (coach + parceiro + profissional) e "student_referrer" (aluno indicador).
// Se um aluno indicador também é coach/parceiro/profissional, ele entra em "seller".
export type PayoutGroup = "seller" | "student_referrer";
export type SellerRole = "all" | "coach" | "partner" | "professional";

const n = (v: unknown) => Number(v || 0);

// ============= Helpers =============

interface ClassifiedProfiles {
  coachProfileIds: string[];
  partnerProfileIds: string[];
  professionalProfileIds: string[]; // exclui quem já é coach
  sellerProfileIds: string[]; // união dedup priority: coach > partner > professional
  sellerRoleByProfile: Map<string, "coach" | "partner" | "professional">;
  studentByProfile: Map<string, string>; // profile_id -> student_id (quando existe)
}

async function classifyProfiles(): Promise<ClassifiedProfiles> {
  const [coachesRaw, partnersRaw, studentsRaw] = await Promise.all([
    supabaseAdmin.from("coaches").select("id,profile_id,is_professional").not("profile_id", "is", null),
    supabaseAdmin.from("partners" as never).select("profile_id" as never).not("profile_id" as never, "is" as never, null as never),
    supabaseAdmin.from("students").select("id,profile_id").not("profile_id", "is", null),
  ]);
  const coaches = ((coachesRaw.data as Array<{ profile_id: string; is_professional: boolean | null }>) || []);
  const partners = ((partnersRaw.data as unknown as Array<{ profile_id: string }>) || []);
  const students = ((studentsRaw.data as Array<{ id: string; profile_id: string }>) || []);

  const coachSet = new Set<string>();
  const proSet = new Set<string>();
  for (const c of coaches) {
    if (c.is_professional) proSet.add(c.profile_id); else coachSet.add(c.profile_id);
  }
  // se for coach e profissional, vira coach
  for (const id of coachSet) proSet.delete(id);

  const partnerSet = new Set<string>();
  for (const p of partners) partnerSet.add(p.profile_id);

  const studentByProfile = new Map<string, string>();
  for (const s of students) studentByProfile.set(s.profile_id, s.id);

  const sellerRoleByProfile = new Map<string, "coach" | "partner" | "professional">();
  for (const id of coachSet) sellerRoleByProfile.set(id, "coach");
  for (const id of partnerSet) sellerRoleByProfile.set(id, "partner");
  for (const id of proSet) sellerRoleByProfile.set(id, "professional");

  const sellerProfileIds = Array.from(new Set([...coachSet, ...partnerSet, ...proSet]));

  return {
    coachProfileIds: [...coachSet],
    partnerProfileIds: [...partnerSet],
    professionalProfileIds: [...proSet],
    sellerProfileIds,
    sellerRoleByProfile,
    studentByProfile,
  };
}

// Retorna totais de comissões agregados por beneficiary_profile_id.
interface CommissionAgg { earned: number; blocked: number; available: number; paid: number; }
async function aggregateCommissionsBy(profileIds: string[], cutoff?: string | null): Promise<Map<string, CommissionAgg>> {
  const map = new Map<string, CommissionAgg>();
  if (!profileIds.length) return map;
  let q = supabaseAdmin
    .from("commissions")
    .select("beneficiary_profile_id,amount,status,created_at")
    .in("beneficiary_profile_id", profileIds);
  if (cutoff) q = q.gte("created_at", cutoff);
  const { data } = await q;
  for (const r of ((data as Array<{ beneficiary_profile_id: string; amount: number; status: string }>) || [])) {
    const cur = map.get(r.beneficiary_profile_id) || { earned: 0, blocked: 0, available: 0, paid: 0 };
    cur.earned += n(r.amount);
    if (r.status === "pending") cur.blocked += n(r.amount);
    else if (r.status === "available") cur.available += n(r.amount);
    else if (r.status === "paid") cur.paid += n(r.amount);
    map.set(r.beneficiary_profile_id, cur);
  }
  return map;
}

// ============= Dashboard =============

export interface PayoutsDashboard {
  groups: Record<PayoutGroup, {
    label: string;
    availableTotal: number;
    blockedTotal: number;
    earnedTotal: number;
    pendingRequestsCount: number;
    pendingRequestsTotal: number;
    peopleCount: number;
  }>;
}

export const getPayoutsDashboard = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<PayoutsDashboard> => {
    await assertAdmin(context.userId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    const cls = await classifyProfiles();

    // student_referrer: alunos que receberam comissão de indicação e NÃO estão em seller
    const sellerSet = new Set(cls.sellerProfileIds);
    let refRecvQ = supabaseAdmin
      .from("commissions")
      .select("beneficiary_profile_id,created_at")
      .eq("is_referral", true);
    if (cutoff) refRecvQ = refRecvQ.gte("created_at", cutoff);
    const { data: refRecvRaw } = await refRecvQ;
    const studentReferrerIds = Array.from(
      new Set(((refRecvRaw as Array<{ beneficiary_profile_id: string }>) || [])
        .map((r) => r.beneficiary_profile_id)
        .filter((id) => !sellerSet.has(id) && cls.studentByProfile.has(id)))
    );

    // Agregados de comissões para totais "ganho" e "bloqueado" coerentes
    const sellerAgg = await aggregateCommissionsBy(cls.sellerProfileIds, cutoff);
    const studentRefAgg = await aggregateCommissionsBy(studentReferrerIds, cutoff);

    // Solicitações pendentes (saques) — sellers usam withdrawal_requests; alunos usam student_withdrawal_requests
    let wReqsQ = supabaseAdmin
      .from("withdrawal_requests")
      .select("profile_id,amount,status,requested_at")
      .in("status", ["requested", "approved", "processing"]);
    if (cutoff) wReqsQ = wReqsQ.gte("requested_at", cutoff);
    const { data: wReqs } = await wReqsQ;
    let swReqsQ = supabaseAdmin
      .from("student_withdrawal_requests" as never)
      .select("student_id,amount,status,requested_at" as never)
      .in("status" as never, ["requested", "approved", "processing"] as never);
    if (cutoff) swReqsQ = (swReqsQ as any).gte("requested_at", cutoff);
    const { data: swReqs } = await swReqsQ;

    const wReqsArr = ((wReqs as Array<{ profile_id: string; amount: number }>) || []);
    const swReqsArr = ((swReqs as unknown as Array<{ student_id: string; amount: number }>) || []);
    const studentToProfile = new Map<string, string>();
    for (const [pid, sid] of cls.studentByProfile.entries()) studentToProfile.set(sid, pid);

    const sumReq = (ids: Set<string>) => {
      const sellerReqs = wReqsArr.filter((r) => ids.has(r.profile_id));
      const studReqs = swReqsArr.filter((r) => ids.has(studentToProfile.get(r.student_id) || ""));
      const all = [...sellerReqs.map((r) => n(r.amount)), ...studReqs.map((r) => n(r.amount))];
      return { count: all.length, total: all.reduce((s, x) => s + x, 0) };
    };

    // Sellers: wallets + partner_wallets + nutritionist_wallets + student_wallets (caso seja também aluno indicador)
    const { data: walletsRaw } = await supabaseAdmin
      .from("wallets").select("profile_id,available_balance")
      .in("profile_id", cls.sellerProfileIds.length ? cls.sellerProfileIds : ["00000000-0000-0000-0000-000000000000"]);
    const walletByProfile = new Map(((walletsRaw as Array<{ profile_id: string; available_balance: number }>) || []).map((w) => [w.profile_id, w]));
    const { data: partnerRows } = await supabaseAdmin
      .from("partners" as never).select("id,profile_id" as never)
      .in("profile_id" as never, (cls.sellerProfileIds.length ? cls.sellerProfileIds : ["00000000-0000-0000-0000-000000000000"]) as never);
    const partnerIds = ((partnerRows as unknown as Array<{ id: string; profile_id: string }>) || []);
    const partnerProfileById = new Map(partnerIds.map((p) => [p.id, p.profile_id]));
    const { data: partnerWalletsRaw } = partnerIds.length
      ? await supabaseAdmin.from("partner_wallets" as never).select("partner_id,available_balance,total_withdrawn" as never).in("partner_id" as never, partnerIds.map((p) => p.id) as never)
      : { data: [] as unknown };
    const partnerWalletByProfile = new Map<string, { available_balance: number; total_withdrawn: number }>();
    ((partnerWalletsRaw as unknown as Array<{ partner_id: string; available_balance: number; total_withdrawn: number }>) || []).forEach((w) => {
      const pid = partnerProfileById.get(w.partner_id);
      if (pid) partnerWalletByProfile.set(pid, w);
    });
    const { data: coachRows } = await supabaseAdmin
      .from("coaches" as never).select("id,profile_id" as never)
      .in("profile_id" as never, (cls.sellerProfileIds.length ? cls.sellerProfileIds : ["00000000-0000-0000-0000-000000000000"]) as never);
    const coachIds = ((coachRows as unknown as Array<{ id: string; profile_id: string }>) || []);
    const coachProfileById = new Map(coachIds.map((c) => [c.id, c.profile_id]));
    const { data: profWalletsRaw } = coachIds.length
      ? await supabaseAdmin.from("professional_wallets" as never).select("professional_coach_id,available_balance,total_withdrawn" as never).in("professional_coach_id" as never, coachIds.map((c) => c.id) as never)
      : { data: [] as unknown };
    const profWalletByProfile = new Map<string, { available_balance: number; total_withdrawn: number }>();
    ((profWalletsRaw as unknown as Array<{ professional_coach_id: string; available_balance: number; total_withdrawn: number }>) || []).forEach((w) => {
      const pid = coachProfileById.get(w.professional_coach_id);
      if (pid) profWalletByProfile.set(pid, w);
    });
    const { data: nutriRaw } = await supabaseAdmin
      .from("nutritionist_wallets" as never).select("profile_id,available_balance" as never)
      .in("profile_id" as never, (cls.sellerProfileIds.length ? cls.sellerProfileIds : ["00000000-0000-0000-0000-000000000000"]) as never);
    const nutriByProfile = new Map(((nutriRaw as unknown as Array<{ profile_id: string; available_balance: number }>) || []).map((w) => [w.profile_id, w]));

    // student_wallets para sellers que também são alunos + student_referrer
    const allStudentIds = Array.from(new Set([
      ...cls.sellerProfileIds.map((p) => cls.studentByProfile.get(p)).filter(Boolean) as string[],
      ...studentReferrerIds.map((p) => cls.studentByProfile.get(p)!).filter(Boolean),
    ]));
    const { data: stuWalletsRaw } = await supabaseAdmin
      .from("student_wallets").select("student_id,available_balance")
      .in("student_id", allStudentIds.length ? allStudentIds : ["00000000-0000-0000-0000-000000000000"]);
    const stuWalletByStudent = new Map(((stuWalletsRaw as Array<{ student_id: string; available_balance: number }>) || []).map((w) => [w.student_id, w]));

    let sellerAvail = 0, sellerBlocked = 0, sellerEarned = 0;
    for (const pid of cls.sellerProfileIds) {
      const agg = sellerAgg.get(pid);
      if (cutoff) {
        // Modo de Testes: ignora saldos cumulativos das carteiras; usa apenas comissões pós-corte
        if (agg) { sellerAvail += agg.available; sellerBlocked += agg.blocked; sellerEarned += agg.earned; }
      } else {
        sellerAvail += n(walletByProfile.get(pid)?.available_balance) + n(partnerWalletByProfile.get(pid)?.available_balance) + n(profWalletByProfile.get(pid)?.available_balance) + n(nutriByProfile.get(pid)?.available_balance);
        const sid = cls.studentByProfile.get(pid);
        if (sid) sellerAvail += n(stuWalletByStudent.get(sid)?.available_balance);
        if (agg) { sellerBlocked += agg.blocked; sellerEarned += agg.earned; }
      }
    }

    let studRefAvail = 0, studRefBlocked = 0, studRefEarned = 0;
    for (const pid of studentReferrerIds) {
      const agg = studentRefAgg.get(pid);
      if (cutoff) {
        if (agg) { studRefAvail += agg.available; studRefBlocked += agg.blocked; studRefEarned += agg.earned; }
      } else {
        const sid = cls.studentByProfile.get(pid)!;
        studRefAvail += n(stuWalletByStudent.get(sid)?.available_balance);
        if (agg) { studRefBlocked += agg.blocked; studRefEarned += agg.earned; }
      }
    }

    const sellerReqInfo = sumReq(new Set(cls.sellerProfileIds));
    const studRefReqInfo = sumReq(new Set(studentReferrerIds));

    return {
      groups: {
        seller: {
          label: "Coach / Parceiro / Profissional",
          availableTotal: sellerAvail,
          blockedTotal: sellerBlocked,
          earnedTotal: sellerEarned,
          pendingRequestsCount: sellerReqInfo.count,
          pendingRequestsTotal: sellerReqInfo.total,
          peopleCount: cls.sellerProfileIds.length,
        },
        student_referrer: {
          label: "Aluno Indicador",
          availableTotal: studRefAvail,
          blockedTotal: studRefBlocked,
          earnedTotal: studRefEarned,
          pendingRequestsCount: studRefReqInfo.count,
          pendingRequestsTotal: studRefReqInfo.total,
          peopleCount: studentReferrerIds.length,
        },
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
  role: "coach" | "partner" | "professional" | "student_referrer";
}

export const listPayoutPeople = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { group: PayoutGroup; search?: string; roleFilter?: SellerRole }) => data)
  .handler(async ({ context, data }): Promise<PayoutPersonRow[]> => {
    await assertAdmin(context.userId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    const cls = await classifyProfiles();

    let profileIds: string[] = [];
    let roleOf: (pid: string) => PayoutPersonRow["role"];

    if (data.group === "seller") {
      const f = data.roleFilter || "all";
      if (f === "coach") profileIds = cls.coachProfileIds;
      else if (f === "partner") profileIds = cls.partnerProfileIds;
      else if (f === "professional") profileIds = cls.professionalProfileIds;
      else profileIds = cls.sellerProfileIds;
      roleOf = (pid) => cls.sellerRoleByProfile.get(pid) || "coach";
    } else {
      const sellerSet = new Set(cls.sellerProfileIds);
      let refQ = supabaseAdmin
        .from("commissions").select("beneficiary_profile_id,created_at").eq("is_referral", true);
      if (cutoff) refQ = refQ.gte("created_at", cutoff);
      const { data: refRecvRaw } = await refQ;
      profileIds = Array.from(new Set(((refRecvRaw as Array<{ beneficiary_profile_id: string }>) || [])
        .map((r) => r.beneficiary_profile_id)
        .filter((id) => !sellerSet.has(id) && cls.studentByProfile.has(id))));
      roleOf = () => "student_referrer";
    }

    if (profileIds.length === 0) return [];

    const pendingReqsQ = (() => {
      let q = supabaseAdmin.from("withdrawal_requests").select("id,profile_id,amount,status,requested_at").in("profile_id", profileIds).in("status", ["requested", "approved", "processing"]);
      if (cutoff) q = q.gte("requested_at", cutoff);
      return q;
    })();
    const stuReqsQ = (async () => {
      const sids = profileIds.map((p) => cls.studentByProfile.get(p)).filter(Boolean) as string[];
      if (!sids.length) return { data: [] as unknown };
      let q = supabaseAdmin.from("student_withdrawal_requests" as never).select("id,student_id,amount,status,requested_at" as never).in("student_id" as never, sids as never).in("status" as never, ["requested", "approved", "processing"] as never);
      if (cutoff) q = (q as any).gte("requested_at", cutoff);
      return q;
    })();

    const [{ data: profs }, { data: wallets }, { data: pendingReqs }, { data: nutriW }, { data: stuW }, { data: stuReqs }] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,name,email").in("id", profileIds),
      supabaseAdmin.from("wallets").select("profile_id,available_balance,total_withdrawn").in("profile_id", profileIds),
      pendingReqsQ,
      supabaseAdmin.from("nutritionist_wallets" as never).select("profile_id,available_balance,total_withdrawn" as never).in("profile_id" as never, profileIds as never),
      (async () => {
        const sids = profileIds.map((p) => cls.studentByProfile.get(p)).filter(Boolean) as string[];
        if (!sids.length) return { data: [] as unknown };
        return supabaseAdmin.from("student_wallets").select("student_id,available_balance,total_withdrawn").in("student_id", sids);
      })(),
      stuReqsQ,
    ]);

    const commAgg = await aggregateCommissionsBy(profileIds, cutoff);

    const wMap = new Map(((wallets as Array<Record<string, number | string>>) || []).map((w) => [w.profile_id as string, w]));
    const nMap = new Map(((nutriW as unknown as Array<Record<string, number | string>>) || []).map((w) => [w.profile_id as string, w]));
    const swMap = new Map(((stuW as unknown as Array<{ student_id: string; available_balance: number; total_withdrawn: number }>) || []).map((w) => [w.student_id, w]));
    const { data: partnerRows } = await supabaseAdmin
      .from("partners" as never)
      .select("id,profile_id" as never)
      .in("profile_id" as never, profileIds as never);
    const partnerIds = ((partnerRows as unknown as Array<{ id: string; profile_id: string }>) || []);
    const partnerProfileById = new Map(partnerIds.map((p) => [p.id, p.profile_id]));
    const { data: partnerWallets } = partnerIds.length
      ? await supabaseAdmin.from("partner_wallets" as never).select("partner_id,available_balance,total_withdrawn" as never).in("partner_id" as never, partnerIds.map((p) => p.id) as never)
      : { data: [] as unknown };
    const pwMap = new Map<string, { available_balance: number; total_withdrawn: number }>();
    ((partnerWallets as unknown as Array<{ partner_id: string; available_balance: number; total_withdrawn: number }>) || []).forEach((w) => {
      const pid = partnerProfileById.get(w.partner_id);
      if (pid) pwMap.set(pid, w);
    });
    const { data: coachRows2 } = await supabaseAdmin
      .from("coaches" as never).select("id,profile_id" as never)
      .in("profile_id" as never, profileIds as never);
    const coachIds2 = ((coachRows2 as unknown as Array<{ id: string; profile_id: string }>) || []);
    const coachProfileById2 = new Map(coachIds2.map((c) => [c.id, c.profile_id]));
    const { data: profWallets } = coachIds2.length
      ? await supabaseAdmin.from("professional_wallets" as never).select("professional_coach_id,available_balance,total_withdrawn" as never).in("professional_coach_id" as never, coachIds2.map((c) => c.id) as never)
      : { data: [] as unknown };
    const profwMap = new Map<string, { available_balance: number; total_withdrawn: number }>();
    ((profWallets as unknown as Array<{ professional_coach_id: string; available_balance: number; total_withdrawn: number }>) || []).forEach((w) => {
      const pid = coachProfileById2.get(w.professional_coach_id);
      if (pid) profwMap.set(pid, w);
    });
    const reqMap = new Map<string, { id: string; amount: number; status: string }>();
    for (const r of ((pendingReqs as Array<{ id: string; profile_id: string; amount: number; status: string }>) || [])) {
      if (!reqMap.has(r.profile_id)) reqMap.set(r.profile_id, { id: r.id, amount: n(r.amount), status: r.status });
    }
    const stuReqsByStudent = new Map<string, { id: string; amount: number; status: string }>();
    for (const r of ((stuReqs as unknown as Array<{ id: string; student_id: string; amount: number; status: string }>) || [])) {
      if (!stuReqsByStudent.has(r.student_id)) stuReqsByStudent.set(r.student_id, { id: r.id, amount: n(r.amount), status: r.status });
    }

    const rows: PayoutPersonRow[] = ((profs as Array<{ id: string; name: string; email: string | null }>) || []).map((p) => {
      const w = wMap.get(p.id);
      const pw = pwMap.get(p.id);
      const profw = profwMap.get(p.id);
      const nw = nMap.get(p.id);
      const sid = cls.studentByProfile.get(p.id);
      const sw = sid ? swMap.get(sid) : undefined;
      const role = roleOf(p.id);
      // saque: para aluno indicador puro usamos student_withdrawal_requests; sellers normalmente o withdrawal_requests
      let r = reqMap.get(p.id);
      if (!r && role === "student_referrer" && sid) {
        const sr = stuReqsByStudent.get(sid);
        if (sr) r = sr;
      }
      const agg = commAgg.get(p.id);
      const available = cutoff
        ? (agg?.available || 0)
        : (role === "student_referrer"
          ? n(sw?.available_balance)
          : n(w?.available_balance) + n(pw?.available_balance) + n(profw?.available_balance) + n(nw?.available_balance) + n(sw?.available_balance));
      const totalWithdrawn = cutoff
        ? 0
        : (role === "student_referrer"
          ? n(sw?.total_withdrawn)
          : n(w?.total_withdrawn) + n(pw?.total_withdrawn) + n(profw?.total_withdrawn) + n(nw?.total_withdrawn) + n(sw?.total_withdrawn));
      return {
        profileId: p.id,
        name: p.name || "—",
        email: p.email,
        available,
        blocked: agg?.blocked || 0,
        totalEarned: agg?.earned || 0,
        totalWithdrawn,
        pendingRequestId: r?.id || null,
        pendingRequestAmount: r?.amount || 0,
        pendingRequestStatus: r?.status || null,
        role,
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
  sales: Array<{ id: string; date: string | null; amount: number; status: string | null; product: string | null; student: string | null; tag?: string | null; creatorAmount?: number | null }>;
  commissions: Array<{ id: string; date: string | null; amount: number; status: string | null; level: number | null; transactionId: string | null; partnerOrderId: string | null; isReferral: boolean; studentName: string | null; studentEmail: string | null; productName: string | null; purchaseType: string | null; transactionDate: string | null; availableAt: string | null; slotLabel: string | null }>;
  productEarnings: Array<{ id: string; date: string | null; amount: number; status: string | null; availableAt: string | null; studentName: string | null; studentEmail: string | null; productName: string | null; sourceLabel: string }>;
  withdrawals: Array<{ id: string; amount: number; status: string | null; requested_at: string | null; paid_at: string | null; notes: string | null; pix_key: string | null }>;
  totals: { salesCount: number; salesAmount: number; commissionsAvailable: number; commissionsPending: number; commissionsPaid: number; productEarningsAvailable: number; productEarningsPending: number; productEarningsTotal: number };
}

export const getPayoutDetails = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((data: { profileId: string; group: PayoutGroup; fromDate?: string; toDate?: string }) => data)
  .handler(async ({ context, data }): Promise<PayoutDetails> => {
    await assertAdmin(context.userId);
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id,name,email").eq("id", data.profileId).maybeSingle();
    if (!profile) throw new Error("Perfil não encontrado");

    const cls = await classifyProfiles();
    const sid = cls.studentByProfile.get(data.profileId);
    const { getServerCutoffIso } = await import("@/lib/test-mode.functions");
    const cutoff = await getServerCutoffIso();
    const fromDate = cutoff && (!data.fromDate || cutoff > data.fromDate) ? cutoff : data.fromDate;

    const [{ data: w }, { data: nw }, { data: sw }, { data: partnerRow }, { data: coachRow }] = await Promise.all([
      supabaseAdmin.from("wallets").select("available_balance,total_withdrawn").eq("profile_id", data.profileId).maybeSingle(),
      supabaseAdmin.from("nutritionist_wallets" as never).select("available_balance,total_withdrawn" as never).eq("profile_id" as never, data.profileId as never).maybeSingle(),
      sid ? supabaseAdmin.from("student_wallets").select("available_balance,total_withdrawn").eq("student_id", sid).maybeSingle() : Promise.resolve({ data: null }),
      supabaseAdmin.from("partners" as never).select("id" as never).eq("profile_id" as never, data.profileId as never).maybeSingle(),
      supabaseAdmin.from("coaches").select("id").eq("profile_id", data.profileId).maybeSingle(),
    ]);
    const partnerId = (partnerRow as unknown as { id?: string } | null)?.id ?? null;
    const coachId = (coachRow as { id?: string } | null)?.id ?? null;
    const [{ data: pw }, { data: profw }] = await Promise.all([
      partnerId
        ? supabaseAdmin.from("partner_wallets" as never).select("available_balance,total_withdrawn" as never).eq("partner_id" as never, partnerId as never).maybeSingle()
        : Promise.resolve({ data: null as unknown }),
      coachId
        ? supabaseAdmin.from("professional_wallets" as never).select("available_balance,total_withdrawn" as never).eq("professional_coach_id" as never, coachId as never).maybeSingle()
        : Promise.resolve({ data: null as unknown }),
    ]);

    // Vendas (transações da pessoa enquanto vendedor coach)
    let sales: PayoutDetails["sales"] = [];
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
        if (fromDate) q = q.gte("created_at", fromDate);
        if (data.toDate) q = q.lte("created_at", data.toDate);
        const { data: txs } = await q;
        sales = ((txs as Array<{ id: string; gross_amount: number; status: string; created_at: string | null; paid_at: string | null; student_id: string; products?: { name: string } | null }>) || []).map((t) => ({
          id: t.id, date: t.paid_at || t.created_at, amount: n(t.gross_amount), status: t.status,
          product: t.products?.name || null, student: studentNameById.get(t.student_id) || null,
        }));
      }
    }

    const partnerOrderRows: Array<{
      id: string; gross_amount: number; status: string | null; created_at: string | null; paid_at: string | null; student_id: string | null;
      partner_product_id: string | null; professional_product_id: string | null; partner_net_amount: number | null;
      partner_id: string | null; professional_coach_id: string | null; selling_coach_id: string | null;
      student?: { profile?: { name: string | null; email: string | null } | null } | null;
      partner_product?: { name: string | null } | null;
      professional_product?: { name: string | null } | null;
    }> = [];
    const addPartnerOrders = async (column: "partner_id" | "professional_coach_id" | "selling_coach_id", value: string | null) => {
      if (!value) return;
      let q = supabaseAdmin
        .from("partner_product_orders" as never)
        .select("id,gross_amount,status,created_at,paid_at,student_id,partner_product_id,professional_product_id,partner_net_amount,partner_id,professional_coach_id,selling_coach_id,student:students!partner_product_orders_student_id_fkey(profile:profiles!students_profile_id_fkey(name,email)),partner_product:partner_product_id(name),professional_product:professional_product_id(name)" as never)
        .eq(column as never, value as never)
        .order("created_at" as never, { ascending: false })
        .limit(200);
      if (fromDate) q = (q as any).gte("created_at", fromDate);
      if (data.toDate) q = (q as any).lte("created_at", data.toDate);
      const { data: rows } = await q;
      partnerOrderRows.push(...(((rows as unknown as typeof partnerOrderRows) || [])));
    };
    await Promise.all([
      addPartnerOrders("partner_id", partnerId),
      addPartnerOrders("professional_coach_id", coachId),
      addPartnerOrders("selling_coach_id", coachId),
    ]);
    const partnerOrdersById = new Map<string, typeof partnerOrderRows[number]>();
    const upsertPartnerOrder = (r: typeof partnerOrderRows[number]) => {
      const prev = partnerOrdersById.get(r.id);
      partnerOrdersById.set(r.id, { ...(prev || {}), ...r });
    };
    partnerOrderRows.forEach(upsertPartnerOrder);

    // Comissões — sempre filtradas por beneficiary = essa pessoa
    let qc = supabaseAdmin
      .from("commissions")
      .select("id,amount,status,level,created_at,transaction_id,partner_order_id,is_referral,available_at,slot_label")
      .eq("beneficiary_profile_id", data.profileId)
      .order("created_at", { ascending: false })
      .limit(500);
    if (fromDate) qc = qc.gte("created_at", fromDate);
    if (data.toDate) qc = qc.lte("created_at", data.toDate);
    const { data: commsRaw } = await qc;
    const commsBase = ((commsRaw as Array<{ id: string; amount: number; status: string; level: number | null; created_at: string | null; transaction_id: string | null; partner_order_id: string | null; is_referral: boolean | null; available_at: string | null; slot_label: string | null }>) || []);

    // Enriquecimento: transação/pedido de parceiro -> aluno + produto
    const txIds = Array.from(new Set(commsBase.map((c) => c.transaction_id).filter(Boolean) as string[]));
    const commissionPartnerOrderIds = Array.from(new Set(commsBase.map((c) => c.partner_order_id).filter(Boolean) as string[]));
    if (commissionPartnerOrderIds.length) {
      let q = supabaseAdmin
        .from("partner_product_orders" as never)
        .select("id,gross_amount,status,created_at,paid_at,student_id,partner_product_id,professional_product_id,partner_net_amount,partner_id,professional_coach_id,selling_coach_id,student:students!partner_product_orders_student_id_fkey(profile:profiles!students_profile_id_fkey(name,email)),partner_product:partner_product_id(name),professional_product:professional_product_id(name)" as never)
        .in("id" as never, commissionPartnerOrderIds as never);
      if (fromDate) q = (q as any).gte("created_at", fromDate);
      if (data.toDate) q = (q as any).lte("created_at", data.toDate);
      const { data: rows } = await q;
      ((rows as unknown as typeof partnerOrderRows) || []).forEach(upsertPartnerOrder);
    }
    const txMap = new Map<string, { student_id: string | null; product_id: string | null; purchase_type: string | null; paid_at: string | null; created_at: string | null; product_ids: string[] | null; store_order_id: string | null }>();
    if (txIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("id,student_id,product_id,purchase_type,paid_at,created_at,metadata")
        .in("id", txIds);
      for (const t of ((txs as Array<{ id: string; student_id: string | null; product_id: string | null; purchase_type: string | null; paid_at: string | null; created_at: string | null; metadata?: any }>) || [])) {
        const meta = (t.metadata || {}) as Record<string, unknown>;
        const storeOrderId = typeof meta.store_order_id === "string" ? meta.store_order_id : null;
        txMap.set(t.id, { ...t, product_ids: null, store_order_id: storeOrderId });
      }
    }

    const storeOrderIds = Array.from(new Set(Array.from(txMap.values()).map((t) => t.store_order_id).filter(Boolean) as string[]));
    const storeOrderMap = new Map<string, { student_id: string | null; productNames: string[] }>();
    if (storeOrderIds.length) {
      const [ordersRes, itemsRes] = await Promise.all([
        supabaseAdmin.from("store_orders" as never).select("id,student_id" as never).in("id" as never, storeOrderIds as never),
        supabaseAdmin.from("store_order_items" as never).select("order_id,title" as never).in("order_id" as never, storeOrderIds as never),
      ]);
      for (const o of (((ordersRes as any).data || []) as Array<{ id: string; student_id: string | null }>)) {
        storeOrderMap.set(o.id, { student_id: o.student_id, productNames: [] });
      }
      for (const item of (((itemsRes as any).data || []) as Array<{ order_id: string; title: string | null }>)) {
        const curr = storeOrderMap.get(item.order_id) || { student_id: null, productNames: [] };
        if (item.title) curr.productNames.push(item.title);
        storeOrderMap.set(item.order_id, curr);
      }
    }

    const studentIdsSet = new Set<string>();
    const productIdsSet = new Set<string>();
    const storeProductIdsSet = new Set<string>();
    const digitalProductIdsSet = new Set<string>();
    const partnerProductIdsSet = new Set<string>();
    const professionalProductIdsSet = new Set<string>();
    for (const t of txMap.values()) {
      const storeOrder = t.store_order_id ? storeOrderMap.get(t.store_order_id) : null;
      const txStudentId = t.student_id || storeOrder?.student_id || null;
      if (txStudentId) studentIdsSet.add(txStudentId);
      const pid = t.product_id;
      if (pid) {
        // O mesmo product_id pode chegar de checkout da loja como products, store_products ou digital_products.
        // Busca nas três tabelas para nunca deixar Produto como "—".
        productIdsSet.add(pid);
        storeProductIdsSet.add(pid);
        digitalProductIdsSet.add(pid);
      }
      for (const extra of (t.product_ids || [])) {
        if (extra) productIdsSet.add(extra);
      }
    }
    for (const po of partnerOrdersById.values()) {
      if (po.student_id) studentIdsSet.add(po.student_id);
      if (po.partner_product_id) partnerProductIdsSet.add(po.partner_product_id);
      if (po.professional_product_id) professionalProductIdsSet.add(po.professional_product_id);
    }

    const [stuRowsRes, prodRowsRes, storeRowsRes, digitalRowsRes, partnerProdRowsRes, professionalProdRowsRes] = await Promise.all([
      studentIdsSet.size
        ? supabaseAdmin.from("students").select("id,profile_id,profiles!students_profile_id_fkey(name,email)").in("id", Array.from(studentIdsSet))
        : Promise.resolve({ data: [] as unknown }),
      productIdsSet.size
        ? supabaseAdmin.from("products").select("id,name").in("id", Array.from(productIdsSet))
        : Promise.resolve({ data: [] as unknown }),
      storeProductIdsSet.size
        ? supabaseAdmin.from("store_products").select("id,name").in("id", Array.from(storeProductIdsSet))
        : Promise.resolve({ data: [] as unknown }),
      digitalProductIdsSet.size
        ? supabaseAdmin.from("digital_products").select("id,title").in("id", Array.from(digitalProductIdsSet))
        : Promise.resolve({ data: [] as unknown }),
      partnerProductIdsSet.size
        ? supabaseAdmin.from("partner_products" as never).select("id,name" as never).in("id" as never, Array.from(partnerProductIdsSet) as never)
        : Promise.resolve({ data: [] as unknown }),
      professionalProductIdsSet.size
        ? supabaseAdmin.from("professional_products" as never).select("id,name" as never).in("id" as never, Array.from(professionalProductIdsSet) as never)
        : Promise.resolve({ data: [] as unknown }),
    ]);
    const stuNameById = new Map<string, { name: string | null; email: string | null }>();
    for (const s of ((stuRowsRes.data as Array<{ id: string; profiles?: { name: string | null; email: string | null } | null }>) || [])) {
      stuNameById.set(s.id, { name: s.profiles?.name ?? null, email: s.profiles?.email ?? null });
    }
    const prodNameById = new Map<string, string>();
    for (const p of ((prodRowsRes.data as Array<{ id: string; name: string }>) || [])) prodNameById.set(p.id, p.name);
    for (const p of ((storeRowsRes.data as Array<{ id: string; name: string }>) || [])) prodNameById.set(p.id, p.name);
    for (const p of ((digitalRowsRes.data as Array<{ id: string; title: string }>) || [])) prodNameById.set(p.id, p.title);
    for (const p of (((partnerProdRowsRes as any).data || []) as Array<{ id: string; name: string }>)) prodNameById.set(p.id, `[Parceiro] ${p.name}`);
    for (const p of (((professionalProdRowsRes as any).data || []) as Array<{ id: string; name: string }>)) prodNameById.set(p.id, `[Profissional] ${p.name}`);

    const partnerOrderProductName = (po: typeof partnerOrderRows[number]) => {
      const id = po.partner_product_id || po.professional_product_id || "";
      return prodNameById.get(id) || po.partner_product?.name || po.professional_product?.name || null;
    };
    const partnerOrderStudent = (po: typeof partnerOrderRows[number]) => {
      const byId = po.student_id ? stuNameById.get(po.student_id) || null : null;
      return byId || po.student?.profile || null;
    };

    const ppoSales = Array.from(partnerOrdersById.values()).map((o) => ({
      id: o.id,
      date: o.paid_at || o.created_at,
      amount: n(o.gross_amount),
      status: o.status,
      product: partnerOrderProductName(o),
      student: partnerOrderStudent(o)?.name ?? null,
      tag: o.partner_id === partnerId || o.professional_coach_id === coachId ? "Produto criado" : "Venda parceiro/profissional",
      creatorAmount: o.partner_id === partnerId || o.professional_coach_id === coachId ? n(o.partner_net_amount) : null,
    }));
    sales = [...sales, ...ppoSales]
      .sort((a, b) => (b.date || "").localeCompare(a.date || ""))
      .slice(0, 200);

    const commissions = commsBase.map((c) => {
      const t = c.transaction_id ? txMap.get(c.transaction_id) : null;
      const po = c.partner_order_id ? partnerOrdersById.get(c.partner_order_id) : null;
      const storeOrder = t?.store_order_id ? storeOrderMap.get(t.store_order_id) : null;
      const txStudentId = t?.student_id || storeOrder?.student_id || null;
      const stu = txStudentId ? stuNameById.get(txStudentId) : null;
      let productName: string | null = null;
      if (t?.product_id) productName = prodNameById.get(t.product_id) || null;
      if (!productName && t?.product_ids?.length) {
        productName = t.product_ids.map((id) => prodNameById.get(id)).filter(Boolean).join(", ") || null;
      }
      if (!productName && storeOrder?.productNames?.length) productName = storeOrder.productNames.join(", ");
      const poStudent = po ? partnerOrderStudent(po) : null;
      if (!productName && po) productName = partnerOrderProductName(po);
      return {
        id: c.id,
        date: c.created_at,
        amount: n(c.amount),
        status: c.status,
        level: c.level,
        transactionId: c.transaction_id,
        partnerOrderId: c.partner_order_id,
        isReferral: !!c.is_referral,
        studentName: stu?.name ?? poStudent?.name ?? null,
        studentEmail: stu?.email ?? poStudent?.email ?? null,
        productName,
        purchaseType: t?.purchase_type ?? (po ? (po.partner_product_id ? "Venda de Parceiro" : "Venda de Profissional") : null),
        transactionDate: t?.paid_at ?? t?.created_at ?? po?.paid_at ?? po?.created_at ?? null,
        availableAt: c.available_at,
        slotLabel: c.slot_label,
      };
    });

    const nowMs = Date.now();
    const productEarnings = Array.from(partnerOrdersById.values())
      .filter((o) => o.status === "paid" && (o.partner_id === partnerId || o.professional_coach_id === coachId) && n(o.partner_net_amount) > 0)
      .map((o) => {
        const availableAt = new Date(o.paid_at || o.created_at || Date.now()).getTime() + 7 * 24 * 60 * 60 * 1000;
        const released = availableAt <= nowMs;
        const poStudent = partnerOrderStudent(o);
        return {
          id: o.id,
          date: o.paid_at || o.created_at,
          amount: n(o.partner_net_amount),
          status: released ? "available" : "pending",
          availableAt: new Date(availableAt).toISOString(),
          studentName: poStudent?.name ?? null,
          studentEmail: poStudent?.email ?? null,
          productName: partnerOrderProductName(o),
          sourceLabel: "Produto criado",
        };
      });


    // Saques: combina os dois canais
    const { data: wdRaw } = await supabaseAdmin
      .from("withdrawal_requests")
      .select("id,amount,status,requested_at,paid_at,notes,pix_key")
      .eq("profile_id", data.profileId)
      .order("requested_at", { ascending: false });
    const sellerWithdrawals = ((wdRaw as Array<PayoutDetails["withdrawals"][number]>) || []);
    let studentWithdrawals: PayoutDetails["withdrawals"] = [];
    if (sid) {
      const { data: swdRaw } = await supabaseAdmin
        .from("student_withdrawal_requests" as never)
        .select("id,amount,status,requested_at,paid_at,notes,pix_key" as never)
        .eq("student_id" as never, sid as never)
        .order("requested_at" as never, { ascending: false });
      studentWithdrawals = ((swdRaw as unknown as Array<PayoutDetails["withdrawals"][number]>) || []);
    }
    const withdrawals = [...sellerWithdrawals, ...studentWithdrawals].sort((a, b) =>
      (b.requested_at || "").localeCompare(a.requested_at || "")
    );

    const commissionsAvailable = commissions.filter((c) => c.status === "available").reduce((s, c) => s + c.amount, 0);
    const commissionsPending = commissions.filter((c) => c.status === "pending").reduce((s, c) => s + c.amount, 0);
    const commissionsPaid = commissions.filter((c) => c.status === "paid").reduce((s, c) => s + c.amount, 0);

    // Derivar total_earned/blocked das comissões reais (fonte da verdade)
    const totalEarned = commissions.reduce((s, c) => s + c.amount, 0);
    const blocked = commissionsPending;

    const available = cutoff
      ? commissionsAvailable + productEarnings.filter((e) => e.status === "available").reduce((s, e) => s + e.amount, 0)
      : data.group === "student_referrer"
      ? n((sw as Record<string, number> | null)?.available_balance)
      : n((w as Record<string, number> | null)?.available_balance)
        + n((pw as Record<string, number> | null)?.available_balance)
        + n((profw as Record<string, number> | null)?.available_balance)
        + n((nw as Record<string, number> | null)?.available_balance)
        + n((sw as Record<string, number> | null)?.available_balance);
    const totalWithdrawn = data.group === "student_referrer"
      ? n((sw as Record<string, number> | null)?.total_withdrawn)
      : n((w as Record<string, number> | null)?.total_withdrawn)
        + n((pw as Record<string, number> | null)?.total_withdrawn)
        + n((profw as Record<string, number> | null)?.total_withdrawn)
        + n((nw as Record<string, number> | null)?.total_withdrawn)
        + n((sw as Record<string, number> | null)?.total_withdrawn);
    const productEarningsAvailable = productEarnings.filter((e) => e.status === "available").reduce((s, e) => s + e.amount, 0);
    const productEarningsPending = productEarnings.filter((e) => e.status === "pending").reduce((s, e) => s + e.amount, 0);
    const productEarningsTotal = productEarnings.reduce((s, e) => s + e.amount, 0);

    return {
      profile: profile as { id: string; name: string; email: string | null },
      wallet: { available, blocked: blocked + productEarningsPending, totalEarned: totalEarned + productEarningsTotal, totalWithdrawn },
      sales,
      commissions,
      productEarnings,
      withdrawals,
      totals: {
        salesCount: sales.length,
        salesAmount: sales.reduce((s, x) => s + x.amount, 0),
        commissionsAvailable, commissionsPending, commissionsPaid,
        productEarningsAvailable, productEarningsPending, productEarningsTotal,
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
  sellerRole: "coach" | "partner" | "professional" | null;
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

    const cls = await classifyProfiles();

    return ((rows as Array<{ id: string; profile_id: string; amount: number; status: string | null; pix_key: string | null; pix_key_type: string | null; requested_at: string | null; profiles: { name: string; email: string | null } | null }>) || []).map((r) => {
      const sellerRole = cls.sellerRoleByProfile.get(r.profile_id) || null;
      return {
        id: r.id, profileId: r.profile_id,
        name: r.profiles?.name || "—", email: r.profiles?.email || null,
        amount: n(r.amount), status: r.status,
        pix_key: r.pix_key, pix_key_type: r.pix_key_type, requested_at: r.requested_at,
        group: sellerRole ? "seller" : "student_referrer",
        sellerRole,
      };
    });
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
