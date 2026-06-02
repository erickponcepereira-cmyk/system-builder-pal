import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import type {
  UpcomingEvent,
  GoogleConnectionStatus,
  AttendanceHistory,
  AttendanceHistoryItem,
} from "./google-calendar.server";

// Re-export types for client consumers.
export type { UpcomingEvent, GoogleConnectionStatus, AttendanceHistory, AttendanceHistoryItem };

// All server-only logic lives in ./google-calendar.server.ts and is imported
// dynamically inside each handler so it never enters the client bundle.

export const getGoogleConnectionStatus = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<GoogleConnectionStatus> => {
    const { impl_getGoogleConnectionStatus } = await import("./google-calendar.server");
    return impl_getGoogleConnectionStatus(context.userId);
  });

export const getUpcomingEvents = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }): Promise<{ events: UpcomingEvent[]; error?: string }> => {
    const { impl_getUpcomingEvents } = await import("./google-calendar.server");
    return impl_getUpcomingEvents(context.userId);
  });

export const syncMyCalendar = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { impl_syncMyCalendar } = await import("./google-calendar.server");
    return impl_syncMyCalendar(context.userId);
  });

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
    const { impl_createCoachCalendarEvent } = await import("./google-calendar.server");
    return impl_createCoachCalendarEvent(context.userId, data);
  });

export const updateCoachCalendarEvent = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: {
    googleEventId: string;
    summary?: string;
    description?: string | null;
    startISO?: string;
    endISO?: string;
    location?: string | null;
  }) => d)
  .handler(async ({ context, data }) => {
    const { impl_updateCoachCalendarEvent } = await import("./google-calendar.server");
    return impl_updateCoachCalendarEvent(context.userId, data);
  });

export const deleteCoachCalendarEvent = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { googleEventId: string }) => d)
  .handler(async ({ context, data }) => {
    const { impl_deleteCoachCalendarEvent } = await import("./google-calendar.server");
    return impl_deleteCoachCalendarEvent(context.userId, data);
  });

export const disconnectGoogle = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { impl_disconnectGoogle } = await import("./google-calendar.server");
    return impl_disconnectGoogle(context.userId);
  });

export const adminListAppointments = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { coachId?: string | null; daysAhead?: number }) => d)
  .handler(async ({ context, data }) => {
    const { impl_adminListAppointments } = await import("./google-calendar.server");
    return impl_adminListAppointments(context.userId, data);
  });

export const adminListCoachConnections = createServerFn({ method: "GET" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { impl_adminListCoachConnections } = await import("./google-calendar.server");
    return impl_adminListCoachConnections(context.userId);
  });

export const setAppointmentCompleted = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { appointmentId: string; completed: boolean }) => d)
  .handler(async ({ context, data }) => {
    const { impl_setAppointmentCompleted } = await import("./google-calendar.server");
    return impl_setAppointmentCompleted(context.userId, data);
  });

export const getCoachAttendanceHistory = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .inputValidator((d: { day?: string; month?: string }) => d)
  .handler(async ({ context, data }): Promise<AttendanceHistory> => {
    const { impl_getCoachAttendanceHistory } = await import("./google-calendar.server");
    return impl_getCoachAttendanceHistory(context.userId, data);
  });
