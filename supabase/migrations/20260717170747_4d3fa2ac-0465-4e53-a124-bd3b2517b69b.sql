
-- 1) Rewrite recalc_wallets_for_owner with unified paid+reserved cascade across main -> partner -> professional
CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  -- main
  v_pending numeric := 0;
  v_available_main_raw numeric := 0;
  v_total_earned_main numeric := 0;
  v_referral_pending numeric := 0;
  v_paid_seller numeric := 0;
  v_reserved_seller numeric := 0;

  -- partner
  v_partner_id uuid;
  v_partner_avail_raw numeric := 0;
  v_partner_pending numeric := 0;
  v_partner_earned numeric := 0;

  -- professional
  v_coach_id uuid;
  v_coach_avail_raw numeric := 0;
  v_coach_pending numeric := 0;
  v_coach_earned numeric := 0;

  -- cascade absorbed portions
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
BEGIN
  IF _profile_id IS NULL THEN RETURN; END IF;

  -- ---------- 1) MAIN wallet: commissions ----------
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

  -- Seller-level (main) withdrawals: paid + active reserved
  SELECT COALESCE(SUM(amount), 0) INTO v_paid_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status = 'paid';

  SELECT COALESCE(SUM(amount), 0) INTO v_reserved_seller
  FROM public.withdrawal_requests
  WHERE profile_id = _profile_id
    AND partner_id IS NULL AND professional_coach_id IS NULL
    AND status IN ('requested','approved','processing');

  -- ---------- 2) PARTNER wallet raw ----------
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
  END IF;

  -- ---------- 3) PROFESSIONAL wallet raw ----------
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
  END IF;

  -- ---------- 4) Cascade absorption: PAID first, then RESERVED ----------
  -- Paid: absorbed portion is recorded as total_withdrawn on each wallet.
  v_leftover := v_paid_seller;

  v_take := LEAST(v_available_main_raw, v_leftover);
  v_absorbed_main_paid := v_take;
  v_available_main_raw := v_available_main_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_absorbed_partner_paid := v_take;
  v_partner_avail_raw := v_partner_avail_raw - v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_absorbed_coach_paid := v_take;
  v_coach_avail_raw := v_coach_avail_raw - v_take;

  -- Reserved: reduces displayed available_balance but does NOT count as withdrawn.
  v_leftover := v_reserved_seller;

  v_take := LEAST(v_available_main_raw, v_leftover);
  v_take_main_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_partner_avail_raw, v_leftover);
  v_take_partner_res := v_take;
  v_leftover := v_leftover - v_take;

  v_take := LEAST(v_coach_avail_raw, v_leftover);
  v_take_coach_res := v_take;

  v_main_final    := GREATEST(0, v_available_main_raw - v_take_main_res);
  v_partner_final := GREATEST(0, v_partner_avail_raw   - v_take_partner_res);
  v_coach_final   := GREATEST(0, v_coach_avail_raw     - v_take_coach_res);

  -- ---------- 5) Persist wallets ----------
  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_profile_id, v_pending, v_main_final, v_total_earned_main, v_absorbed_main_paid, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance=EXCLUDED.pending_balance,
      available_balance=EXCLUDED.available_balance,
      total_earned=EXCLUDED.total_earned,
      total_withdrawn=EXCLUDED.total_withdrawn,
      updated_at=now();

  IF v_partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_partner_id, v_partner_final, v_partner_pending, v_partner_earned, v_absorbed_partner_paid, now())
    ON CONFLICT (partner_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;

  IF v_coach_id IS NOT NULL THEN
    INSERT INTO public.professional_wallets (professional_coach_id, available_balance, pending_balance, total_earned, total_withdrawn, updated_at)
    VALUES (v_coach_id, v_coach_final, v_coach_pending, v_coach_earned, v_absorbed_coach_paid, now())
    ON CONFLICT (professional_coach_id) DO UPDATE
    SET available_balance=EXCLUDED.available_balance,
        pending_balance=EXCLUDED.pending_balance,
        total_earned=EXCLUDED.total_earned,
        total_withdrawn=EXCLUDED.total_withdrawn,
        updated_at=now();
  END IF;
END;
$function$;

-- 2) Invariant audit trigger on wallets (never blocks; only logs discrepancies)
CREATE OR REPLACE FUNCTION public.wallets_audit_invariant()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_partner_sum numeric := 0;
  v_coach_sum numeric := 0;
  v_partner_pending numeric := 0;
  v_coach_pending numeric := 0;
  v_partner_earned numeric := 0;
  v_coach_earned numeric := 0;
  v_partner_withdrawn numeric := 0;
  v_coach_withdrawn numeric := 0;
  v_total_avail numeric;
  v_total_pending numeric;
  v_total_earned numeric;
  v_total_withdrawn numeric;
  v_diff numeric;
