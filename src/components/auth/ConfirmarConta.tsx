import { useEffect, useState } from "react";
import { Mail, MessageCircle, Loader2 } from "lucide-react";
import { Logo } from "@/components/Logo";
import { supabase } from "@/integrations/supabase/client";
import { getAuthRedirectUrl } from "@/lib/auth-redirects";
import { toast } from "sonner";
import { CheckEmailNotice } from "@/components/auth/CheckEmailNotice";
import { VerificarWhatsapp } from "@/components/auth/VerificarWhatsapp";
import { confirmarContaPorWhatsapp } from "@/lib/signup-channel.functions";
import { whatsappConfirmacaoDisponivel } from "@/lib/verificacao-whatsapp.functions";

/**
 * Depois do cadastro a pessoa escolhe por onde confirmar a conta.
 * Nada é enviado antes dessa escolha — o e-mail só sai se ela pedir.
 */
export function ConfirmarConta({ email, password }: { email: string; password?: string }) {
  const [canal, setCanal] = useState<null | "email" | "whatsapp">(null);
  const [enviando, setEnviando] = useState(false);
  const [entrando, setEntrando] = useState(false);
  const [tokenAtual, setTokenAtual] = useState<string | null>(null);
  // null = ainda perguntando ao servidor se existe número de plantão
  const [temWhatsapp, setTemWhatsapp] = useState<boolean | null>(null);

  useEffect(() => {
    let ativo = true;
    void whatsappConfirmacaoDisponivel()
      .then((r) => { if (ativo) setTemWhatsapp(r.disponivel); })
      .catch(() => { if (ativo) setTemWhatsapp(false); });
    return () => { ativo = false; };
  }, []);


  async function escolherEmail() {
    if (enviando) return;
    setEnviando(true);
    try {
      const { error } = await supabase.auth.resend({
        type: "signup",
        email,
        options: { emailRedirectTo: getAuthRedirectUrl("/login") },
      });
      if (error) throw error;
      toast.success("E-mail de confirmação enviado!");
      setCanal("email");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não foi possível enviar o e-mail.");
    } finally {
      setEnviando(false);
    }
  }

  async function aoVerificar() {
    if (!tokenAtual) return;
    setEntrando(true);
    try {
      await confirmarContaPorWhatsapp({ data: { token: tokenAtual, email } });
      if (password) {
        const { error } = await supabase.auth.signInWithPassword({ email, password });
        if (error) throw error;
        window.location.replace("/portal-selector");
        return;
      }
      toast.success("Conta confirmada! Faça login para continuar.");
      window.location.replace("/login");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Não consegui confirmar a conta.");
    } finally {
      setEntrando(false);
    }
  }

  if (canal === "email") return <CheckEmailNotice email={email} />;

  if (canal === "whatsapp") {
    return (
      <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background">
        <div className="w-full max-w-md">
          <div className="mb-6 flex items-center justify-center gap-2">
            <Logo className="h-10 w-10 object-contain" />
            <span className="text-lg font-bold text-foreground">FitMind Club</span>
          </div>
          <VerificarWhatsapp
            email={email}
            finalidade="cadastro"
            onToken={setTokenAtual}
            onVerificado={() => void aoVerificar()}
            onPreferirEmail={() => void escolherEmail()}
          />

          {entrando && (
            <p className="mt-3 flex items-center justify-center gap-2 text-xs text-muted-foreground">
              <Loader2 className="h-3.5 w-3.5 animate-spin" /> Liberando seu acesso…
            </p>
          )}
          <button
            type="button"
            onClick={() => void escolherEmail()}
            disabled={enviando}
            className="mt-4 w-full text-center text-xs text-muted-foreground hover:text-foreground disabled:opacity-50"
          >
            Prefiro confirmar por e-mail
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-12 bg-background">
      <div className="w-full max-w-md">
        <div className="mb-6 flex items-center justify-center gap-2">
          <Logo className="h-10 w-10 object-contain" />
          <span className="text-lg font-bold text-foreground">FitMind Club</span>
        </div>

        <div className="rounded-2xl border border-border bg-card p-6 sm:p-8">
          <h1 className="text-xl font-bold text-card-foreground">Como você quer confirmar sua conta?</h1>
          <p className="mt-2 text-sm text-muted-foreground">
            Sua conta foi criada para <span className="font-semibold text-card-foreground">{email}</span>.
            Falta só confirmar quem é você.
          </p>

          {temWhatsapp && (
            <button
              type="button"
              onClick={() => setCanal("whatsapp")}
              className="group mt-6 w-full rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50"
            >
              <div className="flex items-center gap-3">
                <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-[#25D366]/15 text-[#25D366]">
                  <MessageCircle className="h-5 w-5" />
                </div>
                <div>
                  <p className="font-semibold text-card-foreground">
                    Pelo WhatsApp <span className="ml-1 text-[10px] uppercase tracking-wider text-primary">recomendado</span>
                  </p>
                  <p className="text-xs text-muted-foreground">Um toque e a mensagem já vai pronta. Confirmação na hora.</p>
                </div>
              </div>
            </button>
          )}


          <button
            type="button"
            onClick={() => void escolherEmail()}
            disabled={enviando}
            className="group mt-3 w-full rounded-xl border border-border bg-background p-4 text-left transition-colors hover:border-primary/50 disabled:opacity-60"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-11 w-11 items-center justify-center rounded-xl bg-primary/10 text-primary">
                {enviando ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mail className="h-5 w-5" />}
              </div>
              <div>
                <p className="font-semibold text-card-foreground">Por e-mail</p>
                <p className="text-xs text-muted-foreground">Enviamos um link de confirmação para sua caixa de entrada.</p>
              </div>
            </div>
          </button>
        </div>
      </div>
    </div>
  );
}
