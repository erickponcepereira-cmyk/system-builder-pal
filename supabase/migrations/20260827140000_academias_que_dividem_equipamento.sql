-- Duas academias, uma catraca, um WhatsApp — e nada misturado.
--
-- A Estação vai abrigar uma segunda operação (Jessica) no mesmo endereço: mesmo
-- leitor facial, mesma catraca, mesmo número. O que NÃO pode se misturar é o
-- resto: cliente, mensalidade, relatório, funil, campanha, frequência.
--
-- O modelo é um GRUPO. Academias no mesmo grupo dividem equipamento; tudo mais
-- continua preso ao partner_id, como sempre esteve. Quem não está em grupo
-- nenhum se comporta exatamente como antes — a função devolve ele mesmo.
--
-- A alternativa seria ligar o agente a uma lista de parceiros e a conexão a
-- outra lista. Dois cadastros para a mesma ideia, e duas chances de ficarem
-- fora de sincronia.

CREATE TABLE IF NOT EXISTS public.academia_grupos (
  id         uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  nome       text NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.academia_grupos ENABLE ROW LEVEL SECURITY;

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS grupo_id uuid REFERENCES public.academia_grupos(id);

COMMENT ON COLUMN public.partner_acesso_config.grupo_id IS
  'Academias com o mesmo grupo dividem catraca, leitor e numero de WhatsApp. Nulo = equipamento so dela.';

CREATE INDEX IF NOT EXISTS partner_acesso_config_grupo
  ON public.partner_acesso_config (grupo_id) WHERE grupo_id IS NOT NULL;

/**
 * Quem divide equipamento com esta academia — ela inclusive.
 *
 * Sem grupo, devolve só ela mesma. É isso que faz a mudança ser invisível para
 * quem opera sozinho: toda consulta que trocar `= partner_id` por `IN (esta
 * função)` continua dando exatamente o mesmo resultado.
 */
CREATE OR REPLACE FUNCTION public.academia_parceiros_do_grupo(p_partner_id uuid)
RETURNS TABLE(partner_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
  WITH meu AS (
    SELECT c.grupo_id FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id
  )
  SELECT c.partner_id
    FROM public.partner_acesso_config c
    CROSS JOIN meu
   WHERE meu.grupo_id IS NOT NULL AND c.grupo_id = meu.grupo_id
  UNION
  SELECT p_partner_id
$function$;

-- As tres funcoes que passam a olhar o grupo em vez de um partner_id sozinho
-- foram aplicadas em producao nesta mesma data. O que muda em cada uma:
--
--   academia_agente_retrato  -- monta o retrato com as pessoas de TODAS as
--                               academias do grupo. O join continua exigindo
--                               que a mensalidade seja da mesma academia da
--                               credencial, entao dinheiro de uma nunca libera
--                               aluno da outra. A frequencia e contada na
--                               academia DELE.
--
--   academia_agente_enviar   -- acha a credencial em qualquer academia do
--                               grupo e grava a passagem na academia DELA.
--                               Rosto desconhecido, que nao tem dona, fica com
--                               a academia do equipamento.
--
--   bot_escolher_conexao     -- academia sem numero proprio usa o do grupo.
--                               Cada uma monta as proprias campanhas; o chip
--                               que sai e o mesmo.
--
-- md5 em producao, conferidos:
--   academia_parceiros_do_grupo  2ce7f137c7b01e2e45ecaaaa34fe7663
--   academia_agente_retrato      c59b904630fa15d17649288a4d7d7529
--   academia_agente_enviar       9472a598476d60f14af3cb0e7adc3692
--   bot_escolher_conexao         1789a1d31ef779d0f43b9c3b91ee93bb
