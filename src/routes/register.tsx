import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, User, Dumbbell } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useState } from "react";
import { CoachRegistration } from "@/components/auth/CoachRegistration";
import { StudentRegistration } from "@/components/auth/StudentRegistration";

type SearchParams = { role?: string };

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Cadastro — FitMind Club" },
      { name: "description", content: "Cadastre-se como coach ou aluno na plataforma FitMind Club." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    role: search.role as string | undefined,
  }),
  component: RegisterPage,
});

function RegisterPage() {
  const search = Route.useSearch();
  const [role, setRole] = useState<"student" | "coach" | null>(
    search.role === "coach" ? "coach" : search.role === "student" ? "student" : null
  );

  // If coach, show multi-step. If student, simpler form.
  if (role === "coach") {
    return <CoachRegistration onBack={() => setRole(null)} />;
  }

  if (role === "student") {
    return <StudentRegistration onBack={() => setRole(null)} />;
  }

  // Role selection
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Logo className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold text-white">FitMind Club</span>
          </Link>
          <h1 className="text-2xl font-bold text-white">Criar conta</h1>
          <p className="mt-1 text-sm text-white/50">Escolha seu perfil para começar</p>
        </div>

        <div className="space-y-4">
          <button
            onClick={() => setRole("student")}
            className="group w-full rounded-2xl border border-white/10 p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <User className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Sou Aluno</h3>
                <p className="text-sm text-white/50">Quero participar de desafios fitness</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole("coach")}
            className="group w-full rounded-2xl border border-white/10 p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
            style={{ backgroundColor: "#1A1A1A" }}
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Dumbbell className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-white">Sou Coach</h3>
                <p className="text-sm text-white/50">Quero vender desafios e montar minha rede</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 text-center text-sm text-white/40">
          Já tem conta?{" "}
          <Link to="/login" className="font-medium text-primary hover:underline">
            Entrar
          </Link>
        </div>

        <div className="mt-4 text-center">
          <Link to="/" className="inline-flex items-center gap-1 text-sm text-white/30 hover:text-white/60">
            <ArrowLeft className="h-4 w-4" /> Voltar ao início
          </Link>
        </div>
      </div>
    </div>
  );
}
