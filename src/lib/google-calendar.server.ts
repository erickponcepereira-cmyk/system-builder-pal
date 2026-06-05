// Server-only implementation for Google Calendar server functions.
// This file MUST NOT be imported (statically or dynamically) from client code.
// `.server.ts` extension is blocked by TanStack's import-protection plugin.
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  syncCoachAppointments,
  createGoogleCalendarEvent,
  updateGoogleCalendarEvent,
  deleteGoogleCalendarEvent,
} from "@/server/google-oauth.server";

export type UpcomingEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendee?: string;
  location?: string;
  htmlLink?: string;
  publicToken?: string;
  attendeeConfirmed?: boolean;
  attendeeConfirmedAt?: string | null;
  googleEventId?: string;
  coachId?: string;
  coachName?: string;
  completedAt?: string | null;
};

export type GoogleConnectionStatus = {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
};

export type AttendanceHistoryItem = {
  id: string;
  summary: string;
  start: string;
  attendee?: string | null;
  completedAt: string;
};

export type AttendanceHistory = {
  daily: { date: string; total: number; items: AttendanceHistoryItem[] };
  monthly: {
    month: string;
    total: number;
    perDay: Array<{ date: string; total: number }>;
  };
};

async function resolveCurrentCoachId(userId: string): Promise<string | null> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  if (!profile) return null;
  const { data: coach } = await supabaseAdmin
    .from("coaches").select("id").eq("profile_id", profile.id).maybeSingle();
  return coach?.id ?? null;
}

export async function impl_getGoogleConnectionStatus(userId: string): Promise<GoogleConnectionStatus> {
  const { data } = await supabaseAdmin
    .from("coach_google_tokens")
    .select("google_email,last_synced_at")
    .eq("user_id", userId)
    .maybeSingle();
  return {
    connected: !!data,
    email: data?.google_email ?? null,
    lastSyncedAt: data?.last_synced_at ?? null,
  };
}

export async function impl_getUpcomingEvents(userId: string): Promise<{ events: UpcomingEvent[]; error?: string }> {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: coach } = profile
    ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
    : { data: null };

  if (!coach) return { events: [], error: "Coach não encontrado" };

  try {
    const { data: tok } = await supabaseAdmin
      .from("coach_google_tokens")
      .select("user_id")
      .eq("user_id", userId)
      .maybeSingle();
    if (tok) await syncCoachAppointments(userId, coach.id);
  } catch (e) {
    console.error("Background sync failed:", e);
  }

  const { data: rows, error } = await supabaseAdmin
    .from("internal_appointments")
    .select("id,summary,start_at,end_at,attendee_name,attendee_email,location,html_link,google_event_id,public_token,attendee_confirmed,attendee_confirmed_at,completed_at")
    .eq("coach_id", coach.id)
    .gte("start_at", new Date(Date.now() - 24 * 3600_000).toISOString())
    .order("start_at", { ascending: true })
    .limit(20);

  if (error) return { events: [], error: error.message };

  return {
    events: (rows ?? []).map((r) => ({
      id: r.id,
      summary: r.summary,
      start: r.start_at,
      end: r.end_at ?? r.start_at,
      attendee: r.attendee_name ?? r.attendee_email ?? undefined,
      location: r.location ?? undefined,
      htmlLink: r.html_link ?? undefined,
      googleEventId: r.google_event_id ?? undefined,
      publicToken: r.public_token ?? undefined,
      attendeeConfirmed: !!r.attendee_confirmed,
      attendeeConfirmedAt: (r as any).attendee_confirmed_at ?? null,
      completedAt: (r as any).completed_at ?? null,
    })),
  };
}

export async function impl_syncMyCalendar(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: coach } = profile
    ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
    : { data: null };
  if (!coach) throw new Error("Coach não encontrado");
  return syncCoachAppointments(userId, coach.id);
}

