import { createFileRoute, redirect } from "@tanstack/react-router";
import { AdminShell } from "@/components/admin/AdminShell";
import { supabase } from "@/integrations/supabase/client";

export const Route = createFileRoute("/_authenticated/admin")({
  head: () => ({
    meta: [
      { title: "Admin — FitMind Club" },
      { name: "description", content: "Painel administrativo FitMind Club." },
    ],
  }),
  // Sessão é garantida pelo layout pai (_authenticated). Aqui validamos apenas o papel.
  beforeLoad: async ({ context }) => {
    const user = (context as { user?: { id: string } }).user;
    console.log("[AUTH] admin.tsx context.user:", user?.id);
    if (!user) {
      console.log("[AUTH] redirect executado em src/routes/_authenticated/admin.tsx:18 (no user in context)");
      throw redirect({ to: "/login" });
    }
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("user_id", user.id)
      .maybeSingle();
    console.log("[AUTH] admin.tsx profile role:", (profile as { role?: string } | null)?.role);
    if (!profile || (profile as { role?: string }).role !== "admin") {
      console.log("[AUTH] redirect executado em src/routes/_authenticated/admin.tsx:28 (role != admin)");
      throw redirect({ to: "/login" });
    }
  },
  component: AdminShell,
});
