import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

export type HideTargetType =
  | "product"
  | "section"
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

type Row = { target_type: HideTargetType; product_kind: HideProductKind; target_id: string | null };

export function useStoreVisibility(coachMode: boolean) {
  const [hiddenForViewer, setHiddenForViewer] = useState<Set<string>>(new Set());
  const [myHidden, setMyHidden] = useState<Set<string>>(new Set());
  const [loaded, setLoaded] = useState(false);

  const refresh = useCallback(async () => {
    try {
      const [{ data: viewerRows }, myRes] = await Promise.all([
        supabase.rpc("store_hidden_for_viewer" as never) as unknown as Promise<{ data: Row[] | null }>,
        coachMode
          ? (supabase.rpc("coach_store_list_my_hidden" as never) as unknown as Promise<{ data: Row[] | null }>)
          : Promise.resolve({ data: [] as Row[] }),
      ]);
      const v = new Set<string>(
        (viewerRows || []).map((r) => visibilityKey(r.target_type, r.product_kind, r.target_id)),
      );
      const m = new Set<string>(
        (myRes.data || []).map((r) => visibilityKey(r.target_type, r.product_kind, r.target_id)),
      );
      setHiddenForViewer(v);
      setMyHidden(m);
    } finally {
      setLoaded(true);
    }
  }, [coachMode]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const toggleHidden = useCallback(
    async (
      targetType: HideTargetType,
      productKind: HideProductKind,
      targetId: string | null,
      nextHidden: boolean,
    ) => {
      const { error } = await supabase.rpc("coach_store_set_hidden" as never, {
        _target_type: targetType,
        _product_kind: productKind,
        _target_id: targetId,
        _hidden: nextHidden,
      } as never);
      if (error) throw new Error(error.message);
      await refresh();
    },
    [refresh],
  );

  const isHiddenForViewer = (
    targetType: HideTargetType,
    productKind: HideProductKind,
    targetId: string | null,
  ) => hiddenForViewer.has(visibilityKey(targetType, productKind, targetId));

  const isHiddenByMe = (
    targetType: HideTargetType,
    productKind: HideProductKind,
    targetId: string | null,
  ) => myHidden.has(visibilityKey(targetType, productKind, targetId));

  return { loaded, hiddenForViewer, myHidden, toggleHidden, isHiddenForViewer, isHiddenByMe, refresh };
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
