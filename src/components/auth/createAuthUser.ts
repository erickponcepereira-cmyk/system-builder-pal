import { criarContaSemEmail } from "@/lib/signup-channel.functions";

export async function createAuthUser(email: string, password: string, name: string, role: "coach" | "student" | "partner", extraMeta: Record<string, unknown> = {}) {
  const normalizedEmail = email.trim().toLowerCase();

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

