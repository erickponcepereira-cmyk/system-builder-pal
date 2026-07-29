ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS force_released boolean NOT NULL DEFAULT false;

CREATE TABLE IF NOT EXISTS public.commission_release_advances (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  commission_id uuid NOT NULL REFERENCES public.commissions(id) ON DELETE CASCADE,
  profile_id uuid NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  amount numeric(12,2) NOT NULL DEFAULT 0,
  slot_label text,
  original_status text,
  original_available_at timestamptz,
  reason text,
  admin_user_id uuid,
  created_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.commission_release_advances TO authenticated;
GRANT ALL ON public.commission_release_advances TO service_role;

ALTER TABLE public.commission_release_advances ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "advances_admin_read" ON public.commission_release_advances;
CREATE POLICY "advances_admin_read" ON public.commission_release_advances
  FOR SELECT TO authenticated
  USING (public.is_admin(auth.uid()));

CREATE INDEX IF NOT EXISTS idx_commission_release_advances_profile
  ON public.commission_release_advances(profile_id, created_at DESC);

CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
$function$;

CREATE OR REPLACE FUNCTION public.admin_advance_commission_release(
  _profile_id uuid,
  _commission_ids uuid[],
  _admin_user_id uuid,
  _reason text DEFAULT NULL
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_total numeric := 0;
BEGIN
  IF NOT public.is_admin(_admin_user_id) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;
  IF _profile_id IS NULL OR _commission_ids IS NULL OR array_length(_commission_ids, 1) IS NULL THEN
    RAISE EXCEPTION 'Informe o perfil e ao menos uma comissão';
  END IF;

  INSERT INTO public.commission_release_advances
    (commission_id, profile_id, amount, slot_label, original_status, original_available_at, reason, admin_user_id)
  SELECT c.id, c.beneficiary_profile_id, c.amount, c.slot_label, c.status::text, c.available_at, _reason, _admin_user_id
  FROM public.commissions c
  WHERE c.id = ANY(_commission_ids)
    AND c.beneficiary_profile_id = _profile_id
    AND COALESCE(c.force_released, false) = false;

  UPDATE public.commissions c
  SET force_released = true,
      available_at = LEAST(COALESCE(c.available_at, now()), now()),
      status = CASE WHEN c.status::text = 'pending' THEN 'available'::commission_status ELSE c.status END
  WHERE c.id = ANY(_commission_ids)
    AND c.beneficiary_profile_id = _profile_id
    AND COALESCE(c.force_released, false) = false;

  SELECT COALESCE(SUM(amount), 0) INTO v_total
  FROM public.commissions
  WHERE id = ANY(_commission_ids) AND beneficiary_profile_id = _profile_id;

  PERFORM public.recalc_wallets_for_owner(_profile_id);
  RETURN v_total;
END;
$$;

REVOKE ALL ON FUNCTION public.admin_advance_commission_release(uuid, uuid[], uuid, text) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.admin_advance_commission_release(uuid, uuid[], uuid, text) TO service_role;