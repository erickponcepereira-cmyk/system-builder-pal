// Server-only helpers for per-coach Google OAuth + Calendar sync.
import { supabaseAdmin } from "@/integrations/supabase/client.server";

export const GOOGLE_OAUTH_SCOPES = [
  "openid",
  "email",
  "profile",
  "https://www.googleapis.com/auth/calendar.readonly",
  "https://www.googleapis.com/auth/calendar.events",
].join(" ");

export function getRedirectUri(origin: string) {
  return `${origin.replace(/\/$/, "")}/api/oauth/google/callback`;
}

export function buildAuthUrl(params: {
  clientId: string;
  redirectUri: string;
  state: string;
}) {
  const u = new URL("https://accounts.google.com/o/oauth2/v2/auth");
  u.searchParams.set("client_id", params.clientId);
  u.searchParams.set("redirect_uri", params.redirectUri);
  u.searchParams.set("response_type", "code");
  u.searchParams.set("scope", GOOGLE_OAUTH_SCOPES);
  u.searchParams.set("access_type", "offline");
  u.searchParams.set("prompt", "consent");
  u.searchParams.set("include_granted_scopes", "true");
  u.searchParams.set("state", params.state);
  return u.toString();
}

export async function exchangeCodeForTokens(params: {
  code: string;
  redirectUri: string;
}) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const body = new URLSearchParams({
    code: params.code,
    client_id: clientId,
    client_secret: clientSecret,
    redirect_uri: params.redirectUri,
    grant_type: "authorization_code",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token exchange failed [${res.status}]: ${t}`);
  }
  return (await res.json()) as {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope: string;
    token_type: string;
    id_token?: string;
  };
}

export async function refreshAccessToken(refreshToken: string) {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID!;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET!;
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId,
    client_secret: clientSecret,
    grant_type: "refresh_token",
  });
  const res = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google token refresh failed [${res.status}]: ${t}`);
  }
  return (await res.json()) as {
    access_token: string;
    expires_in: number;
    scope: string;
    token_type: string;
  };
}

export async function fetchGoogleUserInfo(accessToken: string) {
  const res = await fetch("https://www.googleapis.com/oauth2/v2/userinfo", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!res.ok) return { email: null as string | null };
  const data = (await res.json()) as { email?: string };
  return { email: data.email ?? null };
}

/** Returns a valid (refreshed if needed) access token for the given user. */
export async function getValidAccessTokenForUser(userId: string) {
  const { data: row, error } = await supabaseAdmin
    .from("coach_google_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();
  if (error) throw error;
  if (!row) return null;

  const expiresAt = new Date(row.expires_at).getTime();
  const skewMs = 60_000;
  if (expiresAt - skewMs > Date.now()) {
    return { accessToken: row.access_token, row };
  }

  const refreshed = await refreshAccessToken(row.refresh_token);
  const newExpires = new Date(Date.now() + refreshed.expires_in * 1000).toISOString();
  await supabaseAdmin
    .from("coach_google_tokens")
    .update({
      access_token: refreshed.access_token,
      expires_at: newExpires,
      scope: refreshed.scope,
      token_type: refreshed.token_type,
    })
    .eq("user_id", userId);

  return { accessToken: refreshed.access_token, row: { ...row, access_token: refreshed.access_token, expires_at: newExpires } };
}

export type GoogleEvent = {
  id: string;
  summary?: string;
  description?: string;
  start?: { dateTime?: string; date?: string };
  end?: { dateTime?: string; date?: string };
  attendees?: Array<{ email?: string; displayName?: string }>;
  location?: string;
  htmlLink?: string;
  status?: string;
};

export async function fetchUpcomingGoogleEvents(accessToken: string, max = 50) {
  const params = new URLSearchParams({
    timeMin: new Date().toISOString(),
    maxResults: String(max),
    singleEvents: "true",
    orderBy: "startTime",
  });
  const res = await fetch(
    `https://www.googleapis.com/calendar/v3/calendars/primary/events?${params}`,
    { headers: { Authorization: `Bearer ${accessToken}` } },
  );
  if (!res.ok) {
    const t = await res.text();
    throw new Error(`Google Calendar fetch failed [${res.status}]: ${t.slice(0, 200)}`);
  }
  const data = (await res.json()) as { items?: GoogleEvent[] };
  return data.items ?? [];
}

/** Sync upcoming Google events into internal_appointments for the given coach. */
export async function syncCoachAppointments(userId: string, coachId: string) {
  const tok = await getValidAccessTokenForUser(userId);
  if (!tok) throw new Error("Google não conectado");

  const events = await fetchUpcomingGoogleEvents(tok.accessToken, 100);

  const rows = events.map((e) => {
    const start = e.start?.dateTime ?? e.start?.date ?? null;
    const end = e.end?.dateTime ?? e.end?.date ?? null;
    const att = e.attendees?.find((a) => a.email) ?? e.attendees?.[0];
    return {
      coach_id: coachId,
      google_event_id: e.id,
      summary: e.summary ?? "(Sem título)",
      description: e.description ?? null,
      start_at: start ? new Date(start).toISOString() : new Date().toISOString(),
      end_at: end ? new Date(end).toISOString() : null,
      attendee_name: att?.displayName ?? null,
      attendee_email: att?.email ?? null,
      location: e.location ?? null,
      html_link: e.htmlLink ?? null,
      status: e.status ?? "confirmed",
      source: "google",
      last_synced_at: new Date().toISOString(),
    };
  });

  if (rows.length > 0) {
    const { error } = await supabaseAdmin
      .from("internal_appointments")
      .upsert(rows, { onConflict: "coach_id,google_event_id" });
    if (error) throw error;
  }

  // Mark token row as synced
  await supabaseAdmin
    .from("coach_google_tokens")
    .update({ last_synced_at: new Date().toISOString() })
    .eq("user_id", userId);

  return { synced: rows.length };
}
