import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface MyEventItem {
  id: string;
  title: string;
  subtitle: string | null;
  category: string;
  starts_at: string;
  ends_at: string;
  location: string | null;
  color: string | null;
  attended: boolean;
  attended_at: string | null;
}

export const getMyEvents = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ upcoming: MyEventItem[]; past: MyEventItem[] }> => {
    const { supabase, userId } = context;

    const { data: prof } = await supabase
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (!prof) return { upcoming: [], past: [] };

    const profileId = prof.id as string;

    // Events visible to user (RLS gates this)
    const { data: visible } = await supabase
      .from("fitmind_events")
      .select("id,title,subtitle,category,starts_at,ends_at,location,color")
      .order("starts_at", { ascending: true });

    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: atts } = await supabaseAdmin
      .from("event_attendances")
      .select("event_id,created_at")
      .eq("profile_id", profileId);

    const attMap = new Map<string, string>();
    ((atts || []) as Array<{ event_id: string; created_at: string }>).forEach((a) => {
      attMap.set(a.event_id, a.created_at);
    });

    const now = Date.now();
    const upcoming: MyEventItem[] = [];
    const past: MyEventItem[] = [];

    // Attended events (include even if not visible anymore)
    const attendedEventIds = Array.from(attMap.keys());
    const visibleIds = new Set((visible || []).map((e) => e.id as string));
    const missingIds = attendedEventIds.filter((id) => !visibleIds.has(id));
    let extra: Array<{ id: string; title: string; subtitle: string | null; category: string; starts_at: string; ends_at: string; location: string | null; color: string | null }> = [];
    if (missingIds.length) {
      const { data: more } = await supabaseAdmin
        .from("fitmind_events")
        .select("id,title,subtitle,category,starts_at,ends_at,location,color")
        .in("id", missingIds);
      extra = (more || []) as typeof extra;
    }

    const all = [...((visible || []) as typeof extra), ...extra];
    for (const ev of all) {
      const attended_at = attMap.get(ev.id) || null;
      const item: MyEventItem = {
        ...ev,
        attended: !!attended_at,
        attended_at,
      };
      const endTime = new Date(ev.ends_at).getTime();
      if (endTime >= now) upcoming.push(item);
      else past.push(item);
    }

    upcoming.sort((a, b) => new Date(a.starts_at).getTime() - new Date(b.starts_at).getTime());
    past.sort((a, b) => new Date(b.starts_at).getTime() - new Date(a.starts_at).getTime());

    return { upcoming, past };
  });

export interface EventReportRow {
  id: string;
  title: string;
  starts_at: string;
  category: string;
  responsible_coach_name: string | null;
  total_attendees: number;
  by_classification: { Aluno: number; "Aluno Coach": number; "Aluno Parceiro": number; "Aluno Profissional": number };
}

