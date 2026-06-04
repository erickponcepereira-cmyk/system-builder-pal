import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { z } from "zod";

type CoachRow = {
  id: string;
  profile_id: string;
  upline_coach_id: string | null;
  is_professional?: boolean | null;
  profiles?: { name: string | null; email: string | null } | null;
};

type StudentRow = { id: string; coach_id: string; profile_id: string };

export type StudentBreakdown = {
  total: number;
  studentOnly: number;
  coachStudent: number;
  professionalStudent: number;
  partnerStudent: number;
};

export type NetworkRankMedal = { key: string; name: string; icon: string | null; threshold: number } | null;

export type NetworkRankingRow = {
  coachId: string;
  name: string;
  email: string;
  level: number;
  directStudents: number;
  downlineCoaches: number;
  individualRevenue: number;
  networkRevenue: number;
  medal: NetworkRankMedal;
  isYou?: boolean;
};

export type CoachTreeNode = {
  coachId: string;
  name: string;
  email: string;
  level: number;
  directStudents: StudentBreakdown;
  childCoaches: number;
  children: CoachTreeNode[];
};

export type MyNetworkStructure = {
  me: { coachId: string; name: string; email: string; directStudents: StudentBreakdown; childCoaches: number } | null;
  upline: { coachId: string; name: string; email: string; directStudents: StudentBreakdown; childCoaches: number } | null;
  totals: { downlineCoaches: number; directStudents: StudentBreakdown };
  children: CoachTreeNode[];
};

const DateRangeSchema = z.object({
  from: z.string().min(10).max(10),
  to: z.string().min(10).max(10),
});

const AdminRankingSchema = DateRangeSchema.extend({
  rootCoachId: z.string().uuid().nullable().optional(),
});

const emptyBreakdown = (): StudentBreakdown => ({ total: 0, studentOnly: 0, coachStudent: 0, professionalStudent: 0, partnerStudent: 0 });

function coachName(c: CoachRow) {
  return c.profiles?.name || "Coach";
}

function coachEmail(c: CoachRow) {
  return c.profiles?.email || "";
}

async function resolveProfileAndCoach(supabaseAdmin: any, userId: string) {
  const { data: profile } = await supabaseAdmin.from("profiles").select("id, role").eq("user_id", userId).maybeSingle();
  if (!profile?.id) return { profileId: null, coachId: null, role: null };
  const { data: coach } = await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return { profileId: profile.id as string, coachId: (coach?.id as string | undefined) ?? null, role: profile.role as string | null };
}

function buildByUpline(coaches: CoachRow[]) {
  const byUpline = new Map<string, CoachRow[]>();
  coaches.forEach((c) => {
    const key = c.upline_coach_id || "__root__";
    const arr = byUpline.get(key) || [];
    arr.push(c);
    byUpline.set(key, arr);
  });
  byUpline.forEach((arr) => arr.sort((a, b) => coachName(a).localeCompare(coachName(b))));
  return byUpline;
}

function collectDownline(rootCoachId: string, byUpline: Map<string, CoachRow[]>, includeSelf: CoachRow | null = null) {
  const rows: Array<{ coach: CoachRow; level: number }> = [];
  const seen = new Set<string>();
  if (includeSelf) {
    rows.push({ coach: includeSelf, level: 0 });
    seen.add(includeSelf.id);
  }
  const queue = (byUpline.get(rootCoachId) || []).map((coach) => ({ coach, level: 1 }));
  while (queue.length) {
    const item = queue.shift()!;
    if (seen.has(item.coach.id)) continue;
    seen.add(item.coach.id);
    rows.push(item);
    (byUpline.get(item.coach.id) || []).forEach((child) => queue.push({ coach: child, level: item.level + 1 }));
  }
  return rows;
}

async function loadBase(supabaseAdmin: any) {
  const [{ data: coachesRaw }, { data: studentsRaw }, { data: partnersRaw }] = await Promise.all([
    supabaseAdmin.from("coaches").select("id,profile_id,upline_coach_id,is_professional,profiles!coaches_profile_id_fkey(name,email)"),
    supabaseAdmin.from("students").select("id,coach_id,profile_id"),
    supabaseAdmin.from("partners").select("profile_id"),
  ]);
  const coaches = ((coachesRaw as CoachRow[] | null) || []).filter((c) => !!c.id);
  const students = ((studentsRaw as StudentRow[] | null) || []).filter((s) => !!s.coach_id);
  const coachProfileIds = new Set(coaches.map((c) => c.profile_id));
  const professionalProfileIds = new Set(coaches.filter((c) => !!c.is_professional).map((c) => c.profile_id));
  const partnerProfileIds = new Set(((partnersRaw as Array<{ profile_id: string }> | null) || []).map((p) => p.profile_id));
  return { coaches, students, coachProfileIds, professionalProfileIds, partnerProfileIds };
}

