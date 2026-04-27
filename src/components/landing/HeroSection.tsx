import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight, Users, TrendingUp, Award } from "lucide-react";

export function HeroSection() {
  return (
    <section className="relative min-h-screen flex items-center justify-center px-4 pt-16 gradient-hero overflow-hidden">
      {/* Background decoration */}
      <div className="absolute inset-0 overflow-hidden pointer-events-none">
        <div className="absolute -top-40 -right-40 h-80 w-80 rounded-full bg-primary/5 blur-3xl" />
        <div className="absolute -bottom-40 -left-40 h-96 w-96 rounded-full bg-primary/5 blur-3xl" />
      </div>

      <div className="relative z-10 mx-auto max-w-5xl text-center">
        <div className="mb-6 inline-flex items-center gap-2 rounded-full border border-primary/30 bg-primary/10 px-4 py-1.5 text-sm text-primary">
          <Award className="h-4 w-4" />
          Plataforma #1 de Desafios Fitness
        </div>

        <h1 className="text-4xl font-extrabold leading-tight tracking-tight sm:text-5xl md:text-6xl lg:text-7xl">
          Transforme vidas.{" "}
          <span className="text-gradient-primary">Construa sua rede.</span>
        </h1>

        <p className="mx-auto mt-6 max-w-2xl text-lg text-muted-foreground sm:text-xl">
          O FitMind Club conecta coaches e alunos em desafios fitness de 30 dias com
          comissões automatizadas em cadeia. Cresça sua equipe e seus ganhos.
        </p>

        <div className="mt-10 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
          <Button variant="hero" size="xl" asChild>
            <Link to="/register">
              Comece Agora <ArrowRight className="ml-1 h-5 w-5" />
            </Link>
          </Button>
          <Button variant="outline" size="lg" asChild>
            <Link to="/login">Já tenho conta</Link>
          </Button>
        </div>

        <div className="mt-16 grid grid-cols-1 gap-6 sm:grid-cols-3">
          <StatCard icon={<Users className="h-6 w-6 text-primary" />} value="2.500+" label="Coaches ativos" />
          <StatCard icon={<TrendingUp className="h-6 w-6 text-primary" />} value="R$ 1.2M" label="Em comissões pagas" />
          <StatCard icon={<Award className="h-6 w-6 text-primary" />} value="15.000+" label="Desafios completados" />
        </div>
      </div>
    </section>
  );
}

function StatCard({ icon, value, label }: { icon: React.ReactNode; value: string; label: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-2xl border border-border/50 bg-card/50 p-6 backdrop-blur-sm">
      {icon}
      <span className="text-2xl font-bold text-foreground">{value}</span>
      <span className="text-sm text-muted-foreground">{label}</span>
    </div>
  );
}
