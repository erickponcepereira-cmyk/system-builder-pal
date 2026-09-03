-- De onde cada cadastro veio, na propria credencial.
--
-- A tela do aluno precisa dizer "importada" ou "nativa", e esse dado nao
-- existia. `academia_credenciais.importado_em` NAO serve: ela quer dizer "ja foi
-- vista no equipamento", e credencial de academia sem catraca tem isso nulo para
-- sempre. A unica marca de origem morava em `academia_mensalidades.importado_de`,
-- que e da mensalidade e nao da pessoa -- e quem foi importado sem contrato nao
-- tem mensalidade nenhuma (29 das 113 no Reino).
--
-- Entra `importado_de` na credencial, no mesmo vocabulario da mensalidade:
-- 'nextfit', 'sistema-antigo', e NULL para cadastro feito no balcao.
--
-- O BACKFILL DA GENTE SEM MENSALIDADE E INFERENCIA, e vale saber disso antes de
-- tratar a coluna como verdade absoluta. Importacao acontece em lote, e o lote
-- aparece no `created_at` com clareza incomum: a Estacao inteira nasceu em
-- 15/08 00:35 (404 credenciais no mesmo minuto) e o Reino em tres lotes de
-- 01/09 (59 + 6 + 48 = 113). Cadastro de balcao e um por vez, em minutos
-- espalhados. Entao a regra e: credencial que nasceu num minuto com quatro ou
-- mais credenciais, e onde alguem daquele lote tem mensalidade importada,
-- herda a origem do lote.

ALTER TABLE public.academia_credenciais
  ADD COLUMN IF NOT EXISTS importado_de text;

COMMENT ON COLUMN public.academia_credenciais.importado_de IS
  'Origem do cadastro: nextfit, sistema-antigo, etc. NULL = cadastrada no balcao. Nao confundir com importado_em, que e "ja foi vista no equipamento".';

-- 1) Quem tem mensalidade importada carrega a origem dela: e evidencia direta.
UPDATE public.academia_credenciais cr
   SET importado_de = m.importado_de
  FROM (
    SELECT DISTINCT ON (credencial_id) credencial_id, importado_de
      FROM public.academia_mensalidades
     WHERE credencial_id IS NOT NULL AND importado_de IS NOT NULL
     ORDER BY credencial_id, created_at
  ) m
 WHERE m.credencial_id = cr.id
   AND cr.importado_de IS NULL;

-- 2) Quem nasceu no mesmo lote herda a origem dominante dele.
WITH lotes AS (
  SELECT cr.partner_id,
         date_trunc('minute', cr.created_at) AS lote,
         count(*) AS tamanho,
         mode() WITHIN GROUP (ORDER BY cr.importado_de) AS origem
    FROM public.academia_credenciais cr
   GROUP BY 1, 2
  HAVING count(*) >= 4
     AND count(cr.importado_de) > 0
)
UPDATE public.academia_credenciais cr
   SET importado_de = l.origem
  FROM lotes l
 WHERE cr.partner_id = l.partner_id
   AND date_trunc('minute', cr.created_at) = l.lote
   AND cr.importado_de IS NULL
   AND l.origem IS NOT NULL;
