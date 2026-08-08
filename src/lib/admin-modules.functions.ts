import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";
import { attachSupabaseAuth } from "@/integrations/supabase/auth-client-middleware";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

async function exigirAdmin(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: me } = await supabaseAdmin
    .from("profiles")
    .select("id, role")
    .eq("user_id", userId)
    .maybeSingle();
  if (!me || (me as { role?: string }).role !== "admin") {
    throw new Error("Apenas administradores podem gerenciar os módulos.");
  }
  return supabaseAdmin;
}

export type ModuleScope = "global" | "theme" | "partner" | "coach" | "profile";

export interface ModuleSetting {
  id: string;
  scope_type: ModuleScope;
  scope_id: string | null;
  module_key: string;
  enabled: boolean;
  /** Nome amigável do alvo (coach, parceiro, tema...). */
  scope_label?: string | null;
}

export const listModuleSettings = createServerFn({ method: "POST" })
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const { data } = await supabaseAdmin
      .from("module_settings")
      .select("id, scope_type, scope_id, module_key, enabled")
      .order("scope_type")
      .order("module_key");

    const rows = (data as unknown as ModuleSetting[]) || [];
    const coachIds = rows.filter((r) => r.scope_type === "coach" && r.scope_id).map((r) => r.scope_id!);
    const partnerIds = rows.filter((r) => r.scope_type === "partner" && r.scope_id).map((r) => r.scope_id!);
    const profileIds = rows.filter((r) => r.scope_type === "profile" && r.scope_id).map((r) => r.scope_id!);

    const [{ data: coaches }, { data: partners }] = await Promise.all([
      coachIds.length
        ? supabaseAdmin.from("coaches").select("id, profile_id").in("id", coachIds)
        : Promise.resolve({ data: [] as Array<{ id: string; profile_id: string }> }),
      partnerIds.length
        ? supabaseAdmin.from("partners").select("id, fantasy_name").in("id", partnerIds)
        : Promise.resolve({ data: [] as Array<{ id: string; fantasy_name: string | null }> }),
    ]);

    const coachRows = (coaches as Array<{ id: string; profile_id: string }> | null) || [];
    const perfilIds = Array.from(new Set([...coachRows.map((c) => c.profile_id), ...profileIds]));
    const { data: perfis } = perfilIds.length
      ? await supabaseAdmin.from("profiles").select("id, name, email").in("id", perfilIds)
      : { data: [] as Array<{ id: string; name: string | null; email: string | null }> };

    const perfilMap = new Map(
      ((perfis as Array<{ id: string; name: string | null; email: string | null }> | null) || []).map((p) => [p.id, p]),
    );
    const coachMap = new Map(coachRows.map((c) => [c.id, perfilMap.get(c.profile_id)]));
    const partnerMap = new Map(
      ((partners as Array<{ id: string; fantasy_name: string | null }> | null) || []).map((p) => [p.id, p.fantasy_name]),
    );

    return {
      settings: rows.map((row) => ({
        ...row,
        scope_label:
          row.scope_type === "global"
            ? "Padrão do sistema"
            : row.scope_type === "coach"
              ? coachMap.get(row.scope_id || "")?.name || coachMap.get(row.scope_id || "")?.email || row.scope_id
              : row.scope_type === "partner"
                ? partnerMap.get(row.scope_id || "") || row.scope_id
                : row.scope_type === "profile"
                  ? perfilMap.get(row.scope_id || "")?.name || row.scope_id
                  : row.scope_id,
      })),
    };
  });

const setSchema = z.object({
  scope_type: z.enum(["global", "theme", "partner", "coach", "profile"]),
  scope_id: z.string().nullable().optional(),
  module_key: z.string().min(2),
  enabled: z.boolean(),
});

