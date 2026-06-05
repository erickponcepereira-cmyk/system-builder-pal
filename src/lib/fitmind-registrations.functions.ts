import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export type RegistrationStatus = "registered" | "attended" | "no_show";

export interface RegistrationRow {
  id: string;
  profile_id: string;
  status: RegistrationStatus;
  registered_at: string;
  display_name: string;
  avatar_url: string | null;
  coach_name: string | null;
  classification: "Aluno" | "Aluno Coach" | "Aluno Parceiro" | "Aluno Profissional";
}

// Toggle "Quero ir" — student registers/cancels themselves
export const toggleMyRegistration = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!prof) throw new Error("Perfil não encontrado.");
    const profileId = (prof as { id: string }).id;

    const { data: existing } = await supabase
      .from("event_registrations")
      .select("id,status")
      .eq("event_id", data.eventId)
      .eq("profile_id", profileId)
      .maybeSingle();

    if (existing) {
      if ((existing as { status: string }).status === "registered") {
        await supabase.from("event_registrations").delete().eq("id", (existing as { id: string }).id);
        return { registered: false };
      }
      return { registered: true }; // already attended/no_show, keep
    }
    const { error } = await supabase.from("event_registrations").insert({
      event_id: data.eventId, profile_id: profileId, status: "registered",
    });
    if (error) throw new Error(error.message);
    return { registered: true };
  });

// Check if I'm registered to an event
export const getMyRegistration = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!prof) return { status: null as RegistrationStatus | null };
    const { data: reg } = await supabase
      .from("event_registrations")
      .select("status")
      .eq("event_id", data.eventId)
      .eq("profile_id", (prof as { id: string }).id)
      .maybeSingle();
    return { status: ((reg as { status: RegistrationStatus } | null)?.status) ?? null };
  });

// List my registered event IDs (for "Meus eventos" filter)
export const getMyRegisteredEventIds = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabase, userId } = context;
    const { data: prof } = await supabase
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    if (!prof) return { eventIds: [] as string[] };
    const { data: regs } = await supabase
      .from("event_registrations")
      .select("event_id")
      .eq("profile_id", (prof as { id: string }).id);
    return { eventIds: ((regs as Array<{ event_id: string }> | null) || []).map((r) => r.event_id) };
  });

// Manager: list all registrations for an event (with enrichment)
export const getEventRegistrations = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }): Promise<RegistrationRow[]> => {
    const { supabase } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: rows } = await supabase
      .from("event_registrations")
      .select("id,profile_id,status,registered_at")
      .eq("event_id", data.eventId)
      .order("registered_at", { ascending: true });
    const regs = (rows || []) as Array<{ id: string; profile_id: string; status: RegistrationStatus; registered_at: string }>;
    if (!regs.length) return [];

    const profileIds = Array.from(new Set(regs.map((r) => r.profile_id)));
    const [profilesRes, coachesRes, studentsRes, partnersRes] = await Promise.all([
      supabaseAdmin.from("profiles").select("id,name,avatar_url").in("id", profileIds),
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

    const profMap = new Map<string, { name: string; avatar_url: string | null }>();
    ((profilesRes.data as Array<{ id: string; name: string; avatar_url: string | null }>) || []).forEach((p) => {
      profMap.set(p.id, { name: p.name, avatar_url: p.avatar_url });
    });
    const coachMap = new Map<string, boolean | null>();
    ((coachesRes.data as Array<{ profile_id: string; is_professional: boolean | null }>) || []).forEach((c) => {
      coachMap.set(c.profile_id, c.is_professional);
    });
    const partnerSet = new Set(((partnersRes.data as Array<{ profile_id: string }>) || []).map((p) => p.profile_id));
    const studentCoachMap = new Map<string, string | null>();
    ((studentsRes.data as Array<{ profile_id: string; coaches: { profiles: { name: string } | null } | null }>) || []).forEach((s) => {
      studentCoachMap.set(s.profile_id, s.coaches?.profiles?.name || null);
    });

    return regs.map((r) => {
      const p = profMap.get(r.profile_id);
      const isCoach = coachMap.has(r.profile_id);
      const isProfessional = isCoach && coachMap.get(r.profile_id) === true;
      const isPartner = partnerSet.has(r.profile_id);
      let classification: RegistrationRow["classification"] = "Aluno";
      if (isProfessional) classification = "Aluno Profissional";
      else if (isCoach) classification = "Aluno Coach";
      else if (isPartner) classification = "Aluno Parceiro";
      return {
        id: r.id,
        profile_id: r.profile_id,
        status: r.status,
        registered_at: r.registered_at,
        display_name: p?.name || "Participante",
        avatar_url: p?.avatar_url || null,
        coach_name: studentCoachMap.get(r.profile_id) || null,
        classification,
      };
    });
  });

// Manager: change registration status
export const setRegistrationStatus = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      registrationId: z.string().uuid(),
      status: z.enum(["registered", "attended", "no_show"]),
    }).parse(input),
  )
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error } = await supabase
      .from("event_registrations")
      .update({ status: data.status })
      .eq("id", data.registrationId);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

// Manager: close event — mark all still-registered as no_show
export const finalizeEventAttendance = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) => z.object({ eventId: z.string().uuid() }).parse(input))
  .handler(async ({ data, context }) => {
    const { supabase } = context;
    const { error, count } = await supabase
      .from("event_registrations")
      .update({ status: "no_show" }, { count: "exact" })
      .eq("event_id", data.eventId)
      .eq("status", "registered");
    if (error) throw new Error(error.message);
    return { ok: true, marked: count || 0 };
  });
