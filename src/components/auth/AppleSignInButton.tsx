import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";
import { getAuthRedirectUrl } from "@/lib/auth-redirects";
import { persistReferralForOAuth } from "@/lib/referral-signup";
import { enriquecerAtribuicao, urlDeRetornoComIndicacao } from "@/lib/atribuicao";
import { peekPostAuthIntent } from "@/lib/post-auth-intent";

/** Ícone da maçã (SVG inline, monocromático). */
function AppleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true" fill="currentColor">
      <path d="M16.365 1.43c0 1.14-.42 2.2-1.12 3-.79.92-2.06 1.63-3.14 1.55a3.4 3.4 0 0 1 1.13-2.9c.77-.82 2.1-1.5 3.13-1.65zM20.5 17.06c-.55 1.27-.82 1.83-1.53 2.95-.99 1.56-2.39 3.5-4.12 3.51-1.54.02-1.94-1-4.03-.99-2.09.01-2.52 1.01-4.06.99-1.73-.02-3.05-1.77-4.04-3.32C.02 15.85-.27 10.72 1.44 8c1.21-1.94 3.13-3.07 4.93-3.07 1.84 0 3 1.01 4.52 1.01 1.48 0 2.38-1.01 4.51-1.01 1.6 0 3.3.87 4.51 2.38-3.96 2.17-3.32 7.82.59 9.75z" />
    </svg>
  );
}

/**
 * Botão "Continuar com Apple".
 * Sempre volta para /auth/callback (rota pública) — nunca direto para um painel
 * protegido, senão a sessão ainda não estaria hidratada no retorno.
 */
export function AppleSignInButton({
  label = "Continuar com Apple",
  nextPath,
  role,
}: {
  label?: string;
  nextPath?: string | null;
  role?: "student" | "coach" | "partner" | "professional";
}) {
  const [loading, setLoading] = useState(false);

  const handleClick = async () => {
    setLoading(true);
    try {
      if (typeof window !== "undefined") {
        const intent = nextPath ?? peekPostAuthIntent();
        if (intent) sessionStorage.setItem("fitmind:auth-next", intent);
        if (role) sessionStorage.setItem("fitmind:auth-role", role);
        else sessionStorage.removeItem("fitmind:auth-role");

        if (role) localStorage.setItem("fitmind:auth-role", role);
        else localStorage.removeItem("fitmind:auth-role");
      }
      // Indicação precisa sobreviver ao redirect do OAuth.
      await enriquecerAtribuicao();
      persistReferralForOAuth();

      const result = await lovable.auth.signInWithOAuth("apple", {
        redirect_uri: urlDeRetornoComIndicacao(getAuthRedirectUrl("/auth/callback")),
      });

      if (result.error) {
        toast.error("Não foi possível entrar com a Apple. Tente novamente.");
        setLoading(false);
        return;
      }

      if (result.redirected) return; // navegador vai redirecionar

      // Popup: sessão já definida — segue para o callback resolver o cadastro.
      window.location.href = "/auth/callback";
    } catch {
      toast.error("Falha ao conectar com a Apple.");
      setLoading(false);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={loading}
      className="flex w-full items-center justify-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm font-semibold text-white transition hover:bg-white/10 disabled:opacity-50"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <AppleIcon className="h-5 w-5" />}
      {label}
    </button>
  );
}
