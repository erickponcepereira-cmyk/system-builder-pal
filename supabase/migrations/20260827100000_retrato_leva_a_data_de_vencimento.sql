-- O retrato passa a levar a data real de vencimento.
--
-- Ele já levava `ate`, que é o vencimento MAIS a carência — o dia em que a
-- catraca fecha. Serve para decidir acesso e não serve para avisar: dizer
-- "vence em 5 dias" usando essa data daria carência dias a mais, e o aluno
-- passaria a contar com um prazo que não comprou.
--
-- Com `vence` separado, a tela do leitor pode avisar quem está perto do fim
-- sem que a recepção precise falar nada.
DROP FUNCTION IF EXISTS public.academia_agente_retrato(uuid, text);

CREATE FUNCTION public.academia_agente_retrato(p_agente_id uuid, p_segredo text)
RETURNS TABLE(ref text, ate date, vence date, limite integer, usados integer, hoje boolean, dia date)
LANGUAGE plpgsql
VOLATILE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  a RECORD;
  v_carencia integer;
  v_tz text;
  v_hoje date;
  v_semana date;
BEGIN
  SELECT id, partner_id INTO a
    FROM public.academia_agentes
   WHERE id = p_agente_id
     AND ativo
     AND segredo_hash = encode(sha256(convert_to(p_segredo, 'UTF8')), 'hex');

  IF a.id IS NULL THEN
    RAISE EXCEPTION 'Agente nao autorizado.' USING ERRCODE = 'insufficient_privilege';
  END IF;

  UPDATE public.academia_agentes
     SET ultimo_contato_em = now(), ultima_sync_em = now()
   WHERE id = a.id;

  SELECT COALESCE(c.dias_carencia, 3), COALESCE(c.timezone, 'America/Sao_Paulo')
    INTO v_carencia, v_tz
    FROM public.partner_acesso_config c
   WHERE c.partner_id = a.partner_id;
  v_carencia := COALESCE(v_carencia, 3);
  v_tz := COALESCE(v_tz, 'America/Sao_Paulo');

  v_hoje := (now() AT TIME ZONE v_tz)::date;
  -- date_trunc('week') no Postgres comeca na SEGUNDA, que e a semana que a
  -- academia usa. O domingo fecha o ciclo.
  v_semana := date_trunc('week', v_hoje)::date;

  RETURN QUERY
  WITH pessoa AS (
    SELECT cr.referencia,
           cr.id AS cred_id,
           cr.student_id,
           max(m.valido_ate) AS ate,
           -- O limite da mensalidade que MANDA: a de vencimento mais longe, a
           -- mesma que define ate quando a pessoa entra.
           (array_agg(m.limite_dias_semana ORDER BY m.valido_ate DESC))[1] AS limite
      FROM public.academia_credenciais cr
      JOIN public.academia_mensalidades m
        ON m.partner_id = cr.partner_id
       AND m.status = 'ativa'
       AND (
         m.credencial_id = cr.id
         OR (m.credencial_id IS NULL AND cr.student_id IS NOT NULL AND m.student_id = cr.student_id)
       )
     WHERE cr.partner_id = a.partner_id
       AND cr.ativo
     GROUP BY cr.referencia, cr.id, cr.student_id
  )
  SELECT p.referencia,
         (p.ate + v_carencia)::date,
         p.ate,
         p.limite,
         COALESCE(u.dias, 0),
         COALESCE(u.hoje, false),
         v_hoje
    FROM pessoa p
    LEFT JOIN LATERAL (
      -- DISTINCT na DATA: entrar, sair para o carro e voltar gasta um dia, nao
      -- dois. E `hoje` existe para quem ja gastou o dia poder entrar de novo no
      -- mesmo dia sem consumir outro.
      SELECT count(DISTINCT (f.entrada_em AT TIME ZONE v_tz)::date)::integer AS dias,
             bool_or((f.entrada_em AT TIME ZONE v_tz)::date = v_hoje) AS hoje
        FROM public.academia_frequencias f
       WHERE f.partner_id = a.partner_id
         AND (f.entrada_em AT TIME ZONE v_tz)::date >= v_semana
         AND (
           f.credencial_id = p.cred_id
           OR (f.credencial_id IS NULL AND p.student_id IS NOT NULL AND f.student_id = p.student_id)
         )
    ) u ON true;
END;
$function$;