export const getEventsReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<{ rows: EventReportRow[]; totals: { events: number; attendees: number; byClass: EventReportRow["by_classification"] } }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    // Permission: admin OR event creator (badge) OR responsible coach of any event
    const { data: isAdminRpc } = await supabase.rpc("is_admin", { _user_id: userId });
    let canView = !!isAdminRpc;
    let scopedToCoachId: string | null = null; // when only "responsible coach", scope to their events
    if (!canView) {
      const { data: prof } = await supabase
        .from("profiles").select("id").eq("user_id", userId).maybeSingle();
      if (prof) {
        const { data: coach } = await supabaseAdmin
          .from("coaches").select("id").eq("profile_id", (prof as { id: string }).id).maybeSingle();
        if (coach) {
          const myCoachId = (coach as { id: string }).id;
          const { data: badge } = await supabaseAdmin
            .from("coach_badges")
            .select("badge_key")
            .eq("coach_id", myCoachId)
            .eq("badge_key", "event_creator" as never)
            .maybeSingle();
          if (badge) {
            canView = true; // creator sees all
          } else {
            const { data: anyEv } = await supabaseAdmin
              .from("fitmind_events")
              .select("id")
              .eq("responsible_coach_id", myCoachId)
              .limit(1);
            if (anyEv && anyEv.length) {
              canView = true;
              scopedToCoachId = myCoachId;
            }
          }
        }
      }
    }
    if (!canView) throw new Error("Sem permissão para acessar relatórios.");

    let q = supabaseAdmin
      .from("fitmind_events")
      .select("id,title,starts_at,category,responsible_coach_id")
      .order("starts_at", { ascending: false });
    if (scopedToCoachId) q = q.eq("responsible_coach_id", scopedToCoachId);
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lte("starts_at", data.to);
    const { data: events } = await q;
    const evList = (events || []) as Array<{ id: string; title: string; starts_at: string; category: string; responsible_coach_id: string | null }>;
    if (!evList.length) return { rows: [], totals: { events: 0, attendees: 0, byClass: { Aluno: 0, "Aluno Coach": 0, "Aluno Parceiro": 0, "Aluno Profissional": 0 } } };

    const evIds = evList.map((e) => e.id);
    const coachIds = Array.from(new Set(evList.map((e) => e.responsible_coach_id).filter(Boolean) as string[]));

    const [attRes, coachRes] = await Promise.all([
      supabaseAdmin.from("event_attendances").select("event_id,profile_id").in("event_id", evIds),
      coachIds.length
        ? supabaseAdmin.from("coaches").select("id,profile_id,profiles!coaches_profile_id_fkey(name)").in("id", coachIds)
        : Promise.resolve({ data: [] as Array<{ id: string; profile_id: string; profiles: { name: string } | null }> }),
    ]);

    const attendances = (attRes.data || []) as Array<{ event_id: string; profile_id: string }>;
    const coachNameMap = new Map<string, string>();
    ((coachRes.data as Array<{ id: string; profiles: { name: string } | null }>) || []).forEach((c) => {
      coachNameMap.set(c.id, c.profiles?.name || "Coach");
    });

    const allProfileIds = Array.from(new Set(attendances.map((a) => a.profile_id)));
    let coachProfiles = new Set<string>();
    let profProfiles = new Set<string>();
    let partnerProfiles = new Set<string>();
    if (allProfileIds.length) {
      const [c, p] = await Promise.all([
        supabaseAdmin.from("coaches").select("profile_id,is_professional").in("profile_id", allProfileIds),
        supabaseAdmin.from("partners").select("profile_id").in("profile_id", allProfileIds).then(
          (r) => r,
          () => ({ data: [] as Array<{ profile_id: string }> }),
        ),
      ]);
      ((c.data as Array<{ profile_id: string; is_professional: boolean | null }>) || []).forEach((r) => {
        coachProfiles.add(r.profile_id);
        if (r.is_professional) profProfiles.add(r.profile_id);
      });
      ((p.data as Array<{ profile_id: string }>) || []).forEach((r) => partnerProfiles.add(r.profile_id));
    }

    const classify = (pid: string): keyof EventReportRow["by_classification"] => {
      if (profProfiles.has(pid)) return "Aluno Profissional";
      if (coachProfiles.has(pid)) return "Aluno Coach";
      if (partnerProfiles.has(pid)) return "Aluno Parceiro";
      return "Aluno";
    };

    const attByEvent = new Map<string, Array<{ profile_id: string }>>();
    for (const a of attendances) {
      if (!attByEvent.has(a.event_id)) attByEvent.set(a.event_id, []);
      attByEvent.get(a.event_id)!.push(a);
    }

    const totalsByClass: EventReportRow["by_classification"] = { Aluno: 0, "Aluno Coach": 0, "Aluno Parceiro": 0, "Aluno Profissional": 0 };
    let totalAttendees = 0;

    const rows: EventReportRow[] = evList.map((e) => {
      const att = attByEvent.get(e.id) || [];
      const by: EventReportRow["by_classification"] = { Aluno: 0, "Aluno Coach": 0, "Aluno Parceiro": 0, "Aluno Profissional": 0 };
      for (const a of att) {
        const k = classify(a.profile_id);
        by[k]++;
        totalsByClass[k]++;
      }
      totalAttendees += att.length;
      return {
        id: e.id,
        title: e.title,
        starts_at: e.starts_at,
        category: e.category,
        responsible_coach_name: e.responsible_coach_id ? coachNameMap.get(e.responsible_coach_id) || null : null,
        total_attendees: att.length,
        by_classification: by,
      };
    });

    return { rows, totals: { events: evList.length, attendees: totalAttendees, byClass: totalsByClass } };
  });

