import { createFileRoute, Link } from "@tanstack/react-router";
import { ArrowLeft, User, Dumbbell, Building2, Stethoscope, ShoppingCart } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { CoachRegistration } from "@/components/auth/CoachRegistration";
import { StudentRegistration } from "@/components/auth/StudentRegistration";
import { PartnerRegistration } from "@/components/auth/PartnerRegistration";
import { ProfessionalRegistration } from "@/components/auth/ProfessionalRegistration";
import { InstallAppButton } from "@/components/InstallAppButton";
import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";
import { readPublicCart, type PublicCartLine } from "@/lib/public-store";


type SearchParams = { role?: string };

export const Route = createFileRoute("/register")({
  head: () => ({
    meta: [
      { title: "Cadastro — FitMind Club" },
      { name: "description", content: "Cadastre-se como coach, aluno ou empresa parceira na plataforma FitMind Club." },
    ],
  }),
  validateSearch: (search: Record<string, unknown>): SearchParams => ({
    role: search.role as string | undefined,
  }),
  component: RegisterPage,
});

const brl = (n: number) => n.toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

function RegisterPage() {
  const search = Route.useSearch();
  const [role, setRole] = useState<"student" | "coach" | "partner" | "professional" | null>(
    search.role === "coach" ? "coach"
    : search.role === "student" ? "student"
    : search.role === "partner" ? "partner"
    : search.role === "professional" ? "professional"
    : null
  );

  /**
   * Quem chegou com carrinho montado na loja pública é comprador: vai direto
   * para o cadastro de aluno, sem passar pelo seletor de perfil. Ler o
   * carrinho só depois de montar evita divergência de hidratação (SSR).
   */
  const [cart, setCart] = useState<PublicCartLine[]>([]);
  useEffect(() => {
    const lines = readPublicCart();
    setCart(lines);
    if (lines.length && !search.role) setRole("student");
  }, [search.role]);

  const cartCount = cart.reduce((s, l) => s + l.quantity, 0);
  const cartTotal = cart.reduce((s, l) => s + l.price * l.quantity, 0);

  if (role === "coach") return <CoachRegistration onBack={() => setRole(null)} />;
  if (role === "student") {
    return (
      <>
        {cartCount > 0 && (
          <div className="sticky top-0 z-40 border-b border-primary/20 bg-primary/10 px-4 py-2.5">
            <div className="mx-auto flex max-w-md items-center justify-between gap-3">
              <span className="flex items-center gap-2 text-xs font-bold text-primary">
                <ShoppingCart className="h-4 w-4" />
                Seu carrinho: {cartCount} {cartCount === 1 ? "item" : "itens"}
              </span>
              <span className="text-xs font-bold text-primary">{brl(cartTotal)}</span>
            </div>
          </div>
        )}
        <StudentRegistration onBack={() => setRole(null)} />
      </>
    );
  }
  if (role === "partner") return <PartnerRegistration onBack={() => setRole(null)} />;
  if (role === "professional") return <ProfessionalRegistration onBack={() => setRole(null)} />;




  // Role selection
  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-8 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-6">
            <Logo className="h-12 w-12 object-contain" />
            <span className="text-2xl font-bold text-foreground">FitMind Club</span>
          </Link>
          <h1 className="text-2xl font-bold text-foreground">Criar conta</h1>
          <p className="mt-1 text-sm text-muted-foreground">Escolha seu perfil para começar</p>
        </div>

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
                <h3 className="font-semibold text-card-foreground">Sou Aluno</h3>
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
                <h3 className="font-semibold text-card-foreground">Sou Coach</h3>
                <p className="text-sm text-muted-foreground">Quero vender desafios e montar minha rede</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole("partner")}
            className="group w-full rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Building2 className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-card-foreground">Sou Empresa Parceira</h3>
                <p className="text-sm text-muted-foreground">Quero oferecer benefícios e produtos aos alunos</p>
              </div>
            </div>
          </button>

          <button
            onClick={() => setRole("professional")}
            className="group w-full rounded-2xl border border-border bg-card p-6 text-left transition-all hover:border-primary/50 hover:shadow-lg hover:shadow-primary/5"
          >
            <div className="flex items-center gap-4">
              <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary group-hover:bg-primary group-hover:text-primary-foreground transition-colors">
                <Stethoscope className="h-6 w-6" />
              </div>
              <div>
                <h3 className="font-semibold text-card-foreground">Sou Profissional</h3>
                <p className="text-sm text-muted-foreground">Nutricionista, personal, médico, esteticista, advogado...</p>
              </div>
            </div>
          </button>
        </div>

        <div className="mt-6 flex items-center gap-3">
          <div className="h-px flex-1 bg-border" />
          <span className="text-xs text-muted-foreground">ou cadastre-se como aluno com</span>
          <div className="h-px flex-1 bg-border" />
        </div>

        <div className="mt-4">
          <GoogleSignInButton label="Cadastrar com Google" />
          <div className="mt-2">
            <AppleSignInButton label="Cadastrar com Apple" />
          </div>
          <p className="mt-2 text-center text-[11px] text-muted-foreground">
            Se você já tem conta com este e-mail, ela será vinculada — sem cadastro duplicado.
          </p>
        </div>

        <div className="mt-6">
          <InstallAppButton />
        </div>


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

