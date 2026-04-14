import { Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { ArrowRight } from "lucide-react";

export function CTASection() {
  return (
    <section className="px-4 py-24">
      <div className="mx-auto max-w-4xl text-center">
        <div className="rounded-3xl border border-primary/20 gradient-card p-12 sm:p-16">
          <h2 className="text-3xl font-bold sm:text-4xl">
            Pronto para <span className="text-gradient-primary">começar?</span>
          </h2>
          <p className="mx-auto mt-4 max-w-lg text-muted-foreground">
            Cadastre-se como coach, monte sua rede e comece a transformar vidas enquanto ganha comissões em cadeia.
          </p>
          <div className="mt-8 flex flex-col items-center gap-4 sm:flex-row sm:justify-center">
            <Button variant="hero" size="xl" asChild>
              <Link to="/register">
                Quero ser Coach <ArrowRight className="ml-1 h-5 w-5" />
              </Link>
            </Button>
            <Button variant="ghost" size="lg" asChild>
              <Link to="/register">Sou aluno</Link>
            </Button>
          </div>
        </div>
      </div>
    </section>
  );
}