export async function impl_createCoachCalendarEvent(userId: string, data: {
  summary: string;
  description?: string;
  startISO: string;
  endISO: string;
  attendeeEmail?: string | null;
  attendeeName?: string | null;
  location?: string | null;
}) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: coach } = profile
    ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
    : { data: null };
  if (!coach) throw new Error("Coach não encontrado");

  const { data: tok } = await supabaseAdmin
    .from("coach_google_tokens")
    .select("user_id")
    .eq("user_id", userId)
    .maybeSingle();
  if (!tok) {
    return { connected: false, htmlLink: null as string | null, id: null as string | null };
  }

  const result = await createGoogleCalendarEvent({
    userId,
    coachId: coach.id,
    summary: data.summary,
    description: data.description,
    startISO: data.startISO,
    endISO: data.endISO,
    attendeeEmail: data.attendeeEmail ?? null,
    attendeeName: data.attendeeName ?? null,
    location: data.location ?? null,
  });
  return { connected: true, ...result };
}

export async function impl_updateCoachCalendarEvent(userId: string, data: {
  googleEventId: string;
  summary?: string;
  description?: string | null;
  startISO?: string;
  endISO?: string;
  location?: string | null;
}) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: coach } = profile
    ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
    : { data: null };
  if (!coach) throw new Error("Coach não encontrado");
  const result = await updateGoogleCalendarEvent({
    userId,
    coachId: coach.id,
    googleEventId: data.googleEventId,
    summary: data.summary,
    description: data.description ?? undefined,
    startISO: data.startISO,
    endISO: data.endISO,
    location: data.location ?? undefined,
  });
  return { ok: true, ...result };
}

export async function impl_deleteCoachCalendarEvent(userId: string, data: { googleEventId: string }) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id").eq("user_id", userId).maybeSingle();
  const { data: coach } = profile
    ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
    : { data: null };
  if (!coach) throw new Error("Coach não encontrado");
  await deleteGoogleCalendarEvent({
    userId,
    coachId: coach.id,
    googleEventId: data.googleEventId,
  });
  return { ok: true };
}

export async function impl_disconnectGoogle(userId: string) {
  await supabaseAdmin.from("coach_google_tokens").delete().eq("user_id", userId);
  return { ok: true };
}

export async function impl_adminListAppointments(userId: string, data: { coachId?: string | null; daysAhead?: number }) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("id,role").eq("user_id", userId).maybeSingle();
  if (profile?.role !== "admin") throw new Error("Acesso negado");

  const days = Math.min(Math.max(data.daysAhead ?? 30, 1), 180);
  const until = new Date(Date.now() + days * 86400_000).toISOString();

  let q = supabaseAdmin
    .from("internal_appointments")
    .select("id,coach_id,summary,start_at,end_at,attendee_name,attendee_email,location,html_link,status")
    .gte("start_at", new Date().toISOString())
    .lte("start_at", until)
    .order("start_at", { ascending: true })
    .limit(500);

  if (data.coachId) q = q.eq("coach_id", data.coachId);

  const { data: rows, error } = await q;
  if (error) throw error;

  const coachIds = Array.from(new Set((rows ?? []).map((r) => r.coach_id)));
  let coachMap = new Map<string, string>();
  if (coachIds.length > 0) {
    const { data: coaches } = await supabaseAdmin
      .from("coaches")
      .select("id,profile_id")
      .in("id", coachIds);
    const profileIds = (coaches ?? []).map((c) => c.profile_id);
    const { data: profiles } = profileIds.length
      ? await supabaseAdmin.from("profiles").select("id,name").in("id", profileIds)
      : { data: [] as Array<{ id: string; name: string }> };
    const profileNameMap = new Map((profiles ?? []).map((p) => [p.id, p.name]));
    coachMap = new Map(
      (coaches ?? []).map((c) => [c.id, profileNameMap.get(c.profile_id) || "Coach"]),
    );
  }

  return {
    appointments: (rows ?? []).map((r) => ({
      id: r.id,
      coachId: r.coach_id,
      coachName: coachMap.get(r.coach_id) || "Coach",
      summary: r.summary,
      start: r.start_at,
      end: r.end_at ?? r.start_at,
      attendee: r.attendee_name ?? r.attendee_email ?? null,
      location: r.location,
      htmlLink: r.html_link,
      status: r.status,
    })),
  };
}

