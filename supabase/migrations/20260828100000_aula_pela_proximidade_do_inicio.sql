-- A aula é escolhida pela proximidade do INÍCIO, não pela janela de duração.
--
-- Como estava: a passagem caía na turma cuja janela [início, fim) a continha.
-- Só que ninguém chega na hora exata — chega antes. Quem entrava 05:45 estava
-- indo para a aula das 06:00 e era contado na das 05:00; quem entrava 17:21
-- ficava em "Fora de aula", junto de quem passou às 10 da manhã. Onze das 26
-- passagens "fora de aula" da Estação eram gente chegando entre 17:21 e 17:27
-- para a aula das 17:30.
--
-- Como fica: a passagem vai para a aula cujo INÍCIO está mais perto, desde que
-- dentro da tolerância. Com aulas de hora em hora isso reproduz exatamente a
-- regra que o dono descreveu — 05:00–05:30 na das 5, 05:30–06:30 na das 6 — e
-- continua correta se a grade tiver intervalos irregulares, o que uma janela
-- fixa de "meia hora antes" não faria.
--
-- A diferença é circular: aula às 00:30 e entrada às 23:50 distam 40 minutos,
-- não 1400. Não acontece nesta academia, mas custa uma linha.

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS tolerancia_aula_min smallint NOT NULL DEFAULT 30;

COMMENT ON COLUMN public.partner_acesso_config.tolerancia_aula_min IS
  'Quantos minutos antes ou depois do início da aula uma passagem ainda conta como sendo dela. Deve ser no máximo metade do intervalo entre aulas.';

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
  comeca time,
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
  v_tol integer;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(c.tolerancia_aula_min, 30)
    INTO v_tz, v_tol
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz  := COALESCE(v_tz, 'America/Sao_Paulo');
  v_tol := COALESCE(v_tol, 30);
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
  classificada AS (
    SELECT p.id, p.quem,
           (SELECT t.id FROM public.academia_turmas t
             WHERE t.partner_id = p_partner_id AND t.ativo
               AND t.hora_inicio IS NOT NULL
               AND (cardinality(t.dias_semana) = 0
                 OR EXTRACT(DOW FROM p.local_ts)::smallint = ANY(t.dias_semana))
               AND LEAST(
                     abs(EXTRACT(EPOCH FROM (p.local_ts::time - t.hora_inicio)) / 60),
                     1440 - abs(EXTRACT(EPOCH FROM (p.local_ts::time - t.hora_inicio)) / 60)
                   ) <= v_tol
             -- A aula mais PERTO do horario de entrada. Empate fica com a que
             -- comeca antes, para o resultado nao depender da ordem da tabela.
             ORDER BY LEAST(
                        abs(EXTRACT(EPOCH FROM (p.local_ts::time - t.hora_inicio)) / 60),
                        1440 - abs(EXTRACT(EPOCH FROM (p.local_ts::time - t.hora_inicio)) / 60)
                      ), t.hora_inicio
             LIMIT 1) AS turma
      FROM passagem p
  )
  SELECT t.id, t.nome, t.modalidade, public.dias_semana_rotulo(t.dias_semana),
         to_char(t.hora_inicio, 'HH24:MI') || '–' || to_char(t.hora_fim, 'HH24:MI'),
         -- Sai como coluna para a tela poder ordenar a grade pelo relogio. Sem
         -- isto a lista vinha na ordem que o banco quis: 05:00, 06:00, 19:30,
         -- 17:30, 18:30, 07:00.
         t.hora_inicio,
         count(c.id)::integer, count(DISTINCT c.quem)::integer
    FROM public.academia_turmas t
    LEFT JOIN classificada c ON c.turma = t.id
   WHERE t.partner_id = p_partner_id AND t.ativo
     AND t.hora_inicio IS NOT NULL AND t.hora_fim IS NOT NULL
   GROUP BY t.id, t.nome, t.modalidade, t.dias_semana, t.hora_inicio, t.hora_fim

  UNION ALL

  -- A linha que mede a propria grade: se ela for a maior de todas, o que esta
  -- cadastrado nao descreve o que acontece na academia. `comeca` nulo joga a
  -- linha para o fim da ordenacao.
  SELECT NULL::uuid, 'Fora de aula'::text, NULL::text, NULL::text, '—'::text,
         NULL::time,
         count(*)::integer, count(DISTINCT c.quem)::integer
    FROM classificada c WHERE c.turma IS NULL
   HAVING count(*) > 0;
END;
$function$;
