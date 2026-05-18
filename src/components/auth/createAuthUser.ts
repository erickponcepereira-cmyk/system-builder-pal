import { supabase } from "@/integrations/supabase/client";

export async function createAuthUser(email: string, password: string, name: string, role: "coach" | "student" | "partner", extraMeta: Record<string, unknown> = {}) {
  const normalizedEmail = email.trim().toLowerCase();

  const { data, error } = await supabase.auth.signUp({
    email: normalizedEmail,
    password,
    options: {
      data: { name: name.trim(), role },
      emailRedirectTo: `${window.location.origin}/login`,
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

  // Quando o e-mail já existe e a confirmação está ativa, o Supabase devolve
  // um usuário "mascarado" (identities vazio) por segurança. Não logamos —
  // avisamos para o usuário usar a opção de login/recuperação.
  if (data.user.identities && data.user.identities.length === 0) {
    throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
  }

  return data.user;
}
