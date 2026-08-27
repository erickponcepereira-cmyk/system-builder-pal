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
          .select("id, telefone, jid")
          .eq("conexao_id", conexao.id);

        const lista = (conversas ?? []) as Array<{ id: string; telefone: string; jid: string | null }>;
        if (!lista.length) return json({ mensagens: [] });

        const porId = new Map(lista.map((c) => [c.id, c]));

        const agora = new Date();
        // Duas travas de tempo, com propósitos diferentes:
        //  - agendado_para: o disparo sai espaçado, sem precisar de agendador
        //  - entregue_em: a mesma mensagem não sai de novo enquanto o conector
        //    ainda está com ela na mão
        const reentrega = new Date(agora.getTime() - 2 * 60_000).toISOString();

        const { data: pendentes, error } = await db
          .from("bot_mensagens")
          .select("id, conversa_id, corpo")
          .eq("direcao", "saida")
          .eq("status", "pendente")
          .in("conversa_id", lista.map((c) => c.id))
          .or(`agendado_para.is.null,agendado_para.lte.${agora.toISOString()}`)
          .or(`entregue_em.is.null,entregue_em.lt.${reentrega}`)
          .order("created_at", { ascending: true })
          .limit(limite);

        if (error) return json({ erro: error.message }, 500);

        const mensagens = ((pendentes ?? []) as Array<{ id: string; conversa_id: string; corpo: string | null }>)
          .map((m) => {
            const c = porId.get(m.conversa_id);
            return {
              id: m.id,
              telefone: c?.telefone ?? "",
              // Quando existe, o conector responde direto para este endereço em
              // vez de remontar um a partir dos dígitos.
              jid: c?.jid ?? null,
              corpo: m.corpo ?? "",
            };
          })
          .filter((m) => (m.telefone || m.jid) && m.corpo);

        // Marca ANTES de responder. Se o conector cair no meio, a marca expira
        // em 2 minutos e a mensagem volta sozinha — melhor do que arriscar
        // entregar duas vezes por causa de uma queda.
        if (mensagens.length) {
          await db
            .from("bot_mensagens")
            .update({ entregue_em: agora.toISOString() })
            .in("id", mensagens.map((m) => m.id));
        }

        return json({ mensagens });
      },
    },
  },
});
