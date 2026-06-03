import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export type PartnerVisitRow = {
  id: string;
  visited_at: string;
  source: string | null;
  student_id: string;
  student_name: string;
  student_email: string | null;
  student_photo: string | null;
  coach_name: string | null;
  student_visit_count: number;
};

export const getMyPartnerVisits = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { userId } = context;

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!profile) return [] as PartnerVisitRow[];

    const { data: partner } = await supabaseAdmin
      .from("partners")
      .select("id")
      .eq("profile_id", profile.id)
      .maybeSingle();
    if (!partner) return [] as PartnerVisitRow[];

    const { data: visits } = await supabaseAdmin
      .from("partner_visits")
      .select("id, visited_at, source, student_id")
      .eq("partner_id", partner.id)
      .order("visited_at", { ascending: false })
      .limit(2000);

    const visitRows = (visits as { id: string; visited_at: string; source: string | null; student_id: string }[]) || [];
    if (visitRows.length === 0) return [] as PartnerVisitRow[];

    const studentIds = Array.from(new Set(visitRows.map((v) => v.student_id)));

    const { data: students } = await supabaseAdmin
      .from("students")
      .select("id, coach_id, profiles!students_profile_id_fkey(name, email, photo_url, avatar_url)")
      .in("id", studentIds);

    type StudentRow = {
      id: string;
      coach_id: string | null;
      profiles: { name: string; email: string | null; photo_url: string | null; avatar_url: string | null } | null;
    };
    const studentRows = (students as unknown as StudentRow[]) || [];

    const coachIds = Array.from(new Set(studentRows.map((s) => s.coach_id).filter(Boolean))) as string[];
    let coachNameMap: Record<string, string> = {};
    if (coachIds.length) {
      const { data: coaches } = await supabaseAdmin
        .from("coaches")
        .select("id, profiles!coaches_profile_id_fkey(name)")
        .in("id", coachIds);
      type CoachRow = { id: string; profiles: { name: string } | null };
      coachNameMap = Object.fromEntries(
        ((coaches as unknown as CoachRow[]) || []).map((c) => [c.id, c.profiles?.name || ""]),
      );
    }

    const visitCount: Record<string, number> = {};
    for (const v of visitRows) {
      visitCount[v.student_id] = (visitCount[v.student_id] || 0) + 1;
    }

    const studentMap = Object.fromEntries(studentRows.map((s) => [s.id, s]));

    return visitRows.map<PartnerVisitRow>((v) => {
      const s = studentMap[v.student_id];
      return {
        id: v.id,
        visited_at: v.visited_at,
        source: v.source,
        student_id: v.student_id,
        student_name: s?.profiles?.name || "Aluno",
        student_email: s?.profiles?.email || null,
        student_photo: s?.profiles?.photo_url || s?.profiles?.avatar_url || null,
        coach_name: s?.coach_id ? coachNameMap[s.coach_id] || null : null,
        student_visit_count: visitCount[v.student_id] || 0,
      };
    });
  });
