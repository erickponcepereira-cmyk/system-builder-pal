-- Uma aula que acontece de segunda a sexta é UMA aula, não cinco.
--
-- `academia_turmas.dia_semana` guarda um único dia. A grade real da Estação são
-- seis horários que se repetem de segunda a sexta — no modelo antigo isso vira
-- 30 linhas, e o relatório "Cliente por aula" fica ilegível justamente na tela
-- em que ele precisa ser lido de relance.
--
-- `dias_semana` é o conjunto. Vazio significa todo dia, que é o comportamento
-- de quem não escolheu nada.

ALTER TABLE public.academia_turmas
  ADD COLUMN IF NOT EXISTS dias_semana smallint[] NOT NULL DEFAULT '{}';

COMMENT ON COLUMN public.academia_turmas.dias_semana IS
  'Dias em que a aula acontece, padrão EXTRACT(DOW): 0=domingo … 6=sábado. Vazio = todo dia.';

-- Quem já tinha um dia único passa a ter um conjunto de um elemento.
UPDATE public.academia_turmas
   SET dias_semana = ARRAY[dia_semana]::smallint[]
 WHERE dia_semana IS NOT NULL AND cardinality(dias_semana) = 0;

COMMENT ON COLUMN public.academia_turmas.dia_semana IS
  'OBSOLETO — use dias_semana. Mantido só para não quebrar leitura antiga.';

-- "seg–sex" em vez de "1, 2, 3, 4, 5".
--
-- Sequência corrida vira intervalo; salteada fica em lista. Um rótulo que a
-- recepção lê sem traduzir é a diferença entre olhar a tabela e ignorá-la.
CREATE OR REPLACE FUNCTION public.dias_semana_rotulo(p_dias smallint[])
RETURNS text
LANGUAGE plpgsql
IMMUTABLE
AS $function$
DECLARE
  nomes text[] := ARRAY['dom','seg','ter','qua','qui','sex','sáb'];
  ord   smallint[];
  corrido boolean := true;
  i int;
BEGIN
  IF p_dias IS NULL OR cardinality(p_dias) = 0 THEN RETURN 'todo dia'; END IF;

  SELECT array_agg(DISTINCT d ORDER BY d) INTO ord FROM unnest(p_dias) d;
  IF cardinality(ord) = 7 THEN RETURN 'todo dia'; END IF;
  IF cardinality(ord) = 1 THEN RETURN nomes[ord[1] + 1]; END IF;

  FOR i IN 2 .. cardinality(ord) LOOP
    IF ord[i] <> ord[i-1] + 1 THEN corrido := false; EXIT; END IF;
  END LOOP;

  IF corrido THEN
    RETURN nomes[ord[1] + 1] || '–' || nomes[ord[cardinality(ord)] + 1];
  END IF;

  RETURN (SELECT string_agg(nomes[d + 1], ', ' ORDER BY d) FROM unnest(ord) d);
END;
$function$;

-- O relatório de aulas passa a casar pelo CONJUNTO de dias, e a devolver o
-- rótulo pronto em vez do número do dia. Quem lê a tabela quer "seg–sex", não
-- um smallint que a tela precisa traduzir.
DROP FUNCTION IF EXISTS public.academia_relatorio_turmas(uuid, date, date);

CREATE OR REPLACE FUNCTION public.academia_relatorio_turmas(
  p_partner_id uuid,
  p_de date DEFAULT NULL,
  p_ate date DEFAULT NULL
)
RETURNS TABLE(
  turma_id uuid,
  turma text,
  modalidade text,
  dias text,
  janela text,
  entradas integer,
  pessoas integer
)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_de date;
  v_ate date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo') INTO v_tz
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');
  v_hoje := (now() AT TIME ZONE v_tz)::date;
  v_de := COALESCE(p_de, date_trunc('month', v_hoje)::date);
  v_ate := COALESCE(p_ate, v_hoje);

  RETURN QUERY
  WITH passagem AS (
    SELECT f.id,
           COALESCE(f.credencial_id::text, f.student_id::text) AS quem,
           (f.entrada_em AT TIME ZONE v_tz) AS local_ts
      FROM public.academia_frequencias f
     WHERE f.partner_id = p_partner_id
       AND (f.entrada_em AT TIME ZONE v_tz)::date BETWEEN v_de AND v_ate
  ),
  -- Uma passagem pode caber em duas turmas sobrepostas. Fica com a que começa
  -- mais tarde: quem entra 06:58 numa aula de 06:00 e outra de 07:00 veio para
  -- a das 07:00.
  classificada AS (
    SELECT p.id, p.quem,
           (SELECT t.id FROM public.academia_turmas t
             WHERE t.partner_id = p_partner_id AND t.ativo
               AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
               AND (cardinality(t.dias_semana) = 0
                 OR EXTRACT(DOW FROM p.local_ts)::smallint = ANY(t.dias_semana))
               AND p.local_ts::time >= t.hora_inicio
               AND p.local_ts::time <  t.hora_fim
             ORDER BY t.hora_inicio DESC
             LIMIT 1) AS turma
      FROM passagem p
  )
  SELECT t.id, t.nome, t.modalidade, public.dias_semana_rotulo(t.dias_semana),
         to_char(t.hora_inicio, 'HH24:MI') || '–' || to_char(t.hora_fim, 'HH24:MI'),
         count(c.id)::integer, count(DISTINCT c.quem)::integer
    FROM public.academia_turmas t
    LEFT JOIN classificada c ON c.turma = t.id
   WHERE t.partner_id = p_partner_id AND t.ativo
     AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
   GROUP BY t.id, t.nome, t.modalidade, t.dias_semana, t.hora_inicio, t.hora_fim

  UNION ALL

  -- A linha que mede a propria grade: se ela for a maior de todas, o que esta
  -- cadastrado nao descreve o que acontece na academia.
  SELECT NULL::uuid, 'Fora de aula'::text, NULL::text, NULL::text, '—'::text,
         count(*)::integer, count(DISTINCT c.quem)::integer
    FROM classificada c WHERE c.turma IS NULL
   HAVING count(*) > 0;
END;
$function$;

-- A grade real da Estação Treinamento Funcional, ditada pelo dono em 27/08:
-- segunda a sexta, seis horários. Três de manhã, três à noite, com o intervalo
-- do meio do dia vazio de propósito — é assim que a academia funciona.
INSERT INTO public.academia_turmas
  (partner_id, nome, modalidade, dias_semana, hora_inicio, hora_fim, ativo)
SELECT '646c99dd-23cc-4da5-ba96-e52cfb1384b4', v.nome, 'Funcional',
       '{1,2,3,4,5}'::smallint[], v.ini::time, v.fim::time, true
  FROM (VALUES
    ('05:00', '05:00', '06:00'),
    ('06:00', '06:00', '07:00'),
    ('07:00', '07:00', '08:00'),
    ('17:30', '17:30', '18:30'),
    ('18:30', '18:30', '19:30'),
    ('19:30', '19:30', '20:30')
  ) AS v(nome, ini, fim)
 WHERE NOT EXISTS (
   SELECT 1 FROM public.academia_turmas t
    WHERE t.partner_id = '646c99dd-23cc-4da5-ba96-e52cfb1384b4'
      AND t.hora_inicio = v.ini::time AND t.hora_fim = v.fim::time
 );
