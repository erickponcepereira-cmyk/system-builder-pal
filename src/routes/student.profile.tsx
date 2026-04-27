import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { Settings, CreditCard, Gift, Users, Award, HelpCircle, LogOut, ChevronRight, Camera, GraduationCap, Rocket } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/student/profile")({
  component: ProfilePage,
});

const sections = [
  {
    title: "Conta",
    items: [
      { icon: Settings, label: "Editar perfil" },
      { icon: CreditCard, label: "Meus planos" },
      { icon: Award, label: "Minha evolução" },
    ],
  },
  {
    title: "Programa",
    items: [
      { icon: Gift, label: "Clube de benefícios" },
      { icon: Users, label: "Indicar amigos" },
    ],
  },
  {
    title: "Suporte",
    items: [
      { icon: HelpCircle, label: "Central de ajuda" },
    ],
  },
];

function ProfilePage() {
  const navigate = useNavigate();

  const handleLogout = async () => {
    await supabase.auth.signOut();
    toast.success("Sessão encerrada");
    navigate({ to: "/login" });
  };

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <h1 className="text-2xl font-bold text-white">Perfil</h1>
      </header>

      {/* Profile card */}
      <div className="rounded-2xl p-5 flex items-center gap-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="relative">
          <div className="flex h-16 w-16 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/40">
            <span className="text-xl font-bold text-primary">A</span>
          </div>
          <button className="absolute -bottom-1 -right-1 flex h-6 w-6 items-center justify-center rounded-full bg-primary border-2" style={{ borderColor: "#1A1A1A" }}>
            <Camera className="h-3 w-3 text-primary-foreground" />
          </button>
        </div>
        <div className="flex-1">
          <p className="text-base font-bold text-white">Aluno FitMind Club</p>
          <p className="text-xs text-white/50">aluno@email.com</p>
          <span className="mt-1.5 inline-block rounded-full bg-primary/20 px-2 py-0.5 text-[10px] font-bold text-primary">
            🔥 Plano Premium
          </span>
        </div>
      </div>

      {/* Stats */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-white">3</p>
          <p className="text-[10px] text-white/40">Desafios</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-white">-8.4</p>
          <p className="text-[10px] text-white/40">kg total</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-base font-bold text-primary">A+</p>
          <p className="text-[10px] text-white/40">Nota</p>
        </div>
      </div>

      <div className="rounded-2xl border border-primary/20 bg-primary/10 p-4">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Rocket className="h-5 w-5" />
          </div>
          <div className="flex-1">
            <h2 className="text-sm font-bold text-white">Quer fazer parte da equipe de coaches?</h2>
            <p className="mt-1 text-xs leading-relaxed text-white/60">Torne-se um Coach FitMind Club e ganhe ajudando outras pessoas a se transformarem.</p>
            <button className="mt-3 inline-flex items-center gap-2 rounded-xl bg-primary px-3 py-2 text-xs font-bold text-primary-foreground">
              <GraduationCap className="h-4 w-4" /> Fazer Curso de Coach
            </button>
          </div>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-white/40">Carteira de indicações</p>
            <p className="mt-1 text-2xl font-bold text-white">R$ 120,00</p>
            <p className="text-[11px] text-white/40">+ R$ 80,00 pendente por 15 dias</p>
          </div>
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
            <Gift className="h-5 w-5 text-primary" />
          </div>
        </div>
        <div className="mt-3 flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
          <span className="truncate font-mono text-xs text-white/60">/r/ALUNO2026</span>
          <button className="text-xs font-bold text-primary">Copiar</button>
        </div>
      </div>

      {/* Sections */}
      {sections.map((section) => (
        <div key={section.title}>
          <h2 className="mb-2 text-[11px] font-semibold uppercase tracking-wider text-white/40 px-1">
            {section.title}
          </h2>
          <div className="rounded-2xl overflow-hidden" style={{ backgroundColor: "#1A1A1A" }}>
            {section.items.map((it, i) => (
              <button
                key={it.label}
                className={`flex w-full items-center gap-3 px-4 py-3.5 text-left transition-colors hover:bg-white/[0.04] ${
                  i !== section.items.length - 1 ? "border-b border-white/5" : ""
                }`}
              >
                <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-white/5">
                  <it.icon className="h-4 w-4 text-white/70" />
                </div>
                <span className="flex-1 text-sm text-white">{it.label}</span>
                <ChevronRight className="h-4 w-4 text-white/30" />
              </button>
            ))}
          </div>
        </div>
      ))}

      {/* Logout */}
      <button
        onClick={handleLogout}
        className="mt-2 flex items-center justify-center gap-2 rounded-2xl py-3.5 text-sm font-semibold text-red-400 transition-colors hover:bg-red-500/10"
        style={{ backgroundColor: "#1A1A1A" }}
      >
        <LogOut className="h-4 w-4" />
        Sair da conta
      </button>

      <p className="text-center text-[10px] text-white/20 mt-2">FitMind Club v1.0.0</p>
    </div>
  );
}
