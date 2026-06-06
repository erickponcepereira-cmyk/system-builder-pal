import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Briefcase, Dumbbell, Eye, EyeOff, Loader2, Shield, User } from "lucide-react";
import { Logo } from "@/components/Logo";
import { InstallAppButton } from "@/components/InstallAppButton";
import { useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";

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
  const [accessOptions, setAccessOptions] = useState<{ admin: boolean; coach: boolean; student: boolean; partner: boolean } | null>(null);
  const [resetMode, setResetMode] = useState(false);
  const [resetSent, setResetSent] = useState(false);
  const [resetLoading, setResetLoading] = useState(false);

  const enterArea = (area: "coach" | "student" | "admin" | "partner") => {
    if (area !== "admin" && area !== "partner") sessionStorage.setItem("fitmind_selected_area", area);
    const redirect = new URLSearchParams(window.location.search).get("redirect") || "";
    const safeRedirect = redirect.startsWith("/") && !redirect.startsWith("//") ? redirect : "";
    const areaRoot = area === "admin" ? "/admin" : area === "coach" ? "/coach" : area === "partner" ? "/partner" : "/student";
    const target = safeRedirect.startsWith(areaRoot) ? safeRedirect : areaRoot;
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

    // Status "blocked" no profile não bloqueia mais o login global —
    // bloqueio agora é escopado por papel (ex.: coaches.blocked_at bloqueia só o painel de coach).

    // Reativa automaticamente se estava inativo por falta de atividade
    if (profile.status === "inactive") {
      await supabase.rpc("touch_my_activity" as never);
    } else {
      // Registra atividade silenciosamente
      supabase.rpc("touch_my_activity" as never).then(() => {}, () => {});
    }

    const role = profile.role;

    const [
      { data: coach, error: coachError },
      { data: student, error: studentError },
      { data: partner, error: partnerError },
    ] = await Promise.all([
      supabase.from("coaches").select("id, approved_at, blocked_at").eq("profile_id", profile.id).maybeSingle(),
      supabase.from("students").select("id").eq("profile_id", profile.id).maybeSingle(),
      supabase.from("partners" as never).select("id" as never).eq("profile_id" as never, profile.id).maybeSingle(),
    ]);

    if (coachError || studentError || partnerError) {
      setLoading(false);
      const message = "Não foi possível validar seu acesso. Tente novamente.";
      setFormError(message);
      toast.error(message);
      return;
    }

    const canAdmin = role === "admin" || role === "manager" || role === "director";
    // Coach é considerado bloqueado se tiver blocked_at OU se o profile estiver explicitamente "blocked" (legado).
    const coachBlocked = !!(coach && (coach as { blocked_at?: string | null }).blocked_at) || profile.status === "blocked";
    const canCoach = canAdmin || (!!coach && !coachBlocked);
    const canStudent = role === "student" || !!student;
    const canPartner = role === "partner" || !!partner;

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

    if (role === "partner" && !partner) {
      setLoading(false);
      const m = "Cadastro de parceiro incompleto. Contate o suporte.";
      setFormError(m); toast.error(m); return;
    }

    const available = { admin: canAdmin, coach: canCoach, student: canStudent, partner: canPartner };
    const count = Number(canAdmin) + Number(canCoach) + Number(canStudent) + Number(canPartner);

    if (count === 0) {
      setLoading(false);
      const message = "Login indisponível: nenhum painel liberado para este cadastro.";
      setFormError(message);
      toast.error(message);
      return;
    }

    if (showSuccess) toast.success("Login realizado com sucesso!");

    if (count >= 2) {
      setAccessOptions(available);
      setLoading(false);
      return;
    }

    if (canAdmin) enterArea("admin");
    else if (canCoach) enterArea("coach");
    else if (canStudent) enterArea("student");
    else enterArea("partner");
  };



  // Auto-login desativado durante a fase de testes.
  // O usuário precisa preencher e-mail/senha manualmente toda vez.

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
        sessionStorage.removeItem("fitmind_selected_area");
        await routeSignedInUser(data.user.id, true);
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
    <div className="flex min-h-screen">
      {/* Left panel - Brand */}
      <div className="hidden md:flex md:w-[40%] flex-col items-center justify-center relative" style={{ backgroundColor: "#0A0A0A" }}>
        <div className="flex flex-col items-center gap-4">
          <Logo className="h-24 w-24 object-contain" />
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
            <Logo className="h-20 w-20 object-contain" />
            <h1 className="text-2xl font-bold text-white">FitMind Club</h1>
          </div>

          <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
            <h2 className="text-xl font-bold text-white mb-6">
              {accessOptions ? "Entrar como" : resetMode ? "Redefinir senha" : "Acessar conta"}
            </h2>

            {resetMode && !accessOptions && (
              <div className="mb-4">
                {resetSent ? (
                  <div className="rounded-xl border border-primary/30 bg-primary/10 px-3 py-3 text-xs text-white/80">
                    Link enviado para <span className="font-semibold text-white">{email.trim().toLowerCase()}</span>.
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
                      <Label htmlFor="reset-email" className="text-white/70">E-mail cadastrado</Label>
                      <Input
                        id="reset-email"
                        type="email"
                        placeholder="seu@email.com"
                        value={email}
                        onChange={(e) => { setEmail(e.target.value); if (formError) setFormError(null); }}
                        required
                        disabled={resetLoading}
                        className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
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
                  className="mt-4 block w-full text-center text-xs text-white/50 hover:text-white/80"
                >
                  ← Voltar para o login
                </button>
              </div>
            )}

            {!resetMode && accessOptions ? (
              <div className="space-y-3">
                {accessOptions.admin && (
                  <button
                    type="button"
                    onClick={() => enterArea("admin")}
                    className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-white transition-colors hover:bg-primary/20"
                  >
                    <Shield className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Painel de Admin</span>
                  </button>
                )}
                {accessOptions.coach && (
                  <button
                    type="button"
                    onClick={() => enterArea("coach")}
                    className="flex w-full items-center gap-3 rounded-xl border border-primary/30 bg-primary/10 px-4 py-3 text-left text-white transition-colors hover:bg-primary/20"
                  >
                    <Dumbbell className="h-5 w-5 text-primary" />
                    <span className="font-semibold">Painel de Coach</span>
                  </button>
                )}
                {accessOptions.student && (
                  <button
                    type="button"
                    onClick={() => enterArea("student")}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition-colors hover:bg-white/10"
                  >
                    <User className="h-5 w-5 text-white/70" />
                    <span className="font-semibold">Painel de Aluno</span>
                  </button>
                )}
                {accessOptions.partner && (
                  <button
                    type="button"
                    onClick={() => enterArea("partner")}
                    className="flex w-full items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-4 py-3 text-left text-white transition-colors hover:bg-white/10"
                  >
                    <Briefcase className="h-5 w-5 text-white/70" />
                    <span className="font-semibold">Painel de Parceiro</span>
                  </button>
                )}
              </div>
            ) : !resetMode ? (


            <form onSubmit={handleLogin} className="space-y-4">
              {formError && (
                <div className="rounded-xl border border-destructive/30 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {formError}
                </div>
              )}
              <div className="space-y-2">
                <Label htmlFor="email" className="text-white/70">E-mail</Label>
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
                    onChange={(e) => {
                      setPassword(e.target.value);
                      if (formError) setFormError(null);
                    }}
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
                <button
                  type="button"
                  onClick={() => { setResetMode(true); setResetSent(false); setFormError(null); }}
                  className="text-xs text-primary hover:underline"
                >
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
            ) : null}

            {!accessOptions && !resetMode && <div className="my-6 flex items-center gap-3">
              <div className="h-px flex-1 bg-white/10" />
              <span className="text-xs text-white/30">ou</span>
              <div className="h-px flex-1 bg-white/10" />
            </div>}

            {!accessOptions && !resetMode && <div className="space-y-3 text-center">
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

          <div className="mt-6">
            <InstallAppButton />
          </div>


          <p className="mt-8 text-center text-[10px] text-white/15">
            v1.0.0 — Para suporte: suporte@fitmindclub.com
          </p>
        </div>
      </div>
    </div>
  );
}
