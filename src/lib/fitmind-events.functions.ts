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

    // Permission: admin OR event creator coach
    const { data: isAdminRpc } = await supabase.rpc("is_admin", { _user_id: userId });
    let canView = !!isAdminRpc;
    if (!canView) {
      const { data: ok } = await supabase.rpc("can_create_fitmind_events" as never, { _user_id: userId } as never);
      canView = ok === true;
    }
    if (!canView) throw new Error("Sem permissão para acessar relatórios.");

    let q = supabaseAdmin
      .from("fitmind_events")
      .select("id,title,starts_at,category,responsible_coach_id")
      .order("starts_at", { ascending: false });
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
