import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

export interface TestModeState {
  enabled: boolean;
  cutoffAt: string | null;
  setBy: string | null;
  setAt: string | null;
}

async function assertAdmin(ctx: { supabase: any; userId: string }) {
  const { data } = await ctx.supabase
    .from("profiles").select("role").eq("user_id", ctx.userId).maybeSingle();
  if (!data || data.role !== "admin") throw new Error("Acesso negado");
}

export const getTestModeState = createServerFn({ method: "GET" })
  .handler(async (): Promise<TestModeState> => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data } = await supabaseAdmin
      .from("app_settings")
      .select("key, value, updated_by, updated_at")
      .in("key", ["test_mode_enabled", "test_mode_cutoff_at"]);
    const map = new Map((data || []).map((r: any) => [r.key, r]));
    const en = map.get("test_mode_enabled");
    const co = map.get("test_mode_cutoff_at");
    return {
      enabled: String((en as any)?.value || "false") === "true",
      cutoffAt: ((co as any)?.value as string) || null,
      setBy: ((en as any)?.updated_by as string) || null,
      setAt: ((en as any)?.updated_at as string) || null,
    };
  });

export const setTestMode = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { enabled: boolean; cutoffAt?: string | null }) =>
    z.object({
      enabled: z.boolean(),
      cutoffAt: z.string().nullable().optional(),
    }).parse(d))
  .handler(async ({ data, context }) => {
    await assertAdmin(context);
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    // Quando ligando sem cutoff explícito, congela "agora" como marco
    const cutoff = data.enabled
      ? (data.cutoffAt && data.cutoffAt.trim() ? data.cutoffAt : new Date().toISOString())
      : (data.cutoffAt ?? "");
    const now = new Date().toISOString();
    // Resolve profile.id from auth user id (updated_by FK references profiles.id)
    const { data: prof } = await supabaseAdmin
      .from("profiles").select("id").eq("user_id", context.userId).maybeSingle();
    const updatedBy = (prof as any)?.id ?? null;
    const { error: e1 } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "test_mode_enabled", value: data.enabled ? "true" : "false", updated_by: updatedBy, updated_at: now }, { onConflict: "key" });
    if (e1) throw new Error(e1.message);
    const { error: e2 } = await supabaseAdmin
      .from("app_settings")
      .upsert({ key: "test_mode_cutoff_at", value: cutoff || "", updated_by: updatedBy, updated_at: now }, { onConflict: "key" });
    if (e2) throw new Error(e2.message);
    return { ok: true, enabled: data.enabled, cutoffAt: cutoff || null };
  });

/** Server-side helper: returns ISO cutoff string when test mode is on, else null. */
export async function getServerCutoffIso(): Promise<string | null> {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data } = await supabaseAdmin
    .from("app_settings").select("key, value")
    .in("key", ["test_mode_enabled", "test_mode_cutoff_at"]);
  const map = new Map((data || []).map((r: any) => [r.key, r.value]));
  if (String(map.get("test_mode_enabled") || "false") !== "true") return null;
  const v = String(map.get("test_mode_cutoff_at") || "");
  return v ? v : null;
}
