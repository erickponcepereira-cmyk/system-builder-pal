import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { COMMUNITY_POLICY_VERSION } from "@/lib/ugc.constants";

export { COMMUNITY_POLICY_VERSION } from "@/lib/ugc.constants";

export const UGC_REPORT_REASONS = [
  { value: "sexual_content", label: "Conteúdo sexual ou nudez" },
  { value: "harassment", label: "Assédio ou bullying" },
  { value: "hate", label: "Discurso de ódio" },
  { value: "violence", label: "Violência ou ameaça" },
  { value: "dangerous", label: "Atividade perigosa" },
  { value: "self_harm", label: "Automutilação ou risco de suicídio" },
  { value: "illegal", label: "Atividade ilegal" },
  { value: "spam", label: "Spam ou fraude" },
  { value: "impersonation", label: "Falsidade ideológica" },
  { value: "privacy", label: "Exposição de dados pessoais" },
  { value: "other", label: "Outro" },
] as const;

export type UgcTargetKind =
  | "group_message"
  | "partner_post"
  | "product_review"
  | "product_review_reply"
  | "profile"
  | "partner"
  | "whatsapp_group";

export type UgcBlockTargetKind =
  | "profile"
  | "partner"
  | "whatsapp_group"
  | "product_review"
  | "product_review_reply";

export function useCommunityPolicy() {
  const [accepted, setAccepted] = useState<boolean | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [checkError, setCheckError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    const { data, error } = await supabase.rpc("ugc_has_current_policy" as never);
    if (error) {
      setAccepted(false);
      setCheckError(error.message);
      return false;
    }
    const value = data === true;
    setAccepted(value);
    setCheckError(null);
    return value;
  }, []);

  useEffect(() => { void refresh(); }, [refresh]);

  const requireAccepted = useCallback(() => {
    if (accepted === true) return true;
    setDialogOpen(true);
    return false;
  }, [accepted]);

  return {
    accepted,
    checking: accepted === null,
    checkError,
    dialogOpen,
    setDialogOpen,
    requireAccepted,
    markAccepted: () => {
      setAccepted(true);
      setCheckError(null);
      setDialogOpen(false);
    },
  };
}
