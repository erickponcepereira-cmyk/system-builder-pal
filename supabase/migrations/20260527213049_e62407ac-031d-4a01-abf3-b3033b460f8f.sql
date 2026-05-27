CREATE OR REPLACE FUNCTION public.pay_coach_available(_profile_id UUID, _kind TEXT DEFAULT 'coach', _notes TEXT DEFAULT NULL)
RETURNS NUMERIC
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_admin UUID;
  v_amount NUMERIC := 0;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO v_admin FROM public.profiles WHERE user_id = auth.uid();

  IF _kind = 'network' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'paid'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) > 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
        total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
        updated_at = NOW()
    WHERE profile_id = _profile_id;

  ELSIF _kind = 'system' THEN
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND (
        COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = '')
      );

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'paid'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND (
        COALESCE(slot_label,'') ~* '^(sistema|admin)'
        OR (beneficiary_coach_id IS NULL AND COALESCE(slot_label,'') = '')
      );

  ELSE
    SELECT COALESCE(SUM(amount),0) INTO v_amount
    FROM public.commissions
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    IF v_amount <= 0 THEN RETURN 0; END IF;

    UPDATE public.commissions
    SET status = 'paid'
    WHERE beneficiary_profile_id = _profile_id
      AND status = 'available'
      AND COALESCE(level,0) = 0
      AND COALESCE(slot_label,'') !~* '^(sistema|admin|nutri)';

    UPDATE public.wallets
    SET available_balance = GREATEST(0, COALESCE(available_balance,0) - v_amount),
        total_withdrawn = COALESCE(total_withdrawn,0) + v_amount,
        updated_at = NOW()
    WHERE profile_id = _profile_id;
  END IF;

  INSERT INTO public.withdrawal_requests (profile_id, amount, status, requested_at, approved_at, paid_at, approved_by, notes)
  VALUES (_profile_id, v_amount, 'paid', NOW(), NOW(), NOW(), v_admin,
          COALESCE(_notes,
            CASE
              WHEN _kind='network' THEN 'Baixa rede via painel financeiro'
              WHEN _kind='system' THEN 'Baixa sistema via painel financeiro'
              ELSE 'Baixa coach via painel financeiro'
            END));

  RETURN v_amount;
