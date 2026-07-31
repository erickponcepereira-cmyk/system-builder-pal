import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/** Só regrava o "último acesso" se o registro anterior tiver mais de 6h. */
const MIN_INTERVAL_MS = 6 * 60 * 60 * 1000;

export const touchLastLogin = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { userId } = context;
    const nowIso = new Date().toISOString();

    const { data: profile } = await supabaseAdmin
      .from("profiles")
      .select("id, last_app_login_at")
      .eq("user_id", userId)
      .maybeSingle();

    if (!profile?.id) return { ok: true, at: null, skipped: true };

    const last = profile.last_app_login_at ? new Date(profile.last_app_login_at).getTime() : 0;
    if (Date.now() - last < MIN_INTERVAL_MS) {
      return { ok: true, at: profile.last_app_login_at, skipped: true };
    }

    await supabaseAdmin
      .from("profiles")
      .update({ last_app_login_at: nowIso })
      .eq("id", profile.id);

    // Mantém coaches.last_activity_at em sincronia para os painéis de inatividade
    await supabaseAdmin
      .from("coaches")
      .update({ last_activity_at: nowIso })
      .eq("profile_id", profile.id);

    return { ok: true, at: nowIso, skipped: false };
  });
