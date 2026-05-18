import { useEffect, useState } from "react";
import { useNavigate } from "@tanstack/react-router";
import { ChevronDown, Repeat, ShieldCheck, Stethoscope, Store, UserRound, Users } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

type RoleOption = {
  key: "admin" | "coach" | "professional" | "partner" | "student";
  label: string;
  to: "/admin" | "/coach" | "/professional" | "/partner" | "/student";
  icon: typeof Users;
  color: string;
};

const ALL: RoleOption[] = [
  { key: "admin", label: "Admin", to: "/admin", icon: ShieldCheck, color: "text-amber-400" },
  { key: "coach", label: "Coach", to: "/coach", icon: Users, color: "text-primary" },
  { key: "professional", label: "Profissional", to: "/professional", icon: Stethoscope, color: "text-cyan-400" },
  { key: "partner", label: "Parceiro", to: "/partner", icon: Store, color: "text-emerald-400" },
  { key: "student", label: "Aluno", to: "/student", icon: UserRound, color: "text-white" },
];

export function RoleSwitcher({ current }: { current: RoleOption["key"] }) {
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [roles, setRoles] = useState<RoleOption["key"][]>([]);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user || !active) return;
      const { data: profile } = await supabase
        .from("profiles")
        .select("id, role")
        .eq("user_id", user.id)
        .maybeSingle();
      if (!profile?.id || !active) return;
      const found: RoleOption["key"][] = [];
      if (profile.role === "admin") found.push("admin");
      const [{ data: coach }, { data: partner }, { data: student }] = await Promise.all([
        supabase.from("coaches").select("id, is_professional, approved_at").eq("profile_id", profile.id).maybeSingle(),
        supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle(),
        supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
      ]);
      if (coach) {
        found.push("coach");
        if ((coach as any).is_professional && (coach as any).approved_at) found.push("professional");
      }
      if (partner) found.push("partner");
      if (student) found.push("student");
      if (active) setRoles(found);
    })();
    return () => { active = false; };
  }, []);

  const available = ALL.filter((r) => roles.includes(r.key));
  if (available.length <= 1) return null;

  const currentMeta = ALL.find((r) => r.key === current);
  const CurrentIcon = currentMeta?.icon ?? Repeat;

  return (
    <div className="relative">
      <button
        onClick={() => setOpen((v) => !v)}
        className="inline-flex items-center gap-1.5 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs font-semibold text-white hover:bg-white/10"
      >
        <CurrentIcon className={`h-3.5 w-3.5 ${currentMeta?.color || ""}`} />
        <span>{currentMeta?.label || "Painel"}</span>
        <ChevronDown className="h-3 w-3 opacity-60" />
      </button>
      {open && (
        <>
          <div className="fixed inset-0 z-40" onClick={() => setOpen(false)} />
          <div className="absolute right-0 top-full z-50 mt-1 w-48 overflow-hidden rounded-xl border border-white/10 bg-neutral-900 shadow-xl">
            <p className="px-3 pt-2 pb-1 text-[10px] uppercase tracking-wider text-white/40">Trocar painel</p>
            {available.map((r) => {
              const Icon = r.icon;
              const isCurrent = r.key === current;
              return (
                <button
                  key={r.key}
                  disabled={isCurrent}
                  onClick={() => { setOpen(false); navigate({ to: r.to }); }}
                  className={`flex w-full items-center gap-2 px-3 py-2 text-left text-xs ${
                    isCurrent ? "bg-white/5 text-white/40 cursor-default" : "text-white hover:bg-white/10"
                  }`}
                >
                  <Icon className={`h-3.5 w-3.5 ${r.color}`} />
                  <span className="flex-1">{r.label}</span>
                  {isCurrent && <span className="text-[9px] text-white/40">atual</span>}
                </button>
              );
            })}
          </div>
        </>
      )}
    </div>
  );
}