BEGIN
  SELECT COALESCE(pw.available_balance,0), COALESCE(pw.pending_balance,0),
         COALESCE(pw.total_earned,0), COALESCE(pw.total_withdrawn,0)
    INTO v_partner_sum, v_partner_pending, v_partner_earned, v_partner_withdrawn
  FROM public.partner_wallets pw
  JOIN public.partners p ON p.id = pw.partner_id
  WHERE p.profile_id = NEW.profile_id LIMIT 1;

  SELECT COALESCE(cw.available_balance,0), COALESCE(cw.pending_balance,0),
         COALESCE(cw.total_earned,0), COALESCE(cw.total_withdrawn,0)
    INTO v_coach_sum, v_coach_pending, v_coach_earned, v_coach_withdrawn
  FROM public.professional_wallets cw
  JOIN public.coaches c ON c.id = cw.professional_coach_id
  WHERE c.profile_id = NEW.profile_id LIMIT 1;

  v_total_avail    := COALESCE(NEW.available_balance,0) + v_partner_sum + v_coach_sum;
  v_total_pending  := COALESCE(NEW.pending_balance,0)  + v_partner_pending + v_coach_pending;
  v_total_earned   := COALESCE(NEW.total_earned,0)     + v_partner_earned + v_coach_earned;
  v_total_withdrawn:= COALESCE(NEW.total_withdrawn,0)  + v_partner_withdrawn + v_coach_withdrawn;

  v_diff := (v_total_avail + v_total_pending + v_total_withdrawn) - v_total_earned;

  IF ABS(v_diff) > 0.01 THEN
    BEGIN
      INSERT INTO public.admin_audit_log(actor_id, action, target_type, target_id, metadata)
      VALUES (NULL, 'wallet_invariant_violation', 'profile', NEW.profile_id,
        jsonb_build_object(
          'available_sum', v_total_avail,
          'pending_sum', v_total_pending,
          'earned_sum', v_total_earned,
          'withdrawn_sum', v_total_withdrawn,
          'diff', v_diff
        ));
    EXCEPTION WHEN OTHERS THEN
      -- audit failure must never block a wallet write
      NULL;
    END;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS wallets_audit_invariant_trg ON public.wallets;
CREATE TRIGGER wallets_audit_invariant_trg
AFTER INSERT OR UPDATE ON public.wallets
FOR EACH ROW EXECUTE FUNCTION public.wallets_audit_invariant();

-- 3) Backfill: recalc every profile that owns any wallet
DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT profile_id FROM (
      SELECT profile_id FROM public.wallets
      UNION
      SELECT p.profile_id FROM public.partner_wallets pw JOIN public.partners p ON p.id = pw.partner_id
      UNION
      SELECT c.profile_id FROM public.professional_wallets cw JOIN public.coaches c ON c.id = cw.professional_coach_id
    ) s
    WHERE profile_id IS NOT NULL
  LOOP
    PERFORM public.recalc_wallets_for_owner(r.profile_id);
  END LOOP;
END $$;
