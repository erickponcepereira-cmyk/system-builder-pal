import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { syncCoachAppointments, createGoogleCalendarEvent } from "@/server/google-oauth.server";

export type UpcomingEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendee?: string;
  location?: string;
  htmlLink?: string;
  coachId?: string;
  coachName?: string;
};

export type GoogleConnectionStatus = {
  connected: boolean;
  email: string | null;
  lastSyncedAt: string | null;
};

/** Returns connection status of the current user's Google account. */
export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleConnectionStatus> => {
    const userId = context.userId;
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
  });

/** Returns upcoming appointments for the current coach (from internal table). */
export const getUpcomingEvents = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: UpcomingEvent[]; error?: string }> => {
    const userId = context.userId;

    // Resolve current coach
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    const { data: coach } = profile
      ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };

    if (!coach) return { events: [], error: "Coach não encontrado" };

    // Best-effort sync if connected
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
      .select("id,summary,start_at,end_at,attendee_name,attendee_email,location,html_link")
      .eq("coach_id", coach.id)
      .gte("start_at", new Date().toISOString())
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
      })),
    };
  });

/** Manually trigger a sync for the current coach. */
export const syncMyCalendar = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const { data: coach } = profile
      ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!coach) throw new Error("Coach não encontrado");
    return syncCoachAppointments(userId, coach.id);
  });

/** Create an event on the coach's connected Google Calendar. */
export const createCoachCalendarEvent = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: {
    summary: string;
    description?: string;
    startISO: string;
    endISO: string;
    attendeeEmail?: string | null;
    attendeeName?: string | null;
    location?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const userId = context.userId;
    const { data: profile } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", userId).maybeSingle();
    const { data: coach } = profile
      ? await supabaseAdmin.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle()
      : { data: null };
    if (!coach) throw new Error("Coach não encontrado");

    // Check connection first to give a clear error
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
  });

/** Disconnect Google for current user. */
export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
    await supabaseAdmin.from("coach_google_tokens").delete().eq("user_id", userId);
    return { ok: true };
  });

/** Admin only: list all upcoming appointments across coaches, optionally filtered. */
export const adminListAppointments = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { coachId?: string | null; daysAhead?: number }) => d)
  .handler(async ({ context, data }) => {
    const userId = context.userId;
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

    // Resolve coach names
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
  });

/** Admin: list coaches with Google connection info. */
export const adminListCoachConnections = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const userId = context.userId;
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
  });
