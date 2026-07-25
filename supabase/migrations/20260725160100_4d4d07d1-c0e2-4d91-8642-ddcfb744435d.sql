CREATE OR REPLACE FUNCTION public.admin_purge_user_dependents(_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, pg_temp
AS $$
DECLARE
  v_profile_id uuid;
  v_student_id uuid;
  v_coach_id uuid;
  v_partner_id uuid;
  v_fallback_coach_id uuid;
  r record;
  v_sql text;
  v_id uuid;
  v_summary jsonb := '{}'::jsonb;
BEGIN
  IF auth.role() <> 'service_role' THEN
    IF NOT EXISTS (
      SELECT 1 FROM public.profiles WHERE user_id = auth.uid() AND role = 'admin'
    ) THEN
      RAISE EXCEPTION 'Acesso negado';
    END IF;
  END IF;

  SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = _user_id;
  IF v_profile_id IS NULL THEN
    RETURN jsonb_build_object('ok', true, 'note', 'no profile');
  END IF;

  SELECT id INTO v_student_id FROM public.students WHERE profile_id = v_profile_id LIMIT 1;
  SELECT id INTO v_coach_id FROM public.coaches WHERE profile_id = v_profile_id LIMIT 1;
  SELECT id INTO v_partner_id FROM public.partners WHERE profile_id = v_profile_id LIMIT 1;
  SELECT public.get_system_fallback_coach_id() INTO v_fallback_coach_id;

  -- Prevent wallet recalculation triggers from re-creating wallet rows while this user is being removed.
  PERFORM set_config('fitmind.deleting_profile_id', v_profile_id::text, true);

  -- Reassign downline records before deleting the coach, so required FKs do not block the purge.
  IF v_coach_id IS NOT NULL THEN
    UPDATE public.coaches
       SET upline_coach_id = NULLIF(v_fallback_coach_id, v_coach_id),
           transferred_to_coach_id = NULL
     WHERE upline_coach_id = v_coach_id
        OR transferred_to_coach_id = v_coach_id;

    IF v_fallback_coach_id IS NOT NULL AND v_fallback_coach_id <> v_coach_id THEN
      UPDATE public.students
         SET coach_id = v_fallback_coach_id,
             updated_at = now()
       WHERE coach_id = v_coach_id
         AND (v_student_id IS NULL OR id <> v_student_id);
    END IF;
  END IF;

  IF v_student_id IS NOT NULL THEN
    UPDATE public.students SET referred_by_student_id = NULL WHERE referred_by_student_id = v_student_id;
  END IF;

  -- Keep historic paid orders/reports, but detach the deleted seller/professional/partner pointers.
  IF v_partner_id IS NOT NULL THEN
    UPDATE public.partner_product_orders SET partner_id = NULL WHERE partner_id = v_partner_id;
  END IF;

  IF v_coach_id IS NOT NULL THEN
    UPDATE public.partner_product_orders
       SET professional_coach_id = NULL
     WHERE professional_coach_id = v_coach_id;
    UPDATE public.partner_product_orders
       SET master_coach_cross_beneficiary_coach_id = NULL
     WHERE master_coach_cross_beneficiary_coach_id = v_coach_id;
    UPDATE public.product_order_pool_entries
       SET hbl_fulfiller_coach_id = NULL
     WHERE hbl_fulfiller_coach_id = v_coach_id;
    UPDATE public.products
       SET creator_coach_id = NULL
     WHERE creator_coach_id = v_coach_id;
  END IF;

  -- Explicit financial/user-owned rows first, before profile removal can cascade and fire wallet recalc.
  DELETE FROM public.withdrawal_requests
   WHERE profile_id = v_profile_id
      OR approved_by = v_profile_id
      OR partner_id = v_partner_id
      OR professional_coach_id = v_coach_id;
  IF v_student_id IS NOT NULL THEN
    DELETE FROM public.student_withdrawal_requests WHERE student_id = v_student_id OR approved_by = v_profile_id;
  ELSE
    DELETE FROM public.student_withdrawal_requests WHERE approved_by = v_profile_id;
  END IF;
  DELETE FROM public.wallets WHERE profile_id = v_profile_id;
  IF v_student_id IS NOT NULL THEN DELETE FROM public.student_wallets WHERE student_id = v_student_id; END IF;
  IF v_partner_id IS NOT NULL THEN DELETE FROM public.partner_wallets WHERE partner_id = v_partner_id; END IF;
  IF v_coach_id IS NOT NULL THEN DELETE FROM public.professional_wallets WHERE professional_coach_id = v_coach_id; END IF;

  -- Remove commissions tied to the profile/student/coach that would otherwise block deletes.
  DELETE FROM public.commissions
   WHERE beneficiary_profile_id = v_profile_id
      OR beneficiary_coach_id = v_coach_id
      OR referred_by_student_id = v_student_id;

  -- Delete transaction chains owned by this student after commissions are gone.
  IF v_student_id IS NOT NULL THEN
    DELETE FROM public.commissions WHERE transaction_id IN (
      SELECT id FROM public.transactions
      WHERE student_id = v_student_id
         OR subscription_id IN (SELECT id FROM public.subscriptions WHERE student_id = v_student_id)
    );
    DELETE FROM public.transactions
     WHERE student_id = v_student_id
        OR subscription_id IN (SELECT id FROM public.subscriptions WHERE student_id = v_student_id);
    DELETE FROM public.subscriptions WHERE student_id = v_student_id;
  END IF;

  -- Generic pass: for restrictive public FKs to this profile/student/coach/partner,
  -- NULL nullable references and DELETE rows whose FK column is required.
  FOR r IN
    SELECT n.nspname AS schema_name,
           c.relname AS table_name,
           a.attname AS column_name,
           a.attnotnull AS not_null,
           cf.relname AS ref_table,
           con.confdeltype
      FROM pg_constraint con
      JOIN pg_class c ON c.oid = con.conrelid
      JOIN pg_namespace n ON n.oid = c.relnamespace
      JOIN pg_class cf ON cf.oid = con.confrelid
      JOIN pg_namespace nf ON nf.oid = cf.relnamespace
      JOIN pg_attribute a ON a.attrelid = c.oid AND a.attnum = con.conkey[1]
     WHERE con.contype = 'f'
       AND nf.nspname = 'public'
       AND cf.relname IN ('profiles','students','coaches','partners')
       AND n.nspname = 'public'
       AND con.confdeltype IN ('a','r')
     ORDER BY CASE cf.relname
                WHEN 'students' THEN 1
                WHEN 'coaches' THEN 2
                WHEN 'partners' THEN 3
                WHEN 'profiles' THEN 4
                ELSE 5
              END,
              a.attnotnull DESC
  LOOP
    v_id := CASE r.ref_table
              WHEN 'profiles' THEN v_profile_id
              WHEN 'students' THEN v_student_id
              WHEN 'coaches' THEN v_coach_id
              WHEN 'partners' THEN v_partner_id
            END;
    IF v_id IS NULL THEN
      CONTINUE;
    END IF;

    BEGIN
      IF r.not_null THEN
        v_sql := format('DELETE FROM %I.%I WHERE %I = $1', r.schema_name, r.table_name, r.column_name);
      ELSE
        v_sql := format('UPDATE %I.%I SET %I = NULL WHERE %I = $1', r.schema_name, r.table_name, r.column_name, r.column_name);
      END IF;
      EXECUTE v_sql USING v_id;
    EXCEPTION WHEN OTHERS THEN
      v_summary := v_summary || jsonb_build_object(r.table_name || '.' || r.column_name, SQLERRM);
    END;
  END LOOP;

  -- Final explicit deletes in dependency order. CASCADE handles child rows already configured for it.
  IF v_partner_id IS NOT NULL THEN DELETE FROM public.partners WHERE id = v_partner_id; END IF;
  IF v_coach_id IS NOT NULL THEN DELETE FROM public.coaches WHERE id = v_coach_id; END IF;
  IF v_student_id IS NOT NULL THEN DELETE FROM public.students WHERE id = v_student_id; END IF;
  DELETE FROM public.wallets WHERE profile_id = v_profile_id;

  RETURN jsonb_build_object('ok', true, 'errors', v_summary);
END;
$$;

REVOKE ALL ON FUNCTION public.admin_purge_user_dependents(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.admin_purge_user_dependents(uuid) TO authenticated, service_role;

CREATE OR REPLACE FUNCTION public.recalc_wallets_for_owner(_profile_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
      ) AS is_released
    FROM public.commissions c
    WHERE c.beneficiary_profile_id = _profile_id
      AND COALESCE(c.is_referral, false) = false
      AND COALESCE(c.slot_label, '') !~* '^(sistema|admin|nutri)'
      AND c.status::text IN ('pending','available','withdrawn','paid')
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
$$;