export const setModuleSetting = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => setSchema.parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const scopeId = data.scope_type === "global" ? null : (data.scope_id ?? null);
    if (data.scope_type !== "global" && !scopeId) throw new Error("Selecione o alvo do módulo.");

    let query = supabaseAdmin
      .from("module_settings")
      .select("id")
      .eq("scope_type", data.scope_type)
      .eq("module_key", data.module_key);
    query = scopeId ? query.eq("scope_id", scopeId) : query.is("scope_id", null);
    const { data: existing } = await query.maybeSingle();

    if (existing) {
      const { error } = await supabaseAdmin
        .from("module_settings")
        .update({ enabled: data.enabled, updated_at: new Date().toISOString() } as never)
        .eq("id", (existing as { id: string }).id);
      if (error) throw new Error(error.message);
    } else {
      const { error } = await supabaseAdmin.from("module_settings").insert({
        scope_type: data.scope_type,
        scope_id: scopeId,
        module_key: data.module_key,
        enabled: data.enabled,
      } as never);
      if (error) throw new Error(error.message);
    }
    return { ok: true };
  });

export const removeModuleSetting = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ id: z.string().uuid() }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const { error } = await supabaseAdmin.from("module_settings").delete().eq("id", data.id);
    if (error) throw new Error(error.message);
    return { ok: true };
  });

export interface ModuleTarget {
  kind: "coach" | "partner";
  id: string;
  name: string;
  email: string | null;
}

export const searchModuleTargets = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ q: z.string().default("") }).parse(input ?? {}))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }) => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const termo = data.q.trim();
    if (!termo) return { targets: [] as ModuleTarget[] };

    const { data: perfis } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .or(`name.ilike.%${termo}%,email.ilike.%${termo}%`)
      .limit(40);
    const lista = (perfis as Array<{ id: string; name: string | null; email: string | null }> | null) || [];
    if (lista.length === 0) return { targets: [] as ModuleTarget[] };
    const ids = lista.map((p) => p.id);
    const mapa = new Map(lista.map((p) => [p.id, p]));

    const [{ data: coaches }, { data: partners }] = await Promise.all([
      supabaseAdmin.from("coaches").select("id, profile_id").in("profile_id", ids).limit(40),
      supabaseAdmin.from("partners").select("id, profile_id, fantasy_name").in("profile_id", ids).limit(40),
    ]);

    const targets: ModuleTarget[] = [
      ...((coaches as Array<{ id: string; profile_id: string }> | null) || []).map((c) => ({
        kind: "coach" as const,
        id: c.id,
        name: mapa.get(c.profile_id)?.name || "Coach",
        email: mapa.get(c.profile_id)?.email ?? null,
      })),
      ...((partners as Array<{ id: string; profile_id: string; fantasy_name: string | null }> | null) || []).map((p) => ({
        kind: "partner" as const,
        id: p.id,
        name: p.fantasy_name || mapa.get(p.profile_id)?.name || "Parceiro",
        email: mapa.get(p.profile_id)?.email ?? null,
      })),
    ];
    return { targets };
  });

export interface ModuleResolution {
  profile: { id: string; name: string | null; email: string | null } | null;
  chain: string[];
  modules: Array<{ module_key: string; enabled: boolean; source: string }>;
}

/**
 * Diagnóstico: mostra exatamente quais módulos uma pessoa enxerga hoje
 * e por qual regra (perfil, coach, rede, tema ou padrão).
 */
export const resolveModulesForUser = createServerFn({ method: "POST" })
  .inputValidator((input: unknown) => z.object({ q: z.string().min(2) }).parse(input))
  .middleware([attachSupabaseAuth, requireSupabaseAuth])
  .handler(async ({ context, data }): Promise<ModuleResolution> => {
    const supabaseAdmin = await exigirAdmin(context.userId);
    const termo = data.q.trim();
    const { data: perfis } = await supabaseAdmin
      .from("profiles")
      .select("id, name, email")
      .or(`name.ilike.%${termo}%,email.ilike.%${termo}%`)
      .limit(1);
    const perfil = ((perfis as Array<{ id: string; name: string | null; email: string | null }> | null) || [])[0] ?? null;
    if (!perfil) return { profile: null, chain: [], modules: [] };

    const [{ data: chain }, { data: mods }] = await Promise.all([
      supabaseAdmin.rpc("cadeia_coaches_do_perfil" as never, { _profile_id: perfil.id } as never),
      supabaseAdmin.rpc("resolver_modulos" as never, { _profile_id: perfil.id } as never),
    ]);

    return {
      profile: perfil,
      chain: ((chain as unknown as string[]) || []).filter(Boolean),
      modules: (mods as unknown as Array<{ module_key: string; enabled: boolean; source: string }>) || [],
    };
  });
