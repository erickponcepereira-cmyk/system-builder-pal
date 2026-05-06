import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import {
  exchangeCodeForTokens,
  fetchGoogleUserInfo,
  getRedirectUri,
  syncCoachAppointments,
  ensureFitMindCalendarId,
} from "@/server/google-oauth.server";

export const Route = createFileRoute("/api/oauth/google/callback")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const url = new URL(request.url);
        const code = url.searchParams.get("code");
        const state = url.searchParams.get("state");
        const error = url.searchParams.get("error");

        if (error) {
          return htmlResult(`Conexão cancelada: ${error}`, "/coach");
        }
        if (!code || !state) {
          return htmlResult("Parâmetros inválidos.", "/coach");
        }

        // Validate state
        const { data: stateRow } = await supabaseAdmin
          .from("oauth_states")
          .select("*")
          .eq("state", state)
          .maybeSingle();

        if (!stateRow) return htmlResult("State inválido ou expirado.", "/coach");
        if (new Date(stateRow.expires_at).getTime() < Date.now()) {
          await supabaseAdmin.from("oauth_states").delete().eq("state", state);
          return htmlResult("Sessão de autorização expirada. Tente novamente.", "/coach");
        }

        // Cleanup state
        await supabaseAdmin.from("oauth_states").delete().eq("state", state);

        const origin = `${url.protocol}//${url.host}`;
        const redirectUri = getRedirectUri(origin);

        try {
          const tokens = await exchangeCodeForTokens({ code, redirectUri });
          if (!tokens.refresh_token) {
            return htmlResult(
              "Google não devolveu refresh_token. Em myaccount.google.com → Apps com acesso, remova o acesso anterior e tente conectar novamente.",
              "/coach",
            );
          }

          const userInfo = await fetchGoogleUserInfo(tokens.access_token);

          // Find coach for this user
          const { data: profile } = await supabaseAdmin
            .from("profiles")
            .select("id")
            .eq("user_id", stateRow.user_id)
            .maybeSingle();
          const { data: coach } = profile
            ? await supabaseAdmin
                .from("coaches")
                .select("id")
                .eq("profile_id", profile.id)
                .maybeSingle()
            : { data: null };

          const expiresAt = new Date(Date.now() + tokens.expires_in * 1000).toISOString();

          await supabaseAdmin
            .from("coach_google_tokens")
            .upsert(
              {
                user_id: stateRow.user_id,
                coach_id: coach?.id ?? null,
                google_email: userInfo.email,
                access_token: tokens.access_token,
                refresh_token: tokens.refresh_token,
                token_type: tokens.token_type,
                scope: tokens.scope,
                expires_at: expiresAt,
              },
              { onConflict: "user_id" },
            );

          // First sync (best effort)
          if (coach?.id) {
            try {
              await syncCoachAppointments(stateRow.user_id, coach.id);
            } catch (e) {
              console.error("Initial sync failed:", e);
            }
          }

          throw redirect({ href: stateRow.redirect_to || "/coach" });
        } catch (e) {
          if (e instanceof Response) throw e;
          // redirect throws an object — re-throw unless plain Error
          if (e && typeof e === "object" && "isRedirect" in (e as object)) throw e;
          console.error("OAuth callback error:", e);
          return htmlResult(
            `Falha ao conectar: ${(e as Error)?.message ?? String(e)}`,
            "/coach",
          );
        }
      },
    },
  },
});

function htmlResult(message: string, redirectTo: string) {
  const html = `<!doctype html><meta charset="utf-8"><title>Google Agenda</title>
<body style="font-family:system-ui;background:#0A0A0A;color:#fff;display:flex;align-items:center;justify-content:center;min-height:100vh;padding:24px;text-align:center">
<div><h1 style="font-size:18px;margin:0 0 12px">Google Agenda</h1>
<p style="color:#bbb;margin:0 0 16px">${escapeHtml(message)}</p>
<a href="${redirectTo}" style="color:#f97316">Voltar</a></div>
<script>setTimeout(()=>location.href=${JSON.stringify(redirectTo)},3500)</script>
</body>`;
  return new Response(html, { status: 200, headers: { "Content-Type": "text/html; charset=utf-8" } });
}

function escapeHtml(s: string) {
  return s.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]!));
}
