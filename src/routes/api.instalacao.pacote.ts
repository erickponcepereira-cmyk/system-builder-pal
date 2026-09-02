import { createFileRoute } from "@tanstack/react-router";
import { supabaseAdmin } from "@/integrations/supabase/client.server";
import { perfilComAcessoAcademia } from "@/lib/academia-acesso.server";
import {
  ehPrograma,
  montarZipDoCodigo,
  obterUltimaVersao,
  urlDoPacoteBase,
} from "@/lib/instalacao.server";

/**
 * Os dois downloads da aba de instalação, num lugar só.
 *
 * `tipo=codigo` monta na hora o zip do código publicado — é o que antes saía um
 * arquivo por vez, em cinco cliques, com a pasta ficando pela metade quando
 * alguém errava um.
 *
 * `tipo=base` **não** devolve bytes: devolve uma URL assinada de cinco minutos
 * para o arquivo guardado. São dezenas de MB de binário, e passar isso pelo
 * Worker gastaria memória à toa quando o storage já sabe servir sozinho.
 *
 * A régua de acesso é a mesma da tela da academia, e o token vem no cabeçalho e
 * não na URL, para não parar em log de servidor.
 */

const texto = (msg: string, status: number) =>
  new Response(msg, { status, headers: { "Content-Type": "text/plain; charset=utf-8" } });

export const Route = createFileRoute("/api/instalacao/pacote")({
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

        if (url.searchParams.get("tipo") === "base") {
          const assinada = await urlDoPacoteBase(programa);
          if (!assinada) {
            return texto("O pacote base ainda não foi enviado para este programa.", 404);
          }
          return new Response(JSON.stringify({ url: assinada }), {
            headers: { "Content-Type": "application/json", "Cache-Control": "no-store" },
          });
        }

        const publicada = await obterUltimaVersao(programa);
        if (!publicada) return texto("Nenhuma versão publicada.", 404);

        const zip = montarZipDoCodigo(publicada);
        // O corpo tem que ser um ArrayBuffer de verdade: a view do fflate pode
        // ser uma janela sobre um buffer maior, e mandar a view inteira
        // entregaria bytes a mais no fim do arquivo.
        const corpo = zip.buffer.slice(
          zip.byteOffset,
          zip.byteOffset + zip.byteLength,
        ) as ArrayBuffer;

        return new Response(corpo, {
          headers: {
            "Content-Type": "application/zip",
            "Content-Disposition":
              `attachment; filename="fitmind-${programa}-${publicada.versao}.zip"`,
            "Cache-Control": "no-store",
          },
        });
      },
    },
  },
});
