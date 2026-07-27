import { supabase } from "@/integrations/supabase/client";
import { bootstrapTestSignup, isTestEmailClient } from "@/lib/test-accounts.functions";
import { getAuthRedirectUrl } from "@/lib/auth-redirects";

export async function createAuthUser(email: string, password: string, name: string, role: "coach" | "student" | "partner", extraMeta: Record<string, unknown> = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  // Fluxo de conta de teste: bypass de confirmação de e-mail.
  if (isTestEmailClient(normalizedEmail)) {
    const { userId } = await bootstrapTestSignup({ data: { email: normalizedEmail, password, name } });
    // Já podemos logar diretamente porque o usuário foi criado como email_confirmed.
    const { error: signInErr } = await supabase.auth.signInWithPassword({ email: normalizedEmail, password });
    if (signInErr) throw new Error(signInErr.message);
    return { id: userId } as { id: string };
  }

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: name.trim(), role, ...extraMeta },
      emailRedirectTo: getAuthRedirectUrl("/login"),
    },
  });

  if (error) {
    if (error.message.toLowerCase().includes("already")) {
      throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
    }
    throw new Error(error.message || "Não foi possível criar a conta de acesso.");
  }

  if (!data.user) {
    throw new Error("Não foi possível criar a conta. Tente novamente em instantes.");
  }

  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
  }

  return data.user;
}
