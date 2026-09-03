/**
 * Indicação na loja unificada.
 *
 * São duas metades, e faltar uma delas já perde dinheiro:
 *
 * 1. **Divulgar** — o botão que gera `/produto/<id>?ref=<codigo>`. Sem ele
 *    ninguém tem link para mandar.
 * 2. **Atribuir** — o `referred_by_student_id` que viaja até a RPC do pedido.
 *    Sem ele o link funciona, a compra acontece, e a comissão de indicação
 *    simplesmente não existe — sem erro nenhum na tela.
 *
 * A segunda metade é a que passa despercebida, porque nada quebra quando ela
 * falta. Só falta dinheiro no fim do mês.
 *
 * Cópia do que `StorePage.tsx` faz (`copyReferralLink`, e a leitura em
 * `load()`), mantida fora do componente pelo mesmo motivo do resto.
 */

import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { useCallback, useEffect, useState } from "react";
import { getShareOrigin } from "@/lib/auth-redirects";

export type ContextoDeIndicacao = {
  /** Código de quem está olhando a loja. Aluno e coach têm códigos próprios. */
  meuCodigo: string | null;
  /**
   * Produtos que o FINANCEIRO marcou como produto de indicação. Só eles ganham
   * botão de compartilhar para aluno — coach compartilha qualquer um.
   */
  indicaveis: Set<string>;
  /**
   * Quem indicou esta visita, vindo de `/r/<code>`. Fica em `sessionStorage`
   * porque a indicação vale para a sessão: a pessoa pode entrar pelo link,
   * navegar, cadastrar-se e só então comprar.
   */
  indicadoPor: string | null;
};

export const CONTEXTO_VAZIO: ContextoDeIndicacao = {
  meuCodigo: null,
  indicaveis: new Set(),
  indicadoPor: null,
};

/** Chave usada pelo redirecionador `/r/<code>`. Não pode mudar sozinha. */
const CHAVE_SESSAO = "fitmind_referral";

function lerIndicacaoDaSessao(): string | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(CHAVE_SESSAO);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as { referredByStudentId?: string | null };
    return parsed?.referredByStudentId || null;
  } catch {
    return null;
  }
}

export async function loadReferralContext(
  audience: "student" | "coach",
): Promise<ContextoDeIndicacao> {
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) return CONTEXTO_VAZIO;

  const { data: profile } = await supabase
    .from("profiles").select("id").eq("user_id", user.id).maybeSingle();
  if (!profile?.id) return CONTEXTO_VAZIO;

  if (audience === "coach") {
    const { data: coach } = await supabase
      .from("coaches").select("referral_code").eq("profile_id", profile.id).maybeSingle();
    // Coach divulga qualquer produto: `indicaveis` fica vazio e a tela trata
    // vazio-em-modo-coach como "todos".
    return {
      meuCodigo: (coach as { referral_code?: string | null } | null)?.referral_code || null,
      indicaveis: new Set(),
      indicadoPor: null,
    };
  }

  const { data: student } = await supabase
    .from("students").select("referral_code").eq("profile_id", profile.id).maybeSingle();

  // `product_referral_rules` é a régua do financeiro. Produto fora dela não
  // paga indicação, então oferecer o botão seria prometer o que não existe.
  const { data: regras, error } = await supabase
    .from("product_referral_rules" as never)
    .select("product_id" as never)
    .eq("enabled" as never, true as never)
    .eq("is_referral_product" as never, true as never);
  if (error) console.error("[indicacao] regras", error);

  return {
    meuCodigo: (student as { referral_code?: string | null } | null)?.referral_code || null,
    indicaveis: new Set(
      ((regras as unknown as Array<{ product_id: string }>) || []).map((r) => String(r.product_id)),
    ),
    indicadoPor: lerIndicacaoDaSessao(),
  };
}

/**
 * Compartilha o link do produto com o código de quem indica.
 *
 * Tenta a folha nativa de compartilhamento primeiro — no celular é um toque em
 * vez de "copiar, abrir o WhatsApp, colar". Cai para a área de transferência
 * quando o navegador não tem, ou quando a pessoa cancela.
 */
export async function compartilharIndicacao(sourceId: string, codigo: string | null): Promise<void> {
  if (!codigo) {
    toast.error("Seu código de indicação ainda não está disponível.");
    return;
  }
  const url = `${getShareOrigin()}/produto/${sourceId}?ref=${codigo}`;
  try {
    if (navigator.share) {
      await navigator.share({ title: "Indicação FitMind Club", url });
      return;
    }
    await navigator.clipboard.writeText(url);
    toast.success("Link de indicação copiado!");
  } catch {
    // `navigator.share` rejeita quando a pessoa cancela; copiar é um plano B
    // que serve tanto para cancelamento quanto para falha real.
    try {
      await navigator.clipboard.writeText(url);
      toast.success("Link de indicação copiado!");
    } catch {
      toast.error("Não foi possível gerar o link agora.");
    }
  }
}

export function useIndicacao(audience: "student" | "coach") {
  const [ctx, setCtx] = useState<ContextoDeIndicacao>(CONTEXTO_VAZIO);

  const carregar = useCallback(async () => {
    try {
      setCtx(await loadReferralContext(audience));
    } catch (erro) {
      console.error("[indicacao] contexto", erro);
    }
  }, [audience]);

  useEffect(() => { void carregar(); }, [carregar]);

  /** Este produto pode ser indicado por quem está olhando? */
  const podeIndicar = useCallback(
    (sourceId: string, origem?: string) => {
      if (!ctx.meuCodigo) return false;
      if (audience === "coach") return true;

      /*
       * Produto de parceiro e de profissional SEMPRE paga indicação.
       *
       * Isso não é regra nova: o backend já faz. Um pedido desses gera a
       * comissão com o rótulo "Fitcoin de Indicação (Venda de Parceiro)" e o
       * gatilho de `commissions` credita o fitcoin — a divisão é metade para
       * quem indicou e metade para o coach, sobre o que sobra depois da rede.
       * Há pedidos assim pagos em produção.
       *
       * `product_referral_rules` é a régua do catálogo FITMIND, onde cada
       * produto tem fatias próprias e o financeiro decide caso a caso. Ela
       * nunca teve linha para parceiro. Enquanto o botão dependia dela, o
       * dinheiro estava lá e ninguém tinha como buscá-lo: o aluno via o
       * produto, indicaria, e a tela não oferecia.
       */
      if (origem === "partner" || origem === "professional") return true;

      return ctx.indicaveis.has(sourceId);
    },
    [ctx, audience],
  );

  return { ...ctx, podeIndicar, compartilhar: compartilharIndicacao };
}
