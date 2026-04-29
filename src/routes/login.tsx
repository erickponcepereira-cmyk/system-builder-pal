import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dumbbell, Eye, EyeOff, Loader2, User } from "lucide-react";
import fitmindLogo from "@/assets/fitmind-logo.png";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

export const Route = createFileRoute("/login")({
  head: () => ({
    meta: [
      { title: "Entrar — FitMind Club" },
      { name: "description", content: "Acesse sua conta FitMind Club." },
    ],
  }),
  component: LoginPage,
});

function LoginPage() {
  useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [accessOptions, setAccessOptions] = useState<{ coach: boolean; student: boolean } | null>(null);

  const enterArea = (area: "coach" | "student" | "admin") => {
    if (area !== "admin") sessionStorage.setItem("fitmind_selected_area", area);
    const target = area === "admin" ? "/admin" : area === "coach" ? "/coach" : "/student";
    window.location.assign(target);
  };

  const routeSignedInUser = async (userId: string, showSuccess = false) => {
    setLoading(true);
    setFormError(null);
    const { data: profile, error: profileError } = await supabase
      .from("profiles")
      .select("id, role, status")
      .eq("user_id", userId)
      .maybeSingle();

    if (profileError) {
      setLoading(false);
      const message = "Não foi possível verificar seu cadastro. Tente novamente em instantes.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (!profile) {
      setLoading(false);
      const message = "Login criado, mas o cadastro está incompleto: perfil não encontrado.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (profile.status === "blocked" || profile.status === "inactive") {
      setLoading(false);
      const message = profile.status === "blocked" ? "Login indisponível: conta bloqueada." : "Login indisponível: conta inativa.";
      setFormError(message);
      toast.error(message);
      return;
    }

    const [{ data: coach, error: coachError }, { data: student, error: studentError }] = await Promise.all([
      supabase.from("coaches").select("id").eq("profile_id", profile.id).maybeSingle(),
      supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
    ]);

    if (coachError || studentError) {
      setLoading(false);
      const message = "Não foi possível validar seu acesso. Tente novamente.";
      setFormError(message);
      toast.error(message);
      return;
    }

    const role = profile.role;
    const canCoach = role === "manager" || role === "director" || !!coach;
    const canStudent = role === "student" || !!student;

    if (role === "coach" && !coach) {
      setLoading(false);
      const message = "Cadastro de coach incompleto: registro de coach não encontrado.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (role === "student" && !student) {
      setLoading(false);
      const message = "Cadastro de aluno incompleto: registro de aluno não encontrado.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (role !== "admin" && !canCoach && !canStudent) {
      setLoading(false);
      const message = "Login indisponível: nenhum painel liberado para este cadastro.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (showSuccess) toast.success("Login realizado com sucesso!");
    if (role === "admin") enterArea("admin");
    else if (canCoach && canStudent) {
      setAccessOptions({ coach: true, student: true });
      setLoading(false);
    }
    else if (canCoach) enterArea("coach");
    else enterArea("student");
  };

  useEffect(() => {
    let active = true;
    supabase.auth.getUser().then(({ data: { user } }) => {
      if (active && user) routeSignedInUser(user.id);
    });
    return () => {
      active = false;
    };
  }, []);

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();

    if (!normalizedEmail || !password.trim()) {
      const message = "Preencha e-mail e senha para entrar.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (!normalizedEmail.includes("@")) {
      const message = "Confira o e-mail digitado. Ele precisa ter @ e domínio.";
      setFormError(message);
      toast.error(message);
      return;
    }

    setLoading(true);
    setFormError(null);

    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        const message = error.message === "Invalid login credentials"
          ? "E-mail ou senha incorretos. Confira se não há espaço, letra trocada ou senha errada."
          : error.message;
        setFormError(message);
        toast.error(message);
        return;
      }

      if (data.user) {
        sessionStorage.removeItem("fitmind_selected_area");
        await routeSignedInUser(data.user.id, true);
      } else {
        const message = "Login indisponível: a autenticação não retornou usuário.";
        setFormError(message);
        toast.error(message);
      }
    } catch {
      const message = "Erro ao fazer login. Tente novamente.";
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen">
      {/* Left panel - Brand */}
      <div className="hidden md:flex md:w-[40%] flex-col items-center justify-center relative" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="flex flex-col items-center gap-4">
          <img src={fitmindLogo} alt="Logo FitMind Club" className="h-24 w-24 object-contain" />
          <h1 className="text-3xl font-bold text-white">FitMind Club</h1>
          <p className="text-sm text-white/50 tracking-wider">Transforme. Conecte. Cresça.</p>
        </div>
        <p className="absolute bottom-6 left-6 text-xs text-white/20">v1.0.0</p>
      </div>

      {/* Right panel - Login form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12" style={{ backgroundColor: "#111111" }}>
        {/* Mobile logo */}
        <div className="w-full max-w-sm">
          <div className="md:hidden flex flex-col items-center gap-3 mb-10">
            <img src={fitmindLogo} alt="Logo FitMind Club" className="h-20 w-20 object-contain" />
            <h1 className="text-2xl font-bold text-white">FitMind Club</h1>
          </div>

          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
            <h2 className="text-xl font-bold text-white mb-6">{accessOptions ? "Entrar como" : "Acessar conta"}</h2>

            {accessOptions ? (
              <div className="space-y-3">
                <button
                  type="button"
                  onClick={() => enterArea("coach")}
                  className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-white transition-colors hover:bg-primary/20"
                >
                  <Dumbbell className="h-5 w-5 text-primary" />
                  <span className="font-semibold">Painel de Coach</span>
                </button>
                <button
                  type="button"
                  onClick={() => enterArea("student")}
                  className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition-colors hover:bg-white/10"
                >
                  <User className="h-5 w-5 text-white/70" />
                  <span className="font-semibold">Painel de Aluno</span>
                </button>
              </div>
            ) : (

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
            )}

            {!accessOptions && <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>}

            {!accessOptions && <div className="space-y-3 text-center">
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
            </div>}
          </div>

          <p className="mt-8 text-center text-[10px] text-white/15">
            v1.0.0 — Para suporte: suporte@fitmindclub.com
          </p>
        </div>
      </div>
    </div>
  );
}
