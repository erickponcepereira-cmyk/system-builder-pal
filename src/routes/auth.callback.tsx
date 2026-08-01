import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { resolveGoogleAccount } from "@/lib/google-signup.functions";
import { Logo } from "@/components/Logo";
import { clearPostAuthIntent, setPostAuthIntent, takePostAuthIntent } from "@/lib/post-auth-intent";


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
    clearPostAuthIntent();
    return raw;
  }
  // O sessionStorage não sobrevive ao OAuth em alguns aparelhos: usa o
  // destino durável guardado antes de sair para o Google.
  return takePostAuthIntent();
}


function AuthCallbackPage() {
  const navigate = useNavigate();
  const [message, setMessage] = useState("Concluindo o login...");
  const ran = useRef(false);

  useEffect(() => {
    if (ran.current) return;
    ran.current = true;

    (async () => {
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

      try {
        setMessage("Verificando seu cadastro...");
        const state = await resolveGoogleAccount({ data: undefined as never });

        if (state.status === "needs_profile") {
          // Ainda falta completar o cadastro: devolve o destino para depois.
          if (next) setPostAuthIntent(next);
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
          window.location.replace(next);
          return;
        }

        navigate({ to: "/portal-selector", replace: true });
      } catch (e) {
        toast.error((e as Error)?.message || "Falha ao verificar o cadastro.");
        navigate({ to: "/complete-signup", search: {}, replace: true });
      }
    })();
  }, [navigate]);

  return (
    <div className="flex min-h-screen flex-col items-center justify-center gap-4 px-4" style={{ backgroundColor: "#0A0A0A" }}>
      <Logo />
      <Loader2 className="h-6 w-6 animate-spin text-primary" />
      <p className="text-sm text-white/60">{message}</p>
    </div>
  );
}
