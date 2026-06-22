import { createFileRoute, Outlet, redirect, useNavigate } from "@tanstack/react-router";
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
  beforeLoad: async () => {
    const { data: { session } } = await supabase.auth.getSession();
    if (!session?.user) throw redirect({ to: "/login" });
  },
  component: StudentLayout,
});

function StudentLayout() {
  const navigate = useNavigate();
  const [checkingRole, setCheckingRole] = useState(true);

  useEffect(() => {
    let active = true;

    (async () => {
      try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!active) return;
        if (!user) {
          const redirect = `${window.location.pathname}${window.location.search}`;
          navigate({ to: "/login", search: { redirect } as never, replace: true });
          return;
        }

        const { data: profile } = await supabase
          .from("profiles")
          .select("id, role")
          .eq("user_id", user.id)
          .maybeSingle();

        if (!active) return;
        const selectedArea = sessionStorage.getItem("fitmind_selected_area");
        const { data: student } = profile
          ? await supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle()
          : { data: null };

        // Block pending coaches (not yet released) from the student app
        if (profile?.id && (profile.role === "coach" || ["manager", "director"].includes(profile.role || ""))) {
          const { data: coachRow } = await supabase
            .from("coaches")
            .select("onboarding_stage")
            .eq("profile_id", profile.id)
            .maybeSingle();
          const stage = (coachRow as { onboarding_stage?: string } | null)?.onboarding_stage;
          if (stage && stage !== "released") {
            navigate({ to: "/coach", replace: true });
            return;
          }
        }

        if (!active) return;
        if (profile?.role === "admin" && selectedArea !== "student") navigate({ to: "/admin", replace: true });
        else if (["coach", "manager", "director"].includes(profile?.role || "") && selectedArea !== "student") navigate({ to: "/coach", replace: true });
        else if (!student && profile?.role !== "student" && profile?.role !== "admin") navigate({ to: "/coach", replace: true });
        else setCheckingRole(false);
      } catch {
        if (active) setCheckingRole(false);
      }
    })();

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
