CREATE OR REPLACE FUNCTION public.wallet_statement(_profile_id uuid, _recalc boolean DEFAULT true)
 RETURNS jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_user_id uuid;
  v_partner_ids uuid[];
  v_coach_ids uuid[];
  v_student_ids uuid[];

  v_main_avail numeric := 0;
  v_main_pend numeric := 0;
  v_main_earned numeric := 0;
  v_main_withdrawn numeric := 0;

  v_p_avail numeric := 0;
  v_p_pend numeric := 0;
  v_p_earned numeric := 0;
  v_p_withdrawn numeric := 0;

  v_pro_avail numeric := 0;
  v_pro_pend numeric := 0;
  v_pro_earned numeric := 0;
  v_pro_withdrawn numeric := 0;

  v_creator_avail numeric := 0;
  v_creator_pend numeric := 0;
  v_creator_earned numeric := 0;
  v_creator_withdrawn numeric := 0;

  v_ref_avail numeric := 0;
  v_ref_pend numeric := 0;
  v_ref_earned numeric := 0;

  v_hold numeric := 0;
  v_hold_total numeric := 0;
  v_net_blocked numeric := 0;
  v_comm_released numeric := 0;

  v_wd_paid numeric := 0;
  v_wd_open numeric := 0;
  v_spent numeric := 0;
  v_advance numeric := 0;
  v_base_avail numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN '{}'::jsonb; END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;

  SELECT array_agg(id) INTO v_partner_ids FROM public.partners WHERE profile_id = _profile_id;
  SELECT array_agg(id) INTO v_coach_ids   FROM public.coaches  WHERE profile_id = _profile_id;
  SELECT array_agg(id) INTO v_student_ids FROM public.students WHERE profile_id = _profile_id;

  SELECT COALESCE(available_balance,0), COALESCE(pending_balance,0),
         COALESCE(total_earned,0), COALESCE(total_withdrawn,0)
    INTO v_main_avail, v_main_pend, v_main_earned, v_main_withdrawn
  FROM public.wallets WHERE profile_id = _profile_id;

  IF v_partner_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0),
           COALESCE(SUM(total_earned),0), COALESCE(SUM(total_withdrawn),0)
      INTO v_p_avail, v_p_pend, v_p_earned, v_p_withdrawn
    FROM public.partner_wallets WHERE partner_id = ANY(v_partner_ids);
  END IF;

  IF v_coach_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0),
           COALESCE(SUM(total_earned),0), COALESCE(SUM(total_withdrawn),0)
      INTO v_pro_avail, v_pro_pend, v_pro_earned, v_pro_withdrawn
    FROM public.professional_wallets WHERE professional_coach_id = ANY(v_coach_ids);
  END IF;

  v_creator_avail := v_p_avail + v_pro_avail;
  v_creator_pend := v_p_pend + v_pro_pend;
  v_creator_earned := v_p_earned + v_pro_earned;
  v_creator_withdrawn := v_p_withdrawn + v_pro_withdrawn;

  IF v_student_ids IS NOT NULL THEN
    SELECT COALESCE(SUM(available_balance),0), COALESCE(SUM(pending_balance),0), COALESCE(SUM(total_earned),0)
      INTO v_ref_avail, v_ref_pend, v_ref_earned
    FROM public.student_wallets WHERE student_id = ANY(v_student_ids);
  END IF;

  WITH src AS (
    SELECT
      c.amount,
      COALESCE(c.is_network, false) AS is_network,
      COALESCE(c.force_released, false) AS forced,
      COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = _profile_id
          AND nuh.period_year  = EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) AS month_unlocked,
      (
        c.status::text IN ('available','withdrawn','paid')
        OR (c.status::text = 'pending' AND c.available_at IS NOT NULL AND c.available_at <= now())
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn','paid')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE NOT forced AND NOT is_released), 0),
    COALESCE(SUM(amount) FILTER (WHERE NOT forced AND is_released AND is_network AND NOT month_unlocked), 0),
    COALESCE(SUM(amount) FILTER (WHERE forced OR (is_released AND (NOT is_network OR month_unlocked))), 0)
  INTO v_hold, v_net_blocked, v_comm_released
  FROM src;

  SELECT COALESCE(SUM(amount) FILTER (WHERE status = 'paid'), 0),
         COALESCE(SUM(amount) FILTER (WHERE status IN ('requested','approved','processing')), 0)
    INTO v_wd_paid, v_wd_open
  FROM public.withdrawal_requests WHERE profile_id = _profile_id;

  IF v_student_ids IS NOT NULL THEN
    SELECT v_wd_paid + COALESCE(SUM(amount) FILTER (WHERE status::text = 'paid'), 0),
           v_wd_open + COALESCE(SUM(amount) FILTER (WHERE status::text IN ('requested','approved','processing')), 0)
      INTO v_wd_paid, v_wd_open
    FROM public.student_withdrawal_requests WHERE student_id = ANY(v_student_ids);
  END IF;

  IF v_user_id IS NOT NULL THEN
    SELECT COALESCE(SUM(amount), 0) INTO v_spent
    FROM public.subscription_invoices
    WHERE user_id = v_user_id AND status = 'paid' AND payment_method = 'wallet';
  END IF;

  IF v_student_ids IS NOT NULL THEN
    SELECT v_spent
      + COALESCE((SELECT SUM(total_amount) FROM public.store_orders
                  WHERE student_id = ANY(v_student_ids) AND status::text = 'paid' AND payment_method::text = 'wallet'), 0)
      + COALESCE((SELECT SUM(gross_amount) FROM public.partner_product_orders
                  WHERE student_id = ANY(v_student_ids) AND status = 'paid' AND payment_method = 'wallet'), 0)
      INTO v_spent;
  END IF;

  SELECT COALESCE(SUM(GREATEST(amount - settled_amount, 0)), 0) INTO v_advance
  FROM public.wallet_advances WHERE profile_id = _profile_id;

  -- Fitcoin (indicação do aluno) NÃO entra no saldo profissional.
  v_base_avail := v_main_avail + v_creator_avail;
  -- Carência = coach (comissões ainda no prazo) + parceiro + profissional.
  -- A rede já vencida mas travada pela missão fica FORA do "a liberar".
  v_hold_total := v_hold + v_creator_pend;

  RETURN jsonb_build_object(
    'profile_id', _profile_id,
    'generated_at', now(),
    'available', round(GREATEST(v_base_avail - v_advance, 0)::numeric, 2),
    'available_before_advance', round(v_base_avail::numeric, 2),
    'advance_open', round(v_advance::numeric, 2),
    'hold', round(v_hold_total::numeric, 2),
    'hold_coach', round(v_hold::numeric, 2),
    'network_blocked', round(v_net_blocked::numeric, 2),
    'pending_total', round((v_hold_total + v_net_blocked)::numeric, 2),
    'withdraw_open', round(v_wd_open::numeric, 2),
    'withdrawn_paid', round(v_wd_paid::numeric, 2),
    'spent_wallet', round(v_spent::numeric, 2),
    'total_earned', round((v_main_earned + v_creator_earned)::numeric, 2),
    'sources', jsonb_build_object(
      'coach', jsonb_build_object(
        'available', round(v_main_avail::numeric, 2),
        'hold', round(v_hold::numeric, 2),
        'earned', round(v_main_earned::numeric, 2)
      ),
      'partner', jsonb_build_object(
        'available', round(v_p_avail::numeric, 2),
        'hold', round(v_p_pend::numeric, 2),
        'earned', round(v_p_earned::numeric, 2)
      ),
      'professional', jsonb_build_object(
        'available', round(v_pro_avail::numeric, 2),
        'hold', round(v_pro_pend::numeric, 2),
        'earned', round(v_pro_earned::numeric, 2)
      )
    ),
    'fitcoin', jsonb_build_object(
      'available', round(v_ref_avail::numeric, 2),
      'pending', round(v_ref_pend::numeric, 2),
      'earned', round(v_ref_earned::numeric, 2)
    ),
    'breakdown', jsonb_build_object(
      'commissions', jsonb_build_object(
        'available', round(v_main_avail::numeric, 2),
        'pending', round(v_hold::numeric, 2),
        'released_total', round(v_comm_released::numeric, 2),
        'earned', round(v_main_earned::numeric, 2),
        'withdrawn', round(v_main_withdrawn::numeric, 2)
      ),
      'creator', jsonb_build_object(
        'available', round(v_creator_avail::numeric, 2),
        'pending', round(v_creator_pend::numeric, 2),
        'earned', round(v_creator_earned::numeric, 2),
        'withdrawn', round(v_creator_withdrawn::numeric, 2)
      ),
      'referral', jsonb_build_object(
        'available', round(v_ref_avail::numeric, 2),
        'pending', round(v_ref_pend::numeric, 2),
        'earned', round(v_ref_earned::numeric, 2)
      )
    )
  );
END;
$function$;