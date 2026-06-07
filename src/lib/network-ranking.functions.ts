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
export type NetworkRankPatent = { key: string; name: string; color: string | null; icon: string | null; level: number } | null;

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
  patent: NetworkRankPatent;
  categories: string[];
  sponsorName?: string | null;
  isYou?: boolean;
};

export type CoachTreeNode = {
  coachId: string;
  studentId: string | null;
  name: string;
  email: string;
  level: number;
  directStudents: StudentBreakdown;
  childCoaches: number;
  individualRevenue: number;
  medal: NetworkRankMedal;
  patent: NetworkRankPatent;
  categories: string[];
  classifications: string[];
  children: CoachTreeNode[];
};

export type MyNetworkStructure = {
  me: { coachId: string; name: string; email: string; directStudents: StudentBreakdown; childCoaches: number; patent: NetworkRankPatent; medal: NetworkRankMedal; categories: string[]; classifications: string[]; individualRevenue: number } | null;
  upline: { coachId: string; name: string; email: string; directStudents: StudentBreakdown; childCoaches: number; patent: NetworkRankPatent; medal: NetworkRankMedal; categories: string[]; classifications: string[]; individualRevenue: number } | null;
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
  // Defensive: allow duplicate coach rows (legacy data) without throwing
  const { data: coaches } = await supabaseAdmin
    .from("coaches")
    .select("id, created_at")
    .eq("profile_id", profile.id)
    .order("created_at", { ascending: true })
    .limit(1);
  const coachId = Array.isArray(coaches) && coaches.length > 0 ? coaches[0].id : null;
  return { profileId: profile.id as string, coachId: (coachId as string | null), role: profile.role as string | null };
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
  const [{ data: coachesRaw }, { data: studentsRaw }, { data: partnersRaw }, { data: mastersRaw }, { data: masterBadgesRaw }, { data: specsRaw }] = await Promise.all([
    supabaseAdmin.from("coaches").select("id,profile_id,upline_coach_id,is_professional,specialty_key,herbalife_portal_url,profiles!coaches_profile_id_fkey(name,email)"),
    supabaseAdmin.from("students").select("id,coach_id,profile_id"),
    supabaseAdmin.from("partners").select("profile_id"),
    supabaseAdmin.from("master_coaches").select("coach_id,status"),
    supabaseAdmin.from("coach_badges").select("coach_id").eq("badge_key", "master_coach"),
    supabaseAdmin.from("professional_specialties").select("key,label"),
  ]);
  const coaches = ((coachesRaw as Array<CoachRow & { specialty_key?: string | null; herbalife_portal_url?: string | null }> | null) || []).filter((c) => !!c.id);
  const students = ((studentsRaw as StudentRow[] | null) || []).filter((s) => !!s.coach_id);
  const coachProfileIds = new Set(coaches.map((c) => c.profile_id));
  const professionalProfileIds = new Set(coaches.filter((c) => !!c.is_professional).map((c) => c.profile_id));
  const partnerProfileIds = new Set(((partnersRaw as Array<{ profile_id: string }> | null) || []).map((p) => p.profile_id));
  const studentProfileIds = new Set(students.map((s) => s.profile_id));
  const masterCoachIds = new Set<string>();
  ((mastersRaw as Array<{ coach_id: string; status: string | null }> | null) || []).filter((m) => (m.status || "active") === "active").forEach((m) => masterCoachIds.add(m.coach_id));
  ((masterBadgesRaw as Array<{ coach_id: string }> | null) || []).forEach((b) => masterCoachIds.add(b.coach_id));
  const specialtyLabels = new Map<string, string>();
  ((specsRaw as Array<{ key: string; label: string }> | null) || []).forEach((s) => specialtyLabels.set(s.key, s.label));
  return { coaches, students, coachProfileIds, professionalProfileIds, partnerProfileIds, studentProfileIds, masterCoachIds, specialtyLabels };
}

function categoriesForCoach(
  coach: CoachRow & { specialty_key?: string | null; herbalife_portal_url?: string | null },
  partnerProfileIds: Set<string>,
  masterCoachIds: Set<string>,
  specialtyLabels: Map<string, string>,
): string[] {
  const cats: string[] = [];
  if (masterCoachIds.has(coach.id)) cats.push("Master Coach");
  if (coach.specialty_key) {
    const label = specialtyLabels.get(coach.specialty_key);
    if (label) cats.push(label);
  }
  if (coach.herbalife_portal_url && coach.herbalife_portal_url.trim()) cats.push("Coach HBL");
  if (partnerProfileIds.has(coach.profile_id)) cats.push("Parceiro");
  return cats;
}

function classificationsForCoach(
  coach: CoachRow,
  partnerProfileIds: Set<string>,
  studentProfileIds: Set<string>,
): string[] {
  const out: string[] = [];
  if (coach.is_professional) out.push("Profissional");
  else out.push("Aluno Coach");
  if (partnerProfileIds.has(coach.profile_id)) out.push("Parceiro");
  if (studentProfileIds.has(coach.profile_id)) out.push("Aluno");
  return out;
}



