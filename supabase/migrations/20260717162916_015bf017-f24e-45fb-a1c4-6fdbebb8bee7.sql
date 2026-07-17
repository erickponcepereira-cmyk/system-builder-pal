
CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending numeric := 0;
  v_available_main_raw numeric := 0;
  v_total_earned_main numeric := 0;
  v_referral_pending numeric := 0;
  v_paid_withdrawn_main numeric := 0;
  v_active_reserved_main numeric := 0;
  v_leftover numeric := 0;

  v_partner_id uuid;
  v_partner_avail_raw numeric := 0;
  v_partner_pending numeric := 0;
  v_partner_earned numeric := 0;
  v_partner_paid numeric := 0;
  v_partner_reserved_specific numeric := 0;
  v_partner_final_avail numeric := 0;

  v_coach_id uuid;
  v_coach_avail_raw numeric := 0;
  v_coach_pending numeric := 0;
  v_coach_earned numeric := 0;
  v_coach_paid numeric := 0;
  v_coach_reserved_specific numeric := 0;
  v_coach_final_avail numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  -- 1) main wallet: commissions
  WITH src AS (
    SELECT
      c.amount,
      c.status::text AS status,
      c.available_at,
      c.created_at,
      (
        COALESCE(c.level, 0) > 0
        OR (
          COALESCE(c.slot_label, '') ~* '(^|\s)(linha|upline)\s*[0-9]+'
          AND COALESCE(c.slot_label, '') !~* 'sem\s+upline'
        )
      ) AS is_network,
      COALESCE((
        SELECT nuh.any_completed
        FROM public.network_unlock_history nuh
        WHERE nuh.profile_id = _profile_id
          AND nuh.period_year  = EXTRACT(YEAR  FROM (c.created_at AT TIME ZONE 'UTC'))::int
          AND nuh.period_month = EXTRACT(MONTH FROM (c.created_at AT TIME ZONE 'UTC'))::int
      ), false) AS month_unlocked,
      (
        c.status::text = 'available'
        OR (c.status::text = 'pending' AND c.available_at IS NOT NULL AND c.available_at <= now())
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status IN ('pending','available')
        AND (NOT is_released OR (is_network AND NOT month_unlocked))
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE is_released AND (NOT is_network OR month_unlocked)
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

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_withdrawn_main
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_active_reserved_main
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status IN ('requested','approved','processing');

  v_available_main_raw := GREATEST(0, v_available_main_raw - v_paid_withdrawn_main);

  -- 2) partner wallet raw
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

    SELECT COALESCE(SUM(amount), 0) INTO v_partner_paid
    FROM public.withdrawal_requests WHERE partner_id = v_partner_id AND status = 'paid';

    SELECT COALESCE(SUM(amount), 0) INTO v_partner_reserved_specific
    FROM public.withdrawal_requests WHERE partner_id = v_partner_id AND status IN ('requested','approved','processing');

    v_partner_avail_raw := GREATEST(0, v_partner_avail_raw - v_partner_paid - v_partner_reserved_specific);
  END IF;

  -- 3) professional wallet raw
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

    SELECT COALESCE(SUM(amount), 0) INTO v_coach_paid
    FROM public.withdrawal_requests WHERE professional_coach_id = v_coach_id AND status = 'paid';

    SELECT COALESCE(SUM(amount), 0) INTO v_coach_reserved_specific
    FROM public.withdrawal_requests WHERE professional_coach_id = v_coach_id AND status IN ('requested','approved','processing');

    v_coach_avail_raw := GREATEST(0, v_coach_avail_raw - v_coach_paid - v_coach_reserved_specific);
  END IF;

  -- 4) Drain the seller-level reservation across wallets: main -> partner -> professional
  v_leftover := v_active_reserved_main;
  DECLARE
    take numeric;
    v_main_final numeric;
  BEGIN
    take := LEAST(v_available_main_raw, v_leftover);
    v_main_final := GREATEST(0, v_available_main_raw - take);
    v_leftover := v_leftover - take;

    take := LEAST(v_partner_avail_raw, v_leftover);
    v_partner_final_avail := GREATEST(0, v_partner_avail_raw - take);
    v_leftover := v_leftover - take;

    take := LEAST(v_coach_avail_raw, v_leftover);
    v_coach_final_avail := GREATEST(0, v_coach_avail_raw - take);

    INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
    VALUES (_profile_id, v_pending, v_main_final, v_total_earned_main, v_paid_withdrawn_main, now())
    ON CONFLICT (profile_id) DO UPDATE
    SET pending_balance=EXCLUDED.pending_balance,
        available_balance=EXCLUDED.available_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END;

  IF v_partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_partner_id, v_partner_final_avail, v_partner_pending, v_partner_earned, v_partner_paid, now())
    ON CONFLICT (partner_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_coach_id, v_coach_final_avail, v_coach_pending, v_coach_earned, v_coach_paid, now())
    ON CONFLICT (professional_coach_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;
END;
$$;

-- Route the main recalc through the owner-level function
CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public.recalc_wallets_for_owner(_profile_id);
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_partner_wallet(_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pid uuid;
BEGIN
  SELECT profile_id INTO v_pid FROM public.partners WHERE id = _partner_id;
  IF v_pid IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(v_pid); END IF;
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_professional_wallet(_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE v_pid uuid;
BEGIN
  SELECT profile_id INTO v_pid FROM public.coaches WHERE id = _coach_id;
  IF v_pid IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(v_pid); END IF;
END;
$$;

-- Backfill
DO $backfill$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS pid FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL
    UNION SELECT DISTINCT profile_id FROM public.wallets
    UNION SELECT DISTINCT profile_id FROM public.withdrawal_requests WHERE profile_id IS NOT NULL
    UNION SELECT DISTINCT p.profile_id FROM public.partners p JOIN public.partner_product_orders o ON o.partner_id = p.id
    UNION SELECT DISTINCT c.profile_id FROM public.coaches c JOIN public.partner_product_orders o ON o.professional_coach_id = c.id
  LOOP
    IF r.pid IS NOT NULL THEN PERFORM public.recalc_wallets_for_owner(r.pid); END IF;
  END LOOP;
END;
$backfill$;
