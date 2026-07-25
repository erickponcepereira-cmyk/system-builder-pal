import { createFileRoute, redirect } from "@tanstack/react-router";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";

type AuthDetails = {
  redirect_url?: string;
  redirect_to?: string;
  client?: { name?: string; redirect_uri?: string } | null;
  scope?: string;
};

// Typed wrapper for the beta supabase.auth.oauth namespace.
type OAuthApi = {
  getAuthorizationDetails: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  approveAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
  denyAuthorization: (id: string) => Promise<{ data: AuthDetails | null; error: { message: string } | null }>;
};
const oauth = () => (supabase.auth as unknown as { oauth: OAuthApi }).oauth;

function safeNext(path: string): string {
  return path.startsWith("/") && !path.startsWith("//") ? path : "/";
}

export const Route = createFileRoute("/.lovable/oauth/consent")({
  ssr: false,
  validateSearch: (s: Record<string, unknown>) => ({
    authorization_id: typeof s.authorization_id === "string" ? s.authorization_id : "",
  }),
  beforeLoad: async ({ search, location }) => {
    if (!search.authorization_id) throw new Error("Missing authorization_id");
    const { data } = await supabase.auth.getSession();
    const next = location.pathname + location.searchStr;
    if (!data.session) throw redirect({ to: "/login", search: { next } as never });
  },
  loader: async ({ location }) => {
    const authorizationId = new URLSearchParams(location.search).get("authorization_id")!;
    const { data, error } = await oauth().getAuthorizationDetails(authorizationId);
    if (error) throw new Error(error.message);
    const immediate = data?.redirect_url ?? data?.redirect_to;
    if (immediate && !data?.client) throw redirect({ href: immediate } as never);
    return data;
  },
  component: Consent,
  errorComponent: ({ error }) => (
    <main className="min-h-screen flex items-center justify-center p-6 text-white bg-black">
      <div className="max-w-md text-center space-y-2">
        <h1 className="text-xl font-bold">Não foi possível carregar a autorização</h1>
        <p className="text-sm text-white/60">{String((error as Error)?.message ?? error)}</p>
      </div>
    </main>
  ),
});

function Consent() {
  const details = Route.useLoaderData() as AuthDetails | null;
  const { authorization_id } = Route.useSearch();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function decide(approve: boolean) {
    setBusy(true);
    setError(null);
    const api = oauth();
    const { data, error } = approve
      ? await api.approveAuthorization(authorization_id)
      : await api.denyAuthorization(authorization_id);
    if (error) { setBusy(false); setError(error.message); return; }
    const target = data?.redirect_url ?? data?.redirect_to;
    if (!target) { setBusy(false); setError("Servidor de autorização não retornou redirecionamento."); return; }
    window.location.href = target;
  }

  const clientName = details?.client?.name ?? "aplicativo externo";

  return (
    <main className="min-h-screen flex items-center justify-center p-6 bg-black text-white">
      <div className="w-full max-w-md rounded-2xl p-6 space-y-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h1 className="text-xl font-bold">Conectar {clientName} à sua conta FitMind</h1>
        <p className="text-sm text-white/70">
          Isso permite que <strong>{clientName}</strong> utilize as ferramentas deste app em seu nome,
          respeitando suas permissões (admin/coach/parceiro/profissional/aluno).
        </p>
        {details?.client?.redirect_uri && (
          <p className="text-xs text-white/40 break-all">Redirect: {details.client.redirect_uri}</p>
        )}
        {error && <p role="alert" className="text-sm text-red-400">{error}</p>}
        <div className="flex gap-2 pt-2">
          <button
            disabled={busy}
            onClick={() => decide(true)}
            className="flex-1 rounded-lg bg-primary text-black font-semibold px-4 py-2 disabled:opacity-50"
          >
            Aprovar
          </button>
          <button
            disabled={busy}
            onClick={() => decide(false)}
            className="flex-1 rounded-lg bg-white/10 text-white px-4 py-2 disabled:opacity-50"
          >
            Cancelar
          </button>
        </div>
        <p className="text-[11px] text-white/40 pt-2">
          Você pode revogar o acesso a qualquer momento nas configurações do FitMind.
        </p>
      </div>
    </main>
  );
}

export { safeNext };
