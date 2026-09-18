import { useCallback, useEffect, useMemo, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HideTargetType =
  | "product"
  | "section"
  | "category"
  | "vendor_partner"
  | "vendor_professional"
  | "vendor_fitmind";

export type HideProductKind =
  | "partner_product"
  | "professional_product"
  | "digital"
  | "store_product"
  | "item"
  | null;

export function visibilityKey(
  targetType: HideTargetType,
  productKind: HideProductKind,
  targetId: string | null,
): string {
  return `${targetType}:${productKind ?? ""}:${targetId ?? ""}`;
}

/**
 * O que se esconde, para a pergunta de confirmação.
 *
 * `grupo` já vem com a preposição — "da categoria «Herbalife»", "da FitMind",
 * "de todos os parceiros" — porque não cabem todos num molde só.
 * `produto: null` vira "este produto".
 */
export type AlvoDaOcultacao = { produto: string | null } | { grupo: string };

const ALVO_PADRAO: Record<HideTargetType, AlvoDaOcultacao> = {
  product: { produto: null },
  section: { grupo: "desta seção" },
  category: { grupo: "desta categoria" },
  vendor_partner: { grupo: "de todos os parceiros" },
  vendor_professional: { grupo: "de todos os profissionais" },
  vendor_fitmind: { grupo: "da FitMind" },
};

/**
 * A pergunta antes de esconder algo da rede. Mostrar de novo não pergunta.
 *
 * Mora aqui, e não em cada tela, porque todo caminho de esconder passa por
 * `toggleHidden`. Em 15/09 um toque sem pergunta escondeu o catálogo FitMind
 * de 571 alunos; uma tela nova que esquecesse de perguntar repetiria isso.
 */
export function confirmarOcultacao(alvo: AlvoDaOcultacao): boolean {
  const oque = "grupo" in alvo
    ? `todos os produtos ${alvo.grupo}`
    : alvo.produto ? `o produto «${alvo.produto}»` : "este produto";
  const quem = "grupo" in alvo ? "esses produtos" : "esse produto";
  return window.confirm(
    `Tem certeza que deseja ocultar ${oque}?\n\n` +
    `Ninguém da sua rede verá mais ${quem} nem poderá comprar. Essa ação é reversível.`,
  );
}

type HideRow = {
  target_type: HideTargetType;
  product_kind: HideProductKind;
  target_id: string | null;
  hider_coach_id: string;
};

type ChainEntry = { coach_id: string; depth: number };

type VisibilityContext = {
  chain: ChainEntry[];
  self_coach_id: string | null;
  hidden: HideRow[];
  my_hidden: Array<{ target_type: HideTargetType; product_kind: HideProductKind; target_id: string | null }>;
};

// Maps a product kind to the vendor-wide hide type it should be affected by.
function vendorTypeFor(kind: HideProductKind): HideTargetType | null {
  if (kind === "partner_product") return "vendor_partner";
  if (kind === "professional_product") return "vendor_professional";
  if (kind === "digital" || kind === "store_product" || kind === "item") return "vendor_fitmind";
  return null;
}

export function useStoreVisibility(coachMode: boolean) {
  const [ctx, setCtx] = useState<VisibilityContext>({
    chain: [],
    self_coach_id: null,
    hidden: [],
    my_hidden: [],
  });
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const { data } = await supabase.rpc("store_visibility_context" as never);
      const parsed = (data as unknown as VisibilityContext) || {
        chain: [],
        self_coach_id: null,
        hidden: [],
        my_hidden: [],
      };
      setCtx({
        chain: Array.isArray(parsed.chain) ? parsed.chain : [],
        self_coach_id: parsed.self_coach_id ?? null,
        hidden: Array.isArray(parsed.hidden) ? parsed.hidden : [],
        my_hidden: Array.isArray(parsed.my_hidden) ? parsed.my_hidden : [],
      });
    } finally {
      setLoaded(true);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh, coachMode]);

  const chainDepth = useMemo(() => {
    const m = new Map<string, number>();
    ctx.chain.forEach((e) => m.set(e.coach_id, e.depth));
    return m;
  }, [ctx.chain]);

  const hiderDepth = useCallback(
    (hiderCoachId: string) => chainDepth.get(hiderCoachId) ?? Number.POSITIVE_INFINITY,
    [chainDepth],
  );

  const myHiddenSet = useMemo(() => {
    return new Set<string>(
      ctx.my_hidden.map((r) => visibilityKey(r.target_type, r.product_kind, r.target_id)),
    );
  }, [ctx.my_hidden]);

  /**
   * Esconde ou mostra. Esconder pergunta antes, e devolve `false` quando a
   * pessoa desiste — para a tela não anunciar "oculto" sem ter ocultado.
   */
  const toggleHidden = useCallback(
    async (
      targetType: HideTargetType,
      productKind: HideProductKind,
      targetId: string | null,
      nextHidden: boolean,
      alvo: AlvoDaOcultacao = ALVO_PADRAO[targetType],
    ): Promise<boolean> => {
      if (nextHidden && !confirmarOcultacao(alvo)) return false;
      const { error } = await supabase.rpc("coach_store_set_hidden" as never, {
        _target_type: targetType,
        _product_kind: productKind,
        _target_id: targetId,
        _hidden: nextHidden,
      } as never);
      if (error) throw new Error(error.message);
      await refresh();
      return true;
    },
    [refresh],
  );

  // Applies the creator-aware exception: a hide is bypassed when the creator
  // of the product is the viewer's own coach identity, or is on the viewer's
  // upline chain at a position closer to the viewer than the hider.
  const isBypassedByCreator = useCallback(
    (hiderCoachId: string, creatorCoachId?: string | null) => {
      if (!creatorCoachId) return false;
      if (ctx.self_coach_id && creatorCoachId === ctx.self_coach_id) return true;
      const cDepth = chainDepth.get(creatorCoachId);
      if (cDepth === undefined) return false;
      return cDepth < hiderDepth(hiderCoachId);
    },
    [ctx.self_coach_id, chainDepth, hiderDepth],
  );

  const isHiddenForViewer = useCallback(
    (
      targetType: HideTargetType,
      productKind: HideProductKind,
      targetId: string | null,
      creatorCoachId?: string | null,
    ) => {
      // Direct hides on this exact target
      for (const h of ctx.hidden) {
        if (
          h.target_type === targetType &&
          h.product_kind === productKind &&
          h.target_id === targetId
        ) {
          if (!isBypassedByCreator(h.hider_coach_id, creatorCoachId)) return true;
        }
      }
      // Vendor-wide hides that cover this kind (only when checking a product row)
      if (targetType === "product") {
        const vendorType = vendorTypeFor(productKind);
        if (vendorType) {
          for (const h of ctx.hidden) {
            if (h.target_type === vendorType && h.target_id === null) {
              if (!isBypassedByCreator(h.hider_coach_id, creatorCoachId)) return true;
            }
          }
        }
      }
      return false;
    },
    [ctx.hidden, isBypassedByCreator],
  );

  const isHiddenByMe = useCallback(
    (targetType: HideTargetType, productKind: HideProductKind, targetId: string | null) =>
      myHiddenSet.has(visibilityKey(targetType, productKind, targetId)),
    [myHiddenSet],
  );

  // Kept as a separate name for readability; behaviour mirrors isHiddenForViewer
  // because the chain excludes the viewer's own coach id.
  const isHiddenByUpline = isHiddenForViewer;

  return {
    loaded,
    toggleHidden,
    isHiddenForViewer,
    isHiddenByMe,
    isHiddenByUpline,
    refresh,
    // Debug/introspection
    _ctx: ctx,
  };
}

/** Map kind do StorePage para product_kind do override. */
export function mapStoreItemKind(
  kind: "challenge" | "digital" | "store" | "item" | "partner" | "partner_company",
): HideProductKind {
  if (kind === "challenge") return "item"; // products table
  if (kind === "item") return "item";
  if (kind === "digital") return "digital";
  if (kind === "store") return "store_product";
  return null;
}

/** Vendor "fitmind" cobre tudo da loja FitMind (challenges, digitais, físicos e itens). */
export function isFitmindKind(kind: HideProductKind): boolean {
  return kind === "digital" || kind === "store_product" || kind === "item";
}
