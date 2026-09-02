import { zipSync, strToU8 } from "fflate";
import { supabaseAdmin } from "@/integrations/supabase/client.server";

/**
 * O código dos dois programas do PC da academia mora no banco, nas mesmas
 * tabelas de onde eles se auto-atualizam (`agente_versoes` e
 * `conector_versoes`). A instalação numa academia nova lê daí.
 *
 * É o que faz a academia nova nascer na mesma versão que as antigas já rodam.
 * A cópia manual de pasta nascia velha por definição: ninguém lembra de
 * atualizar a pasta modelo depois de publicar uma correção.
 */

export type Programa = "agente" | "conector";

export type VersaoPublicada = {
  versao: string;
  arquivos: Record<string, string>;
  notas: string | null;
};

export function ehPrograma(valor: string): valor is Programa {
  return valor === "agente" || valor === "conector";
}

/**
 * Última versão publicada de um dos dois programas, com o conteúdo dos arquivos.
 *
 * As duas consultas são escritas separadas porque as tabelas não são iguais:
 * `agente_versoes` tem o interruptor `ativa` e `conector_versoes` não tem. Sem
 * respeitar o interruptor, uma versão despublicada voltaria pela instalação.
 *
 * A ordenação é textual porque as versões são zero-padded (1.02.00) — a mesma
 * comparação que a auto-atualização faz.
 */
export async function obterUltimaVersao(programa: Programa): Promise<VersaoPublicada | null> {
  const { data, error } =
    programa === "agente"
      ? await supabaseAdmin
          .from("agente_versoes")
          .select("versao, arquivos, notas")
          .eq("ativa", true)
          .order("versao", { ascending: false })
          .limit(1)
          .maybeSingle()
      : await supabaseAdmin
          .from("conector_versoes")
          .select("versao, arquivos, notas")
          .order("versao", { ascending: false })
          .limit(1)
          .maybeSingle();

  if (error) throw new Error(error.message);
  if (!data) return null;

  return {
    versao: data.versao,
    notas: data.notas,
    arquivos: data.arquivos as Record<string, string>,
  };
}

/** Onde o pacote base de cada programa mora, no bucket privado `instalacao`. */
export const caminhoDoPacoteBase = (programa: Programa) => `${programa}/base.zip`;

/**
 * O código publicado inteiro num zip só, montado na hora.
 *
 * Antes a recepção clicava um arquivo por vez — cinco cliques para o agente, e
 * errar um deixava a pasta pela metade sem avisar. São ~124 kB de texto, então
 * montar isto dentro do Worker é barato.
 */
export function montarZipDoCodigo(publicada: VersaoPublicada): Uint8Array {
  const entradas: Record<string, Uint8Array> = {};
  for (const [caminho, conteudo] of Object.entries(publicada.arquivos)) {
    entradas[caminho] = strToU8(conteudo);
  }
  return zipSync(entradas, { level: 6 });
}

/**
 * O pacote base: Node, `node_modules`, os `.exe`, os `.bat` e os ícones.
 *
 * Não dá para montar aqui, e nem deveria. São dezenas de MB de binário, o
 * Worker não tem memória para isso, e principalmente: esses arquivos ficam
 * **fora** da lista branca da auto-atualização de propósito, para que uma
 * atualização não consiga reescrever o que abre junto com o Windows do cliente.
 * Então ele é um arquivo guardado, subido de vez em quando, e servido por URL
 * assinada — o download nem passa pelo servidor da aplicação.
 *
 * Instalado o base, o programa se atualiza sozinho até a versão de hoje. É por
 * isso que um pacote base "velho" continua servindo: ele é o ponto de partida,
 * não a versão final.
 */
export async function estadoDoPacoteBase(
  programa: Programa,
): Promise<{ existe: boolean; bytes: number | null; atualizado_em: string | null }> {
  const { data } = await supabaseAdmin.storage
    .from("instalacao")
    .list(programa, { search: "base.zip", limit: 1 });

  const item = (data ?? []).find((o) => o.name === "base.zip");
  if (!item) return { existe: false, bytes: null, atualizado_em: null };

  const meta = item.metadata as { size?: number } | null;
  return {
    existe: true,
    bytes: meta?.size ?? null,
    atualizado_em: item.updated_at ?? item.created_at ?? null,
  };
}

/** URL assinada e curta do pacote base, ou null se ninguém subiu ainda. */
export async function urlDoPacoteBase(programa: Programa): Promise<string | null> {
  const { data, error } = await supabaseAdmin.storage
    .from("instalacao")
    .createSignedUrl(caminhoDoPacoteBase(programa), 300, {
      download: `fitmind-${programa}.zip`,
    });

  if (error || !data?.signedUrl) return null;
  return data.signedUrl;
}