/* ===== Coach ministered events: profile + report ===== */

export interface MinisteredEventRow {
  id: string;
  title: string;
  starts_at: string;
  category: string;
  total_attendees: number;
}

export interface MinisteredTopParticipant {
  profile_id: string;
  name: string;
  attendances: number;
}

export interface MinisteredTopReferringCoach {
  coach_id: string;
  name: string;
  brought_attendees: number;
}

export interface MinisteredReport {
  summary: {
    events_count: number;
    attendees_total: number;
    last_event: { id: string; title: string; starts_at: string } | null;
  };
  events: MinisteredEventRow[];
  top_participants: MinisteredTopParticipant[];
  top_referring_coaches: MinisteredTopReferringCoach[];
}

export const getCoachMinisteredReport = createServerFn({ method: "GET" })
  .middleware([requireSupabaseAuth])
  .inputValidator((input) =>
    z.object({
      from: z.string().optional(),
      to: z.string().optional(),
      scope: z.enum(["ministered", "created"]).optional(),
    }).parse(input ?? {}),
  )
  .handler(async ({ data, context }): Promise<MinisteredReport & { can_view_created: boolean; scope: "ministered" | "created" }> => {
    const { supabase, userId } = context;
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");

    const { data: prof } = await supabase
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const profileId = (prof as { id: string } | null)?.id || null;
    const coachRes = profileId
      ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profileId).maybeSingle()
      : { data: null as { id: string } | null };
    const coachId = (coachRes.data as { id: string } | null)?.id || null;

    const { data: isAdminRpc } = await supabase.rpc("is_admin", { _user_id: userId });
    const { data: canCreateRpc } = await supabase.rpc("can_create_fitmind_events" as never, { _user_id: userId } as never);
    let canViewCreated = isAdminRpc === true || canCreateRpc === true;
    if (!canViewCreated && coachId) {
      const { data: coachPermission } = await supabaseAdmin
        .from("coaches")
        .select("can_create_fitmind_events")
        .eq("id", coachId)
        .maybeSingle();
      const { data: badge } = await supabaseAdmin
        .from("coach_badges").select("badge_key")
        .eq("coach_id", coachId).eq("badge_key", "event_creator" as never).maybeSingle();
      canViewCreated = !!badge || (coachPermission as { can_create_fitmind_events?: boolean } | null)?.can_create_fitmind_events === true;
    }
    const scope: "ministered" | "created" =
      data.scope === "created" && canViewCreated ? "created" : "ministered";

    const empty: MinisteredReport & { can_view_created: boolean; scope: "ministered" | "created" } = {
      summary: { events_count: 0, attendees_total: 0, last_event: null },
      events: [], top_participants: [], top_referring_coaches: [],
      can_view_created: canViewCreated, scope,
    };
    if (!coachId || !profileId) return empty;

    let q = supabaseAdmin
      .from("fitmind_events")
      .select("id,title,starts_at,category")
      .order("starts_at", { ascending: false });
    // event_creator badge holders see ALL events on the "created" tab (they're the platform's event creators).
    // The "ministered" tab is always scoped to events they're the responsible coach for.
    if (scope === "created") {
      // no extra filter — show all events
    } else {
      q = q.eq("responsible_coach_id", coachId);
    }
    if (data.from) q = q.gte("starts_at", data.from);
    if (data.to) q = q.lte("starts_at", data.to);
    const { data: events } = await q;
    const evList = (events || []) as Array<{ id: string; title: string; starts_at: string; category: string }>;
    if (!evList.length) return empty;


    const evIds = evList.map((e) => e.id);
    const { data: attRaw } = await supabaseAdmin
      .from("event_attendances")
      .select("event_id,profile_id")
      .in("event_id", evIds);
    const attendances = (attRaw || []) as Array<{ event_id: string; profile_id: string }>;

    // Per-event totals
    const perEvent = new Map<string, number>();
    for (const a of attendances) perEvent.set(a.event_id, (perEvent.get(a.event_id) || 0) + 1);

    // Top participants
    const perProfile = new Map<string, number>();
    for (const a of attendances) perProfile.set(a.profile_id, (perProfile.get(a.profile_id) || 0) + 1);
    const profileIds = Array.from(perProfile.keys());
    const profMap = new Map<string, string>();
    if (profileIds.length) {
      const { data: profs } = await supabaseAdmin
        .from("profiles").select("id,name").in("id", profileIds);
      ((profs || []) as Array<{ id: string; name: string }>).forEach((p) => profMap.set(p.id, p.name));
    }
    const topParticipants: MinisteredTopParticipant[] = profileIds
      .map((pid) => ({ profile_id: pid, name: profMap.get(pid) || "Participante", attendances: perProfile.get(pid) || 0 }))
      .sort((a, b) => b.attendances - a.attendances)
      .slice(0, 20);

    // Top referring coaches: join attendees → students.coach_id (excluding self-ministered coach)
    const perCoach = new Map<string, number>();
    if (profileIds.length) {
      const { data: studs } = await supabaseAdmin
        .from("students").select("profile_id,coach_id").in("profile_id", profileIds);
      const profileToCoach = new Map<string, string>();
      ((studs || []) as Array<{ profile_id: string; coach_id: string }>).forEach((s) => {
        profileToCoach.set(s.profile_id, s.coach_id);
      });
      for (const a of attendances) {
        const cId = profileToCoach.get(a.profile_id);
        if (cId) perCoach.set(cId, (perCoach.get(cId) || 0) + 1);
      }
    }
    const coachIds = Array.from(perCoach.keys());
    const coachNameMap = new Map<string, string>();
    if (coachIds.length) {
      const { data: cs } = await supabaseAdmin
        .from("coaches")
        .select("id,profiles!coaches_profile_id_fkey(name)")
        .in("id", coachIds);
      ((cs || []) as Array<{ id: string; profiles: { name: string } | null }>).forEach((c) => {
        coachNameMap.set(c.id, c.profiles?.name || "Coach");
      });
    }
    const topReferringCoaches: MinisteredTopReferringCoach[] = coachIds
      .map((cid) => ({ coach_id: cid, name: coachNameMap.get(cid) || "Coach", brought_attendees: perCoach.get(cid) || 0 }))
      .sort((a, b) => b.brought_attendees - a.brought_attendees)
      .slice(0, 20);

    const rows: MinisteredEventRow[] = evList.map((e) => ({
      id: e.id, title: e.title, starts_at: e.starts_at, category: e.category,
      total_attendees: perEvent.get(e.id) || 0,
    }));

    const last = evList[0];
    return {
      summary: {
        events_count: evList.length,
        attendees_total: attendances.length,
        last_event: last ? { id: last.id, title: last.title, starts_at: last.starts_at } : null,
      },
      events: rows,
      top_participants: topParticipants,
      top_referring_coaches: topReferringCoaches,
      can_view_created: canViewCreated,
      scope,
    };

  });

