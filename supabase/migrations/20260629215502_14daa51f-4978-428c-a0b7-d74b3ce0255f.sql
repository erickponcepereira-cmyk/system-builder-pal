
-- 1) BEFORE INSERT trigger: do NOT force status='available'.
-- Referral commissions stay 'pending' until available_at is reached.
CREATE OR REPLACE FUNCTION public.commissions_redirect_to_fitcoin_before()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_release_days INTEGER := 7;
BEGIN
  IF COALESCE(NEW.is_referral, false) = true AND NEW.referred_by_student_id IS NOT NULL THEN
    SELECT COALESCE(value::INTEGER, 7) INTO v_release_days
    FROM public.app_settings WHERE key = 'commission_release_days';

    IF NEW.available_at IS NULL THEN
      NEW.available_at := NOW() + (v_release_days || ' days')::INTERVAL;
    END IF;
    -- Status follows available_at: pending while in the future
    IF NEW.available_at > NOW() THEN
      NEW.status := 'pending';
      NEW.fitcoin_credited := FALSE;
    ELSE
      NEW.status := COALESCE(NEW.status, 'available');
      NEW.fitcoin_credited := TRUE;
    END IF;
  END IF;
  RETURN NEW;
END;
$$;

-- 2) Backfill existing referral commissions: pending while available_at in the future.
UPDATE public.commissions
SET status = 'pending',
    fitcoin_credited = FALSE
WHERE COALESCE(is_referral, false) = true
  AND available_at IS NOT NULL
  AND available_at > NOW()
  AND status::text <> 'pending';

-- 3) Recalc all student wallets that have any referral commission.
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT DISTINCT referred_by_student_id AS sid
    FROM public.commissions
    WHERE referred_by_student_id IS NOT NULL
      AND COALESCE(is_referral, false) = true
  LOOP
    PERFORM public.recalc_student_wallet_for_referral(r.sid);
  END LOOP;
END $$;
