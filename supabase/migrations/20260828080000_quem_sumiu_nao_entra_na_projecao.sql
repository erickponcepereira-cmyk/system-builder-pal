-- Quem sumiu há muito tempo para de contar como receita futura.
--
-- A projeção somava R$ 17.920,00 supondo que as 130 pessoas com vencimento na
-- janela vão renovar. Quem não aparece na academia há dois meses não vai — e
-- contá-la não é otimismo, é previsão errada, do tipo que faz a academia
-- planejar em cima de dinheiro que não vem.
--
-- O PRAZO É DA ACADEMIA (`dias_sumido`, padrão 60). Sessenta dias é o corte que
-- o dono escolheu: quem passa disso raramente volta por aviso de vencimento — o
-- caminho ali é campanha de retorno, que já existe como marco próprio.
--
-- A ARMADILHA, e por isso a função é mais cuidadosa do que parece: a catraca da
-- Estação só registra desde 19/08. São NOVE dias de histórico. Perguntar "quem
-- não vem há 60 dias?" hoje responderia "294 pessoas" — inclusive quem treinou
-- ontem e quem treina três vezes por semana. Ausência só pode ser afirmada
-- quando existe histórico suficiente para afirmá-la; antes disso a função
-- devolve vazio e não exclui ninguém. Começa a valer sozinha por volta de
-- 18/10, quando o registro completar 60 dias.

ALTER TABLE public.partner_acesso_config
  ADD COLUMN IF NOT EXISTS dias_sumido smallint NOT NULL DEFAULT 60;

COMMENT ON COLUMN public.partner_acesso_config.dias_sumido IS
  'Dias sem passar na catraca a partir dos quais a pessoa deixa de contar como receita futura. Só vale quando há esse tanto de histórico.';

/*
 * Quem está sumido há tempo demais para ser contado como receita.
 *
 * Devolve VAZIO enquanto a academia não tiver `p_dias` de histórico de catraca.
 * É a diferença entre "não veio" e "não sabemos se veio" — e tratar as duas
 * como a mesma coisa transformaria a estreia do sistema numa lista de 294
 * clientes falsamente perdidos.
 */
CREATE OR REPLACE FUNCTION public.academia_sumidos(p_partner_id uuid, p_dias integer DEFAULT NULL)
RETURNS TABLE(credencial_id uuid, student_id uuid, visto_em date)
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_tz text;
  v_hoje date;
  v_dias integer;
  v_desde date;
BEGIN
  SELECT COALESCE(c.timezone, 'America/Sao_Paulo'), COALESCE(p_dias, c.dias_sumido, 60)
    INTO v_tz, v_dias
    FROM public.partner_acesso_config c WHERE c.partner_id = p_partner_id;
  v_tz   := COALESCE(v_tz, 'America/Sao_Paulo');
  v_dias := COALESCE(v_dias, p_dias, 60);
  v_hoje := (now() AT TIME ZONE v_tz)::date;

  SELECT min(f.entrada_em AT TIME ZONE v_tz)::date INTO v_desde
    FROM public.academia_frequencias f WHERE f.partner_id = p_partner_id;

  -- Sem histórico suficiente, ninguém está provadamente sumido.
  IF v_desde IS NULL OR (v_hoje - v_desde) < v_dias THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH gente AS (
    SELECT DISTINCT ON (COALESCE(m.credencial_id::text, m.student_id::text))
           m.credencial_id AS cred, m.student_id AS stu
      FROM public.academia_mensalidades m
     WHERE m.partner_id = p_partner_id AND m.status = 'ativa'
     ORDER BY COALESCE(m.credencial_id::text, m.student_id::text)
  )
  SELECT g.cred, g.stu, u.ultima
    FROM gente g
    LEFT JOIN LATERAL (
      SELECT max(f.entrada_em AT TIME ZONE v_tz)::date AS ultima
        FROM public.academia_frequencias f
       WHERE f.partner_id = p_partner_id
         AND (f.credencial_id = g.cred
           OR (g.cred IS NULL AND g.stu IS NOT NULL AND f.student_id = g.stu))
    ) u ON true
   WHERE u.ultima IS NULL OR u.ultima < v_hoje - v_dias;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.academia_sumidos(uuid, integer) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.academia_sumidos(uuid, integer) TO authenticated, service_role;
