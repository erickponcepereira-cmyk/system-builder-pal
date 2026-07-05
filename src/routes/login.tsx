import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { InstallAppButton } from "@/components/InstallAppButton";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";
import { useBranding } from "@/components/theme-provider";

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
  const navigate = useNavigate();
  const { theme } = useBranding();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  useEffect(() => {
    let active = true;
    (async () => {
      const { data: { session } } = await supabase.auth.getSession();
      if (active && session?.user) {
        navigate({ to: "/portal-selector", replace: true });
      }
    })();
    return () => { active = false; };
  }, [navigate]);


  const goToPortalSelector = () => {
    sessionStorage.removeItem("fitmind_selected_area");
    navigate({ to: "/portal-selector", replace: true });
  };

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
        const message = translateAuthError(error);
        setFormError(message);
        toast.error(message);
        return;
      }

      if (data.user) {
        toast.success("Login realizado com sucesso!");
        goToPortalSelector();
      } else {
        const message = "Login indisponível: a autenticação não retornou usuário.";
        setFormError(message);
        toast.error(message);
      }
    } catch (err) {
      const message = translateAuthError(err);
      setFormError(message);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  };

  const handleResetPassword = async (e: React.FormEvent) => {
    e.preventDefault();
    const normalizedEmail = email.trim().toLowerCase();
    setFormError(null);

    if (!normalizedEmail.includes("@") || !normalizedEmail.includes(".")) {
      const m = "Informe um e-mail válido para receber o link.";
      setFormError(m); toast.error(m); return;
    }

    setResetLoading(true);
    try {
      const { error } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
        redirectTo: `${window.location.origin}/reset-password`,
      });
      if (error) throw error;
      setResetSent(true);
      toast.success("Enviamos um link de redefinição para seu e-mail.");
    } catch (err) {
      const friendly = translateAuthError(err);
      setFormError(friendly);
      toast.error(friendly);
    } finally {
      setResetLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen bg-background">
      {/* Left panel - Brand */}
      <div className="hidden md:flex md:w-[40%] flex-col items-center justify-center relative bg-sidebar text-sidebar-foreground">
        <div className="flex flex-col items-center gap-4">
          <Logo className="h-24 w-24 object-contain" />
          <h1 className="text-3xl font-bold">{theme.name}</h1>
          <p className="text-sm text-muted-foreground tracking-wider">Transforme. Conecte. Cresça.</p>
        </div>
        <p className="absolute bottom-6 left-6 text-xs text-muted-foreground/60">v1.0.0</p>
      </div>

      {/* Right panel - Login form */}
      <div className="flex flex-1 items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-sm">
          <div className="md:hidden flex flex-col items-center gap-3 mb-10">
            <Logo className="h-20 w-20 object-contain" />
            <h1 className="text-2xl font-bold text-foreground">{theme.name}</h1>
          </div>

          <div className="rounded-2xl p-6 sm:p-8 bg-card border border-border">
            <h2 className="text-xl font-bold text-card-foreground mb-6">
              {resetMode ? "Redefinir senha" : "Acessar conta"}
            </h2>

            {resetMode ? (
              <div className="mb-4">
                {resetSent ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-xs text-foreground">
                    Link enviado para <span className="font-semibold">{email.trim().toLowerCase()}</span>.
                    Confira sua caixa de entrada (e o spam) e clique no link para definir uma nova senha.
                  </div>
                ) : (
                  <form onSubmit={handleResetPassword} className="space-y-4">
                    {formError && (
                      <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                        {formError}
                      </div>
                    )}
                    <div className="space-y-2">
                      <Label htmlFor="reset-email" className="text-muted-foreground">E-mail cadastrado</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (formError) setFormError(null); }}
                        required
                        disabled={resetLoading}
                        className="bg-input border-border text-foreground placeholder:text-muted-foreground/60"
                      />
                    </div>
                    <Button type="submit" className="w-full" size="lg" disabled={resetLoading}>
                      {resetLoading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Enviar link de redefinição"}
                    </Button>
                  </form>
                )}
                <button
                  type="button"
                  onClick={() => { setResetMode(false); setResetSent(false); setFormError(null); }}
                  className="mt-4 block w-full text-center text-xs text-muted-foreground hover:text-foreground"
                >
                  ← Voltar para o login
                </button>
              </div>
            ) : (
              <form onSubmit={handleLogin} className="space-y-4">
                {formError && (
                  <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                    {formError}
                  </div>
                )}
                <div className="space-y-2">
                  <Label htmlFor="email" className="text-muted-foreground">E-mail</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="seu@email.com"
                    value={email}
                    onChange={(e) => {
                      setEmail(e.target.value);
                      if (formError) setFormError(null);
                    }}
                    required
                    disabled={loading}
                    className="bg-input border-border text-foreground placeholder:text-muted-foreground/60"
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="password" className="text-muted-foreground">Senha</Label>
                  <div className="relative">
                    <Input
                      id="password"
                      type={showPassword ? "text" : "password"}
                      placeholder="••••••••"
                      value={password}
                      onChange={(e) => {
                        setPassword(e.target.value);
                        if (formError) setFormError(null);
                      }}
                      required
                      disabled={loading}
                      className="bg-input border-border text-foreground placeholder:text-muted-foreground/60 pr-10"
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword(!showPassword)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                    </button>
                  </div>
                </div>

                <div className="text-right">
                  <button
                    type="button"
                    onClick={() => { setResetMode(true); setResetSent(false); setFormError(null); }}
                    className="text-xs text-primary hover:underline"
                  >
                    Esqueci minha senha
                  </button>
                </div>

                <Button type="submit" className="w-full" size="lg" disabled={loading}>
                  {loading ? (
                    <Loader2 className="h-5 w-5 animate-spin text-primary-foreground" />
                  ) : (
                    "Entrar"
                  )}
                </Button>
              </form>
            )}

            {!resetMode && (
              <>
                <div className="my-6 flex items-center gap-3">
                  <div className="h-px flex-1 bg-border" />
                  <span className="text-xs text-muted-foreground">ou</span>
                  <div className="h-px flex-1 bg-border" />
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
                    className="block text-xs text-muted-foreground hover:text-foreground"
                  >
                    Quero me inscrever em um desafio → Cadastrar como Aluno
                  </Link>
                </div>
              </>
            )}
          </div>

          <div className="mt-6">
            <InstallAppButton />
          </div>

          <p className="mt-8 text-center text-[10px] text-muted-foreground/60">
            v1.0.0 — Para suporte: suporte@fitmindclub.com
          </p>
        </div>
      </div>
    </div>
  );
}
