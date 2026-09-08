import { createServerFn } from "@tanstack/react-start";
import { requireSupabaseAuth } from "@/integrations/supabase/auth-middleware";

/**
 * Os pacotes base dos programas do PC da academia, que são da PLATAFORMA.
 *
 * Existe **um** pacote por programa, servindo todas as academias — não é
 * configuração de unidade. O upload morava dentro do painel de uma academia, o
 * que fazia parecer que cada uma sobe o seu; o armazenamento sempre foi
 * platform-wide (`instalacao/<programa>/base.zip`, sem partner no caminho), mas
 * a tela mentia sobre isso. Aqui em Admin → Academias o lugar bate com o dado.
 *
 * A academia continua **baixando** pelo painel dela: baixar é operação da
 * unidade, publicar é da plataforma.
 */

type Programa = "agente" | "conector";

export type EstadoBase = { existe: boolean; bytes: number | null; atualizado_em: string | null };

async function exigirSuporte(userId: string) {
  const { supabaseAdmin } = await import("@/integrations/supabase/client.server");
  const { data: perfil } = await supabaseAdmin
    .from("profiles").select("is_master_admin").eq("user_id", userId).maybeSingle();

  if (!(perfil as { is_master_admin?: boolean } | null)?.is_master_admin) {
    throw new Error("Só o suporte da FitMind publica os pacotes de instalação.");
  }
  return supabaseAdmin;
}

/** O que está publicado hoje, dos dois programas. */
export const estadoDosPacotesBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .handler(async ({ context }): Promise<Record<Programa, EstadoBase>> => {
    await exigirSuporte(context.userId);
    const { estadoDoPacoteBase } = await import("./instalacao.server");

    const [agente, conector] = await Promise.all([
      estadoDoPacoteBase("agente"),
      estadoDoPacoteBase("conector"),
    ]);
    return { agente, conector };
  });

/**
 * Prepara o envio de um pacote base.
 *
 * O arquivo sobe direto do navegador para o storage por URL assinada — tem
 * dezenas de MB e não tem por que atravessar o servidor. `upsert` ligado porque
 * publicar de novo é substituir: só existe um base por programa, e ele é o ponto
 * de partida, não uma versão histórica.
 */
export const gerarEnvioDoPacoteBase = createServerFn({ method: "POST" })
  .middleware([requireSupabaseAuth])
  .inputValidator((d: { programa: Programa }) => d)
  .handler(async ({ data, context }) => {
    const supabaseAdmin = await exigirSuporte(context.userId);
    const { caminhoDoPacoteBase } = await import("./instalacao.server");

    const caminho = caminhoDoPacoteBase(data.programa);
    const { data: envio, error } = await supabaseAdmin.storage
      .from("instalacao")
      .createSignedUploadUrl(caminho, { upsert: true });

    if (error || !envio) throw new Error(error?.message ?? "Não deu para preparar o envio.");
    // O caminho volta daqui para o navegador não ter uma segunda cópia da regra
    // de onde o pacote base mora.
    return { url: envio.signedUrl, token: envio.token, caminho };
  });
