import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Flame, Eye, EyeOff, Loader2 } from "lucide-react";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — FitChain" },
      { name: "description", content: "Acesse sua conta FitChain." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        toast.error(
          error.message === "Invalid login credentials"
            ? "E-mail ou senha incorretos"
            : error.message
        );
        return;
      }

      if (data.user) {
        const { data: profile } = await supabase
          .from("profiles")
          .select("role")
          .eq("user_id", data.user.id)
          .single();

        const role = profile?.role;
        toast.success("Login realizado com sucesso!");

        if (role === "admin") {
          navigate({ to: "/admin" });
        } else if (role === "coach" || role === "manager" || role === "director") {
          navigate({ to: "/coach" });
        } else {
          navigate({ to: "/student" });
        }
      }
    } catch {
      toast.error("Erro ao fazer login. Tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - Brand */}
      <div className="hidden md:flex md:w-[40%] flex-col items-center justify-center relative" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="flex flex-col items-center gap-4">
          <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-primary">
            <Flame className="h-8 w-8 text-primary-foreground" />
          </div>
          <h1 className="text-3xl font-bold text-white">FitChain</h1>
          <p className="text-sm text-white/50 tracking-wider">Transforme. Conecte. Cresça.</p>
        </div>
        <p className="absolute bottom-6 left-6 text-xs text-white/20">v1.0.0</p>
      </div>

      {/* Right panel - Login form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12" style={{ backgroundColor: "#111111" }}>
        {/* Mobile logo */}
        <div className="w-full max-w-sm">
          <div className="md:hidden flex flex-col items-center gap-3 mb-10">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-primary">
              <Flame className="h-6 w-6 text-primary-foreground" />
            </div>
            <h1 className="text-2xl font-bold text-white">FitChain</h1>
          </div>

          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
            <h2 className="text-xl font-bold text-white mb-6">Acessar conta</h2>

            <form onSubmit={handleLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70">E-mail</Label>
                <Input
                  id="email"
                  type="email"
                  placeholder="seu@email.com"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  disabled={loading}
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="password" className="text-white/70">Senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? "text" : "password"}
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    disabled={loading}
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70"
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>

              <div className="text-right">
                <button type="button" className="text-xs text-primary hover:underline">
                  Esqueci minha senha
                </button>
              </div>

              <Button
                type="submit"
                className="w-full"
                size="lg"
                disabled={loading}
              >
                {loading ? (
                  <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                ) : (
                  "Entrar"
                )}
              </Button>
            </form>

            <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>

            <div className="space-y-3 text-center">
              <Link
                to="/register"
                search={{ role: "coach" }}
                className="block text-sm font-medium text-primary hover:underline"
              >
                Sou novo por aqui → Cadastrar como Coach
              </Link>
              <Link
                to="/register"
                search={{ role: "student" }}
                className="block text-xs text-white/40 hover:text-white/60"
              >
                Quero me inscrever em um desafio → Cadastrar como Aluno
              </Link>
            </div>
          </div>

          <p className="mt-8 text-center text-[10px] text-white/15">
            v1.0.0 — Para suporte: suporte@fitchain.com
          </p>
        </div>
      </div>
    </div>
  );
}
