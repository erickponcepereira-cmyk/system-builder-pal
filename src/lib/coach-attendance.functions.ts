import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type CoachStudentAttendance = {
  id: string;
  name: string;
  email: string;
  phone: string | null;
  user_id: string | null;
  last_sign_in_at: string | null;
  last_checkin_at: string | null;
  last_checkin_source: "app" | "freebie" | null;
  last_purchase_at: string | null;
  checkins_7d: number;
  checkins_prev_7d: number;
  checkins_30d: number;
  status: "active" | "watch" | "inactive_7" | "inactive_15" | "inactive_30";
  trend: "rising" | "stable" | "dropping";
  days_since_activity: number | null;
};

export const getCoachAttendance = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    // Resolve coach
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return [] as CoachStudentAttendance[];

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!coach) return [] as CoachStudentAttendance[];

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, profiles!students_profile_id_fkey(name,email,phone,user_id)")
      .eq("coach_id", coach.id);

    type StudentRow = {
      id: string;
      profile_id: string;
      profiles: { name: string; email: string; phone: string | null; user_id: string } | null;
    };
    const studentRows = (students as unknown as StudentRow[]) || [];
    if (studentRows.length === 0) return [] as CoachStudentAttendance[];

    const studentIds = studentRows.map((s) => s.id);
    const userIds = studentRows.map((s) => s.profiles?.user_id).filter(Boolean) as string[];

    const now = Date.now();
    const d7 = new Date(now - 7 * 86400000).toISOString();
    const d14 = new Date(now - 14 * 86400000).toISOString();
    const d30 = new Date(now - 30 * 86400000).toISOString();
    const date7 = d7.slice(0, 10);
    const date14 = d14.slice(0, 10);
    const date30 = d30.slice(0, 10);

    const [{ data: logs }, { data: visits }, { data: txs }, { data: storeOrders }] = await Promise.all([
      supabaseAdmin
        .from("attendance_logs")
        .select("student_id, log_date, attended")
        .in("student_id", studentIds)
        .gte("log_date", date30),
      supabaseAdmin
        .from("partner_visits")
        .select("student_id, visited_at")
        .in("student_id", studentIds)
        .gte("visited_at", d30),
      supabaseAdmin
        .from("transactions")
        .select("student_id, paid_at, status")
        .in("student_id", studentIds)
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false }),
      supabaseAdmin
        .from("store_orders")
        .select("student_id, updated_at, created_at, status")
        .in("student_id", studentIds)
        .eq("status", "paid")
        .order("updated_at", { ascending: false }),
    ]);

    // last sign-ins via auth admin (paginate users we need)
    const lastSignInMap: Record<string, string | null> = {};
    if (userIds.length) {
      // Fetch in batches via listUsers (max 200 per page); cap at first page since rosters usually small.
      // For large rosters, paginate.
      let page = 1;
      const perPage = 200;
      const wanted = new Set(userIds);
      while (wanted.size > 0) {
        const { data, error } = await supabaseAdmin.auth.admin.listUsers({ page, perPage });
        if (error || !data?.users?.length) break;
        for (const u of data.users) {
          if (wanted.has(u.id)) {
            lastSignInMap[u.id] = u.last_sign_in_at ?? null;
            wanted.delete(u.id);
          }
        }
        if (data.users.length < perPage) break;
        page += 1;
        if (page > 50) break; // safety
      }
    }

    type Log = { student_id: string; log_date: string; attended: boolean | null };
    type Visit = { student_id: string; visited_at: string };
    type Tx = { student_id: string; paid_at: string; status: string };
    type SOrder = { student_id: string; updated_at: string; created_at: string; status: string };

    const logRows = (logs as Log[] | null) || [];
    const visitRows = (visits as Visit[] | null) || [];
    const txRows = (txs as Tx[] | null) || [];
    const storeOrderRows = (storeOrders as SOrder[] | null) || [];

    return studentRows.map<CoachStudentAttendance>((s) => {
      const sLogs = logRows.filter((l) => l.student_id === s.id && l.attended);
      const sVisits = visitRows.filter((v) => v.student_id === s.id);
      const sTxs = txRows.filter((t) => t.student_id === s.id);
      const sStoreOrders = storeOrderRows.filter((o) => o.student_id === s.id);

      const lastApp = sLogs
        .map((l) => l.log_date)
        .sort()
        .at(-1) || null;
      const lastVisit = sVisits
        .map((v) => v.visited_at)
        .sort()
        .at(-1) || null;
      const lastApptISO = lastApp ? new Date(lastApp + "T12:00:00").toISOString() : null;
      let lastCheckinAt: string | null = null;
      let lastSource: "app" | "freebie" | null = null;
      if (lastApptISO && (!lastVisit || lastApptISO >= lastVisit)) {
        lastCheckinAt = lastApptISO;
        lastSource = "app";
      } else if (lastVisit) {
        lastCheckinAt = lastVisit;
        lastSource = "freebie";
      }

      const lastTxPaid = sTxs[0]?.paid_at || null;
      const lastStorePaid = sStoreOrders[0]?.updated_at || sStoreOrders[0]?.created_at || null;
      const lastPurchase = [lastTxPaid, lastStorePaid].filter(Boolean).sort().at(-1) || null;
      const lastSignIn = s.profiles?.user_id ? lastSignInMap[s.profiles.user_id] ?? null : null;

      // Activity = max(lastCheckin, lastSignIn, lastPurchase)
      const candidates = [lastCheckinAt, lastSignIn, lastPurchase].filter(Boolean) as string[];
      const latest = candidates.sort().at(-1) || null;
      const daysSince = latest ? Math.floor((now - new Date(latest).getTime()) / 86400000) : null;

      const checkins7 = new Set(
        sLogs.filter((l) => l.log_date >= date7).map((l) => l.log_date)
      ).size + sVisits.filter((v) => v.visited_at >= d7).length;
      const checkinsPrev7 = new Set(
        sLogs.filter((l) => l.log_date >= date14 && l.log_date < date7).map((l) => l.log_date)
      ).size + sVisits.filter((v) => v.visited_at >= d14 && v.visited_at < d7).length;
      const checkins30 = new Set(sLogs.map((l) => l.log_date)).size + sVisits.length;

      let status: CoachStudentAttendance["status"] = "active";
      if (daysSince === null || daysSince >= 30) status = "inactive_30";
      else if (daysSince >= 15) status = "inactive_15";
      else if (daysSince >= 7) status = "inactive_7";
      else if (checkinsPrev7 >= 3 && checkins7 < checkinsPrev7 / 2) status = "watch";

      let trend: CoachStudentAttendance["trend"] = "stable";
      if (checkinsPrev7 > 0) {
        if (checkins7 < checkinsPrev7 * 0.6) trend = "dropping";
        else if (checkins7 > checkinsPrev7 * 1.2) trend = "rising";
      } else if (checkins7 > 0) trend = "rising";

      return {
        id: s.id,
        name: s.profiles?.name || "Aluno",
        email: s.profiles?.email || "",
        phone: s.profiles?.phone || null,
        user_id: s.profiles?.user_id || null,
        last_sign_in_at: lastSignIn,
        last_checkin_at: lastCheckinAt,
        last_checkin_source: lastSource,
        last_purchase_at: lastPurchase,
        checkins_7d: checkins7,
        checkins_prev_7d: checkinsPrev7,
        checkins_30d: checkins30,
        status,
        trend,
        days_since_activity: daysSince,
      };
    });
  });

