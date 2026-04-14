import { createFileRoute, Link } from "@tanstack/react-router";
import { Flame, Clock, ArrowLeft } from "lucide-react";
import { Button } from "@/components/ui/button";

export const Route = createFileRoute("/register_/pending")({
  head: () => ({
    meta: [
      { title: "Cadastro Enviado — FitChain" },
      { name: "description", content: "Seu cadastro foi enviado e está aguardando aprovação." },
    ],
  }),
  component: PendingPage,
});

function PendingPage() {
  return (
    <div className="flex min-h-screen items-center justify-center px-4" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-8">
          <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
            <Flame className="h-5 w-5 text-primary-foreground" />
          </div>
          <span className="text-2xl font-bold text-white">FitChain</span>
        </div>

        <div className="rounded-2xl p-8" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="flex h-16 w-16 mx-auto items-center justify-center rounded-full bg-primary/10 mb-6">
            <Clock className="h-8 w-8 text-primary" />
          </div>

          <h1 className="text-xl font-bold text-white mb-2">Cadastro enviado!</h1>
          <p className="text-sm text-white/50 mb-6">
            Seu cadastro foi recebido e está aguardando aprovação do administrador. Você receberá um e-mail assim que for aprovado.
          </p>

          <Button asChild className="w-full" size="lg">
            <Link to="/login">Ir para o login</Link>
          </Button>
        </div>

        <div className="mt-6">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/30 hover:text-white/60">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
