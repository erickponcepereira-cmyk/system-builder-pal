import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { Briefcase, Dumbbell, Loader2, LogOut, Shield, Stethoscope, User } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { Logo } from "@/components/Logo";
import { toast } from "sonner";

type AccessOptions = {
  admin: boolean;
  coach: boolean;
  professional: boolean;
  student: boolean;
  partner: boolean;
};

export const Route = createFileRoute("/_authenticated/portal-selector")({
  head: () => ({
    meta: [
      { title: "Selecionar portal — FitMind Club" },
      { name: "description", content: "Escolha qual painel deseja acessar." },
    ],
  }),
  component: PortalSelectorPage,
});

function PortalSelectorPage() {
  console.log("[PORTAL] mounted");
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [options, setOptions] = useState<AccessOptions | null>(null);

  useEffect(() => {
    return () => {
      console.log("[PORTAL] unmounted");
    };
  }, []);

  useEffect(() => {
    let active = true;
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          navigate({ to: "/login", replace: true });
          return;
        }

        const { data: profile, error: profileError } = await supabase
          .from("profiles")
          .select("id, role, status")
          .eq("user_id", user.id)
          .maybeSingle();

        if (profileError || !profile) {
          if (active) {
            setError(profileError?.message || "Perfil não encontrado para este usuário.");
            setLoading(false);
          }
          return;
        }

        if (profile.status === "inactive") {
          await supabase.rpc("touch_my_activity" as never);
        } else {
          supabase.rpc("touch_my_activity" as never).then(() => {}, () => {});
        }

        const [
          { data: coach },
          { data: student },
          { data: partner },
        ] = await Promise.all([
          supabase.from("coaches").select("id, approved_at, blocked_at, is_professional").eq("profile_id", profile.id).maybeSingle(),
          supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
          supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle(),
        ]);

        const role = profile.role;
        const canAdmin = role === "admin" || role === "manager" || role === "director";
        const coachBlocked = !!(coach && (coach as { blocked_at?: string | null }).blocked_at) || profile.status === "blocked";
        const canCoach = canAdmin || (!!coach && !coachBlocked);
        const isProfessional = !!(coach && (coach as { is_professional?: boolean }).is_professional);
        const canProfessional = canAdmin || (isProfessional && !coachBlocked);
        const canStudent = role === "student" || !!student;
        const canPartner = role === "partner" || !!partner;

        if (!active) return;
        const available: AccessOptions = {
          admin: canAdmin,
          coach: canCoach,
          professional: canProfessional,
          student: canStudent,
          partner: canPartner,
        };
        const count = Number(canAdmin) + Number(canCoach) + Number(canProfessional) + Number(canStudent) + Number(canPartner);
        if (count === 0) {
          setError("Nenhum painel está liberado para este cadastro.");
        } else {
          setOptions(available);
        }
        setLoading(false);
      } catch (err) {
        if (!active) return;
        console.error("[portal-selector] erro:", err);
        setError((err as Error)?.message || "Erro ao carregar opções de acesso.");
        setLoading(false);
      }
    })();
    return () => { active = false; };
  }, [navigate]);

  const enterArea = (area: "coach" | "student" | "admin" | "partner" | "professional") => {
    if (area !== "admin" && area !== "partner" && area !== "professional") {
      sessionStorage.setItem("fitmind_selected_area", area);
    } else {
      sessionStorage.removeItem("fitmind_selected_area");
    }
    const areaRoot =
      area === "admin" ? "/admin" :
      area === "coach" ? "/coach" :
      area === "partner" ? "/partner" :
      area === "professional" ? "/professional" :
      "/student";
    navigate({ to: areaRoot as never, replace: true });
  };

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut();
      toast.success("Sessão encerrada.");
    } finally {
      navigate({ to: "/login", replace: true });
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#111111" }}>
      <div className="w-full max-w-sm">
        <div className="flex flex-col items-center gap-3 mb-8">
          <Logo className="h-20 w-20 object-contain" />
          <h1 className="text-2xl font-bold text-white">FitMind Club</h1>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          <h2 className="text-xl font-bold text-white mb-6">Entrar como</h2>

          {loading && (
            <div className="flex items-center justify-center py-10">
              <Loader2 className="h-6 w-6 animate-spin text-primary" />
            </div>
          )}

          {!loading && error && (
            <div className="space-y-4">
              <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                {error}
              </div>
              <button
                type="button"
                onClick={handleLogout}
                className="flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-sm text-white hover:bg-white/10"
              >
                <LogOut className="h-4 w-4" /> Sair e voltar ao login
              </button>
            </div>
          )}

          {!loading && options && (
            <div className="space-y-3">
              {options.admin && (
                <button
                  type="button"
                  onClick={() => enterArea("admin")}
                  className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-white transition-colors hover:bg-primary/20"
                >
                  <Shield className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Painel de Admin</span>
                </button>
              )}
              {options.coach && (
                <button
                  type="button"
                  onClick={() => enterArea("coach")}
                  className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-white transition-colors hover:bg-primary/20"
                >
                  <Dumbbell className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Painel de Coach</span>
                </button>
              )}
              {options.professional && (
                <button
                  type="button"
                  onClick={() => enterArea("professional")}
                  className="flex w-full items-center gap-3 rounded-xl border border-cyan-400/30 bg-cyan-400/10 px-4 py-3 text-left text-white transition-colors hover:bg-cyan-400/20"
                >
                  <Stethoscope className="h-5 w-5 text-cyan-400" />
                  <span className="font-semibold">Painel de Profissional</span>
                </button>
              )}
              {options.student && (
                <button
                  type="button"
                  onClick={() => enterArea("student")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition-colors hover:bg-white/10"
                >
                  <User className="h-5 w-5 text-white/70" />
                  <span className="font-semibold">Painel de Aluno</span>
                </button>
              )}
              {options.partner && (
                <button
                  type="button"
                  onClick={() => enterArea("partner")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition-colors hover:bg-white/10"
                >
                  <Briefcase className="h-5 w-5 text-white/70" />
                  <span className="font-semibold">Painel de Parceiro</span>
                </button>
              )}

              <button
                type="button"
                onClick={handleLogout}
                className="mt-4 flex w-full items-center justify-center gap-2 rounded-xl border border-white/10 px-4 py-2 text-xs text-white/50 hover:text-white/80 hover:bg-white/5"
              >
                <LogOut className="h-3.5 w-3.5" /> Sair
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
