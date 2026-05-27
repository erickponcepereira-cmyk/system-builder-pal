
CREATE OR REPLACE FUNCTION public.recalc_wallet_for_profile(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = false;

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (_profile_id, v_pending, v_available, v_total_earned, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, EXCLUDED.available_balance - COALESCE(public.wallets.total_withdrawn, 0)),
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_student_wallet_for_referral(_student_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total_earned numeric := 0;
BEGIN
  IF _student_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE referred_by_student_id = _student_id
    AND COALESCE(is_referral, false) = true;

  INSERT INTO public.student_wallets (student_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (_student_id, v_pending, v_available, v_total_earned, now())
  ON CONFLICT (student_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, EXCLUDED.available_balance - COALESCE(public.student_wallets.total_withdrawn, 0)),
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.commissions_sync_wallet()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF COALESCE(OLD.is_referral, false) AND OLD.referred_by_student_id IS NOT NULL THEN
      PERFORM public.recalc_student_wallet_for_referral(OLD.referred_by_student_id);
    ELSIF OLD.beneficiary_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(OLD.beneficiary_profile_id);
    END IF;
    RETURN OLD;
  ELSE
    IF COALESCE(NEW.is_referral, false) AND NEW.referred_by_student_id IS NOT NULL THEN
      PERFORM public.recalc_student_wallet_for_referral(NEW.referred_by_student_id);
    ELSIF NEW.beneficiary_profile_id IS NOT NULL THEN
      PERFORM public.recalc_wallet_for_profile(NEW.beneficiary_profile_id);
    END IF;
    IF TG_OP = 'UPDATE' THEN
      IF COALESCE(OLD.is_referral, false) AND OLD.referred_by_student_id IS NOT NULL
         AND OLD.referred_by_student_id IS DISTINCT FROM NEW.referred_by_student_id THEN
        PERFORM public.recalc_student_wallet_for_referral(OLD.referred_by_student_id);
      ELSIF OLD.beneficiary_profile_id IS NOT NULL
         AND OLD.beneficiary_profile_id IS DISTINCT FROM NEW.beneficiary_profile_id THEN
        PERFORM public.recalc_wallet_for_profile(OLD.beneficiary_profile_id);
      END IF;
    END IF;
    RETURN NEW;
  END IF;
END;
$$;

DROP TRIGGER IF EXISTS trg_commissions_sync_wallet ON public.commissions;
CREATE TRIGGER trg_commissions_sync_wallet
AFTER INSERT OR UPDATE OR DELETE ON public.commissions
FOR EACH ROW EXECUTE FUNCTION public.commissions_sync_wallet();

DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT beneficiary_profile_id FROM public.commissions
           WHERE beneficiary_profile_id IS NOT NULL AND COALESCE(is_referral, false) = false
  LOOP
    PERFORM public.recalc_wallet_for_profile(r.beneficiary_profile_id);
  END LOOP;

  FOR r IN SELECT DISTINCT referred_by_student_id FROM public.commissions
           WHERE referred_by_student_id IS NOT NULL AND COALESCE(is_referral, false) = true
  LOOP
    PERFORM public.recalc_student_wallet_for_referral(r.referred_by_student_id);
  END LOOP;
END $$;
