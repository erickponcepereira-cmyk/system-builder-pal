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
      <GoogleSignInButton label="Cadastrar com Google" role={role} />
      <div className="mt-4 flex items-center gap-3">
        <div className="h-px flex-1 bg-white/10" />
        <span className="text-[11px] text-white/40">ou preencha os dados abaixo</span>
        <div className="h-px flex-1 bg-white/10" />
      </div>
    </div>
  );
}
