import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Loader2 } from "lucide-react";

export const Route = createFileRoute("/become-partner")({
  head: () => ({ meta: [{ title: "Tornar-se Parceiro — FitMind Club" }] }),
  component: BecomePartnerPage,
});

function BecomePartnerPage() {
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) {
        navigate({ to: "/register", search: { role: "partner" } });
        return;
      }
      // Conta existente: nunca cria novo cadastro — envia para o upgrade in-app.
      navigate({ to: "/upgrade/$role", params: { role: "partner" } });
    })();
  }, [navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center" style={{ backgroundColor: "#0A0A0A" }}>
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
    </div>
  );
}

