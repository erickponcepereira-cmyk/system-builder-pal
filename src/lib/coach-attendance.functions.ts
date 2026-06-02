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