export async function impl_adminListCoachConnections(userId: string) {
  const { data: profile } = await supabaseAdmin
    .from("profiles").select("role").eq("user_id", userId).maybeSingle();
  if (profile?.role !== "admin") throw new Error("Acesso negado");

  const { data: coaches } = await supabaseAdmin
    .from("coaches")
    .select("id,profile_id");
  const profileIds = (coaches ?? []).map((c) => c.profile_id);
  const { data: profiles } = profileIds.length
    ? await supabaseAdmin.from("profiles").select("id,name").in("id", profileIds)
    : { data: [] };
  const profileNameMap = new Map((profiles ?? []).map((p: any) => [p.id, p.name as string]));

  const { data: tokens } = await supabaseAdmin
    .from("coach_google_tokens")
    .select("coach_id,google_email,last_synced_at");
  const tokenMap = new Map((tokens ?? []).map((t) => [t.coach_id, t]));

  return {
    coaches: (coaches ?? [])
      .map((c) => ({
        id: c.id,
        name: profileNameMap.get(c.profile_id) || "Coach",
        googleEmail: tokenMap.get(c.id)?.google_email ?? null,
        lastSyncedAt: tokenMap.get(c.id)?.last_synced_at ?? null,
        connected: tokenMap.has(c.id),
      }))
      .sort((a, b) => a.name.localeCompare(b.name)),
  };
}

export async function impl_setAppointmentCompleted(userId: string, data: { appointmentId: string; completed: boolean }) {
  const coachId = await resolveCurrentCoachId(userId);
  if (!coachId) throw new Error("Coach não encontrado");
  const { error } = await supabaseAdmin
    .from("internal_appointments")
    .update({ completed_at: data.completed ? new Date().toISOString() : null })
    .eq("id", data.appointmentId)
    .eq("coach_id", coachId);
  if (error) throw error;
  return { ok: true };
}

export async function impl_getCoachAttendanceHistory(userId: string, data: { day?: string; month?: string }): Promise<AttendanceHistory> {
  const coachId = await resolveCurrentCoachId(userId);
  if (!coachId) throw new Error("Coach não encontrado");

  const today = new Date();
  const dayStr = data.day || today.toISOString().slice(0, 10);
  const monthStr = data.month || today.toISOString().slice(0, 7);

  const dayStart = new Date(`${dayStr}T00:00:00`);
  const dayEnd = new Date(dayStart.getTime() + 86400_000);

  const monthStart = new Date(`${monthStr}-01T00:00:00`);
  const monthEnd = new Date(monthStart.getFullYear(), monthStart.getMonth() + 1, 1);

  const { data: dayRows } = await supabaseAdmin
    .from("internal_appointments")
    .select("id,summary,start_at,attendee_name,attendee_email,completed_at")
    .eq("coach_id", coachId)
    .not("completed_at", "is", null)
    .gte("completed_at", dayStart.toISOString())
    .lt("completed_at", dayEnd.toISOString())
    .order("completed_at", { ascending: false });

  const { data: monthRows } = await supabaseAdmin
    .from("internal_appointments")
    .select("completed_at")
    .eq("coach_id", coachId)
    .not("completed_at", "is", null)
    .gte("completed_at", monthStart.toISOString())
    .lt("completed_at", monthEnd.toISOString());

  const perDayMap = new Map<string, number>();
  (monthRows ?? []).forEach((r: any) => {
    const d = new Date(r.completed_at).toISOString().slice(0, 10);
    perDayMap.set(d, (perDayMap.get(d) || 0) + 1);
  });
  const perDay = Array.from(perDayMap.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([date, total]) => ({ date, total }));

  return {
    daily: {
      date: dayStr,
      total: (dayRows ?? []).length,
      items: (dayRows ?? []).map((r: any) => ({
        id: r.id,
        summary: r.summary,
        start: r.start_at,
        attendee: r.attendee_name ?? r.attendee_email ?? null,
        completedAt: r.completed_at,
      })),
    },
    monthly: {
      month: monthStr,
      total: (monthRows ?? []).length,
      perDay,
    },
  };
}
