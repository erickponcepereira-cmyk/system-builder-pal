import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type AttendanceClassification = "Aluno" | "Aluno Coach" | "Aluno Parceiro" | "Aluno Profissional";

export interface EnrichedAttendee {
  id: string;
  profile_id: string;
  display_name: string;
  avatar_url: string | null;
  created_at: string;
  classification: AttendanceClassification;
  coach_name: string | null;
}

export const getEventAttendees = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }): Promise<EnrichedAttendee[]> => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Verify user can see this event (RLS will gate it)
    const { data: ev } = await supabase
      .from("fitmind_events")
      .select("id")
      .eq("id", data.eventId)
      .maybeSingle();
    if (!ev) return [];

    const { data: rows } = await supabaseAdmin
      .from("event_attendances")
      .select("id,profile_id,display_name,avatar_url,created_at")
      .eq("event_id", data.eventId)
      .order("created_at", { ascending: true });

    const attendees = (rows || []) as Array<{
      id: string; profile_id: string; display_name: string;
      avatar_url: string | null; created_at: string;
    }>;
    if (!attendees.length) return [];

    const profileIds = Array.from(new Set(attendees.map((a) => a.profile_id)));

    const [coachesRes, studentsRes, partnersRes] = await Promise.all([
      supabaseAdmin.from("coaches").select("profile_id,is_professional").in("profile_id", profileIds),
      supabaseAdmin
        .from("students")
        .select("profile_id,coaches:coach_id(profiles!coaches_profile_id_fkey(name))")
        .in("profile_id", profileIds),
      supabaseAdmin.from("partners").select("profile_id").in("profile_id", profileIds).then(
        (r) => r,
        () => ({ data: [] as Array<{ profile_id: string }> }),
      ),
    ]);

    const coachMap = new Map<string, { is_professional: boolean | null }>();
    ((coachesRes.data as Array<{ profile_id: string; is_professional: boolean | null }>) || []).forEach((c) => {
      coachMap.set(c.profile_id, { is_professional: c.is_professional });
    });

    const partnerSet = new Set(((partnersRes.data as Array<{ profile_id: string }>) || []).map((p) => p.profile_id));

    const studentCoachMap = new Map<string, string | null>();
    ((studentsRes.data as Array<{ profile_id: string; coaches: { profiles: { name: string } | null } | null }>) || []).forEach((s) => {
      studentCoachMap.set(s.profile_id, s.coaches?.profiles?.name || null);
    });

    return attendees.map((a) => {
      const isCoach = coachMap.has(a.profile_id);
      const isProfessional = isCoach && coachMap.get(a.profile_id)!.is_professional === true;
      const isPartner = partnerSet.has(a.profile_id);

      let classification: AttendanceClassification = "Aluno";
      if (isProfessional) classification = "Aluno Profissional";
      else if (isCoach) classification = "Aluno Coach";
      else if (isPartner) classification = "Aluno Parceiro";

      return {
        ...a,
        classification,
        coach_name: studentCoachMap.get(a.profile_id) || null,
      };
    });
  });

export const checkInToEvent = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({ eventId: z.string().uuid() }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;

    // Verify event is visible to user (RLS-gated read)
    const { data: ev, error: evErr } = await supabase
      .from("fitmind_events")
      .select("id,title")
      .eq("id", data.eventId)
      .maybeSingle();
    if (evErr || !ev) throw new Error("Evento não encontrado ou sem permissão.");

    const { data: prof } = await supabase
      .from("profiles")
      .select("id,name,avatar_url")
      .eq("user_id", userId)
      .maybeSingle();
    if (!prof) throw new Error("Perfil não encontrado.");

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: student } = await supabaseAdmin
      .from("students")
      .select("id")
      .eq("profile_id", prof.id)
      .maybeSingle();

    // Idempotent upsert via unique (event_id, profile_id)
    const { error } = await supabaseAdmin
      .from("event_attendances")
      .upsert(
        {
          event_id: data.eventId,
          profile_id: prof.id,
          display_name: prof.name || "Participante",
          avatar_url: prof.avatar_url,
          student_id: student?.id || null,
        },
        { onConflict: "event_id,profile_id", ignoreDuplicates: true },
      );
    if (error) throw new Error(error.message);

    return { ok: true, eventTitle: ev.title };
  });
