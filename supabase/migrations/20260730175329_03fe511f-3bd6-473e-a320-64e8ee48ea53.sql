CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  v_user_id uuid;
  v_pending numeric := 0;
  v_available_main_raw numeric := 0;
  v_total_earned_main numeric := 0;
  v_referral_pending numeric := 0;
  v_paid_seller numeric := 0;
  v_reserved_seller numeric := 0;

  v_partner_id uuid;
  v_partner_avail_raw numeric := 0;
  v_partner_pending numeric := 0;
  v_partner_earned numeric := 0;

  v_coach_id uuid;
  v_coach_avail_raw numeric := 0;
  v_coach_pending numeric := 0;
  v_coach_earned numeric := 0;

  v_cp_avail numeric := 0;
  v_cp_pend numeric := 0;
  v_cp_earn numeric := 0;

  v_absorbed_main_paid numeric := 0;
  v_absorbed_partner_paid numeric := 0;
  v_absorbed_coach_paid numeric := 0;
  v_take_main_res numeric := 0;
  v_take_partner_res numeric := 0;
  v_take_coach_res numeric := 0;

  v_main_final numeric := 0;
  v_partner_final numeric := 0;
  v_coach_final numeric := 0;

  v_leftover numeric := 0;
  v_take numeric := 0;

  v_sub_main numeric := 0;
  v_sub_partner numeric := 0;
  v_sub_coach numeric := 0;
  v_store_main numeric := 0;
  v_store_partner numeric := 0;
  v_store_coach numeric := 0;
  v_partner_order_main numeric := 0;
  v_partner_order_partner numeric := 0;
  v_partner_order_coach numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;
  IF current_setting('fitmind.deleting_profile_id', true) = _profile_id::text THEN RETURN; END IF;

  SELECT user_id INTO v_user_id FROM public.profiles WHERE id = _profile_id;
  IF v_user_id IS NULL THEN RETURN; END IF;

  WITH src AS (
    SELECT
      c.amount,
      c.status::text AS status,
      c.available_at,
      c.created_at,
      COALESCE(c.is_network, false) AS is_network,
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
      ) AS is_released,
      COALESCE(c.force_released, false) AS forced
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn','paid')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('pending','available')
        AND NOT forced
        AND (NOT is_released OR (is_network AND NOT month_unlocked))
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE forced OR (is_released AND (NOT is_network OR month_unlocked))
    ), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available_main_raw, v_total_earned_main
  FROM src;

  SELECT COALESCE(SUM(amount), 0) INTO v_referral_pending
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = true
    AND status::text = 'pending';

  v_pending := v_pending + v_referral_pending;
  v_total_earned_main := v_total_earned_main + v_referral_pending;

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_reserved_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND status IN ('requested','approved','processing');

  SELECT
    COALESCE(SUM(CASE
      WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
        THEN COALESCE((wallet_debit_breakdown->>'coach')::numeric, 0)
      WHEN wallet_source = 'coach' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
        THEN COALESCE((wallet_debit_breakdown->>'partner')::numeric, 0)
      WHEN wallet_source = 'partner' THEN amount ELSE 0 END), 0),
    COALESCE(SUM(CASE
      WHEN COALESCE(wallet_debit_breakdown, '{}'::jsonb) <> '{}'::jsonb
        THEN COALESCE((wallet_debit_breakdown->>'professional')::numeric, 0)
      WHEN wallet_source = 'professional' THEN amount ELSE 0 END), 0)
  INTO v_sub_main, v_sub_partner, v_sub_coach
  FROM public.subscription_invoices
  WHERE user_id = v_user_id
    AND status = 'paid'
    AND payment_method = 'wallet';

  SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = _profile_id LIMIT 1;
  IF v_partner_id IS NOT NULL THEN
    WITH src AS (
      SELECT COALESCE(partner_net_amount, 0) AS amount,
             (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
      FROM public.partner_product_orders
      WHERE partner_id = v_partner_id AND status = 'paid'
    )
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE released), 0),
      COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
      COALESCE(SUM(amount), 0)
    INTO v_partner_avail_raw, v_partner_pending, v_partner_earned FROM src;

    -- Créditos de co-produção recebidos como colaborador (parceiro)
    SELECT
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') <= now()), 0),
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') > now()), 0),
      COALESCE(SUM(cc.amount_brl), 0)
    INTO v_cp_avail, v_cp_pend, v_cp_earn
    FROM public.product_coproduction_credits cc
    JOIN public.partner_product_orders o ON o.id = cc.order_id
    WHERE o.status = 'paid'
      AND cc.collaborator_type = 'partner'
      AND cc.collaborator_id = v_partner_id;

    v_partner_avail_raw := v_partner_avail_raw + v_cp_avail;
    v_partner_pending   := v_partner_pending   + v_cp_pend;
    v_partner_earned    := v_partner_earned    + v_cp_earn;

    -- Repasses de co-produção pagos por este parceiro (criador do produto)
    SELECT
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') <= now()), 0),
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') > now()), 0),
      COALESCE(SUM(cc.amount_brl), 0)
    INTO v_cp_avail, v_cp_pend, v_cp_earn
    FROM public.product_coproduction_credits cc
    JOIN public.product_coproductions pc ON pc.id = cc.coproduction_id
    JOIN public.partner_product_orders o ON o.id = cc.order_id
    WHERE o.status = 'paid'
      AND pc.creator_type = 'partner'
      AND pc.creator_id = v_partner_id;

    v_partner_avail_raw := GREATEST(0, v_partner_avail_raw - v_cp_avail);
    v_partner_pending   := GREATEST(0, v_partner_pending   - v_cp_pend);
    v_partner_earned    := GREATEST(0, v_partner_earned    - v_cp_earn);
  END IF;

  SELECT id INTO v_coach_id FROM public.coaches WHERE profile_id = _profile_id LIMIT 1;
  IF v_coach_id IS NOT NULL THEN
    WITH src AS (
      SELECT COALESCE(partner_net_amount, 0) AS amount,
             (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
      FROM public.partner_product_orders
      WHERE professional_coach_id = v_coach_id AND status = 'paid'
    )
    SELECT
      COALESCE(SUM(amount) FILTER (WHERE released), 0),
      COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
      COALESCE(SUM(amount), 0)
    INTO v_coach_avail_raw, v_coach_pending, v_coach_earned FROM src;

    -- Créditos de co-produção recebidos como colaborador (profissional/coach)
    SELECT
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') <= now()), 0),
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') > now()), 0),
      COALESCE(SUM(cc.amount_brl), 0)
    INTO v_cp_avail, v_cp_pend, v_cp_earn
    FROM public.product_coproduction_credits cc
    JOIN public.partner_product_orders o ON o.id = cc.order_id
    WHERE o.status = 'paid'
      AND cc.collaborator_type <> 'partner'
      AND cc.collaborator_id = v_coach_id;

    v_coach_avail_raw := v_coach_avail_raw + v_cp_avail;
    v_coach_pending   := v_coach_pending   + v_cp_pend;
    v_coach_earned    := v_coach_earned    + v_cp_earn;

    -- Repasses de co-produção pagos por este profissional (criador do produto)
    SELECT
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') <= now()), 0),
      COALESCE(SUM(cc.amount_brl) FILTER (WHERE (COALESCE(o.paid_at, o.created_at) + interval '7 days') > now()), 0),
      COALESCE(SUM(cc.amount_brl), 0)
    INTO v_cp_avail, v_cp_pend, v_cp_earn
    FROM public.product_coproduction_credits cc
    JOIN public.product_coproductions pc ON pc.id = cc.coproduction_id
    JOIN public.partner_product_orders o ON o.id = cc.order_id
    WHERE o.status = 'paid'
      AND pc.creator_type <> 'partner'
      AND pc.creator_id = v_coach_id;

    v_coach_avail_raw := GREATEST(0, v_coach_avail_raw - v_cp_avail);
    v_coach_pending   := GREATEST(0, v_coach_pending   - v_cp_pend);
    v_coach_earned    := GREATEST(0, v_coach_earned    - v_cp_earn);
  END IF;

  SELECT
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'coach')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'partner')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((so.wallet_debit_breakdown->>'professional')::numeric, 0)), 0)
  INTO v_store_main, v_store_partner, v_store_coach
  FROM public.store_orders so
  JOIN public.students s ON s.id = so.student_id
  WHERE s.profile_id = _profile_id
    AND so.status = 'paid'
    AND so.payment_method::text = 'wallet';

  SELECT
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'coach')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'partner')::numeric, 0)), 0),
    COALESCE(SUM(COALESCE((po.wallet_debit_breakdown->>'professional')::numeric, 0)), 0)
  INTO v_partner_order_main, v_partner_order_partner, v_partner_order_coach
  FROM public.partner_product_orders po
  JOIN public.students s ON s.id = po.student_id
  WHERE s.profile_id = _profile_id
    AND po.status = 'paid'
    AND po.payment_method = 'wallet';

  v_sub_main := v_sub_main + v_store_main + v_partner_order_main;
  v_sub_partner := v_sub_partner + v_store_partner + v_partner_order_partner;
  v_sub_coach := v_sub_coach + v_store_coach + v_partner_order_coach;

  v_leftover := v_sub_main;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_absorbed_main_paid := v_absorbed_main_paid + v_take;
  v_available_main_raw := v_available_main_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_take := LEAST(v_partner_avail_raw, v_sub_partner);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;

  v_take := LEAST(v_coach_avail_raw, v_sub_coach);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_leftover := v_paid_seller;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_absorbed_main_paid := v_absorbed_main_paid + v_take;
  v_available_main_raw := v_available_main_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_absorbed_partner_paid := v_absorbed_partner_paid + v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_absorbed_coach_paid := v_absorbed_coach_paid + v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  v_leftover := v_reserved_seller;
  v_take := LEAST(v_available_main_raw, v_leftover);
  v_take_main_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_take_partner_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_take_coach_res := v_take;

  v_main_final    := GREATEST(0, round((v_available_main_raw - v_take_main_res)::numeric, 2));
  v_partner_final := GREATEST(0, round((v_partner_avail_raw   - v_take_partner_res)::numeric, 2));
  v_coach_final   := GREATEST(0, round((v_coach_avail_raw     - v_take_coach_res)::numeric, 2));

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_profile_id, round(v_pending::numeric, 2), v_main_final, round(v_total_earned_main::numeric, 2), round(v_absorbed_main_paid::numeric, 2), now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance=EXCLUDED.pending_balance,
      available_balance=EXCLUDED.available_balance,
      total_earned=EXCLUDED.total_earned,
      total_withdrawn=EXCLUDED.total_withdrawn,
      updated_at=now();

  IF v_partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_partner_id, v_partner_final, round(v_partner_pending::numeric, 2), round(v_partner_earned::numeric, 2), round(v_absorbed_partner_paid::numeric, 2), now())
    ON CONFLICT (partner_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_coach_id, v_coach_final, round(v_coach_pending::numeric, 2), round(v_coach_earned::numeric, 2), round(v_absorbed_coach_paid::numeric, 2), now())
    ON CONFLICT (professional_coach_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;
END;
$fn$;
