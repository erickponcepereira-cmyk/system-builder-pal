import { createFileRoute, Outlet, redirect } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Pathless layout para todas as áreas autenticadas (admin, coach,
 * student, partner, professional).
 *
 * Estratégia:
 *  - `ssr: false`: a verificação roda apenas no navegador / WebView do APK.
 *    O Supabase persiste a sessão em `localStorage` e o servidor SSR não
 *    enxerga isso. Sem essa flag, qualquer hard refresh ou abertura via
 *    deep link era avaliada no servidor, encontrava `session = null` e
 *    redirecionava para /login antes da hidratação — derrubando a sessão
 *    salva em localStorage.
 *  - `beforeLoad` client-side lê a sessão diretamente do localStorage do
 *    Supabase. Se existir, segue; se não, redireciona para /login.
 *  - Cada rota filha (admin, student, coach, partner, professional) NÃO
 *    precisa mais validar sessão — o gate fica centralizado aqui.
 */
export const Route = createFileRoute("/_authenticated")({
  ssr: false,
  beforeLoad: async ({ location }) => {
    const { data, error } = await supabase.auth.getSession();
    if (error || !data.session?.user) {
      throw redirect({
        to: "/login",
        search: { redirect: location.href } as never,
      });
    }
    return { user: data.session.user };
  },
  component: () => <Outlet />,
});
