
DROP FUNCTION IF EXISTS public.recalc_professional_wallet(uuid);
DROP FUNCTION IF EXISTS public.recalc_partner_wallet(uuid);

CREATE OR REPLACE FUNCTION public.recalc_partner_wallet(_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_available numeric := 0;
  v_pending numeric := 0;
  v_earned numeric := 0;
  v_active_reserved numeric := 0;
  v_paid_withdrawn numeric := 0;
BEGIN
  IF _partner_id IS NULL THEN RETURN; END IF;

  WITH src AS (
    SELECT
      COALESCE(partner_net_amount, 0) AS amount,
      (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
    FROM public.partner_product_orders
    WHERE partner_id = _partner_id AND status = 'paid'
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE released), 0),
    COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
    COALESCE(SUM(amount), 0)
  INTO v_available, v_pending, v_earned
  FROM src;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_reserved
  FROM public.withdrawal_requests
  WHERE partner_id = _partner_id AND status IN ('requested','approved','processing');

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_withdrawn
  FROM public.withdrawal_requests
  WHERE partner_id = _partner_id AND status = 'paid';

  INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_partner_id, GREATEST(0, v_available - v_active_reserved - v_paid_withdrawn), v_pending, v_earned, v_paid_withdrawn, now())
  ON CONFLICT (partner_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      pending_balance   = EXCLUDED.pending_balance,
      total_earned      = EXCLUDED.total_earned,
      total_withdrawn   = EXCLUDED.total_withdrawn,
      updated_at        = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_professional_wallet(_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_available numeric := 0;
  v_pending numeric := 0;
  v_earned numeric := 0;
  v_active_reserved numeric := 0;
  v_paid_withdrawn numeric := 0;
BEGIN
  IF _coach_id IS NULL THEN RETURN; END IF;

  WITH src AS (
    SELECT
      COALESCE(partner_net_amount, 0) AS amount,
      (COALESCE(paid_at, created_at) + interval '7 days') <= now() AS released
    FROM public.partner_product_orders
    WHERE professional_coach_id = _coach_id AND status = 'paid'
  )
  SELECT
    COALESCE(SUM(amount) FILTER (WHERE released), 0),
    COALESCE(SUM(amount) FILTER (WHERE NOT released), 0),
    COALESCE(SUM(amount), 0)
  INTO v_available, v_pending, v_earned
  FROM src;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_reserved
  FROM public.withdrawal_requests
  WHERE professional_coach_id = _coach_id AND status IN ('requested','approved','processing');

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_withdrawn
  FROM public.withdrawal_requests
  WHERE professional_coach_id = _coach_id AND status = 'paid';

  INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_coach_id, GREATEST(0, v_available - v_active_reserved - v_paid_withdrawn), v_pending, v_earned, v_paid_withdrawn, now())
  ON CONFLICT (professional_coach_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      pending_balance   = EXCLUDED.pending_balance,
      total_earned      = EXCLUDED.total_earned,
      total_withdrawn   = EXCLUDED.total_withdrawn,
      updated_at        = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
  v_referral_pending numeric := 0;
  v_active_reserved numeric := 0;
  v_paid_withdrawn numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

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
  INTO v_pending, v_available, v_total_earned
  FROM src;

  SELECT COALESCE(SUM(amount), 0)
    INTO v_referral_pending
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = true
    AND status::text = 'pending';

  v_pending := v_pending + v_referral_pending;
  v_total_earned := v_total_earned + v_referral_pending;

  SELECT COALESCE(SUM(amount), 0) INTO v_active_reserved
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL
    AND professional_coach_id IS NULL
    AND status IN ('requested','approved','processing');

  SELECT COALESCE(SUM(amount), 0) INTO v_paid_withdrawn
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL
    AND professional_coach_id IS NULL
    AND status = 'paid';

  INSERT INTO public.wallets (
    profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at
  )
  VALUES (
    _profile_id, v_pending,
    GREATEST(0, v_available - v_active_reserved - v_paid_withdrawn),
    v_total_earned, v_paid_withdrawn, now()
  )
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance   = EXCLUDED.pending_balance,
      available_balance = EXCLUDED.available_balance,
      total_earned      = EXCLUDED.total_earned,
      total_withdrawn   = EXCLUDED.total_withdrawn,
      updated_at        = now();

  PERFORM public.recalc_partner_wallet(p.id) FROM public.partners p WHERE p.profile_id = _profile_id;
  PERFORM public.recalc_professional_wallet(c.id) FROM public.coaches c WHERE c.profile_id = _profile_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.trg_recalc_on_product_order()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner_id uuid;
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_coach_id := COALESCE(NEW.professional_coach_id, OLD.professional_coach_id);

  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(v_partner_id);
    SELECT profile_id INTO v_profile_id FROM public.partners WHERE id = v_partner_id;
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(v_profile_id);
    END IF;
  END IF;

  IF v_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(v_coach_id);
    SELECT profile_id INTO v_profile_id FROM public.coaches WHERE id = v_coach_id;
    IF v_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(v_profile_id);
    END IF;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS partner_product_orders_recalc_trg ON public.partner_product_orders;
CREATE TRIGGER partner_product_orders_recalc_trg
AFTER INSERT OR UPDATE OR DELETE
ON public.partner_product_orders
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_on_product_order();

CREATE OR REPLACE FUNCTION public.trg_recalc_on_withdrawal()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_partner_id uuid;
  v_coach_id uuid;
  v_profile_id uuid;
BEGIN
  v_partner_id := COALESCE(NEW.partner_id, OLD.partner_id);
  v_coach_id := COALESCE(NEW.professional_coach_id, OLD.professional_coach_id);
  v_profile_id := COALESCE(NEW.profile_id, OLD.profile_id);

  IF v_partner_id IS NOT NULL THEN
    PERFORM public.recalc_partner_wallet(v_partner_id);
  END IF;
  IF v_coach_id IS NOT NULL THEN
    PERFORM public.recalc_professional_wallet(v_coach_id);
  END IF;
  IF v_profile_id IS NOT NULL THEN
    PERFORM public.recalc_wallet_for_profile(v_profile_id);
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS withdrawal_requests_recalc_trg ON public.withdrawal_requests;
CREATE TRIGGER withdrawal_requests_recalc_trg
AFTER INSERT OR UPDATE OR DELETE
ON public.withdrawal_requests
FOR EACH ROW EXECUTE FUNCTION public.trg_recalc_on_withdrawal();

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
    IF r.pid IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(r.pid);
    END IF;
  END LOOP;
END;
$backfill$;
