import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Sparkles, TrendingUp, Users, Trophy, Award, Briefcase, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/_authenticated/student/professional-track")({ component: ProfessionalTrackPage });

function ProfessionalTrackPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ChevronLeft className="h-5 w-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Oportunidade</p>
          <h1 className="text-2xl font-bold text-white">Quero ser Profissional</h1>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Briefcase className="h-3 w-3" /> Profissionais de saúde e bem-estar
          </div>
          <h2 className="text-xl font-bold leading-tight text-white">
            Atenda alunos FitMind Club com sua expertise e ganhe escalando seu agendamento.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Personal trainers, nutricionistas, médicos, fisioterapeutas, esteticistas e outros profissionais credenciados podem oferecer seus serviços dentro do nosso ecossistema.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Por que se cadastrar como Profissional</h3>
        <ul className="space-y-2 text-sm leading-relaxed text-white/80">
          <li className="flex items-start gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Receba indicações qualificadas de coaches e alunos da rede.</span></li>
          <li className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Apareça no app para milhares de alunos buscando acompanhamento profissional.</span></li>
          <li className="flex items-start gap-2"><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Use a plataforma para emitir avaliações, anamneses e protocolos com sua marca.</span></li>
          <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Selo de profissional credenciado FitMind Club no seu perfil público.</span></li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-2 text-sm font-bold text-white">Como funciona</h3>
        <p className="text-xs leading-relaxed text-white/65">
          Você se cadastra com seus dados profissionais (registro de conselho, especialidade, cidade), nossa equipe valida e libera seu acesso ao painel de Profissional, onde você gerencia agenda, clientes e fichas técnicas.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
          <Sparkles className="h-3 w-3" /> Sem produto obrigatório
        </div>
      </section>

      <Button size="lg" className="w-full gap-2" onClick={() => navigate({ to: "/register", search: { role: "professional" } as never })}>
        Iniciar cadastro como Profissional <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
