CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
  v_active_reserved numeric := 0;
  v_paid_withdrawn numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN
    RETURN;
  END IF;

  WITH src AS (
    SELECT
      c.amount,
      c.status::text AS status,
      c.available_at,
      c.created_at,
      (
        COALESCE(c.level, 0) > 0
        OR (
          COALESCE(c.slot_label, '') ~* '(^|\\s)(linha|upline)\\s*[0-9]+'
          AND COALESCE(c.slot_label, '') !~* 'sem\\s+upline'
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
        OR (
          c.status::text = 'pending'
          AND c.available_at IS NOT NULL
          AND c.available_at <= now()
        )
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn')
  )
  SELECT
    COALESCE(SUM(amount) FILTER (
      WHERE status = 'pending'
        AND (
          NOT is_released
          OR (is_network AND NOT month_unlocked)
        )
    ), 0),
    COALESCE(SUM(amount) FILTER (
      WHERE is_released
        AND (NOT is_network OR month_unlocked)
    ), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available, v_total_earned
  FROM src;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_active_reserved
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL
    AND professional_coach_id IS NULL
    AND status IN ('requested','approved','processing');

  SELECT COALESCE(SUM(amount), 0)
    INTO v_paid_withdrawn
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL
    AND professional_coach_id IS NULL
    AND status = 'paid';

  INSERT INTO public.wallets (
    profile_id,
    pending_balance,
    available_balance,
    total_earned,
    total_withdrawn,
    updated_at
  )
  VALUES (
    _profile_id,
    v_pending,
    GREATEST(0, v_available - v_active_reserved - v_paid_withdrawn),
    v_total_earned,
    v_paid_withdrawn,
    now()
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance   = EXCLUDED.pending_balance,
      available_balance = EXCLUDED.available_balance,
      total_earned      = EXCLUDED.total_earned,
      total_withdrawn   = EXCLUDED.total_withdrawn,
      updated_at        = now();
END;
$function$;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS profile_id
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
    UNION
    SELECT DISTINCT profile_id
    FROM public.withdrawal_requests
    WHERE profile_id IS NOT NULL
  LOOP
    PERFORM public.recalc_wallet_for_profile(r.profile_id);
  END LOOP;
END $$;