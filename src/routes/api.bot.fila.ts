import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { autenticarConector } from "./api.bot.eventos";

/**
 * O conector busca aqui o que precisa ser enviado pelo WhatsApp.
 *
 * A nuvem não alcança o PC da academia, então quem puxa é ele. Devolve as
 * mensagens pendentes daquela conexão e marca como enviadas quando o conector
 * confirma (em /api/bot/confirmar).
 */

const db = supabaseAdmin as unknown as { from: (t: string) => any };

const json = (obj: unknown, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { "Content-Type": "application/json" } });

export const Route = createFileRoute("/api/bot/fila")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const conexao = await autenticarConector(request);
        if (!conexao) return json({ erro: "conexao ou segredo invalido" }, 401);

        const url = new URL(request.url);
        const limite = Math.min(Math.max(Number(url.searchParams.get("limite") || 10), 1), 50);

        // conversas desta conexão
        const { data: conversas } = await db
          .from("bot_conversas")
          .select("id, telefone")
          .eq("conexao_id", conexao.id);

        const lista = (conversas ?? []) as Array<{ id: string; telefone: string }>;
        if (!lista.length) return json({ mensagens: [] });

        const porId = new Map(lista.map((c) => [c.id, c.telefone]));

        const { data: pendentes, error } = await db
          .from("bot_mensagens")
          .select("id, conversa_id, corpo")
          .eq("direcao", "saida")
          .eq("status", "pendente")
          .in("conversa_id", lista.map((c) => c.id))
          // só o que já venceu: é assim que o disparo sai espaçado sem agendador
          .or(`agendado_para.is.null,agendado_para.lte.${new Date().toISOString()}`)
          .order("created_at", { ascending: true })
          .limit(limite);

        if (error) return json({ erro: error.message }, 500);

        const mensagens = ((pendentes ?? []) as Array<{ id: string; conversa_id: string; corpo: string | null }>)
          .map((m) => ({
            id: m.id,
            telefone: porId.get(m.conversa_id) ?? "",
            corpo: m.corpo ?? "",
          }))
          .filter((m) => m.telefone && m.corpo);

        return json({ mensagens });
      },
    },
  },
});
