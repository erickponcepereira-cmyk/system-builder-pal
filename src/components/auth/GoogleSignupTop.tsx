import { GoogleSignInButton } from "@/components/auth/GoogleSignInButton";

/**
 * Bloco de cadastro rápido com Google, no topo de cada formulário.
 * Mantém o coach indicador (a indicação é persistida antes do redirect) e
 * depois só pede o que o Google não fornece.
 */
export function GoogleSignupTop({
  role,
}: {
  role: "student" | "coach" | "partner" | "professional";
}) {
  return (
    <div className="mb-5">
      <div className="rounded-2xl border border-primary/30 bg-primary/10 p-3">
        <p className="mb-2 text-center text-[11px] font-bold uppercase tracking-wider text-primary">
          Mais rápido — 1 toque
        </p>
        <GoogleSignInButton label="Cadastrar com Google" role={role} />
        <div className="mt-2">
          <AppleSignInButton label="Cadastrar com Apple" role={role} />
        </div>
        <p className="mt-2 text-center text-[10px] text-white/50">
          Sem criar senha. Se você já tem conta com este e-mail, ela é vinculada.
        </p>
      </div>
      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] text-white/40">ou preencha os dados abaixo</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    </div>

  );
}
