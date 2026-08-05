import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Verificação de conta por WhatsApp — mecanismo invertido.
 *
 * Em vez de mandarmos um código para a pessoa (mensagem fria, que é o que faz o
 * WhatsApp bloquear chip), ela é quem manda. O app gera um token curto e monta
 * um link wa.me com a mensagem pronta; a pessoa só aperta enviar. O robô recebe,
 * confere o token e confirma.
 *
 * Três ganhos de uma vez: não queima chip, aquece o número com conversa de
 * verdade, e já entrega o telefone verificado junto do cadastro.
 */

// sem I, O, 0 e 1 — some a confusão de quem lê na tela e digita
const ALFABETO = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";

function gerarToken() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  const parte = Array.from(bytes, (b) => ALFABETO[b % ALFABETO.length]).join("");
  return `FIT-${parte}`;
}

export type VerificacaoIniciada = {
  token: string;
  numero: string;
  link: string;
  mensagem: string;
  expiraEm: string;
};

/**
 * Cria o token e devolve o link pronto. Se não houver número de plantão
 * conectado, avisa — melhor falhar claro do que mostrar um link que não
 * responde.
 */
export const iniciarVerificacaoWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) =>
    z
      .object({
        email: z.string().email().optional(),
        profileId: z.string().uuid().optional(),
        finalidade: z.enum(["cadastro", "login", "trocar_telefone", "lead"]).default("cadastro"),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const db = supabaseAdmin as unknown as {
      from: (t: string) => any;
      rpc: (fn: string, args?: Record<string, unknown>) => any;
    };

    // qual número da plataforma está de plantão agora
    const { data: conexaoId } = await db.rpc("bot_escolher_conexao", {
      _escopo: "admin",
      _owner_id: null,
      _uso: "plataforma",
    });

    if (!conexaoId) {
      throw new Error(
        "Nenhum número de WhatsApp disponível no momento. Tente por e-mail ou fale com o suporte.",
      );
    }

    const { data: conexao } = await db
      .from("bot_conexoes")
      .select("numero")
      .eq("id", conexaoId)
      .maybeSingle();
    const numero = (conexao as { numero: string | null } | null)?.numero;
    if (!numero) throw new Error("O número de plantão ainda não terminou de conectar.");

    // tenta algumas vezes: o token é curto, então colisão é possível
    let token = "";
    for (let i = 0; i < 5; i++) {
      const tentativa = gerarToken();
      const { error } = await db.from("bot_verificacoes").insert({
        token: tentativa,
        finalidade: data.finalidade,
        email: data.email ?? null,
        profile_id: data.profileId ?? null,
      });
      if (!error) {
        token = tentativa;
        break;
      }
      if (error.code !== "23505") throw new Error(error.message);
    }
    if (!token) throw new Error("Não consegui gerar o código. Tente de novo.");

    const mensagem = `Confirmar meu cadastro na FitMind: ${token}`;
    return {
      token,
      numero,
      mensagem,
      link: `https://wa.me/${numero}?text=${encodeURIComponent(mensagem)}`,
      expiraEm: new Date(Date.now() + 30 * 60 * 1000).toISOString(),
    } satisfies VerificacaoIniciada;
  });

/**
 * A tela chama isto de tempos em tempos enquanto espera. Assim que a pessoa
 * manda a mensagem, o robô marca como verificado e aqui vira `true`.
 */
export const conferirVerificacaoWhatsapp = createServerFn({ method: "POST" })
  .inputValidator((d: unknown) => z.object({ token: z.string().min(4).max(20) }).parse(d))
  .handler(async ({ data }) => {
    const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
    const { data: v } = await (supabaseAdmin as unknown as { from: (t: string) => any })
      .from("bot_verificacoes")
      .select("verificado_em, telefone, expira_em, finalidade, profile_id")
      .eq("token", data.token.toUpperCase())
      .maybeSingle();

    const linha = v as {
      verificado_em: string | null;
      telefone: string | null;
      expira_em: string;
      finalidade: string;
      profile_id: string | null;
    } | null;
    if (!linha) return { verificado: false, expirado: false, telefone: null };

    return {
      verificado: !!linha.verificado_em,
      expirado: !linha.verificado_em && new Date(linha.expira_em) < new Date(),
      telefone: linha.telefone,
      finalidade: linha.finalidade,
      profileId: linha.profile_id,
    };
  });
