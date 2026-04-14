import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, ArrowLeft } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — FitChain" },
      { name: "description", content: "Faça login na plataforma FitChain." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">FitChain</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Bem-vindo de volta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Entre na sua conta para continuar</p>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              // Auth will be implemented with Lovable Cloud
            }}
            className="space-y-4"
          >
            <div className="space-y-2">
              <Label htmlFor="email">E-mail</Label>
              <Input
                id="email"
                type="email"
                placeholder="seu@email.com"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">Senha</Label>
              <Input
                id="password"
                type="password"
                placeholder="••••••••"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
              />
            </div>
            <Button type="submit" className="w-full" size="lg">
              Entrar
            </Button>
          </form>

          <div className="mt-6 text-center text-sm text-muted-foreground">
            Não tem conta?{" "}
            <Link to="/register" className="font-medium text-primary hover:underline">
              Cadastre-se
            </Link>
          </div>
        </div>

        <div className="mt-6 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
