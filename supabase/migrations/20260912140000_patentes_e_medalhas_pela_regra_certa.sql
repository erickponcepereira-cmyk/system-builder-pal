-- Patentes e medalhas: a regra certa, e sem depender de alguém abrir a tela.
--
-- Dois problemas separados, consertados aqui.
--
-- 1) `refresh_coach_patents` estava quebrada desde a reforma do plano de
--    carreira. Ela lia `pr.patent`, `min_direct_students`, `min_network_students`
--    e `min_monthly_revenue` — colunas que só têm valor nas 7 linhas INATIVAS de
--    `patent_rules`. Nas 21 linhas ativas `patent` é NULL, e a função não
--    filtrava `is_active`. Escrevia em `profiles.patent`, que está vazia na base
--    inteira: a função nunca produziu efeito. Ainda tinha um produto cartesiano
--    (LEFT JOIN de students com três níveis de downline) que inflava os COUNTs.
--
-- 2) As conquistas só eram gravadas quando o coach ABRIA a tela de carreira —
--    `getIndividualCareer` e `getCareerProgress` inserem ao serem chamadas. Daí
--    91 coaches em `coach_patent_achievements` contra 7 em
--    `coach_medals_individual`: medalha de quem nunca visitou a aba não existia.
--
-- A REGRA, como está escrita nas próprias colunas e descrições:
-- `required_revenue` é a produção total da janela ("R$ 20.000 em 6 meses"), e
-- `max_team_sales_pct` é o TETO da parte que pode vir da equipe — não um piso.
-- O código antigo exigia `ve >= required * ve_max_pct`, tratando o teto como
-- mínimo: um coach que vendia tudo sozinho não subia, o oposto do que a regra
-- existe para proteger. Aqui a equipe contribui até o teto e vender mais por
-- conta própria nunca prejudica.
CREATE OR REPLACE FUNCTION public.refresh_coach_patents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inseridas integer := 0;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  WITH janelas AS (
    SELECT DISTINCT time_window_months AS meses
      FROM public.patent_rules
     WHERE is_active AND key IS NOT NULL AND time_window_months > 0
  ),
  producao AS (
    SELECT j.meses, v.coach_id, v.vp, COALESCE(e.ve, 0) AS ve
      FROM janelas j
      CROSS JOIN LATERAL public.coach_vp_no_periodo(now() - make_interval(months => j.meses), now()) v
      LEFT JOIN LATERAL public.coach_ve_no_periodo(now() - make_interval(months => j.meses), now()) e
             ON e.coach_id = v.coach_id
  ),
  qualificados AS (
    SELECT p.coach_id, r.key, r.level,
           -- Produção que conta: a própria inteira, mais a da equipe até o teto.
           p.vp + LEAST(p.ve, r.required_revenue * r.max_team_sales_pct / 100.0) AS qualificante,
           r.required_revenue
      FROM producao p
      JOIN public.patent_rules r
        ON r.is_active AND r.key IS NOT NULL AND r.time_window_months = p.meses
     WHERE r.required_revenue = 0
        OR p.vp + LEAST(p.ve, r.required_revenue * r.max_team_sales_pct / 100.0) >= r.required_revenue
  ),
  nivel_maximo AS (
    SELECT coach_id, MAX(level) AS level FROM qualificados GROUP BY 1
  ),
  -- "Uma vez nessa patente, para sempre": alcançar um nível conquista todos os
  -- anteriores, e nada é removido depois.
  a_conceder AS (
    SELECT n.coach_id, r.key, r.level,
           COALESCE(q.qualificante, r.required_revenue) AS qualifying
      FROM nivel_maximo n
      JOIN public.patent_rules r
        ON r.is_active AND r.key IS NOT NULL AND r.level <= n.level
      LEFT JOIN qualificados q ON q.coach_id = n.coach_id AND q.key = r.key
  ),
  inseridas AS (
    INSERT INTO public.coach_patent_achievements
           (coach_id, patent_key, patent_level, qualifying_revenue)
    SELECT coach_id, key, level, ROUND(qualifying, 2) FROM a_conceder
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridas FROM inseridas;

  RETURN v_inseridas;
END;
$fn$;

-- Medalhas: mensal pela produção própria do mês corrente, acumulada pela de
-- toda a vida. Aqui é só venda própria — sem equipe, sem produto criado, sem
-- master coach — que é a regra do painel individual.
--
-- O mês começa às 04:00 UTC porque o app opera em UTC-4: sem isso o dia 1 vira
-- no fim da tarde do dia anterior e a medalha do mês novo abre cedo.
CREATE OR REPLACE FUNCTION public.refresh_coach_medals()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_inseridas integer := 0;
  v_inicio_mes timestamptz;
  v_ano int;
  v_mes int;
BEGIN
  IF auth.uid() IS NOT NULL AND NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  v_inicio_mes := date_trunc('month', (now() - interval '4 hours')) + interval '4 hours';
  v_ano := EXTRACT(YEAR  FROM (now() - interval '4 hours'))::int;
  v_mes := EXTRACT(MONTH FROM (now() - interval '4 hours'))::int;

  WITH mensal AS (
    SELECT v.coach_id, v.vp FROM public.coach_vp_no_periodo(v_inicio_mes, now()) v
  ),
  vida AS (
    SELECT v.coach_id, v.vp FROM public.coach_vp_no_periodo() v
  ),
  a_conceder AS (
    SELECT m.coach_id, 'monthly'::text AS kind, r.key, v_ano AS ano, v_mes AS mes, m.vp
      FROM mensal m
      JOIN public.career_medal_rules r ON r.is_active AND r.kind = 'monthly'
     WHERE m.vp >= r.threshold
    UNION ALL
    SELECT l.coach_id, 'cumulative', r.key, NULL::int, NULL::int, l.vp
      FROM vida l
      JOIN public.career_medal_rules r ON r.is_active AND r.kind = 'cumulative'
     WHERE l.vp >= r.threshold
  ),
  inseridas AS (
    INSERT INTO public.coach_medals_individual
           (coach_id, medal_kind, medal_key, period_year, period_month, vp_amount)
    SELECT coach_id, kind, key, ano, mes, ROUND(vp, 2) FROM a_conceder
    ON CONFLICT DO NOTHING
    RETURNING 1
  )
  SELECT count(*) INTO v_inseridas FROM inseridas;

  RETURN v_inseridas;
END;
$fn$;

REVOKE ALL ON FUNCTION public.refresh_coach_patents() FROM PUBLIC;
REVOKE ALL ON FUNCTION public.refresh_coach_medals()  FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.refresh_coach_patents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.refresh_coach_medals()  TO authenticated;