function breakdownForCoach(
  coachId: string,
  studentsByCoach: Map<string, StudentRow[]>,
  coachProfileIds: Set<string>,
  professionalProfileIds: Set<string>,
  partnerProfileIds: Set<string>,
) {
  const b = emptyBreakdown();
  (studentsByCoach.get(coachId) || []).forEach((s) => {
    b.total += 1;
    if (professionalProfileIds.has(s.profile_id)) b.professionalStudent += 1;
    else if (partnerProfileIds.has(s.profile_id)) b.partnerStudent += 1;
    else if (coachProfileIds.has(s.profile_id)) b.coachStudent += 1;
    else b.studentOnly += 1;
  });
  return b;
}

function addBreakdown(a: StudentBreakdown, b: StudentBreakdown) {
  a.total += b.total;
  a.studentOnly += b.studentOnly;
  a.coachStudent += b.coachStudent;
  a.professionalStudent += b.professionalStudent;
  a.partnerStudent += b.partnerStudent;
}

async function loadRevenueByCoach(supabaseAdmin: any, coachIds: string[], from: string, to: string) {
  const revenue = new Map<string, number>();
  coachIds.forEach((id) => revenue.set(id, 0));
  if (!coachIds.length) return revenue;
  const fromIso = new Date(`${from}T00:00:00`).toISOString();
  const toIso = new Date(`${to}T23:59:59`).toISOString();
  const { data: studentsRaw } = await supabaseAdmin.from("students").select("id,coach_id").in("coach_id", coachIds);
  const students = ((studentsRaw as Array<{ id: string; coach_id: string }> | null) || []);
  const studentToCoach = new Map(students.map((s) => [s.id, s.coach_id]));
  const studentIds = students.map((s) => s.id);
  if (!studentIds.length) return revenue;
  const [txRes, storeRes, partnerRes] = await Promise.all([
    supabaseAdmin.from("transactions").select("student_id,gross_amount").in("student_id", studentIds).eq("status", "paid").not("paid_at", "is", null).gte("paid_at", fromIso).lte("paid_at", toIso),
    supabaseAdmin.from("store_orders").select("student_id,total_amount").in("student_id", studentIds).eq("status", "paid").gte("updated_at", fromIso).lte("updated_at", toIso),
    supabaseAdmin.from("partner_product_orders").select("student_id,gross_amount").in("student_id", studentIds).eq("status", "paid").gte("paid_at", fromIso).lte("paid_at", toIso),
  ]);
  const add = (studentId: string, amount: number) => {
    const coachId = studentToCoach.get(studentId);
    if (!coachId) return;
    revenue.set(coachId, (revenue.get(coachId) || 0) + (Number(amount) || 0));
  };
  ((txRes.data as Array<{ student_id: string; gross_amount: number }> | null) || []).forEach((r) => add(r.student_id, r.gross_amount));
  ((storeRes.data as Array<{ student_id: string; total_amount: number }> | null) || []).forEach((r) => add(r.student_id, r.total_amount));
  ((partnerRes.data as Array<{ student_id: string; gross_amount: number }> | null) || []).forEach((r) => add(r.student_id, r.gross_amount));
  return revenue;
}

async function loadMedalRules(supabaseAdmin: any) {
  const { data } = await supabaseAdmin
    .from("career_medal_rules")
    .select("key,display_name,threshold,icon,sort_order,kind,is_active")
    .eq("is_active", true)
    .order("threshold", { ascending: true });
  const rows = ((data as Array<{ key: string; display_name: string; threshold: number; icon: string | null; kind: string | null }> | null) || [])
    .filter((r) => !r.kind || r.kind === "monthly")
    .map((r) => ({ key: r.key, name: r.display_name, icon: r.icon, threshold: Number(r.threshold) || 0 }));
  return rows;
}

function medalFor(value: number, rules: Array<{ key: string; name: string; icon: string | null; threshold: number }>) {
  let medal: NetworkRankMedal = null;
  for (const r of rules) if (value >= r.threshold) medal = r;
  return medal;
}

export const getMyNetworkStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyNetworkStructure> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { coachId } = await resolveProfileAndCoach(supabaseAdmin, context.userId);
    if (!coachId) return { me: null, upline: null, totals: { downlineCoaches: 0, directStudents: emptyBreakdown() }, children: [] };
    const { coaches, students, coachProfileIds, professionalProfileIds, partnerProfileIds } = await loadBase(supabaseAdmin);
    const byUpline = buildByUpline(coaches);
    const byId = new Map(coaches.map((c) => [c.id, c]));
    const studentsByCoach = new Map<string, StudentRow[]>();
    students.forEach((s) => {
      const arr = studentsByCoach.get(s.coach_id) || [];
      arr.push(s);
      studentsByCoach.set(s.coach_id, arr);
    });
    const breakdown = (id: string) => breakdownForCoach(id, studentsByCoach, coachProfileIds, professionalProfileIds, partnerProfileIds);
    const toSummary = (c: CoachRow | undefined | null) => c ? { coachId: c.id, name: coachName(c), email: coachEmail(c), directStudents: breakdown(c.id), childCoaches: (byUpline.get(c.id) || []).length } : null;
    const toNode = (c: CoachRow, level: number): CoachTreeNode => ({
      coachId: c.id,
      name: coachName(c),
      email: coachEmail(c),
      level,
      directStudents: breakdown(c.id),
      childCoaches: (byUpline.get(c.id) || []).length,
      children: (byUpline.get(c.id) || []).map((child) => toNode(child, level + 1)),
    });
    const me = byId.get(coachId) || null;
    const downline = collectDownline(coachId, byUpline);
    const totalDirect = emptyBreakdown();
    addBreakdown(totalDirect, breakdown(coachId));
    return {
      me: toSummary(me),
      upline: toSummary(me?.upline_coach_id ? byId.get(me.upline_coach_id) : null),
      totals: { downlineCoaches: downline.length, directStudents: totalDirect },
      children: (byUpline.get(coachId) || []).map((child) => toNode(child, 1)),
    };
  });

