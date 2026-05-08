import { Link } from "@tanstack/react-router";
import { Check } from "lucide-react";
import { Logo } from "@/components/Logo";

// ============================================================
// CHECK EMAIL NOTICE — exibido após cadastro, antes da confirmação
// ============================================================
export function CheckEmailNotice({ email }: { email: string }) {
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