END;
$$;

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
  v_nut_coach_id UUID;
  v_hbl_coach_id UUID;
  total_distributed NUMERIC := 0;
  remainder_amount NUMERIC := 0;
  v_card_days INTEGER := 0;
  effective_destination TEXT;
  old_nutri RECORD;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

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

  FOR old_nutri IN
    SELECT profile_id, COALESCE(SUM(amount),0) AS amount
    FROM public.nutritionist_blocked_entries
    WHERE transaction_id = _transaction_id AND status = 'blocked'
    GROUP BY profile_id
  LOOP
    UPDATE public.nutritionist_wallets
    SET blocked_balance = GREATEST(0, COALESCE(blocked_balance,0) - old_nutri.amount),
        total_earned = GREATEST(0, COALESCE(total_earned,0) - old_nutri.amount),
        updated_at = NOW()
    WHERE profile_id = old_nutri.profile_id;
  END LOOP;

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;
  DELETE FROM public.product_order_pool_entries WHERE transaction_id = _transaction_id;
  DELETE FROM public.nutritionist_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
  DELETE FROM public.coach_points_log WHERE transaction_id = _transaction_id;

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
    SELECT * INTO master_row FROM public.master_coaches WHERE coach_id = coach_row.id AND status = 'active' LIMIT 1;
  END IF;

  v_hbl_coach_id := NULL;
  IF coach_row.id IS NOT NULL THEN
    v_hbl_coach_id := public.find_hbl_coach_for(coach_row.id);
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles
  WHERE role = 'admin' AND COALESCE(is_master_admin, false) = true LIMIT 1;
  IF admin_profile_id IS NULL THEN
    SELECT id INTO admin_profile_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
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
      effective_destination := slot.destination::TEXT;
      IF effective_destination = 'network_l1' AND slot.label ~* 'linha\s*2' THEN
        effective_destination := 'network_l2';
      ELSIF effective_destination = 'network_l1' AND slot.label ~* 'linha\s*3' THEN
        effective_destination := 'network_l3';
      END IF;

      CASE effective_destination
        WHEN 'admin_wallet' THEN
          beneficiary_profile := admin_profile_id;
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
            v_level := 0;
          END IF;
        WHEN 'network_l2' THEN
          IF upline2_id IS NOT NULL THEN
            beneficiary_profile := upline2.profile_id;
            beneficiary_coach := upline2.id;
            v_level := 2;
          ELSIF coach_row.id IS NOT NULL THEN
            beneficiary_profile := coach_row.profile_id;
            beneficiary_coach := coach_row.id;
            v_level := 0;
          END IF;
        WHEN 'network_l3' THEN
          IF upline3_id IS NOT NULL THEN
            beneficiary_profile := upline3.profile_id;
            beneficiary_coach := upline3.id;
            v_level := 3;
          ELSIF coach_row.id IS NOT NULL THEN
            beneficiary_profile := coach_row.profile_id;
            beneficiary_coach := coach_row.id;
            v_level := 0;
          END IF;
        WHEN 'master_coach_wallet' THEN
          IF master_row.id IS NOT NULL THEN
            SELECT profile_id INTO beneficiary_profile FROM public.coaches WHERE id = master_row.master_coach_id;
          END IF;
        WHEN 'nutritionist_wallet', 'nutritionist_blocked' THEN
          v_nut_coach_id := public.find_nutritionist_for(COALESCE(coach_row.id, NULL));
          IF v_nut_coach_id IS NOT NULL THEN
            SELECT profile_id INTO beneficiary_profile FROM public.coaches WHERE id = v_nut_coach_id;
          END IF;
        ELSE NULL;
      END CASE;

      IF slot.value_type IN ('pct_running','pct_base') THEN
        v_percentage := slot.value_amount;
      END IF;

      IF effective_destination IN ('nutritionist_wallet','nutritionist_blocked') AND beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.nutritionist_blocked_entries (
          transaction_id, profile_id, student_id, product_id, slot_label, amount, status
        ) VALUES (
          _transaction_id, beneficiary_profile, tx.student_id, tx.product_id,
          slot.label, slot_amount, 'blocked'
        );
        UPDATE public.nutritionist_wallets
        SET blocked_balance = COALESCE(blocked_balance, 0) + slot_amount,
            total_earned    = COALESCE(total_earned, 0) + slot_amount,
            updated_at = NOW()
        WHERE profile_id = beneficiary_profile;
        IF NOT FOUND THEN
          INSERT INTO public.nutritionist_wallets (profile_id, blocked_balance, total_earned)
          VALUES (beneficiary_profile, slot_amount, slot_amount)
          ON CONFLICT DO NOTHING;
        END IF;
      ELSIF effective_destination = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries (
          transaction_id, student_id, product_id, slot_label, amount, hbl_fulfiller_coach_id
        ) VALUES (
          _transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount, v_hbl_coach_id
        );
      ELSIF beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.commissions (
          transaction_id, beneficiary_profile_id, beneficiary_coach_id,
          level, percentage, amount, status, available_at, slot_label
        ) VALUES (
          _transaction_id, beneficiary_profile, beneficiary_coach,
          v_level, v_percentage, slot_amount,
          'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
          slot.label
        );
      END IF;
    END LOOP;
  END IF;

  running_balance := GREATEST(0, running_balance - group_total);
  remainder_amount := ROUND(base_distributable - total_distributed, 2);

  IF remainder_amount > 0.01 AND coach_row.id IS NOT NULL THEN
    INSERT INTO public.commissions (
      transaction_id, beneficiary_profile_id, beneficiary_coach_id,
      level, percentage, amount, status, available_at, slot_label
    ) VALUES (
      _transaction_id, coach_row.profile_id, coach_row.id,
      0, NULL, remainder_amount,
      'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
      'Comissão do Vendedor'
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
END;
$$;

REVOKE EXECUTE ON FUNCTION public.release_nutritionist_blocked_entry(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.cancel_nutritionist_blocked_entry(UUID, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.mark_order_pool_entry_status(UUID, public.order_pool_status, TEXT, TEXT) FROM PUBLIC, anon;
REVOKE EXECUTE ON FUNCTION public.pay_coach_available(UUID, TEXT, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.release_nutritionist_blocked_entry(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.cancel_nutritionist_blocked_entry(UUID, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.mark_order_pool_entry_status(UUID, public.order_pool_status, TEXT, TEXT) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.pay_coach_available(UUID, TEXT, TEXT) TO authenticated, service_role;