export const getMyNetworkRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => DateRangeSchema.parse(input))
  .handler(async ({ data, context }): Promise<NetworkRankingRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { coachId } = await resolveProfileAndCoach(supabaseAdmin, context.userId);
    if (!coachId) return [];
    const { coaches, students } = await loadBase(supabaseAdmin);
    const byUpline = buildByUpline(coaches);
    const byId = new Map(coaches.map((c) => [c.id, c]));
    const me = byId.get(coachId);
    const rankingCoaches = collectDownline(coachId, byUpline, me || null);
    const ids = rankingCoaches.map((r) => r.coach.id);
    const revenue = await loadRevenueByCoach(supabaseAdmin, ids, data.from, data.to);
    const medalRules = await loadMedalRules(supabaseAdmin);
    const studentsByCoach = new Map<string, number>();
    students.forEach((s) => studentsByCoach.set(s.coach_id, (studentsByCoach.get(s.coach_id) || 0) + 1));
    return rankingCoaches
      .map(({ coach, level }) => ({
        coachId: coach.id,
        name: coachName(coach),
        email: coachEmail(coach),
        level,
        directStudents: studentsByCoach.get(coach.id) || 0,
        downlineCoaches: collectDownline(coach.id, byUpline).length,
        individualRevenue: revenue.get(coach.id) || 0,
        networkRevenue: 0,
        medal: medalFor(revenue.get(coach.id) || 0, medalRules),
        isYou: coach.id === coachId,
      }))
      .sort((a, b) => b.individualRevenue - a.individualRevenue || a.level - b.level || a.name.localeCompare(b.name));
  });

export const getAdminNetworkRankingFilters = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Array<{ id: string; name: string; email: string }>> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { role } = await resolveProfileAndCoach(supabaseAdmin, context.userId);
    if (role !== "admin") throw new Error("Acesso negado");
    const { data } = await supabaseAdmin.from("coaches").select("id,profiles!coaches_profile_id_fkey(name,email)").not("approved_at", "is", null).is("blocked_at", null).order("created_at", { ascending: false });
    return ((data as Array<{ id: string; profiles: { name: string | null; email: string | null } | null }> | null) || [])
      .map((c) => ({ id: c.id, name: c.profiles?.name || "Coach", email: c.profiles?.email || "" }))
      .sort((a, b) => a.name.localeCompare(b.name));
  });

export const getAdminNetworkRanking = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input: unknown) => AdminRankingSchema.parse(input))
  .handler(async ({ data, context }): Promise<NetworkRankingRow[]> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { role } = await resolveProfileAndCoach(supabaseAdmin, context.userId);
    if (role !== "admin") throw new Error("Acesso negado");
    const { coaches, students } = await loadBase(supabaseAdmin);
    const byUpline = buildByUpline(coaches);
    const byId = new Map(coaches.map((c) => [c.id, c]));
    const scope = data.rootCoachId && byId.has(data.rootCoachId)
      ? collectDownline(data.rootCoachId, byUpline, byId.get(data.rootCoachId) || null)
      : coaches.map((coach) => ({ coach, level: 0 }));
    const ids = scope.map((r) => r.coach.id);
    const revenue = await loadRevenueByCoach(supabaseAdmin, ids, data.from, data.to);
    const studentsByCoach = new Map<string, number>();
    students.forEach((s) => studentsByCoach.set(s.coach_id, (studentsByCoach.get(s.coach_id) || 0) + 1));
    const memo = new Map<string, number>();
    const networkRevenue = (coachId: string): number => {
      if (memo.has(coachId)) return memo.get(coachId)!;
      const total = (byUpline.get(coachId) || []).reduce((sum, child) => sum + (revenue.get(child.id) || 0) + networkRevenue(child.id), 0);
      memo.set(coachId, total);
      return total;
    };
    return scope
      .map(({ coach, level }) => ({
        coachId: coach.id,
        name: coachName(coach),
        email: coachEmail(coach),
        level,
        directStudents: studentsByCoach.get(coach.id) || 0,
        downlineCoaches: collectDownline(coach.id, byUpline).length,
        individualRevenue: revenue.get(coach.id) || 0,
        networkRevenue: networkRevenue(coach.id),
        medal: null,
      }))
      .sort((a, b) => (b.individualRevenue + b.networkRevenue) - (a.individualRevenue + a.networkRevenue) || b.individualRevenue - a.individualRevenue || a.name.localeCompare(b.name));
  });