type PatentRule = {
  key: string;
  display_name: string;
  badge_color: string | null;
  badge_icon: string | null;
  required_revenue: number;
  time_window_months: number;
  min_own_sales_pct: number;
  vp_max_pct: number | null;
  level: number;
};

async function loadPatentRules(supabaseAdmin: any): Promise<PatentRule[]> {
  const { data } = await supabaseAdmin
    .from("patent_rules")
    .select("key,display_name,badge_color,badge_icon,required_revenue,time_window_months,min_own_sales_pct,vp_max_pct,level,is_active")
    .eq("is_active", true)
    .not("key", "is", null)
    .order("level", { ascending: true });
  return ((data as any[] | null) || []).map((r) => ({
    key: r.key,
    display_name: r.display_name,
    badge_color: r.badge_color,
    badge_icon: r.badge_icon,
    required_revenue: Number(r.required_revenue) || 0,
    time_window_months: Number(r.time_window_months) || 1,
    min_own_sales_pct: Number(r.min_own_sales_pct) || 0,
    vp_max_pct: r.vp_max_pct == null ? null : Number(r.vp_max_pct),
    level: Number(r.level) || 0,
  }));
}

function monthsAgoDate(months: number): string {
  const d = new Date();
  d.setMonth(d.getMonth() - months);
  return d.toISOString().slice(0, 10);
}

function todayDate(): string { return new Date().toISOString().slice(0, 10); }

function descendantsOf(coachId: string, byUpline: Map<string, CoachRow[]>): string[] {
  const out: string[] = [];
  const seen = new Set<string>([coachId]);
  const q = (byUpline.get(coachId) || []).map((c) => c.id);
  while (q.length) {
    const id = q.shift()!;
    if (seen.has(id)) continue;
    seen.add(id);
    out.push(id);
    (byUpline.get(id) || []).forEach((c) => q.push(c.id));
  }
  return out;
}

