import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { gravarAtribuicaoResolvida } from "@/lib/atribuicao";
import { setPendingProduct } from "@/lib/pending-product";
import { setStoreIntent } from "@/lib/post-auth-intent";

import { z } from "zod";

/**
 * `/r/{code}` é o mecanismo de ATRIBUIÇÃO (quem indicou). O DESTINO
 * depende da intenção do link:
 *
 *   /r/CODE              -> cadastro (link de indicação clássico)
 *   /r/CODE?to=cadastro  -> cadastro
 *   /r/CODE?to=loja      -> loja pública vinculada ao indicador
 *   /r/CODE?p={id}       -> abre o produto
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
      // Em guia anônima / modo privado o storage pode lançar. Sem o try,
      // o link de indicação travava na tela "Validando seu convite...".
      // O link explícito atual é autoritativo e substitui uma indicação antiga
      // ainda não convertida neste navegador.
      gravarAtribuicaoResolvida(code, row);
      let productKind: "challenge" | "partner" | "professional" | null = null;
      if (productId) {
        setPendingProduct(productId, null);
        const { data: produtoPublico } = await supabase.rpc(
          "catalogo_publico_produto" as never,
          { _id: productId } as never,
        );
        type ProdutoPublicoRow = { fonte?: string; tipo?: string };
        const encontrado = Array.isArray(produtoPublico)
          ? (produtoPublico[0] as ProdutoPublicoRow | undefined)
          : undefined;
        if (encontrado?.fonte === "partner") productKind = "partner";
        else if (encontrado?.fonte === "professional") productKind = "professional";
        else if (encontrado) productKind = "challenge";
        setPendingProduct(productId, productKind);
      }
      setSponsorName(row.sponsor_name || "");
      setStatus("valid");

      // Destino pretendido: se o link é de loja ou de produto, a pessoa deve
      // voltar para a loja logada depois de entrar/cadastrar.
      if (productId || destinoPedido === "loja") {
        setStoreIntent(productId ?? null);
      }


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
            try { sessionStorage.setItem("fitmind_selected_area", "student"); } catch { /* storage indisponível */ }
            nextAction = "store";
          } else {
            await supabase.auth.signOut();
          }
        } else {
          await supabase.auth.signOut();
        }
      }
      setTimeout(() => {
        // Link de produto SEMPRE abre o produto — inclusive para quem já
        // está logado. Antes, aluno logado caía em /student/store e o
        // produto se perdia.
        if (productId) {
          if (nextAction === "store") {
            navigate({ to: "/student/store", search: { produto: productId } });
          } else {
            navigate({ to: "/produto/$id", params: { id: productId } });
          }
          return;
        }
        // aluno já logado: segue para a loja logada, como antes
        if (nextAction === "store") {
          navigate({ to: "/student/store" });
          return;
        }
        // intenção explícita de cadastro
        if (destinoPedido === "cadastro") {
          navigate({ to: "/register" });
          return;
        }
        // link explícito da loja vinculada ao indicador
        if (destinoPedido === "loja") {
          navigate({ to: "/loja" });
          return;
        }
        // padrão do link de indicação sem produto: cadastro com indicador travado
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
              {productId
                ? "Abrindo o produto..."
                : destinoPedido === "loja"
                  ? "Abrindo a loja..."
                  : "Levando você ao cadastro..."}
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
