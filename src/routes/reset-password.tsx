import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Eye, EyeOff, Loader2, KeyRound } from "lucide-react";
import { Logo } from "@/components/Logo";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";
import { translateAuthError } from "@/lib/auth-errors";

export const Route = createFileRoute("/reset-password")({
  head: () => ({
    meta: [
      { title: "Redefinir senha — FitMind Club" },
      { name: "description", content: "Defina uma nova senha de acesso." },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [loading, setLoading] = useState(false);
  const [ready, setReady] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);

  useEffect(() => {
    // O Supabase processa o link de recovery automaticamente e cria uma sessão temporária.
    // Aguardamos um onAuthStateChange "PASSWORD_RECOVERY" ou verificamos a sessão.
    const { data: { subscription } } = supabase.auth.onAuthStateChange((event) => {
      if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
        setReady(true);
      }
    });

    supabase.auth.getSession().then(({ data }) => {
      if (data.session) setReady(true);
    });

    return () => subscription.unsubscribe();
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError(null);

    if (password.length < 8) {
      const m = "A senha deve ter no mínimo 8 caracteres.";
      setFormError(m); toast.error(m); return;
    }
    if (!/[A-Z]/.test(password)) {
      const m = "A senha deve ter pelo menos 1 letra maiúscula.";
      setFormError(m); toast.error(m); return;
    }
    if (!/[0-9]/.test(password)) {
      const m = "A senha deve ter pelo menos 1 número.";
      setFormError(m); toast.error(m); return;
    }
    if (password !== confirmPassword) {
      const m = "As senhas não coincidem.";
      setFormError(m); toast.error(m); return;
    }

    setLoading(true);
    try {
      const { error } = await supabase.auth.updateUser({ password });
      if (error) throw error;
      toast.success("Senha redefinida com sucesso! Faça login com sua nova senha.");
      await supabase.auth.signOut().catch(() => {});
      navigate({ to: "/login" });
    } catch (err) {
      const friendly = translateAuthError(err);
      setFormError(friendly);
      toast.error(friendly);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md">
        <div className="mb-6 text-center">
          <Link to="/" className="inline-flex items-center gap-2 mb-4">
            <img src={fitmindLogo} alt="Logo FitMind Club" className="h-12 w-12 object-contain" />
            <span className="text-xl font-bold text-white">FitMind Club</span>
          </Link>
        </div>

        <div className="rounded-2xl p-6 sm:p-8" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mb-5 flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-primary/15 text-primary">
              <KeyRound className="h-5 w-5" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white">Definir nova senha</h1>
              <p className="text-xs text-white/50">Escolha uma senha forte para sua conta.</p>
            </div>
          </div>

          {!ready ? (
            <div className="rounded-xl border border-white/10 bg-white/5 px-3 py-3 text-xs text-white/60">
              Validando o link de redefinição. Se nada acontecer em alguns segundos,
              o link pode ter expirado — solicite um novo na tela de login.
            </div>
          ) : (
            <form onSubmit={handleSubmit} className="space-y-4">
              {formError && (
                <div className="rounded-xl border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs font-medium text-destructive">
                  {formError}
                </div>
              )}
              <div className="space-y-2">
                <Label className="text-white/70">Nova senha</Label>
                <div className="relative">
                  <Input
                    type={showPassword ? "text" : "password"}
                    value={password}
                    onChange={(e) => { setPassword(e.target.value); if (formError) setFormError(null); }}
                    placeholder="Mín. 8 chars, 1 maiúscula, 1 número"
                    className="bg-white/5 border-white/10 text-white placeholder:text-white/30 pr-10"
                    required
                  />
                  <button type="button" onClick={() => setShowPassword(!showPassword)} className="absolute right-3 top-1/2 -translate-y-1/2 text-white/40 hover:text-white/70">
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label className="text-white/70">Confirmar nova senha</Label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => { setConfirmPassword(e.target.value); if (formError) setFormError(null); }}
                  placeholder="Repita a senha"
                  className="bg-white/5 border-white/10 text-white placeholder:text-white/30"
                  required
                />
              </div>
              <Button type="submit" className="w-full" size="lg" disabled={loading}>
                {loading ? <Loader2 className="h-5 w-5 animate-spin" /> : "Salvar nova senha"}
              </Button>
            </form>
          )}

          <div className="mt-5 text-center">
            <Link to="/login" className="text-xs text-white/40 hover:text-white/60">
              Voltar ao login
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
