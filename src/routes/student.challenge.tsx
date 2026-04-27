import { createFileRoute } from "@tanstack/react-router";
import { Trophy, Calendar, Scale, Camera, TrendingDown, Award, CheckCircle2, Circle, Medal } from "lucide-react";
import { Progress } from "@/components/ui/progress";

export const Route = createFileRoute("/student/challenge")({
  component: ChallengePage,
});

function ChallengePage() {
  const tabs = ["Visão Geral", "Aulas", "Evolução", "Frequência", "Premiação"];
  const attendanceDays = Array.from({ length: 30 }, (_, index) => index + 1);

  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs text-white/40 uppercase tracking-wider">Meu Desafio</p>
        <h1 className="text-2xl font-bold text-white">30 Dias Premium</h1>
      </header>

      {/* Tabs */}
      <div className="flex gap-2 overflow-x-auto -mx-4 px-4 pb-1 scrollbar-none">
        {tabs.map((t, i) => (
          <button
            key={t}
            className={`shrink-0 rounded-full px-4 py-2 text-xs font-semibold transition-colors ${
              i === 0
                ? "bg-primary text-primary-foreground"
                : "bg-white/5 text-white/60 hover:text-white"
            }`}
          >
            {t}
          </button>
        ))}
      </div>

      {/* Progresso geral */}
      <div className="rounded-2xl p-5" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs text-white/50">Progresso geral</span>
          <span className="text-sm font-bold text-primary">60%</span>
        </div>
        <Progress value={60} className="h-2 bg-white/5" />
        <div className="mt-4 grid grid-cols-3 gap-3 pt-3 border-t border-white/5">
          <div>
            <p className="text-lg font-bold text-white">18</p>
            <p className="text-[10px] text-white/40">Dias feitos</p>
          </div>
          <div>
            <p className="text-lg font-bold text-white">12</p>
            <p className="text-[10px] text-white/40">Restantes</p>
          </div>
          <div>
            <p className="text-lg font-bold text-primary">A+</p>
            <p className="text-[10px] text-white/40">Performance</p>
          </div>
        </div>
      </div>

      {/* Métricas */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-2">
            <Scale className="h-4 w-4 text-primary" />
            <TrendingDown className="h-4 w-4 text-emerald-400" />
          </div>
          <p className="text-xl font-bold text-white">82.5 kg</p>
          <p className="text-[10px] text-white/40 mt-0.5">-3.2 kg desde o início</p>
        </div>
        <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex items-center justify-between mb-2">
            <Trophy className="h-4 w-4 text-primary" />
            <Award className="h-4 w-4 text-amber-400" />
          </div>
          <p className="text-xl font-bold text-white">14º</p>
          <p className="text-[10px] text-white/40 mt-0.5">no ranking semanal</p>
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-3 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Frequência</h2>
            <p className="text-[11px] text-white/40">18/25 dias úteis (72%)</p>
          </div>
          <span className="rounded-full bg-primary/20 px-2.5 py-1 text-[10px] font-bold text-primary">72%</span>
        </div>
        <div className="grid grid-cols-10 gap-1.5">
          {attendanceDays.map((day) => {
            const attended = day <= 18;
            const future = day > 25;
            return (
              <div
                key={day}
                className={`flex aspect-square items-center justify-center rounded-full text-[9px] ${
                  attended ? "bg-primary text-primary-foreground" : future ? "bg-white/5 text-white/20" : "border border-white/10 text-white/40"
                }`}
              >
                {attended ? <CheckCircle2 className="h-3 w-3" /> : future ? day : <Circle className="h-3 w-3" />}
              </div>
            );
          })}
        </div>
      </div>

      <div className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="mb-4 flex items-center justify-between">
          <div>
            <h2 className="text-sm font-bold text-white">Ranking por categoria</h2>
            <p className="text-[11px] text-white/40">Feminino • Maior perda de gordura %</p>
          </div>
          <Medal className="h-5 w-5 text-primary" />
        </div>
        <div className="mb-3 grid grid-cols-2 gap-2">
          {["Feminino", "Masculino"].map((gender, index) => (
            <button key={gender} className={`rounded-xl px-3 py-2 text-xs font-bold ${index === 0 ? "bg-primary text-primary-foreground" : "bg-white/5 text-white/60"}`}>
              {gender}
            </button>
          ))}
        </div>
        <div className="flex gap-2 overflow-x-auto pb-1">
          {["Gordura", "Músculo", "Peso"].map((category, index) => (
            <span key={category} className={`shrink-0 rounded-full px-3 py-1.5 text-[10px] font-bold ${index === 0 ? "bg-primary/20 text-primary" : "bg-white/5 text-white/50"}`}>
              {category}
            </span>
          ))}
        </div>
        <div className="mt-4 space-y-2">
          {[
            { pos: "🥇", name: "Ana P.", value: "-8.4%" },
            { pos: "🥈", name: "Bianca S.", value: "-6.9%" },
            { pos: "🥉", name: "Carla M.", value: "-5.8%" },
          ].map((row) => (
            <div key={row.name} className="flex items-center justify-between rounded-xl bg-white/5 px-3 py-2">
              <div className="flex items-center gap-2">
                <span>{row.pos}</span>
                <span className="text-sm font-medium text-white">{row.name}</span>
              </div>
              <span className="text-sm font-bold text-primary">{row.value}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Próximas atividades */}
      <div>
        <h2 className="mb-3 text-xs font-semibold uppercase tracking-wider text-white/40">
          Próximas atividades
        </h2>
        <div className="space-y-2">
          {[
            { icon: Calendar, title: "HIIT — Queima Total", time: "Hoje • 19h00", live: true },
            { icon: Scale, title: "Pesagem semanal", time: "Amanhã • Lembrete" },
            { icon: Camera, title: "Foto de evolução", time: "Quinta • Semana 3" },
          ].map((it, i) => (
            <div
              key={i}
              className="flex items-center gap-3 rounded-2xl p-3"
              style={{ backgroundColor: "#1A1A1A" }}
            >
              <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary/15">
                <it.icon className="h-4 w-4 text-primary" />
              </div>
              <div className="flex-1">
                <p className="text-sm font-medium text-white">{it.title}</p>
                <p className="text-[11px] text-white/40">{it.time}</p>
              </div>
              {it.live && (
                <span className="rounded-full bg-primary/20 px-2 py-0.5 text-[9px] font-bold text-primary">
                  LIVE
                </span>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
