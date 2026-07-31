import { useEffect } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Loja pública é só para quem NÃO tem sessão. Se a pessoa já está logada
 * como aluno, manda para a loja logada (mantendo o produto do deep link).
 */
export function useRedirectLoggedStore(productId?: string | null) {
  const navigate = useNavigate();
  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: userData } = await supabase.auth.getUser();
      if (cancelado || !userData.user) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", userData.user.id)
        .maybeSingle();
      if (cancelado || !profile?.id) return;
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (cancelado || !student?.id) return;
      navigate({
        to: "/student/store",
        search: productId ? { produto: productId } : {},
        replace: true,
      });
    })();
    return () => {
      cancelado = true;
    };
  }, [productId, navigate]);
}
