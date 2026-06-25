import { useState } from "react";
import { Link } from "@tanstack/react-router";
import { Check, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { toast } from "sonner";

// ============================================================
// CHECK EMAIL NOTICE — exibido após cadastro, antes da confirmação
// ============================================================
export function CheckEmailNotice({ email }: { email: string }) {
  const [resending, setResending] = useState(false);
  const [cooldown, setCooldown] = useState(0);

  async function handleResend() {
    if (resending || cooldown > 0) return;
    setResending(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: `${window.location.origin}/login` },
      });
      if (error) throw error;
      toast.success("E-mail de confirmação reenviado!");
      // cooldown 60s para evitar spam
      setCooldown(60);
      const interval = setInterval(() => {
        setCooldown((c) => {
          if (c <= 1) {
            clearInterval(interval);
            return 0;
          }
          return c - 1;
        });
      }, 1000);
    } catch (err: any) {
      const msg = err?.message ?? "Não foi possível reenviar o e-mail.";
      toast.error(msg);
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12" style={{ backgroundColor: "#0A0A0A" }}>
      <div className="w-full max-w-md text-center">
        <div className="inline-flex items-center gap-2 mb-6">
          <Logo className="h-12 w-12 object-contain" />
          <span className="text-xl font-bold text-white">FitMind Club</span>
        </div>
        <div className="rounded-2xl p-8" style={{ backgroundColor: "#1A1A1A" }}>
          <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-primary/15 text-primary">
            <Check className="h-7 w-7" />
          </div>
          <h1 className="text-xl font-bold text-white">Confirme seu e-mail</h1>
          <p className="mt-3 text-sm text-white/60">
            Enviamos um link de confirmação para <span className="font-semibold text-white">{email}</span>.
            Clique no link recebido para ativar sua conta.
          </p>
          <p className="mt-3 text-xs text-white/40">
            Não encontrou o e-mail? Verifique a caixa de spam ou lixo eletrônico.
          </p>
          <div className="mt-6 space-y-3">
            <button
              type="button"
              onClick={handleResend}
              disabled={resending || cooldown > 0}
              className="flex w-full items-center justify-center gap-2 rounded-md border border-white/15 bg-white/5 px-4 py-2.5 text-sm font-semibold text-white hover:bg-white/10 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {resending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Reenviando...
                </>
              ) : cooldown > 0 ? (
                `Reenviar em ${cooldown}s`
              ) : (
                "Reenviar e-mail de confirmação"
              )}
            </button>
            <Link to="/login" className="block w-full rounded-md bg-primary px-4 py-2.5 text-sm font-semibold text-primary-foreground hover:opacity-90">
              Ir para o login
            </Link>
            <Link to="/" className="block text-xs text-white/40 hover:text-white/60">
              Voltar ao início
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
