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
