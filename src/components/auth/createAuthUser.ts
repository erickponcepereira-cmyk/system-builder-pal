import { supabase } from "@/integrations/supabase/client";
import { bootstrapTestSignup, isTestEmailClient } from "@/lib/test-accounts.functions";
import { criarContaSemEmail } from "@/lib/signup-channel.functions";

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

  // A conta nasce sem confirmação e sem e-mail disparado: quem escolhe o canal
  // (WhatsApp ou e-mail) é a tela logo após o cadastro.
  const { userId } = await criarContaSemEmail({
    data: {
      email: normalizedEmail,
      password,
      metadata: { name: name.trim(), role, ...extraMeta },
    },
  });

  return { id: userId } as { id: string };
}

