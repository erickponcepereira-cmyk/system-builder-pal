import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { gravarAtribuicao } from "@/lib/atribuicao";
import { z } from "zod";

/**
 * `/r/{code}` deixou de ser um funil de mão única para o cadastro.
 *
 * Ele continua sendo o mecanismo de ATRIBUIÇÃO (quem indicou), mas o
 * DESTINO agora depende da intenção do link:
 *
 *   /r/CODE?p={id}       -> abre o produto
 *   /r/CODE?to=cadastro  -> vai direto ao cadastro
 *   /r/CODE              -> abre a loja pública
 *
 * Links antigos não quebram: os que já circulam por aí têm `?p=` ou nada,
 * e nos dois casos passam a cair em conteúdo em vez de um formulário.
 */
export const Route = createFileRoute("/r/$code")({
  validateSearch: (search: Record<string, unknown>) =>
    z
      .object({
        p: z.string().optional(),
        to: z.enum(["cadastro", "loja"]).optional(),
      })
      .parse(search),
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
  const { p: productId, to: destinoPedido } = Route.useSearch();
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
      // Atribuição durável: localStorage + primeiro toque. Sobrevive ao
      // redirect do OAuth do Google, que o sessionStorage acima não garante.
      gravarAtribuicao({
        codigo: code,
        coachId: row.coach_id,
        coachNome: row.sponsor_name,
        parceiroId: row.partner_id,
      });
      let productKind: "challenge" | "partner" | "professional" | null = null;
      if (productId) {
        sessionStorage.setItem("fitmind_pending_product", productId);
        const [{ data: ch }, { data: pp }, { data: pr }] = await Promise.all([
          supabase.from("products").select("id").eq("id", productId).maybeSingle(),
          supabase.from("partner_products" as never).select("id").eq("id" as never, productId as never).maybeSingle(),
          supabase.from("professional_products" as never).select("id").eq("id" as never, productId as never).maybeSingle(),
        ]);
        if (ch?.id) productKind = "challenge";
        else if ((pp as any)?.id) productKind = "partner";
        else if ((pr as any)?.id) productKind = "professional";
        if (productKind) {
          sessionStorage.setItem("fitmind_pending_product_kind", productKind);
        }
      }
      setSponsorName(row.sponsor_name || "");
      setStatus("valid");

      // Se já está logado: verifica se tem registro de aluno (mesmo que role seja admin/coach/partner).
      // - tem registro de aluno → entra na loja como aluno (mantém sessão, troca área)
      // - não tem registro de aluno → desloga e manda pro cadastro
      const { data: userData } = await supabase.auth.getUser();
      let nextAction: "store" | "register" = "register";
      if (userData.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("id")
          .eq("user_id", userData.user.id)
          .maybeSingle();
        if (profile?.id) {
          const { data: student } = await supabase
            .from("students")
            .select("id")
            .eq("profile_id", profile.id)
            .maybeSingle();
          if (student?.id) {
            sessionStorage.setItem("fitmind_selected_area", "student");
            nextAction = "store";
          } else {
            await supabase.auth.signOut();
          }
        } else {
          await supabase.auth.signOut();
        }
      }
      setTimeout(() => {
        // aluno já logado: segue para a loja logada, como antes
        if (nextAction === "store") {
          navigate({ to: "/student/store" });
          return;
        }
        // link de produto. Hoje só `products` tem permalink público;
        // partner/professional caem na loja até ganharem página própria.
        if (productId && productKind === "challenge") {
          navigate({ to: "/produto/$id", params: { id: productId } });
          return;
        }
        // link explícito da loja vinculada ao indicador
        if (destinoPedido === "loja" || (productId && !productKind)) {
          navigate({ to: "/loja" });
          return;
        }
        // padrão do link de indicação: cadastro com o indicador travado
        navigate({ to: "/register" });
      }, 900);




    })();
    return () => {
      cancelled = true;
    };
  }, [code, productId, destinoPedido, navigate]);

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
              {destinoPedido === "cadastro"
                ? "Levando você ao cadastro..."
                : productId
                  ? "Abrindo o produto..."
                  : "Abrindo a loja..."}
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
              onClick={() => navigate({ to: "/loja" })}
              className="mt-5 w-full rounded-lg bg-primary px-4 py-2 text-sm font-bold text-primary-foreground"
            >
              Ver a loja mesmo assim
            </button>
          </>
        )}
      </div>
    </div>
  );
}
