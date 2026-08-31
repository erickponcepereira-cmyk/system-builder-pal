import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveGoogleAccount } from "@/lib/google-signup.functions";
import { Logo } from "@/components/Logo";
import { Button } from "@/components/ui/button";
import { clearPostAuthIntent, peekPostAuthIntent, setPostAuthIntent } from "@/lib/post-auth-intent";
import { gravarAtribuicaoResolvida, gravarToqueId, resolverCodigo } from "@/lib/atribuicao";



export const Route = createFileRoute("/auth/callback")({
  head: () => ({
    meta: [
      { title: "Entrando… — FitMind Club" },
      { name: "description", content: "Concluindo o login na FitMind Club." },
    ],
  }),
  component: AuthCallbackPage,
});

function pendingRole(): "coach" | "partner" | "professional" | "student" | null {
  if (typeof window === "undefined") return null;
  const raw =
    sessionStorage.getItem("fitmind:auth-role") || localStorage.getItem("fitmind:auth-role");
  sessionStorage.removeItem("fitmind:auth-role");
  localStorage.removeItem("fitmind:auth-role");
  if (raw === "coach" || raw === "partner" || raw === "professional" || raw === "student") return raw;
  return null;
}

function safeNext(): string | null {
  if (typeof window === "undefined") return null;
  const raw = sessionStorage.getItem("fitmind:auth-next");
  sessionStorage.removeItem("fitmind:auth-next");
  if (raw && raw.startsWith("/") && !raw.startsWith("//")) {
    return raw;
  }
  // O sessionStorage não sobrevive ao OAuth em alguns aparelhos: usa o
  // destino durável guardado antes de sair para o Google.
  return peekPostAuthIntent();
}


function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Concluindo o login...");
  const [retryNeeded, setRetryNeeded] = useState(false);
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
      // A indicação viaja na própria URL de retorno: é o que sobrevive quando
      // o login com Apple/Google termina em outro navegador (link do WhatsApp).
      try {
        const params = new URLSearchParams(window.location.search);
        const ref = params.get("ref");
        const toque = params.get("rt");
        if (toque) gravarToqueId(toque);
        if (ref) {
          const row = await resolverCodigo(ref);
          if (row) gravarAtribuicaoResolvida(ref, row);
        }
      } catch { /* indicação é melhor-esforço, não bloqueia o login */ }

      // Aguarda a sessão ser hidratada (o SDK pode ainda estar gravando o token).

      let session = null as Awaited<ReturnType<typeof supabase.auth.getSession>>["data"]["session"];
      for (let i = 0; i < 25; i++) {
        const { data } = await supabase.auth.getSession();
        if (data.session?.user) { session = data.session; break; }
        await new Promise((r) => setTimeout(r, 200));
      }

      if (!session) {
        toast.error("Não foi possível concluir o login. Tente novamente.");
        navigate({ to: "/login", replace: true });
        return;
      }

      const next = safeNext();
      const role = pendingRole();
      if (next) setPostAuthIntent(next);

      try {
        setMessage("Verificando seu cadastro...");
        const state = await resolveGoogleAccount({ data: undefined as never });

        if (state.status === "needs_profile") {
          // Ainda falta completar o cadastro: devolve o destino para depois.
          navigate({
            to: "/complete-signup",
            search: role && role !== "student" ? { role } : {},
            replace: true,
          });
          return;
        }


        if (state.status === "linked") {
          toast.success("Conta Google vinculada ao seu cadastro existente.");
        }

        if (role && role !== "student") {
          navigate({ to: "/upgrade/$role", params: { role }, replace: true });
          return;
        }

        if (next) {
          if (next.startsWith("/student")) {
            try { sessionStorage.setItem("fitmind_selected_area", "student"); } catch { /* storage indisponível */ }
          }
          clearPostAuthIntent();
          window.location.replace(next);
          return;
        }

        navigate({ to: "/portal-selector", replace: true });
      } catch (e) {
        const errorMessage = (e as Error)?.message || "Falha ao verificar o cadastro.";
        toast.error(errorMessage);
        if (next) setPostAuthIntent(next);
        setMessage("Não foi possível verificar seu cadastro. Sua indicação e sua loja continuam salvas.");
        setRetryNeeded(true);
      }
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4" style={{ backgroundColor: "#0A0A0A" }}>
      <Logo />
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-white/60">{message}</p>
      {retryNeeded ? (
        <Button type="button" onClick={() => window.location.reload()}>
          <RefreshCw className="mr-2 h-4 w-4" />
          Tentar novamente
        </Button>
      ) : null}
    </div>
  );
}