export type StudentCheckin = {
  id: string;
  at: string;
  source: "app" | "freebie";
  label: string;
};
export type StudentPurchase = {
  id: string;
  at: string;
  amount: number;
  label: string;
  method: string | null;
};
export type StudentAttendanceDetail = {
  checkins: StudentCheckin[];
  purchases: StudentPurchase[];
  last_sign_in_at: string | null;
};

export const getStudentAttendanceDetail = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { studentId: string }) => d)
  .handler(async ({ data, context }) => {
    const { userId } = context;

    // Authorize: ensure the student belongs to this coach (or user is admin)
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) throw new Error("Profile not found");

    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id, profile_id, coach_id, profiles!students_profile_id_fkey(user_id)")
      .eq("id", data.studentId)
      .maybeSingle();
    if (!student) throw new Error("Student not found");

    const { data: coach } = await supabaseAdmin
      .from("coaches")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();

    if (!coach || student.coach_id !== coach.id) {
      throw new Error("Forbidden");
    }

    const cutoff = new Date(Date.now() - 180 * 86400000).toISOString();
    const cutoffDate = cutoff.slice(0, 10);

    const [{ data: logs }, { data: visits }, { data: visitsPartners }, { data: txs }, { data: storeOrders }] = await Promise.all([
      supabaseAdmin
        .from("attendance_logs")
        .select("id, log_date, activity_type")
        .eq("student_id", data.studentId)
        .eq("attended", true)
        .gte("log_date", cutoffDate)
        .neq("activity_type", "partner_visit")
        .order("log_date", { ascending: false }),
      supabaseAdmin
        .from("partner_visits")
        .select("id, visited_at, partner_id, source")
        .eq("student_id", data.studentId)
        .gte("visited_at", cutoff)
        .order("visited_at", { ascending: false }),
      Promise.resolve({ data: null }),
      supabaseAdmin
        .from("transactions")
        .select("id, paid_at, gross_amount, payment_method, products!transactions_product_id_fkey(name)")
        .eq("student_id", data.studentId)
        .eq("status", "paid")
        .not("paid_at", "is", null)
        .order("paid_at", { ascending: false })
        .limit(50),
      supabaseAdmin
        .from("store_orders")
        .select("id, updated_at, total_amount, payment_method, order_number")
        .eq("student_id", data.studentId)
        .eq("status", "paid")
        .order("updated_at", { ascending: false })
        .limit(50),
    ]);

    // Lookup partner names
    const partnerIds = Array.from(new Set(((visits as { partner_id: string }[]) || []).map((v) => v.partner_id)));
    let partnerMap: Record<string, string> = {};
    if (partnerIds.length) {
      const { data: parts } = await supabaseAdmin
        .from("partners")
        .select("id, fantasy_name")
        .in("id", partnerIds);
      partnerMap = Object.fromEntries(((parts as { id: string; fantasy_name: string }[]) || []).map((p) => [p.id, p.fantasy_name]));
    }

    const checkins: StudentCheckin[] = [
      ...((logs as { id: string; log_date: string; activity_type: string | null }[]) || []).map((l) => ({
        id: `app-${l.id}`,
        at: new Date(l.log_date + "T12:00:00").toISOString(),
        source: "app" as const,
        label: l.activity_type ? `App · ${l.activity_type}` : "Check-in pelo app",
      })),
      ...((visits as { id: string; visited_at: string; partner_id: string; source: string | null }[]) || []).map((v) => ({
        id: `visit-${v.id}`,
        at: v.visited_at,
        source: "freebie" as const,
        label: partnerMap[v.partner_id]
          ? `${v.source === "partner_scan" ? "Parceiro" : "Gratuito"} · ${partnerMap[v.partner_id]}`
          : v.source === "partner_scan" ? "Visita ao parceiro" : "Gratuito (QR parceiro)",
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    const purchases: StudentPurchase[] = [
      ...((txs as unknown as { id: string; paid_at: string; gross_amount: number; payment_method: string | null; products: { name: string } | null }[]) || []).map((t) => ({
        id: `tx-${t.id}`,
        at: t.paid_at,
        amount: Number(t.gross_amount || 0),
        label: t.products?.name || "Compra",
        method: t.payment_method,
      })),
      ...((storeOrders as { id: string; updated_at: string; total_amount: number; payment_method: string | null; order_number: string }[]) || []).map((o) => ({
        id: `order-${o.id}`,
        at: o.updated_at,
        amount: Number(o.total_amount || 0),
        label: `Loja · ${o.order_number}`,
        method: o.payment_method,
      })),
    ].sort((a, b) => b.at.localeCompare(a.at));

    // last sign-in
    let lastSignIn: string | null = null;
    type StudentWithProfile = { profiles: { user_id: string } | null };
    const studUserId = (student as unknown as StudentWithProfile).profiles?.user_id;
    if (studUserId) {
      const { data: u } = await supabaseAdmin.auth.admin.getUserById(studUserId);
      lastSignIn = u?.user?.last_sign_in_at ?? null;
    }

    return { checkins, purchases, last_sign_in_at: lastSignIn };
  });

