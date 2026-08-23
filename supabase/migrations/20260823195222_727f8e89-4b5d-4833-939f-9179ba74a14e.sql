CREATE OR REPLACE FUNCTION public.fechar_rede_do_mes(_ano integer, _mes integer, _admin_user_id uuid, _simular boolean DEFAULT true)
 RETURNS TABLE(acao text, de text, para text, comissoes bigint, valor numeric)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_sem_snapshot int;
  v_admin_profile uuid;
  v_ref date := make_date(_ano, _mes, 1);
  v_ao_sistema numeric := 0;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  IF v_ref >= date_trunc('month', now())::date THEN
    RAISE EXCEPTION 'O mes %/% ainda nao encerrou. So e possivel fechar mes ja terminado.', _mes, _ano;
  END IF;

  SELECT count(DISTINCT c.beneficiary_profile_id) INTO v_sem_snapshot
    FROM public.commissions c
   WHERE COALESCE(c.is_network,false)
     AND EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int = _ano
     AND EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int = _mes
     AND NOT EXISTS (SELECT 1 FROM public.network_unlock_history n
                      WHERE n.profile_id = c.beneficiary_profile_id
                        AND n.period_year = _ano AND n.period_month = _mes);
  IF COALESCE(v_sem_snapshot,0) > 0 THEN
    RAISE EXCEPTION 'Existem % pessoa(s) com comissao de rede em %/% e sem snapshot de meta. Rode o snapshot do mes antes de fechar.', v_sem_snapshot, _mes, _ano;
  END IF;

  SELECT pr0.id INTO v_admin_profile FROM public.profiles pr0 WHERE pr0.user_id = _admin_user_id;

  CREATE TEMP TABLE _plano ON COMMIT DROP AS
  WITH RECURSIVE presas AS (
    SELECT c.id AS cid, c.amount, c.beneficiary_profile_id AS de_profile,
           c.transaction_id, c.partner_order_id, co.upline_coach_id AS proximo
      FROM public.commissions c
      JOIN public.coaches co ON co.profile_id = c.beneficiary_profile_id
     WHERE COALESCE(c.is_network,false) AND NOT COALESCE(c.is_referral,false)
       AND NOT COALESCE(c.force_released,false)
       AND c.status::text IN ('pending','available')
       AND EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int = _ano
       AND EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int = _mes
       AND NOT COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                          WHERE n.profile_id = c.beneficiary_profile_id
                            AND n.period_year = _ano AND n.period_month = _mes), false)
       AND NOT EXISTS (SELECT 1 FROM public.network_month_transfers t
                        WHERE t.origin_commission_id = c.id)
  ),
  cadeia AS (
    SELECT p.cid, p.proximo AS coach_id, 1 AS nivel FROM presas p
    UNION ALL
    SELECT ch.cid, co.upline_coach_id, ch.nivel + 1
      FROM cadeia ch JOIN public.coaches co ON co.id = ch.coach_id
     WHERE ch.coach_id IS NOT NULL AND ch.nivel < 15
       AND NOT COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                          WHERE n.profile_id = co.profile_id
                            AND n.period_year = _ano AND n.period_month = _mes), false)
  ),
  achou AS (
    SELECT DISTINCT ON (ch.cid) ch.cid, ch.nivel, co.profile_id AS destino_profile
      FROM cadeia ch JOIN public.coaches co ON co.id = ch.coach_id
     WHERE COALESCE((SELECT n.any_completed FROM public.network_unlock_history n
                      WHERE n.profile_id = co.profile_id
                        AND n.period_year = _ano AND n.period_month = _mes), false)
     ORDER BY ch.cid, ch.nivel
  )
  SELECT p.cid, p.amount, p.de_profile, p.transaction_id, p.partner_order_id,
         a.destino_profile, a.nivel
    FROM presas p LEFT JOIN achou a ON a.cid = p.cid;

  IF _simular THEN
    RETURN QUERY
      SELECT (CASE WHEN pl.destino_profile IS NULL THEN 'iria para o SISTEMA' ELSE 'subiria para o upline' END)::text,
             pfrom.name::text, COALESCE(pto.name::text, '(sistema)'),
             count(*)::bigint, round(SUM(pl.amount),2)
        FROM _plano pl
        JOIN public.profiles pfrom ON pfrom.id = pl.de_profile
        LEFT JOIN public.profiles pto ON pto.id = pl.destino_profile
       GROUP BY 1, pfrom.name, pto.name
       ORDER BY 5 DESC;
    RETURN;
  END IF;

  WITH nova AS (
    INSERT INTO public.commissions
      (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id,
       level, percentage, amount, status, available_at, slot_label, is_network)
    SELECT pl.transaction_id, pl.partner_order_id, pl.destino_profile,
           (SELECT co2.id FROM public.coaches co2 WHERE co2.profile_id = pl.destino_profile LIMIT 1),
           0, NULL, pl.amount, 'available'::commission_status, now(),
           'Rede recebida de ' || pfrom.name || ' (' || lpad(_mes::text,2,'0') || '/' || _ano || ')',
           false
      FROM _plano pl JOIN public.profiles pfrom ON pfrom.id = pl.de_profile
     WHERE pl.destino_profile IS NOT NULL
    RETURNING id, beneficiary_profile_id, amount
  )
  INSERT INTO public.network_month_transfers
    (period_year, period_month, origin_commission_id, from_profile_id,
     to_profile_id, to_system, amount, levels_up, new_commission_id, closed_by)
  SELECT _ano, _mes, pl.cid, pl.de_profile, pl.destino_profile, false, pl.amount, pl.nivel,
         (SELECT n2.id FROM nova n2
           WHERE n2.beneficiary_profile_id = pl.destino_profile AND n2.amount = pl.amount LIMIT 1),
         v_admin_profile
    FROM _plano pl WHERE pl.destino_profile IS NOT NULL;

  SELECT COALESCE(SUM(p3.amount), 0) INTO v_ao_sistema
    FROM _plano p3 WHERE p3.destino_profile IS NULL;

  IF v_ao_sistema > 0 THEN
    INSERT INTO public.admin_system_wallet_entries (slot_label, amount, kind, notes, created_at)
    SELECT 'Rede nao liberada - ' || pfrom.name || ' (' || lpad(_mes::text,2,'0') || '/' || _ano || ')',
           pl.amount, 'credit', 'fechamento de rede', now()
      FROM _plano pl JOIN public.profiles pfrom ON pfrom.id = pl.de_profile
     WHERE pl.destino_profile IS NULL;

    UPDATE public.admin_system_wallet
       SET available_balance = available_balance + v_ao_sistema,
           total_earned      = total_earned      + v_ao_sistema,
           updated_at = now()
     WHERE id = true;

    INSERT INTO public.network_month_transfers
      (period_year, period_month, origin_commission_id, from_profile_id,
       to_profile_id, to_system, amount, levels_up, closed_by)
    SELECT _ano, _mes, p4.cid, p4.de_profile, NULL, true, p4.amount, NULL, v_admin_profile
      FROM _plano p4 WHERE p4.destino_profile IS NULL;
  END IF;

  UPDATE public.commissions c
     SET status = 'cancelled'::commission_status
   WHERE c.id IN (SELECT p5.cid FROM _plano p5);

  PERFORM public.recalc_wallets_for_owner(x.pid)
     FROM (SELECT DISTINCT p6.de_profile AS pid FROM _plano p6
           UNION
           SELECT DISTINCT p7.destino_profile FROM _plano p7 WHERE p7.destino_profile IS NOT NULL) x
    WHERE x.pid IS NOT NULL;

  RETURN QUERY
    SELECT (CASE WHEN pl.destino_profile IS NULL THEN 'foi para o SISTEMA' ELSE 'subiu para o upline' END)::text,
           pfrom.name::text, COALESCE(pto.name::text, '(sistema)'),
           count(*)::bigint, round(SUM(pl.amount),2)
      FROM _plano pl
      JOIN public.profiles pfrom ON pfrom.id = pl.de_profile
      LEFT JOIN public.profiles pto ON pto.id = pl.destino_profile
     GROUP BY 1, pfrom.name, pto.name
     ORDER BY 5 DESC;
END;
$function$;

REVOKE ALL ON FUNCTION public.fechar_rede_do_mes(int,int,uuid,boolean) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.fechar_rede_do_mes(int,int,uuid,boolean) TO authenticated, service_role;