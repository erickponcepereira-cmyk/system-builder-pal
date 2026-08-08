import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Cadastro sem disparo automático de e-mail.
 *
 * O signUp padrão manda o e-mail de confirmação na hora, antes mesmo de a
 * pessoa dizer por onde prefere confirmar. Aqui a conta nasce sem e-mail
 * enviado e sem confirmação; quem escolhe o canal é a tela seguinte.
 */
export const criarContaSemEmail = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email(),
        password: z.string().min(8),
        metadata: z.record(z.string(), z.unknown()).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const email = data.email.trim().toLowerCase();

    const { data: created, error } = await supabaseAdmin.auth.admin.createUser({
      email,
      password: data.password,
      email_confirm: false,
      user_metadata: (data.metadata ?? {}) as Record<string, unknown>,
    });

    if (error || !created?.user) {
      const msg = error?.message || "Não foi possível criar a conta.";
      if (/already|registered|exists/i.test(msg)) {
        throw new Error("Este e-mail já está cadastrado. Faça login ou use 'Esqueci minha senha'.");
      }
      throw new Error(msg);
    }

    return { userId: created.user.id };
  });

/**
 * Fecha o ciclo da confirmação por WhatsApp: se o token já foi validado pelo
 * robô, marca o e-mail como confirmado para a pessoa poder entrar.
 */
export const confirmarContaPorWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z.object({ token: z.string().min(4).max(20), email: z.string().email() }).parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as { from: (t: string) => any };
    const email = data.email.trim().toLowerCase();

    const { data: v } = await db
      .from("bot_verificacoes")
      .select("verificado_em, email")
      .eq("token", data.token.toUpperCase())
      .maybeSingle();

    const linha = v as { verificado_em: string | null; email: string | null } | null;
    if (!linha?.verificado_em) throw new Error("Ainda não recebemos sua mensagem no WhatsApp.");
    if ((linha.email || "").toLowerCase() !== email) throw new Error("Confirmação não confere com este cadastro.");

    const { data: profile } = await db
      .from("profiles")
      .select("user_id")
      .eq("email", email)
      .maybeSingle();

    const userId = (profile as { user_id: string | null } | null)?.user_id;
    if (!userId) throw new Error("Conta não encontrada para confirmar.");

    const { error } = await supabaseAdmin.auth.admin.updateUserById(userId, { email_confirm: true });
    if (error) throw new Error(error.message);

    return { ok: true as const };
  });
