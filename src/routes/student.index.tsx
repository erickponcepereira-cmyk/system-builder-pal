import { createFileRoute, Link } from "@tanstack/react-router";
import { Bell, Flame, QrCode, Calendar, Camera, Apple, Scale, Trophy, Sparkles } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/student/")({
  component: StudentHome,
});

function StudentHome() {
  return (
    <div className="flex flex-col gap-5 p-4 pb-6">
      {/* Header */}
      <header className="flex items-center justify-between pt-2">
        <div className="flex items-center gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-full bg-primary/20 ring-2 ring-primary/30">
            <span className="text-base font-bold text-primary">A</span>
          </div>
          <div>
            <p className="text-xs text-white/40">Bom dia,</p>
            <p className="text-sm font-bold text-white">Aluno 🔥</p>
          </div>
        </div>
        <button className="relative flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <Bell className="h-5 w-5 text-white/70" />
          <span className="absolute top-2 right-2 h-2 w-2 rounded-full bg-primary" />
        </button>
      </header>

      {/* Carteirinha Digital */}
      <div
        className="rounded-3xl p-5 relative overflow-hidden"
        style={{
          background: "linear-gradient(135deg, hsl(var(--primary)), hsl(var(--primary) / 0.7))",
        }}
      >
        <div className="absolute -top-10 -right-10 h-40 w-40 rounded-full bg-white/10" />
        <div className="absolute -bottom-16 -left-10 h-40 w-40 rounded-full bg-black/10" />
        <div className="relative z-10 flex justify-between items-start">
          <div>
            <div className="flex items-center gap-1.5 mb-3">
              <Flame className="h-4 w-4 text-white" />
              <span className="text-xs font-bold tracking-wider text-white">FITMIND CLUB</span>
            </div>
            <p className="text-[11px] text-white/70 uppercase tracking-wider">Carteirinha Digital</p>
            <p className="text-lg font-bold text-white mt-0.5">Desafio 30 Dias</p>
            <p className="text-xs text-white/80 mt-2">Plano Premium • Ativo</p>
            <p className="text-[10px] text-white/60 mt-1">Válido até 15/05/2026</p>
          </div>
          <div className="flex h-14 w-14 items-center justify-center rounded-xl bg-white/95">
            <QrCode className="h-9 w-9 text-black" />
          </div>
        </div>
      </div>

      {/* Progresso do Desafio */}
      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-2">
            <Trophy className="h-4 w-4 text-primary" />
            <h2 className="text-sm font-semibold text-white">Progresso do Desafio</h2>
          </div>
          <span className="text-xs font-bold text-primary">Dia 18/30</span>
        </div>
        <Progress value={60} className="h-2 bg-white/5" />
        <div className="mt-3 flex justify-between text-[11px] text-white/50">
          <span>60% concluído</span>
          <span>12 dias restantes</span>
        </div>
      </div>

      {/* Próxima Aula */}
      <Link
        to="/student/challenge"
        className="rounded-2xl p-4 flex items-center gap-3 transition-colors hover:bg-white/[0.07]"
        style={{ backgroundColor: "#1A1A1A" }}
      >
        <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/15">
          <Calendar className="h-5 w-5 text-primary" />
        </div>
        <div className="flex-1">
          <p className="text-[11px] text-white/40 uppercase tracking-wide">Próxima Aula</p>
          <p className="text-sm font-semibold text-white">HIIT — Queima Total</p>
          <p className="text-xs text-white/50">Hoje • 19h00 • Ao vivo</p>
        </div>
        <span className="rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary">AO VIVO</span>
      </Link>

      {/* Ações Rápidas */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">Ações Rápidas</h2>
        <div className="grid grid-cols-4 gap-2">
          {[
            { icon: Camera, label: "Foto" },
            { icon: Apple, label: "Refeição" },
            { icon: Scale, label: "Pesagem" },
            { icon: Sparkles, label: "IA" },
          ].map((a) => (
            <button
              key={a.label}
              className="flex flex-col items-center justify-center gap-1.5 rounded-2xl p-3 transition-colors hover:bg-white/[0.07]"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <a.icon className="h-5 w-5 text-primary" />
              </div>
              <span className="text-[10px] font-medium text-white/70">{a.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Stats rápidas */}
      <div className="grid grid-cols-3 gap-2">
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-white">-3.2</p>
          <p className="text-[10px] text-white/40 mt-0.5">kg perdidos</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-white">14</p>
          <p className="text-[10px] text-white/40 mt-0.5">aulas feitas</p>
        </div>
        <div className="rounded-2xl p-3 text-center" style={{ backgroundColor: "#1A1A1A" }}>
          <p className="text-lg font-bold text-primary">A+</p>
          <p className="text-[10px] text-white/40 mt-0.5">consistência</p>
        </div>
      </div>
    </div>
  );
}
