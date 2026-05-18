import { createFileRoute, redirect } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { buildAuthUrl, getRedirectUri } from "@/server/google-oauth.server";

export const Route = createFileRoute("/api/oauth/google/start")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
        if (!clientId) {
          return new Response("GOOGLE_OAUTH_CLIENT_ID not configured", { status: 500 });
        }

        // Authenticate user via Supabase access token in cookie or header
        const authHeader = request.headers.get("authorization");
        let userId: string | null = null;

        if (authHeader?.startsWith("Bearer ")) {
          const token = authHeader.slice(7);
          const { data } = await supabaseAdmin.auth.getUser(token);
          userId = data.user?.id ?? null;
        } else {
          // Try cookie sb-access-token (frontend will pass token via query as fallback)
          const url = new URL(request.url);
          const tokenParam = url.searchParams.get("access_token");
          if (tokenParam) {
            const { data } = await supabaseAdmin.auth.getUser(tokenParam);
            userId = data.user?.id ?? null;
          }
        }

        if (!userId) {
          return new Response("Não autenticado. Faça login e tente novamente.", { status: 401 });
        }

        const url = new URL(request.url);
        const origin = `${url.protocol}//${url.host}`;
        const redirectUri = getRedirectUri(origin);
        const isPopup = url.searchParams.get("popup") === "1";

        // Generate state and store
        const state = crypto.randomUUID() + "." + crypto.randomUUID();
        await supabaseAdmin.from("oauth_states").insert({
          state,
          user_id: userId,
          provider: "google",
          redirect_to: isPopup ? "__popup__" : "/coach",
        });

        const authUrl = buildAuthUrl({ clientId, redirectUri, state });
        throw redirect({ href: authUrl });
      },
    },
  },
});
