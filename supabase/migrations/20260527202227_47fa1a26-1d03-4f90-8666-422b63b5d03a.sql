
-- 1) Exclude system-fee commissions from coach wallet so Sistema fees don't mix into coach balance
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
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  SELECT
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'pending'), 0),
    COALESCE(SUM(amount) FILTER (WHERE status::text = 'available'), 0),
    COALESCE(SUM(amount), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = false
    -- exclude Sistema / Admin / Nutricionista slots from coach wallet
    AND COALESCE(slot_label, '') !~* '^(sistema|admin|nutri)';

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (_profile_id, v_pending, v_available, v_total_earned, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, EXCLUDED.available_balance - COALESCE(public.wallets.total_withdrawn, 0)),
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$function$;

-- 2) Backfill wallets for everyone who has commissions
DO $$
DECLARE r record;
BEGIN
  FOR r IN SELECT DISTINCT beneficiary_profile_id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL LOOP
    PERFORM public.recalc_wallet_for_profile(r.beneficiary_profile_id);
  END LOOP;
END $$;

-- 3) Register Nathan as nutritionist (creates a nutritionist wallet for him)
INSERT INTO public.nutritionist_wallets (profile_id)
VALUES ('6714e367-a596-46b2-84f8-20d4a011432b')
ON CONFLICT (profile_id) DO NOTHING;
