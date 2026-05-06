import { createServerFn } from "@tanstack/react-start";

const GATEWAY_URL = "https://connector-gateway.lovable.dev/google_calendar/calendar/v3";

export type UpcomingEvent = {
  id: string;
  summary: string;
  start: string;
  end: string;
  attendee?: string;
  location?: string;
  htmlLink?: string;
};

export const getUpcomingEvents = createServerFn({ method: "GET" }).handler(
  async (): Promise<{ events: UpcomingEvent[]; error?: string }> => {
    const LOVABLE_API_KEY = process.env.LOVABLE_API_KEY;
    const GOOGLE_CALENDAR_API_KEY = process.env.GOOGLE_CALENDAR_API_KEY;

    if (!LOVABLE_API_KEY) return { events: [], error: "LOVABLE_API_KEY missing" };
    if (!GOOGLE_CALENDAR_API_KEY)
      return { events: [], error: "Google Calendar não conectado" };

    const params = new URLSearchParams({
      timeMin: new Date().toISOString(),
      maxResults: "10",
      singleEvents: "true",
      orderBy: "startTime",
    });

    const res = await fetch(
      `${GATEWAY_URL}/calendars/primary/events?${params.toString()}`,
      {
        headers: {
          Authorization: `Bearer ${LOVABLE_API_KEY}`,
          "X-Connection-Api-Key": GOOGLE_CALENDAR_API_KEY,
        },
      },
    );

    if (!res.ok) {
      const text = await res.text();
      return { events: [], error: `Calendar [${res.status}]: ${text.slice(0, 200)}` };
    }

    const data = (await res.json()) as {
      items?: Array<{
        id: string;
        summary?: string;
        start?: { dateTime?: string; date?: string };
        end?: { dateTime?: string; date?: string };
        attendees?: Array<{ email?: string; displayName?: string }>;
        location?: string;
        htmlLink?: string;
      }>;
    };

    const events: UpcomingEvent[] = (data.items ?? []).map((e) => ({
      id: e.id,
      summary: e.summary ?? "(Sem título)",
      start: e.start?.dateTime ?? e.start?.date ?? "",
      end: e.end?.dateTime ?? e.end?.date ?? "",
      attendee:
        e.attendees?.[0]?.displayName ?? e.attendees?.[0]?.email ?? undefined,
      location: e.location,
      htmlLink: e.htmlLink,
    }));

    return { events };
  },
);
