import { useEffect, useRef, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { supabase } from "@/integrations/supabase/client";

/**
 * Loja pública é só para quem NÃO tem sessão. Se a pessoa já está logada
 * como aluno, manda para a loja logada (mantendo o produto do deep link).
 */
export function useRedirectLoggedStore(productId?: string | null) {
  const navigate = useNavigate();
  const [status, setStatus] = useState<"checking" | "public" | "redirecting">("checking");
  const redirectStarted = useRef(false);

  useEffect(() => {
    let cancelado = false;
    (async () => {
      const { data: sessionData } = await supabase.auth.getSession();
      const user = sessionData.session?.user;
      if (cancelado) return;
      if (!user) {
        setStatus("public");
        return;
      }
      const { data: profile } = await supabase
        .from("profiles")
        .select("id")
        .eq("user_id", user.id)
        .maybeSingle();
      if (cancelado) return;
      if (!profile?.id) {
        setStatus("public");
        return;
      }
      const { data: student } = await supabase
        .from("students")
        .select("id")
        .eq("profile_id", profile.id)
        .maybeSingle();
      if (cancelado) return;
      if (!student?.id) {
        setStatus("public");
        return;
      }
      if (redirectStarted.current) return;
      redirectStarted.current = true;
      setStatus("redirecting");
      sessionStorage.setItem("fitmind_selected_area", "student");
      await navigate({
        to: "/student/store",
        search: productId ? { produto: productId } : {},
        replace: true,
      });
    })().catch(() => {
      if (!cancelado) setStatus("public");
    });
    return () => {
      cancelado = true;
    };
  }, [productId, navigate]);

  return status;
}
