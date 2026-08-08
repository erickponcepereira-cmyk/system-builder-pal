import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type ModuleKey =
  | "nutricao"
  | "corrida"
  | "treinos"
  | "mentalidade"
  | "beneficios"
  | "avaliacao_fisica";

export const MODULE_LABELS: Record<ModuleKey, string> = {
  nutricao: "Nutrição",
  corrida: "Corrida",
  treinos: "Treinos",
  mentalidade: "Mentalidade",
  beneficios: "Benefícios",
  avaliacao_fisica: "Avaliação física",
};

export type ModuleRow = { module_key: string; enabled: boolean; source: string };

/**
 * Módulos liberados para o usuário logado.
 * A resolução (perfil → coach/parceiro → rede → white label → padrão) acontece no banco.
 */
export function useEnabledModules() {
  const [modules, setModules] = useState<Record<string, boolean>>({});
  const [profileId, setProfileId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const { data: userData } = await supabase.auth.getUser();
        if (!userData.user) return;
        const { data: profile, error: profErr } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (profErr) throw new Error(`perfil: ${profErr.message}`);
        const pid = (profile as { id?: string } | null)?.id ?? null;
        if (!alive) return;
        setProfileId(pid);
        if (!pid) throw new Error("Perfil não encontrado para o usuário logado.");
        const { data, error: rpcErr } = await supabase.rpc("resolver_modulos" as never, { _profile_id: pid } as never);
        if (!alive) return;
        if (rpcErr) throw new Error(`resolver_modulos: ${rpcErr.message}`);
        const map: Record<string, boolean> = {};
        for (const row of ((data as unknown as ModuleRow[]) || [])) map[row.module_key] = row.enabled;
        setModules(map);
        setError(null);
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        console.error("[useEnabledModules]", msg);
        if (alive) setError(msg);
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, []);

  return {
    loading,
    error,
    profileId,
    modules,
    isEnabled: (key: ModuleKey) => modules[key] === true,
  };
}
