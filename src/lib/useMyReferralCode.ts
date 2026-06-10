import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";

/** Retorna o código de indicação do usuário logado (coach > partner > student). */
export function useMyReferralCode(): string | null {
  const [code, setCode] = useState<string | null>(null);
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: u } = await supabase.auth.getUser();
      if (!u.user) return;
      const { data: prof } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", u.user.id)
        .maybeSingle();
      if (!prof?.id) return;
      const [{ data: coach }, { data: partner }, { data: student }] = await Promise.all([
        supabase.from("coaches").select("referral_code").eq("profile_id", prof.id).maybeSingle(),
        supabase.from("partners").select("referral_code").eq("profile_id", prof.id).maybeSingle(),
        supabase.from("students").select("referral_code").eq("profile_id", prof.id).maybeSingle(),
      ]);
      if (cancelled) return;
      const c =
        (coach as { referral_code?: string | null } | null)?.referral_code ||
        (partner as { referral_code?: string | null } | null)?.referral_code ||
        (student as { referral_code?: string | null } | null)?.referral_code ||
        null;
      setCode(c);
    })();
    return () => {
      cancelled = true;
    };
  }, []);
  return code;
}

/** Compartilha (ou copia) o link de indicação para um produto. */
export async function shareReferralProduct(
  referralCode: string | null,
  productId: string,
  title = "Indicação FitMind Club",
): Promise<boolean> {
  if (!referralCode) return false;
  const url = `${window.location.origin}/r/${referralCode}?p=${productId}`;
  try {
    if (typeof navigator !== "undefined" && navigator.share) {
      await navigator.share({ title, url });
      return true;
    }
  } catch {
    /* fall through to clipboard */
  }
  try {
    await navigator.clipboard.writeText(url);
    return true;
  } catch {
    return false;
  }
}
