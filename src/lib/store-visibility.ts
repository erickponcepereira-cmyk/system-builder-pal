import { useCallback, useEffect, useState } from "react";

import { supabase } from "@/integrations/supabase/client";
import {
  useStoreVisibility,
  type HideProductKind,
} from "@/lib/coach-store-overrides";
import type { UnifiedProduct } from "@/lib/unified-store";

/**
 * Visibilidade da vitrine unificada.
 *
 * São TRÊS regras independentes, e faltar qualquer uma é vazamento de catálogo
 * entre redes — não é falta de recurso. Elas foram copiadas do comportamento
 * que já roda em produção, sem alterar nada lá:
 *
 *  1. `visibility_audiences` — filtro por público, aplicado nos produtos do
 *     modelo novo. StorePage.tsx:374-379.
 *  2. Ocultações de seção, categoria e produto — `isHiddenByUpline` sempre;
 *     `isHiddenForViewer` só fora do modo coach. StorePage.tsx:616-632.
 *  3. `restrict_to_networks` + `allowed_coach_ids` + cadeia de coaches —
 *     produto restrito só aparece para quem está na rede autorizada, ou para o
 *     próprio criador. PartnerProfessionalStore.tsx:495-501.
 *
 * `mapStoreItemKind` devolve null para parceiro e profissional, por isso o
 * mapeamento aqui usa `origin`, que é inequívoco.
 */

function kindDeOverride(p: UnifiedProduct): HideProductKind {
  if (p.origin === "partner") return "partner_product";
  if (p.origin === "professional") return "professional_product";
  if (p.kind === "digital") return "digital";
  if (p.kind === "store") return "store_product";
  if (p.kind === "item" || p.kind === "challenge") return "item";
  return null;
}

export type Audiencia = "student" | "coach" | "partner" | "professional";

export type VisibilidadeLoja = {
  pronto: boolean;
  /** Filtra o catálogo aplicando as três regras. */
  filtrar: (produtos: UnifiedProduct[]) => UnifiedProduct[];
  /** Uma seção só aparece se não estiver oculta. */
  secaoVisivel: (sectionId: string) => boolean;

  // ─── Curadoria (só faz sentido em modo coach) ───────────────────────────
  //
  // O coach esconde da REDE DELE o que não quer vender. Duas perguntas
  // diferentes, e confundi-las trava a tela:
  //
  //   `ocultadoPorMim`   → fui eu que escondi; posso desfazer
  //   `ocultadoPorUpline` → meu upline escondeu; não posso desfazer
  //
  /** Fui eu que escondi este alvo? */
  ocultadoPorMim: (
    tipo: "section" | "category" | "product" | "vendor_fitmind",
    kind: string | null,
    targetId: string | null,
  ) => boolean;
  /** Meu upline escondeu? Então está fora, e não há botão que resolva. */
  ocultadoPorUpline: (
    tipo: "section" | "category" | "product" | "vendor_fitmind",
    kind: string | null,
    targetId: string | null,
  ) => boolean;
  /** Liga/desliga a ocultação. Recarrega o contexto sozinho. */
  alternarOculto: (
    tipo: "section" | "category" | "product" | "vendor_fitmind",
    kind: string | null,
    targetId: string | null,
    oculto: boolean,
  ) => Promise<void>;
  /** `product_kind` deste produto, ou `null` quando não há override possível. */
  kindDeCuradoria: (produto: UnifiedProduct) => string | null;
};

