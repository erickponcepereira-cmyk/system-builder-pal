import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { ChevronLeft, Sparkles, TrendingUp, Users, Trophy, Award, Building2, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/student/partner-track")({ component: PartnerTrackPage });

function PartnerTrackPage() {
  const navigate = useNavigate();
  return (
    <div className="flex flex-col gap-4 p-4 pb-10">
      <header className="flex items-center gap-3 pt-2">
        <Link to="/student/profile" className="flex h-10 w-10 items-center justify-center rounded-full bg-white/5">
          <ChevronLeft className="h-5 w-5 text-white" />
        </Link>
        <div>
          <p className="text-xs text-white/40 uppercase tracking-wider">Oportunidade</p>
          <h1 className="text-2xl font-bold text-white">Quero ser Empresa Parceira</h1>
        </div>
      </header>

      <section className="relative overflow-hidden rounded-3xl border border-primary/20 bg-gradient-to-br from-primary/20 via-primary/5 to-transparent p-5">
        <div className="absolute -right-8 -top-8 h-32 w-32 rounded-full bg-primary/20 blur-3xl" />
        <div className="relative">
          <div className="mb-3 inline-flex items-center gap-2 rounded-full bg-primary/15 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-primary">
            <Building2 className="h-3 w-3" /> Parcerias com benefícios
          </div>
          <h2 className="text-xl font-bold leading-tight text-white">
            Coloque sua empresa na frente da nossa rede de alunos, coaches e profissionais.
          </h2>
          <p className="mt-2 text-sm leading-relaxed text-white/70">
            Restaurantes saudáveis, academias, suplementação, vestuário, espaços de bem-estar e qualquer negócio alinhado ao estilo de vida FitMind Club pode se tornar parceiro oficial.
          </p>
        </div>
      </section>

      <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-3 text-sm font-bold text-white">Por que ser Empresa Parceira</h3>
        <ul className="space-y-2 text-sm leading-relaxed text-white/80">
          <li className="flex items-start gap-2"><TrendingUp className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Tráfego qualificado direto do app para o seu estabelecimento.</span></li>
          <li className="flex items-start gap-2"><Users className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Painel próprio com QR Code de check-in, controle de visitas e relatórios.</span></li>
          <li className="flex items-start gap-2"><Trophy className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Vouchers e benefícios exclusivos para impulsionar conversão.</span></li>
          <li className="flex items-start gap-2"><Award className="mt-0.5 h-4 w-4 shrink-0 text-primary" /><span>Selo de Empresa Parceira FitMind Club e divulgação na nossa rede.</span></li>
        </ul>
      </section>

      <section className="rounded-2xl border border-white/5 p-4" style={{ backgroundColor: "#1A1A1A" }}>
        <h3 className="mb-2 text-sm font-bold text-white">Como funciona</h3>
        <p className="text-xs leading-relaxed text-white/65">
          Você envia os dados da empresa, nossa equipe avalia o alinhamento de marca e ativa seu painel de parceira. A partir daí, você publica ofertas e benefícios diretamente para os alunos.
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-white/5 px-3 py-1 text-[10px] font-bold uppercase tracking-wider text-white/60">
          <Sparkles className="h-3 w-3" /> Sem produto obrigatório
        </div>
      </section>

      <Button size="lg" className="w-full gap-2" onClick={() => navigate({ to: "/become-partner" })}>
        Iniciar cadastro da empresa <ArrowRight className="h-4 w-4" />
      </Button>
    </div>
  );
}
