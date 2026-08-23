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
};

export function useVisibilidadeLoja(
  coachMode: boolean,
  audiencia: Audiencia,
): VisibilidadeLoja {
  const vis = useStoreVisibility(coachMode);
  const [meuCoachId, setMeuCoachId] = useState<string | null>(null);
  const [cadeia, setCadeia] = useState<string[]>([]);
  const [carregou, setCarregou] = useState(false);

  useEffect(() => {
    let vivo = true;
    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) { if (vivo) setCarregou(true); return; }

        const { data: profile } = await supabase
          .from("profiles").select("id").eq("user_id", user.id).maybeSingle();

        if (profile?.id) {
          const { data: student } = await supabase
            .from("students").select("coach_id").eq("profile_id", profile.id).maybeSingle();
          if (vivo) setMeuCoachId((student as { coach_id?: string | null } | null)?.coach_id ?? null);
        }

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
        // --- 1. público-alvo ---
        const aud = p.visibilityAudiences;
        if (aud && aud.length > 0 && !aud.includes(audiencia)) return false;

        // --- 3. produto restrito a rede ---
        if (p.restrictToNetworks) {
          if (!prontinho) return false;
          const permitidos = p.allowedCoachIds || [];
          const naRede = permitidos.some((id) => id === meuCoachId || cadeia.includes(id));
          const souCriador = !!p.creatorCoachId && cadeia.includes(p.creatorCoachId);
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

  return { pronto: carregou && vis.loaded, filtrar, secaoVisivel };
}
