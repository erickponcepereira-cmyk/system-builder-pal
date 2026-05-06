// Client-side middleware that attaches the current Supabase access token
// as `Authorization: Bearer <jwt>` so that server functions protected by
// `requireSupabaseAuth` receive the user identity.
import { createMiddleware } from "@tanstack/react-start";
import { supabase } from "@/integrations/supabase/client";

export const attachSupabaseAuth = createMiddleware({ type: "function" }).client(
  async ({ next }) => {
    let headers: Record<string, string> = {};
    try {
      const { data } = await supabase.auth.getSession();
      const token = data.session?.access_token;
      if (token) headers.Authorization = `Bearer ${token}`;
    } catch {
      // ignore — server will return 401
    }
    return next({ headers });
  },
);
