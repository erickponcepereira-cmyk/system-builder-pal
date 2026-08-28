import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { perfilComAcessoAcademia } from "@/lib/academia-acesso.server";
import { ehPrograma, obterUltimaVersao } from "@/lib/instalacao.server";

/**
 * Entrega UM arquivo do código publicado, para quem está instalando os
 * programas numa academia nova.
 *
 * Um arquivo por chamada e texto puro: quem baixa é a recepção, com o
 * navegador, e nada aqui precisa de zip nem de instalador.
 *
 * Não é público — o conteúdo é o código que roda no PC do cliente. A régua de
 * acesso é a mesma da tela da academia; o token vem no cabeçalho, e não na
 * URL, para não parar em log de servidor.
 */

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const Route = createFileRoute("/api/instalacao/arquivo")({
  server: {
    handlers: {
      GET: async ({ request }) => {
        const token = request.headers.get("authorization")?.replace("Bearer ", "");
        if (!token) return texto("Não autenticado.", 401);

        const { data: auth } = await supabaseAdmin.auth.getUser(token);
        const userId = auth.user?.id;
        if (!userId) return texto("Não autenticado.", 401);

        const url = new URL(request.url);
        const partnerId = url.searchParams.get("partnerId") ?? "";
        if (!partnerId) return texto("Informe a academia.", 400);
        if (!(await perfilComAcessoAcademia(userId, partnerId))) {
          return texto("Sem acesso a esta academia.", 403);
        }

        const programa = url.searchParams.get("programa") ?? "";
        if (!ehPrograma(programa)) return texto("Programa desconhecido.", 400);

        const publicada = await obterUltimaVersao(programa);
        if (!publicada) return texto("Nenhuma versão publicada.", 404);

        // O nome pedido tem que ser uma chave do jsonb publicado. É o que
        // impede a URL de virar um leitor de arquivo qualquer — e o que deixa
        // o Content-Disposition seguro, já que o nome sai da nossa publicação.
        const nome = url.searchParams.get("nome") ?? "";
        const conteudo = publicada.arquivos[nome];
        if (typeof conteudo !== "string") return texto("Arquivo não publicado.", 404);

        return new Response(conteudo, {
          headers: {
            "Content-Type": "text/plain; charset=utf-8",
            "Content-Disposition": `attachment; filename="${nome.split("/").pop()}"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
