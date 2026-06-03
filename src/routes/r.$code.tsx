import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { z } from "zod";

export const Route = createFileRoute("/r/$code")({
  validateSearch: (search: Record<string, unknown>) =>
    z.object({ p: z.string().optional() }).parse(search),
  head: () => ({
    meta: [
      { title: "Convite — FitMind Club" },
      { name: "description", content: "Você foi convidado para o FitMind Club. Crie sua conta e comece sua jornada." },
    ],
  }),
  component: ReferralLandingPage,
});

function ReferralLandingPage() {
  const { code } = Route.useParams();
  const { p: productId } = Route.useSearch();
  const navigate = useNavigate();
  const [status, setStatus] = useState<"loading" | "valid" | "invalid">("loading");
  const [sponsorName, setSponsorName] = useState<string>("");

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase.rpc("validate_referral_code" as never, { _code: code } as never);
      if (cancelled) return;
      type Row = {
        valid: boolean;
        kind: "coach" | "student" | "partner" | null;
        sponsor_name: string | null;
        coach_id: string | null;
        referred_by_student_id: string | null;
        partner_id: string | null;
      };
      const row = (Array.isArray(data) ? (data[0] as Row | undefined) : null) ?? null;
      if (error || !row || !row.valid) {
        setStatus("invalid");
        return;
      }
      sessionStorage.setItem(
        "fitmind_referral",
        JSON.stringify({
          code,
          kind: row.kind,
          sponsorName: row.sponsor_name,
          coachId: row.coach_id,
          referredByStudentId: row.referred_by_student_id,
          partnerId: row.partner_id,
          productId: productId || null,
        })
      );
      if (productId) {
        sessionStorage.setItem("fitmind_pending_product", productId);
      }
      setSponsorName(row.sponsor_name || "");
      setStatus("valid");

      // Se já está logado: verifica o papel.
      // - aluno → vai direto pra loja (mantém sessão)
      // - outro papel (admin/coach/etc) → desloga e manda pro cadastro como aluno
      const { data: userData } = await supabase.auth.getUser();
      let nextAction: "store" | "register" = "register";
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (profile?.role === "student") {
          nextAction = "store";
        } else {
          await supabase.auth.signOut();
        }
      }
      setTimeout(() => {
        if (nextAction === "store") {
          navigate({ to: "/student/store" });
          return;
        }
        const targetRole = row.kind === "coach" ? "coach" : "student";
        navigate({ to: "/register", search: { role: targetRole } });
      }, 1200);


    })();
    return () => {
      cancelled = true;
    };
  }, [code, productId, navigate]);

  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-sm rounded-2xl p-8 text-center" style={{ backgroundColor: "#1A1A1A" }}>
        <Logo className="mx-auto mb-4 h-12 w-12 object-contain" />
        {status === "loading" && (
          <>
            <Loader2 className="mx-auto h-6 w-6 animate-spin text-primary" />
            <p className="mt-3 text-sm text-white/60">Validando seu convite...</p>
          </>
        )}
        {status === "valid" && (
          <>
            <p className="text-xs uppercase tracking-wider text-primary font-bold">Convite válido</p>
            <h1 className="mt-2 text-xl font-bold text-white">Bem-vindo ao FitMind Club!</h1>
            <p className="mt-2 text-sm text-white/60">
              Você foi convidado por <span className="font-semibold text-white">{sponsorName}</span>.
            </p>
            <p className="mt-4 text-xs text-white/40">
              {productId ? "Redirecionando para o produto..." : "Redirecionando para o cadastro..."}
            </p>
            <Loader2 className="mx-auto mt-3 h-4 w-4 animate-spin text-white/40" />
          </>
        )}
        {status === "invalid" && (
          <>
            <h1 className="text-lg font-bold text-white">Convite inválido</h1>
            <p className="mt-2 text-sm text-white/60">
              Este link de indicação não foi reconhecido ou expirou.
            </p>
            <button
              onClick={() => navigate({ to: "/register" })}
              className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Continuar sem indicação
            </button>
          </>
        )}
      </div>
    </div>
  );
}
