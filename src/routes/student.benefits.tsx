import { createFileRoute } from "@tanstack/react-router";
import { Gift, Percent, Dumbbell, Apple, HeartPulse, Star } from "lucide-react";

export const Route = createFileRoute("/student/benefits")({
  component: BenefitsPage,
});

const benefits = [
  { icon: Percent, title: "Descontos exclusivos", desc: "Ofertas em produtos, cursos e parceiros selecionados.", tag: "Até 30%" },
  { icon: Dumbbell, title: "Aulas especiais", desc: "Treinos bônus liberados para alunos ativos do desafio.", tag: "Premium" },
  { icon: Apple, title: "Nutrição prática", desc: "Receitas, listas e orientações para manter a consistência.", tag: "Semanal" },
  { icon: HeartPulse, title: "Acompanhamento", desc: "Benefícios para pesagens, evolução e check-ins com coach.", tag: "Ativo" },
];

function BenefitsPage() {
  return (
    <div className="flex flex-col gap-4 p-4 pb-6">
      <header className="pt-2">
        <p className="text-xs uppercase tracking-wider text-white/40">Clube</p>
        <h1 className="text-2xl font-bold text-white">Benefícios</h1>
      </header>

      <section className="relative overflow-hidden rounded-2xl border border-primary/20 bg-primary/10 p-5">
        <div className="flex items-start gap-3">
          <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary text-primary-foreground">
            <Gift className="h-6 w-6" />
          </div>
          <div>
            <p className="text-lg font-bold text-white">FitMind Club ativo</p>
            <p className="mt-1 text-sm leading-relaxed text-white/60">
              Seus benefícios acompanham seu plano e evoluem com sua frequência no desafio.
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-3">
        {benefits.map((benefit) => (
          <article key={benefit.title} className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
            <div className="flex items-start gap-3">
              <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-primary/15">
                <benefit.icon className="h-5 w-5 text-primary" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between gap-2">
                  <h2 className="text-sm font-bold text-white">{benefit.title}</h2>
                  <span className="shrink-0 rounded-full bg-white/5 px-2 py-1 text-[10px] font-bold text-primary">
                    {benefit.tag}
                  </span>
                </div>
                <p className="mt-1 text-xs leading-relaxed text-white/50">{benefit.desc}</p>
              </div>
            </div>
          </article>
        ))}
      </div>

      <section className="rounded-2xl p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <div className="flex items-center gap-2 text-primary">
          <Star className="h-4 w-4" />
          <p className="text-xs font-bold uppercase tracking-wider">Próximo desbloqueio</p>
        </div>
        <p className="mt-2 text-sm text-white">Complete 20 dias de frequência para liberar novos descontos.</p>
      </section>
    </div>
  );
}
