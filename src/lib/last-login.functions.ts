import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export const touchLastLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const nowIso = new Date().toISOString();
    await supabaseAdmin
      .from("profiles")
      .update({ last_app_login_at: nowIso })
      .eq("user_id", userId);
    // Also keep coaches.last_activity_at in sync for the inactivity dashboards
    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id")
      .eq("user_id", userId)
      .maybeSingle();
    if (profile?.id) {
      await supabaseAdmin
        .from("coaches")
        .update({ last_activity_at: nowIso })
        .eq("profile_id", profile.id);
    }
    return { ok: true, at: nowIso };
  });
