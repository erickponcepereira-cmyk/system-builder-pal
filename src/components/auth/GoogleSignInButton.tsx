import { useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { lovable } from "@/integrations/lovable/index";
import { getAuthRedirectUrl } from "@/lib/auth-redirects";
import { persistReferralForOAuth } from "@/lib/referral-signup";
import { enriquecerAtribuicao } from "@/lib/atribuicao";
import { peekPostAuthIntent } from "@/lib/post-auth-intent";



/** Ícone oficial do Google (SVG inline, cores da marca). */
function GoogleIcon({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" className={className} aria-hidden="true">
      <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z" />
      <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.99.66-2.26 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84A11 11 0 0 0 12 23z" />
      <path fill="#FBBC05" d="M5.84 14.11a6.6 6.6 0 0 1 0-4.22V7.05H2.18a11 11 0 0 0 0 9.9l3.66-2.84z" />
      <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.05l3.66 2.84C6.71 7.31 9.14 5.38 12 5.38z" />
    </svg>
  );
}

/**
 * Botão "Continuar com Google".
 * Sempre volta para /auth/callback (rota pública) — nunca direto para um painel
 * protegido, senão a sessão ainda não estaria hidratada no retorno.
 *
 * `role` guarda a intenção de cadastro (coach/parceiro/profissional): depois do
 * Google, o callback leva a pessoa para completar só o que o Google não dá.
 */
export function GoogleSignInButton({
  label = "Continuar com Google",
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
      // Indicação precisa sobreviver ao redirect do OAuth. Se o link trouxe só
      // `?ref={codigo}`, resolve o coach antes de sair — depois do Google não
      // há mais querystring para consultar.
      await enriquecerAtribuicao();
      persistReferralForOAuth();


      const result = await lovable.auth.signInWithOAuth("google", {
        redirect_uri: getAuthRedirectUrl("/auth/callback"),
      });

      if (result.error) {
        toast.error("Não foi possível entrar com o Google. Tente novamente.");
        setLoading(false);
        return;
      }

      if (result.redirected) return; // navegador vai redirecionar

      // Popup: sessão já definida — segue para o callback resolver o cadastro.
      window.location.href = "/auth/callback";
    } catch {
      toast.error("Falha ao conectar com o Google.");
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
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GoogleIcon className="h-5 w-5" />}
      {label}
    </button>
  );
}
