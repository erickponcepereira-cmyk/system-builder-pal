import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/**
 * Gate das superfícies de teste (loja unificada em /student/loja-teste e
 * /coach/loja-teste).
 *
 * Critério: `profiles.is_master_admin`. É a mesma flag que o AdminShell usa
 * para liberar o painel inteiro, então quem já é master admin enxerga o teste
 * sem cadastro novo, e ninguém precisa lembrar de editar uma lista quando
 * alguém troca de e-mail.
 *
 * Para fechar mais (ex.: só dois e-mails, mesmo entre master admins),
 * preencha ALLOWED_EMAILS. Vazio = qualquer master admin entra.
 */
const ALLOWED_EMAILS: string[] = [];

export type TestAccess = { allowed: boolean; loading: boolean };

export function useTestPanelAccess(): TestAccess {
  const [allowed, setAllowed] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) {
          setAllowed(false);
          return;
        }

        if (ALLOWED_EMAILS.length > 0) {
          const email = (user.email || "").toLowerCase();
          if (!ALLOWED_EMAILS.map((e) => e.toLowerCase()).includes(email)) {
            setAllowed(false);
            return;
          }
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("is_master_admin")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active) return;
        setAllowed(!!(profile as { is_master_admin?: boolean } | null)?.is_master_admin);
      } catch (error) {
        console.error("[test-access]", error);
        if (active) setAllowed(false);
      } finally {
        if (active) setLoading(false);
      }
    })();

    return () => { active = false; };
  }, []);

  return { allowed, loading };
}
