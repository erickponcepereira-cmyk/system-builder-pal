import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type DownlineCoach = {
  coach_id: string;
  name: string;
  email: string;
  level: 1 | 2 | 3;
  upline_coach_id: string | null;
  students: number;
  child_coaches: number;
  orders: number;
  revenue: number;
  my_commission: number;
};

export type DownlineReport = {
  range: { from: string; to: string };
  totals: {
    coaches: number;
    students: number;
    revenue: number;
    commission: number;
  };
  byLevel: {
    level: 1 | 2 | 3;
    coaches: number;
    students: number;
    revenue: number;
    commission: number;
    top: DownlineCoach[]; // top 5 by revenue
  }[];
  coaches: DownlineCoach[];
};

async function resolveCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

function empty(from: string, to: string): DownlineReport {
  return {
    range: { from, to },
    totals: { coaches: 0, students: 0, revenue: 0, commission: 0 },
    byLevel: [1, 2, 3].map((l) => ({ level: l as 1 | 2 | 3, coaches: 0, students: 0, revenue: 0, commission: 0, top: [] })),
    coaches: [],
  };
}

export const getCoachDownlineReport = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { from: string; to: string }) => d)
  .handler(async ({ data, context }): Promise<DownlineReport> => {
    const myCoachId = await resolveCoachId(context.userId);
    if (!myCoachId) return empty(data.from, data.to);

    const fromIso = new Date(data.from + "T00:00:00").toISOString();
    const toIso = new Date(data.to + "T23:59:59").toISOString();

    // Load all coaches once (small table) to traverse downline
    const { data: allCoaches } = await supabaseAdmin
      .from("coaches")
      .select("id, profile_id, upline_coach_id, profiles!coaches_profile_id_fkey(name,email)");
    type CR = { id: string; profile_id: string; upline_coach_id: string | null; profiles: { name: string; email: string } | null };
    const coaches = (allCoaches as unknown as CR[]) || [];
    const byUpline = new Map<string, CR[]>();
    coaches.forEach((c) => {
      const k = c.upline_coach_id || "__root__";
      const arr = byUpline.get(k) || [];
      arr.push(c);
      byUpline.set(k, arr);
    });

    // BFS levels 1..3
    const levelMap = new Map<string, 1 | 2 | 3>();
    const ordered: { c: CR; level: 1 | 2 | 3 }[] = [];
    const l1 = byUpline.get(myCoachId) || [];
    l1.forEach((c) => { levelMap.set(c.id, 1); ordered.push({ c, level: 1 }); });
    const l2: CR[] = [];
    l1.forEach((p) => (byUpline.get(p.id) || []).forEach((c) => { levelMap.set(c.id, 2); ordered.push({ c, level: 2 }); l2.push(c); }));
    l2.forEach((p) => (byUpline.get(p.id) || []).forEach((c) => { levelMap.set(c.id, 3); ordered.push({ c, level: 3 }); }));

    if (ordered.length === 0) return empty(data.from, data.to);

    const downlineIds = ordered.map((o) => o.c.id);

    // Students for all downline coaches
    const { data: studentRows } = await supabaseAdmin
      .from("students")
      .select("id, coach_id")
      .in("coach_id", downlineIds);
    type SR = { id: string; coach_id: string };
    const students = (studentRows as SR[] | null) || [];
    const studentsByCoach = new Map<string, string[]>();
    students.forEach((s) => {
      const arr = studentsByCoach.get(s.coach_id) || [];
      arr.push(s.id);
      studentsByCoach.set(s.coach_id, arr);
    });
    const studentToCoach = new Map(students.map((s) => [s.id, s.coach_id]));
    const allStudentIds = students.map((s) => s.id);

    // Paid transactions for these students in range
    const txMap = new Map<string, { revenue: number; orders: number }>();
    if (allStudentIds.length) {
      const { data: txs } = await supabaseAdmin
        .from("transactions")
        .select("student_id, gross_amount")
        .in("student_id", allStudentIds)
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .gte("paid_at", fromIso)
        .lte("paid_at", toIso);
      ((txs as { student_id: string; gross_amount: number }[] | null) || []).forEach((t) => {
        const coachId = studentToCoach.get(t.student_id);
        if (!coachId) return;
        const cur = txMap.get(coachId) || { revenue: 0, orders: 0 };
        cur.revenue += Number(t.gross_amount) || 0;
        cur.orders += 1;
        txMap.set(coachId, cur);
      });

      const { data: orders } = await supabaseAdmin
        .from("store_orders")
        .select("student_id, total_amount")
        .in("student_id", allStudentIds)
        .eq("status", "paid")
        .gte("updated_at", fromIso)
        .lte("updated_at", toIso);
      ((orders as { student_id: string; total_amount: number }[] | null) || []).forEach((o) => {
        const coachId = studentToCoach.get(o.student_id);
        if (!coachId) return;
        const cur = txMap.get(coachId) || { revenue: 0, orders: 0 };
        cur.revenue += Number(o.total_amount) || 0;
        cur.orders += 1;
        txMap.set(coachId, cur);
      });
    }

    // My commissions from these downline coaches in range
    const commByCoach = new Map<string, number>();
    const { data: comms } = await supabaseAdmin
      .from("commissions")
      .select("amount, level, transaction_id, transactions!commissions_transaction_id_fkey(student_id, paid_at, status)")
      .eq("beneficiary_coach_id", myCoachId)
      .in("level", [1, 2, 3]);
    type Comm = { amount: number; level: number; transaction_id: string; transactions: { student_id: string; paid_at: string | null; status: string } | null };
    ((comms as unknown as Comm[] | null) || []).forEach((c) => {
      const t = c.transactions;
      if (!t || t.status !== "paid" || !t.paid_at) return;
      if (t.paid_at < fromIso || t.paid_at > toIso) return;
      const coachId = studentToCoach.get(t.student_id);
      if (!coachId) return;
      commByCoach.set(coachId, (commByCoach.get(coachId) || 0) + (Number(c.amount) || 0));
    });

    // Child coach count map (limited to within our downline scope counts all children regardless of depth)
    const childCount = new Map<string, number>();
    coaches.forEach((c) => {
      if (c.upline_coach_id) childCount.set(c.upline_coach_id, (childCount.get(c.upline_coach_id) || 0) + 1);
    });

    const detail: DownlineCoach[] = ordered.map(({ c, level }) => {
      const tx = txMap.get(c.id) || { revenue: 0, orders: 0 };
      return {
        coach_id: c.id,
        name: c.profiles?.name || "Coach",
        email: c.profiles?.email || "",
        level,
        upline_coach_id: c.upline_coach_id,
        students: (studentsByCoach.get(c.id) || []).length,
        child_coaches: childCount.get(c.id) || 0,
        orders: tx.orders,
        revenue: tx.revenue,
        my_commission: commByCoach.get(c.id) || 0,
      };
    });

    const byLevel = ([1, 2, 3] as const).map((lv) => {
      const items = detail.filter((d) => d.level === lv);
      return {
        level: lv,
        coaches: items.length,
        students: items.reduce((s, x) => s + x.students, 0),
        revenue: items.reduce((s, x) => s + x.revenue, 0),
        commission: items.reduce((s, x) => s + x.my_commission, 0),
        top: [...items].sort((a, b) => b.revenue - a.revenue).slice(0, 5),
      };
    });

    return {
      range: { from: data.from, to: data.to },
      totals: {
        coaches: detail.length,
        students: detail.reduce((s, x) => s + x.students, 0),
        revenue: detail.reduce((s, x) => s + x.revenue, 0),
        commission: detail.reduce((s, x) => s + x.my_commission, 0),
      },
      byLevel,
      coaches: detail.sort((a, b) => a.level - b.level || b.revenue - a.revenue),
    };
  });
