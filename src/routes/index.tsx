import { createFileRoute } from "@tanstack/react-router";
import { Header } from "@/components/layout/Header";
import { HeroSection } from "@/components/landing/HeroSection";
import { FeaturesSection } from "@/components/landing/FeaturesSection";
import { CTASection } from "@/components/landing/CTASection";
import { Footer } from "@/components/layout/Footer";

export const Route = createFileRoute("/")({
  head: () => ({
    meta: [
      { title: "FitMind Club — Plataforma MLM de Desafios Fitness" },
      { name: "description", content: "Conecte coaches e alunos em desafios fitness de 30 dias com comissões automáticas em cadeia." },
      { property: "og:title", content: "FitMind Club — Plataforma MLM de Desafios Fitness" },
      { property: "og:description", content: "Transforme vidas, construa sua rede e ganhe comissões automatizadas." },
    ],
  }),
  component: Index,
});

function Index() {
  return (
    <div className="min-h-screen bg-background">
      <Header />
      <HeroSection />
      <FeaturesSection />
      <CTASection />
      <Footer />
    </div>
  );
}
