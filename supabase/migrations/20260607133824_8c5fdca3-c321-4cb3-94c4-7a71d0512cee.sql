CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx RECORD; product RECORD; student_row RECORD;
  coach_row RECORD; upline1 RECORD; upline2 RECORD; upline3 RECORD; master_row RECORD;
  admin_profile_id UUID; commission_release_days INTEGER := 15;
  base_distributable NUMERIC := 0;
  slot RECORD; slot_amount NUMERIC := 0;
  slot_count INTEGER := 0;
  computed_points INTEGER := 0;
  beneficiary_profile UUID; beneficiary_coach UUID;
  running_balance NUMERIC := 0; group_snapshot NUMERIC := 0;
  group_total NUMERIC := 0; current_group SMALLINT := -1;
  v_paid_month DATE;
  upline1_id UUID; upline2_id UUID; upline3_id UUID;
  v_level INTEGER;
  v_percentage NUMERIC(5,2);
  total_distributed NUMERIC := 0;
  remainder_amount NUMERIC := 0;
  v_card_days INTEGER := 0;
  v_buyer_coach_id UUID;
  v_coach_card_days INTEGER := 0;
  v_is_referral BOOLEAN := FALSE;
  v_referrer_profile UUID := NULL;
  v_matching_slots INTEGER := 0;
  v_credit_admin_system BOOLEAN := FALSE;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  v_is_referral := tx.referrer_student_id IS NOT NULL;
  IF v_is_referral THEN
    SELECT profile_id INTO v_referrer_profile FROM public.students WHERE id = tx.referrer_student_id;
  END IF;

  IF tx.purchase_type = 'challenge' AND tx.subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (student_id, product_id, start_date, end_date, status, payment_method, installments)
    VALUES (tx.student_id, tx.product_id, CURRENT_DATE,
      CURRENT_DATE + COALESCE(product.duration_days, 30), 'active', tx.payment_method, tx.installments)
    RETURNING id INTO tx.subscription_id;
    UPDATE public.transactions SET subscription_id = tx.subscription_id WHERE id = _transaction_id;
  END IF;

  IF tx.purchase_type = 'digital' AND tx.digital_product_id IS NOT NULL THEN
    INSERT INTO public.digital_purchases (student_id, digital_product_id, amount_paid, access_url, expires_at)
    SELECT tx.student_id, dp.id, tx.gross_amount, dp.content_url, now() + make_interval(days => COALESCE(dp.access_days, 365))
    FROM public.digital_products dp WHERE dp.id = tx.digital_product_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(value::INTEGER, 15) INTO commission_release_days
  FROM public.app_settings WHERE key = 'commission_release_days';

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;
  DELETE FROM public.product_order_pool_entries WHERE transaction_id = _transaction_id;
  DELETE FROM public.nutritionist_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
  DELETE FROM public.coach_points_log WHERE transaction_id = _transaction_id;
  PERFORM 1 FROM public.admin_system_wallet_entries WHERE transaction_id = _transaction_id AND kind = 'credit';
  IF FOUND THEN
    UPDATE public.admin_system_wallet
    SET available_balance = GREATEST(0, available_balance - (
      SELECT COALESCE(SUM(amount),0) FROM public.admin_system_wallet_entries
      WHERE transaction_id = _transaction_id AND kind = 'credit')),
        total_earned = GREATEST(0, total_earned - (
      SELECT COALESCE(SUM(amount),0) FROM public.admin_system_wallet_entries
      WHERE transaction_id = _transaction_id AND kind = 'credit')),
        updated_at = NOW()
    WHERE id = true;
    DELETE FROM public.admin_system_wallet_entries WHERE transaction_id = _transaction_id;
  END IF;

  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;

  upline1_id := NULL; upline2_id := NULL; upline3_id := NULL;
  IF coach_row.id IS NOT NULL AND coach_row.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline1 FROM public.coaches WHERE id = coach_row.upline_coach_id;
    IF FOUND THEN
      upline1_id := upline1.id;
      IF upline1.upline_coach_id IS NOT NULL THEN
        SELECT * INTO upline2 FROM public.coaches WHERE id = upline1.upline_coach_id;
        IF FOUND THEN
          upline2_id := upline2.id;
          IF upline2.upline_coach_id IS NOT NULL THEN
            SELECT * INTO upline3 FROM public.coaches WHERE id = upline2.upline_coach_id;
            IF FOUND THEN upline3_id := upline3.id; END IF;
          END IF;
        END IF;
      END IF;
    END IF;
  END IF;

  IF coach_row.id IS NOT NULL THEN
    SELECT * INTO master_row FROM public.master_coach_commissions
    WHERE seller_coach_id = coach_row.id AND product_id = tx.product_id
    ORDER BY created_at DESC LIMIT 1;
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles
  WHERE role = 'admin' AND COALESCE(is_master_admin, false) = true LIMIT 1;
  IF admin_profile_id IS NULL THEN
    SELECT id INTO admin_profile_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  END IF;

  IF v_is_referral THEN
    SELECT COUNT(*) INTO v_matching_slots
    FROM public.product_value_slots
    WHERE product_id = tx.product_id AND is_active = true
      AND COALESCE(applies_to_student_referral, false) = true;
  ELSE
    SELECT COUNT(*) INTO v_matching_slots
    FROM public.product_value_slots
    WHERE product_id = tx.product_id AND is_active = true
      AND COALESCE(applies_to_referral_sales, true) = true;
  END IF;

  SELECT COUNT(*) INTO slot_count FROM public.product_value_slots
  WHERE product_id = tx.product_id AND is_active = true;

  base_distributable := GREATEST(0, COALESCE(tx.gross_amount,0) - COALESCE(tx.payment_fee,0) - COALESCE(tx.tax_amount,0));
  running_balance := base_distributable;
  group_snapshot := base_distributable;
  total_distributed := 0;

  IF slot_count > 0 THEN
    FOR slot IN
      SELECT * FROM public.product_value_slots
      WHERE product_id = tx.product_id AND is_active = true
        AND (
          (v_matching_slots = 0)
          OR (v_is_referral AND COALESCE(applies_to_student_referral, false) = true)
          OR (NOT v_is_referral AND COALESCE(applies_to_referral_sales, true) = true)
        )
      ORDER BY slot_order
    LOOP
      IF slot.slot_group IS DISTINCT FROM current_group THEN
        running_balance := GREATEST(0, running_balance - group_total);
        group_snapshot := running_balance;
        group_total := 0;
        current_group := slot.slot_group;
      END IF;

      slot_amount := ROUND(
        CASE slot.value_type
          WHEN 'fixed'       THEN slot.value_amount
          WHEN 'pct_running' THEN group_snapshot * (slot.value_amount / 100.0)
          ELSE base_distributable * (slot.value_amount / 100.0)
        END, 2);

      IF slot_amount <= 0 THEN CONTINUE; END IF;
      group_total := group_total + slot_amount;
      total_distributed := total_distributed + slot_amount;

      beneficiary_profile := NULL;
      beneficiary_coach := NULL;
      v_level := 0;
      v_percentage := 0;
      v_credit_admin_system := FALSE;

      IF slot.destination::text IN ('nutritionist_wallet', 'nutritionist_blocked') THEN
        beneficiary_coach := public.find_nutritionist_for(COALESCE(coach_row.id, NULL));
        IF beneficiary_coach IS NOT NULL THEN
          SELECT profile_id INTO beneficiary_profile FROM public.coaches WHERE id = beneficiary_coach;
        END IF;

        IF beneficiary_profile IS NOT NULL THEN
          INSERT INTO public.nutritionist_blocked_entries (
            transaction_id, profile_id, student_id, product_id, slot_label, amount, status
          ) VALUES (
            _transaction_id, beneficiary_profile, tx.student_id, tx.product_id, slot.label, slot_amount, 'blocked'
          );
          UPDATE public.nutritionist_wallets
          SET blocked_balance = COALESCE(blocked_balance, 0) + slot_amount,
              total_earned = COALESCE(total_earned, 0) + slot_amount,
              updated_at = NOW()
          WHERE profile_id = beneficiary_profile;
          IF NOT FOUND THEN
            INSERT INTO public.nutritionist_wallets (profile_id, blocked_balance, total_earned)
            VALUES (beneficiary_profile, slot_amount, slot_amount)
            ON CONFLICT DO NOTHING;
          END IF;
          CONTINUE;
        ELSE
          v_credit_admin_system := TRUE;
        END IF;
      ELSIF slot.destination::text = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries (
          transaction_id, student_id, product_id, slot_label, amount
        ) VALUES (
          _transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount
        );
        CONTINUE;
      END IF;

      IF NOT v_credit_admin_system THEN
        CASE slot.destination
          WHEN 'admin_wallet' THEN
            v_credit_admin_system := TRUE;
          WHEN 'coach_wallet' THEN
            IF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            END IF;
          WHEN 'network_l1' THEN
            IF upline1_id IS NOT NULL THEN
              beneficiary_profile := upline1.profile_id;
              beneficiary_coach := upline1.id;
              v_level := 1;
            ELSIF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            ELSE
              v_credit_admin_system := TRUE;
            END IF;
          WHEN 'network_l2' THEN
            IF upline2_id IS NOT NULL THEN
              beneficiary_profile := upline2.profile_id;
              beneficiary_coach := upline2.id;
              v_level := 2;
            ELSIF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            ELSE
              v_credit_admin_system := TRUE;
            END IF;
          WHEN 'network_l3' THEN
            IF upline3_id IS NOT NULL THEN
              beneficiary_profile := upline3.profile_id;
              beneficiary_coach := upline3.id;
              v_level := 3;
            ELSIF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            ELSE
              v_credit_admin_system := TRUE;
            END IF;
          WHEN 'master_coach_wallet' THEN
            IF master_row.id IS NOT NULL THEN
              beneficiary_profile := (SELECT profile_id FROM public.coaches WHERE id = master_row.master_coach_id);
              beneficiary_coach := master_row.master_coach_id;
            ELSE
              v_credit_admin_system := TRUE;
            END IF;
          WHEN 'referral_student' THEN
            IF v_referrer_profile IS NOT NULL THEN
              beneficiary_profile := v_referrer_profile;
              beneficiary_coach := NULL;
            ELSE
              v_credit_admin_system := TRUE;
            END IF;
          ELSE
            v_credit_admin_system := TRUE;
        END CASE;
      END IF;

      IF v_credit_admin_system THEN
        INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind)
        VALUES (_transaction_id, slot.label, slot_amount, 'credit');
        UPDATE public.admin_system_wallet
        SET available_balance = available_balance + slot_amount,
            total_earned = total_earned + slot_amount,
            updated_at = NOW()
        WHERE id = true;
        CONTINUE;
      END IF;

      IF beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.commissions (
          transaction_id, beneficiary_profile_id, beneficiary_coach_id,
          level, percentage, amount, status, available_at, slot_label,
          is_referral, referred_by_student_id
        ) VALUES (
          _transaction_id, beneficiary_profile, beneficiary_coach,
          v_level, v_percentage, slot_amount,
          'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
          slot.label,
          v_is_referral, tx.referrer_student_id
        );
      END IF;
    END LOOP;
  END IF;

  remainder_amount := GREATEST(0, base_distributable - total_distributed);
  IF remainder_amount > 0 AND coach_row.id IS NOT NULL THEN
    INSERT INTO public.commissions (
      transaction_id, beneficiary_profile_id, beneficiary_coach_id,
      level, percentage, amount, status, available_at, slot_label,
      is_referral, referred_by_student_id
    ) VALUES (
      _transaction_id, coach_row.profile_id, coach_row.id,
      0, NULL, remainder_amount,
      'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
      'Comissão do Vendedor',
      v_is_referral, tx.referrer_student_id
    );
  END IF;

  computed_points := COALESCE(product.points_per_sale, 0);
  IF computed_points <= 0 THEN computed_points := 1; END IF;

  IF coach_row.id IS NOT NULL THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    VALUES (coach_row.id, _transaction_id, tx.product_id, computed_points, 'sale',
            jsonb_build_object('product_name', product.name, 'gross_amount', tx.gross_amount));

    UPDATE public.coaches
    SET total_points = COALESCE(total_points, 0) + computed_points
    WHERE id = coach_row.id;

    v_paid_month := date_trunc('month', COALESCE(tx.paid_at, NOW()))::DATE;
    PERFORM public.upsert_monthly_ranking_on_sale(
      coach_row.id, computed_points,
      COALESCE(tx.net_amount, tx.gross_amount, 0), v_paid_month
    );

    PERFORM public.update_career_period_plans(coach_row.id, computed_points);
    PERFORM public.update_career_challenge_progress(coach_row.id, computed_points);

    UPDATE public.coaches
    SET total_sales = COALESCE(total_sales, 0) + 1
    WHERE id = coach_row.id;
  END IF;

  v_card_days := COALESCE(product.card_access_days, 0);
  IF v_card_days > 0 AND tx.student_id IS NOT NULL THEN
    PERFORM public.extend_student_card_access(tx.student_id, v_card_days);
  END IF;

  IF product.product_type IN ('coach_training', 'health_pro_course')
     AND student_row.profile_id IS NOT NULL THEN
    SELECT id INTO v_buyer_coach_id FROM public.coaches WHERE profile_id = student_row.profile_id LIMIT 1;
    IF v_buyer_coach_id IS NOT NULL THEN
      v_coach_card_days := COALESCE(NULLIF(product.card_access_days, 0), 365);
      PERFORM public.extend_coach_card_access(v_buyer_coach_id, v_coach_card_days);
    END IF;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.process_paid_transaction(uuid) TO service_role;

CREATE OR REPLACE FUNCTION public.mark_store_order_paid_and_process(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_now timestamptz := now();
  v_tx record;
BEGIN
  UPDATE public.store_orders
  SET status = 'paid'
  WHERE id = _order_id;

  FOR v_tx IN
    SELECT id, status, paid_at
    FROM public.transactions
    WHERE metadata->>'store_order_id' = _order_id::text
  LOOP
    IF v_tx.status IS DISTINCT FROM 'paid' THEN
      UPDATE public.transactions
      SET status = 'paid',
          paid_at = COALESCE(paid_at, v_now)
      WHERE id = v_tx.id;
    ELSIF v_tx.paid_at IS NULL THEN
      UPDATE public.transactions
      SET paid_at = v_now
      WHERE id = v_tx.id;
    END IF;

    PERFORM public.process_paid_transaction(v_tx.id);
  END LOOP;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) TO service_role;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT DISTINCT so.id
    FROM public.store_orders so
    JOIN public.transactions t ON t.metadata->>'store_order_id' = so.id::text
    WHERE so.status = 'paid'
      AND t.status IS DISTINCT FROM 'paid'
  LOOP
    PERFORM public.mark_store_order_paid_and_process(r.id);
  END LOOP;
END;
$$;