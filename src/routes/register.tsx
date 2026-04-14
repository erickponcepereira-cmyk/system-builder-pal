import { createFileRoute, Link } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, ArrowLeft, User, Dumbbell } from "lucide-react";
import { useState } from "react";

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Cadastro — FitChain" },
      { name: "description", content: "Cadastre-se como coach ou aluno na plataforma FitChain." },
    ],
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const [role, setRole] = useState<"student" | "coach" | null>(null);
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-5 w-5 text-primary-foreground" />
            </div>
            <span className="text-2xl font-bold text-foreground">FitChain</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha seu perfil para começar</p>
        </div>

        {!role ? (
          <div className="space-y-4">
            <button
              onClick={() => setRole("student")}
              className="group w-full rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <User className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Sou Aluno</h3>
                  <p className="text-sm text-muted-foreground">Quero participar de desafios fitness</p>
                </div>
              </div>
            </button>

            <button
              onClick={() => setRole("coach")}
              className="group w-full rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            >
              <div className="flex items-center gap-4">
                <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                  <Dumbbell className="h-6 w-6" />
                </div>
                <div>
                  <h3 className="font-semibold text-foreground">Sou Coach</h3>
                  <p className="text-sm text-muted-foreground">Quero vender desafios e montar minha rede</p>
                </div>
              </div>
            </button>
          </div>
        ) : (
          <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
            <div className="mb-6 flex items-center justify-between">
              <h2 className="font-semibold text-foreground">
                Cadastro de {role === "student" ? "Aluno" : "Coach"}
              </h2>
              <button
                onClick={() => setRole(null)}
                className="text-sm text-muted-foreground hover:text-foreground"
              >
                Trocar
              </button>
            </div>

            <form
              onSubmit={(e) => {
                e.preventDefault();
                // Auth will be implemented with Lovable Cloud
              }}
              className="space-y-4"
            >
              <div className="space-y-2">
                <Label htmlFor="name">Nome completo</Label>
                <Input id="name" placeholder="Seu nome" value={name} onChange={(e) => setName(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-email">E-mail</Label>
                <Input id="reg-email" type="email" placeholder="seu@email.com" value={email} onChange={(e) => setEmail(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="phone">WhatsApp</Label>
                <Input id="phone" type="tel" placeholder="(11) 99999-9999" value={phone} onChange={(e) => setPhone(e.target.value)} required />
              </div>
              <div className="space-y-2">
                <Label htmlFor="reg-password">Senha</Label>
                <Input id="reg-password" type="password" placeholder="••••••••" value={password} onChange={(e) => setPassword(e.target.value)} required />
              </div>
              <Button type="submit" className="w-full" size="lg">
                Criar conta
              </Button>
            </form>

            {role === "coach" && (
              <p className="mt-4 text-xs text-muted-foreground text-center">
                Seu cadastro será analisado pelo administrador antes da aprovação.
              </p>
            )}
          </div>
        )}

        <div className="mt-6 text-center text-sm text-muted-foreground">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-muted-foreground hover:text-foreground">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