function patentForCoach(
  coachId: string,
  patents: PatentRule[],
  windowsRevenueByCoach: Map<number, Map<string, number>>,
  byUpline: Map<string, CoachRow[]>,
): NetworkRankPatent {
  let current: PatentRule | null = null;
  const descIds = descendantsOf(coachId, byUpline);
  for (const p of patents) {
    const rev = windowsRevenueByCoach.get(p.time_window_months);
    if (!rev) continue;
    const own = rev.get(coachId) || 0;
    const team = descIds.reduce((s, id) => s + (rev.get(id) || 0), 0);
    if (p.required_revenue === 0) { current = p; continue; }
    const vpMax = p.vp_max_pct != null ? p.vp_max_pct : p.min_own_sales_pct;
    const cap = (p.required_revenue * (vpMax || 100)) / 100;
    const cappedOwn = Math.min(own, cap);
    const qualifying = cappedOwn + team;
    if (qualifying >= p.required_revenue) current = p; else break;
  }
  if (!current) return null;
  return { key: current.key, name: current.display_name, color: current.badge_color, icon: current.badge_icon, level: current.level };
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

async function loadMedalRules(supabaseAdmin: any, kind: "monthly" | "cumulative" = "monthly") {
  const { data } = await supabaseAdmin
    .from("career_medal_rules")
    .select("key,display_name,threshold,icon,sort_order,kind,is_active")
    .eq("is_active", true)
    .order("threshold", { ascending: true });
  const rows = ((data as Array<{ key: string; display_name: string; threshold: number; icon: string | null; kind: string | null }> | null) || [])
    .filter((r) => (kind === "monthly" ? (!r.kind || r.kind === "monthly") : r.kind === "cumulative"))
    .map((r) => ({ key: r.key, name: r.display_name, icon: r.icon, threshold: Number(r.threshold) || 0 }));
  return rows;
}


function medalFor(value: number, rules: Array<{ key: string; name: string; icon: string | null; threshold: number }>) {
  let medal: NetworkRankMedal = null;
  for (const r of rules) if (value >= r.threshold) medal = r;
  return medal;
}

function firstOfMonthDate() { const d = new Date(); d.setDate(1); return d.toISOString().slice(0, 10); }

export const getMyNetworkStructure = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<MyNetworkStructure> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { coachId } = await resolveProfileAndCoach(supabaseAdmin, context.userId);
    if (!coachId) return { me: null, upline: null, totals: { downlineCoaches: 0, directStudents: emptyBreakdown() }, children: [] };
    const { coaches, students, coachProfileIds, professionalProfileIds, partnerProfileIds, studentProfileIds, masterCoachIds, specialtyLabels } = await loadBase(supabaseAdmin);
    const byUpline = buildByUpline(coaches);
    const byId = new Map(coaches.map((c) => [c.id, c]));
    const studentsByCoach = new Map<string, StudentRow[]>();
    students.forEach((s) => {
      const arr = studentsByCoach.get(s.coach_id) || [];
      arr.push(s);
      studentsByCoach.set(s.coach_id, arr);
    });
    const breakdown = (id: string) => breakdownForCoach(id, studentsByCoach, coachProfileIds, professionalProfileIds, partnerProfileIds);

    const me = byId.get(coachId) || null;
    const downline = collectDownline(coachId, byUpline, me);
    const allIds = downline.map((d) => d.coach.id);
    if (me?.upline_coach_id && byId.has(me.upline_coach_id)) allIds.push(me.upline_coach_id);
    const lifetimeRevenue = await loadRevenueByCoach(supabaseAdmin, allIds, "2000-01-01", todayDate());
    const medalRules = await loadMedalRules(supabaseAdmin, "cumulative");
    const patentRules = await loadPatentRules(supabaseAdmin);
    const distinctWindows = Array.from(new Set(patentRules.map((p) => p.time_window_months))).filter((m) => m > 0);
    const windowsRevenueByCoach = new Map<number, Map<string, number>>();
    const today = todayDate();
    await Promise.all(distinctWindows.map(async (months) => {
      const rev = await loadRevenueByCoach(supabaseAdmin, allIds, monthsAgoDate(months), today);
      windowsRevenueByCoach.set(months, rev);
    }));

    const profileToStudent = new Map<string, string>();
    students.forEach((s) => { if (!profileToStudent.has(s.profile_id)) profileToStudent.set(s.profile_id, s.id); });

    const enrich = (c: CoachRow) => {
      const own = lifetimeRevenue.get(c.id) || 0;
      return {
        coachId: c.id,
        studentId: profileToStudent.get(c.profile_id) ?? null,
        name: coachName(c),
        email: coachEmail(c),
        directStudents: breakdown(c.id),
        childCoaches: (byUpline.get(c.id) || []).length,
        individualRevenue: own,
        medal: medalFor(own, medalRules),
        patent: patentForCoach(c.id, patentRules, windowsRevenueByCoach, byUpline),
        categories: categoriesForCoach(c as any, partnerProfileIds, masterCoachIds, specialtyLabels),
        classifications: classificationsForCoach(c, partnerProfileIds, studentProfileIds),
      };
    };
    const seenTree = new Set<string>([coachId]);
    const toNode = (c: CoachRow, level: number): CoachTreeNode => {
      seenTree.add(c.id);
      const children = (byUpline.get(c.id) || []).filter((child) => !seenTree.has(child.id));
      return {
        ...enrich(c),
        level,
        children: children.map((child) => toNode(child, level + 1)),
      };
    };

    const totalDirect = emptyBreakdown();
    addBreakdown(totalDirect, breakdown(coachId));
    return {
      me: me ? enrich(me) : null,
      upline: me?.upline_coach_id && byId.has(me.upline_coach_id) ? enrich(byId.get(me.upline_coach_id)!) : null,
      totals: { downlineCoaches: downline.length - 1, directStudents: totalDirect },
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
    const { coaches, students, partnerProfileIds, masterCoachIds, specialtyLabels } = await loadBase(supabaseAdmin);
    const byUpline = buildByUpline(coaches);
    const byId = new Map(coaches.map((c) => [c.id, c]));
    const me = byId.get(coachId);
    const rankingCoaches = collectDownline(coachId, byUpline, me || null);
    const ids = rankingCoaches.map((r) => r.coach.id);
    const revenue = await loadRevenueByCoach(supabaseAdmin, ids, data.from, data.to);
    const medalRules = await loadMedalRules(supabaseAdmin);
    const patentRules = await loadPatentRules(supabaseAdmin);
    const distinctWindows = Array.from(new Set(patentRules.map((p) => p.time_window_months))).filter((m) => m > 0);
    const windowsRevenueByCoach = new Map<number, Map<string, number>>();
    const today = todayDate();
    await Promise.all(distinctWindows.map(async (months) => {
      const rev = await loadRevenueByCoach(supabaseAdmin, ids, monthsAgoDate(months), today);
      windowsRevenueByCoach.set(months, rev);
    }));
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
        patent: patentForCoach(coach.id, patentRules, windowsRevenueByCoach, byUpline),
        categories: categoriesForCoach(coach as any, partnerProfileIds, masterCoachIds, specialtyLabels),
        sponsorName: level >= 2 && coach.upline_coach_id && byId.has(coach.upline_coach_id) ? coachName(byId.get(coach.upline_coach_id)!) : null,
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
        patent: null,
        categories: [],
        sponsorName: level >= 2 && coach.upline_coach_id && byId.has(coach.upline_coach_id) ? coachName(byId.get(coach.upline_coach_id)!) : null,
      }))
      .sort((a, b) => (b.individualRevenue + b.networkRevenue) - (a.individualRevenue + a.networkRevenue) || b.individualRevenue - a.individualRevenue || a.name.localeCompare(b.name));
  });