export function useVisibilidadeLoja(
  coachMode: boolean,
  audiencia: Audiencia,
): VisibilidadeLoja {
  const vis = useStoreVisibility(coachMode);
  const [meuCoachId, setMeuCoachId] = useState<string | null>(null);
  const [cadeia, setCadeia] = useState<string[]>([]);
  const [carregou, setCarregou] = useState(false);
  /** Admin enxerga o catálogo inteiro — inclusive produto restrito a rede. */
  const [souAdmin, setSouAdmin] = useState(false);
  /** Ids de vendedor que são meus: parceiro que eu opero, meu próprio coach. */
  const [meusVendedores, setMeusVendedores] = useState<string[]>([]);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (vivo) setCarregou(true); return; }

        const { data: profile } = await supabase
          .from("profiles").select("id,role").eq("user_id", user.id).maybeSingle();

        const perfil = profile as { id?: string; role?: string | null } | null;

        if (perfil?.id) {
          const [studentRes, coachRes, partnerRes, membroRes] = await Promise.all([
            supabase.from("students").select("coach_id").eq("profile_id", perfil.id).maybeSingle(),
            supabase.from("coaches").select("id").eq("profile_id", perfil.id).maybeSingle(),
            supabase.from("partners").select("id").eq("profile_id", perfil.id),
            supabase.from("partner_members").select("partner_id").eq("profile_id", perfil.id),
          ]);
          if (vivo) {
            setMeuCoachId((studentRes.data as { coach_id?: string | null } | null)?.coach_id ?? null);
            const meus = [
              (coachRes.data as { id?: string } | null)?.id,
              ...(((partnerRes.data as Array<{ id: string }> | null) || []).map((p) => p.id)),
              ...(((membroRes.data as Array<{ partner_id: string }> | null) || []).map((p) => p.partner_id)),
            ].filter(Boolean) as string[];
            setMeusVendedores(meus);
          }
        }

        // O papel de admin vem da RPC, não do campo do perfil: é a mesma
        // verdade que o backend usa para decidir acesso.
        const { data: admin } = await supabase.rpc("is_admin" as never, { _user_id: user.id } as never);
        if (vivo) setSouAdmin(admin === true || perfil?.role === "admin");

        // Mesma RPC que a loja de parceiros usa para decidir quem vê produto
        // restrito a rede.
        const { data: chain, error } = await supabase.rpc("minha_cadeia_coaches" as never);
        if (error) console.error("[store-visibility] cadeia", error);
        if (vivo) setCadeia(((chain as unknown as string[]) || []).filter(Boolean));
      } catch (error) {
        console.error("[store-visibility]", error);
      } finally {
        if (vivo) setCarregou(true);
      }
    })();
    return () => { vivo = false; };
  }, []);


  const filtrar = useCallback(
    (produtos: UnifiedProduct[]): UnifiedProduct[] => {
      // Enquanto as regras não carregaram, NÃO mostra catálogo restrito.
      // Falhar fechado aqui: mostrar demais é vazamento, mostrar de menos é
      // um instante de lista curta.
      const prontinho = carregou && vis.loaded;

      return produtos.filter((p) => {
        // Admin vê o catálogo inteiro. Não é conveniência: sem isso o admin
        // cadastra um produto restrito, não o encontra na loja e conclui que
        // o cadastro falhou.
        const meuProduto = !!p.sellerId && meusVendedores.includes(p.sellerId);
        if (souAdmin) return true;

        // --- 1. público-alvo ---
        const aud = p.visibilityAudiences;
        if (aud && aud.length > 0 && !aud.includes(audiencia)) return false;

        // --- 3. produto restrito a rede ---
        if (p.restrictToNetworks && !meuProduto) {
          if (!prontinho) return false;
          const permitidos = p.allowedCoachIds || [];
          const naRede = permitidos.some((id) => id === meuCoachId || cadeia.includes(id));
          const souCriador = !!p.creatorCoachId
            && (cadeia.includes(p.creatorCoachId) || p.creatorCoachId === meuCoachId);
          if (!naRede && !souCriador) return false;
        }


        if (!prontinho) return true;

        // --- 2. ocultações de upline e de quem vende ---
        const pk = kindDeOverride(p);
        const criador = p.creatorCoachId ?? p.sellerCoachId ?? null;

        if (p.sectionId && vis.isHiddenByUpline("section", null, p.sectionId)) return false;
        if (p.categoryId && vis.isHiddenByUpline("category", null, p.categoryId)) return false;
        if (pk && vis.isHiddenByUpline("product", pk, p.sourceId, criador)) return false;

        if (!coachMode) {
          if (p.sectionId && vis.isHiddenForViewer("section", null, p.sectionId)) return false;
          if (p.categoryId && vis.isHiddenForViewer("category", null, p.categoryId)) return false;
          if (pk && vis.isHiddenForViewer("product", pk, p.sourceId, criador)) return false;
        }

        return true;
      });
    },
    [audiencia, cadeia, carregou, coachMode, meuCoachId, vis],
  );

  const secaoVisivel = useCallback(
    (sectionId: string) => {
      if (vis.isHiddenByUpline("section", null, sectionId)) return false;
      if (!coachMode && vis.isHiddenForViewer("section", null, sectionId)) return false;
      return true;
    },
    [coachMode, vis],
  );

  return {
    pronto: carregou && vis.loaded,
    filtrar,
    secaoVisivel,
    // Repasse direto do módulo antigo: a regra de ocultação é a mesma das duas
    // lojas de propósito. Reimplementá-la aqui criaria duas verdades sobre o
    // que a rede do coach enxerga.
    ocultadoPorMim: (tipo, kind, targetId) =>
      vis.isHiddenByMe(tipo as never, kind as never, targetId),
    ocultadoPorUpline: (tipo, kind, targetId) =>
      vis.isHiddenByUpline(tipo as never, kind as never, targetId),
    alternarOculto: (tipo, kind, targetId, oculto) =>
      vis.toggleHidden(tipo as never, kind as never, targetId, oculto),
    kindDeCuradoria: (produto) => kindDeOverride(produto),
  };
}
