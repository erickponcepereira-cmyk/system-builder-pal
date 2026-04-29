import { createFileRoute, Outlet, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { MobileShell } from "@/components/student/MobileShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/student")({
  head: () => ({
    meta: [
      { title: "Minha Área — FitMind Club" },
      { name: "description", content: "Acompanhe seu desafio fitness." },
    ],
  }),
  component: StudentLayout,
});

function StudentLayout() {
  const navigate = useNavigate();
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    let active = true;

    supabase.auth.getUser().then(async ({ data: { user } }) => {
      if (!active) return;
      if (!user) {
        navigate({ to: "/login", replace: true });
        return;
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("role")
        .eq("user_id", user.id)
        .maybeSingle();

      if (!active) return;
      if (profile?.role === "admin") navigate({ to: "/admin", replace: true });
      else if (["coach", "manager", "director"].includes(profile?.role || "")) navigate({ to: "/coach", replace: true });
      else setCheckingRole(false);
    });

    return () => {
      active = false;
    };
  }, [navigate]);

  if (checkingRole) {
    return <div className="flex min-h-screen items-center justify-center bg-background text-sm text-muted-foreground">Carregando...</div>;
  }

  return (
    <MobileShell>
      <Outlet />
    </MobileShell>
  );
}
