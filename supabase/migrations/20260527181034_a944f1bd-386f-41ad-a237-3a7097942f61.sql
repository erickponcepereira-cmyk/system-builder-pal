
ALTER TABLE public.commissions ADD COLUMN IF NOT EXISTS slot_label TEXT;

CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
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
  total_distributed NUMERIC := 0;
  remainder_amount NUMERIC := 0;
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

      CASE slot.destination
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
          ELSE
            IF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            END IF;
          END IF;
        WHEN 'network_l2' THEN
          IF upline2_id IS NOT NULL THEN
            beneficiary_profile := upline2.profile_id;
            beneficiary_coach := upline2.id;
            v_level := 2;
          ELSE
            IF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            END IF;
          END IF;
        WHEN 'network_l3' THEN
          IF upline3_id IS NOT NULL THEN
            beneficiary_profile := upline3.profile_id;
            beneficiary_coach := upline3.id;
            v_level := 3;
          ELSE
            IF coach_row.id IS NOT NULL THEN
              beneficiary_profile := coach_row.profile_id;
              beneficiary_coach := coach_row.id;
            END IF;
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

      IF slot.destination IN ('nutritionist_wallet','nutritionist_blocked') AND beneficiary_profile IS NOT NULL THEN
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
      ELSIF slot.destination = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries (
          transaction_id, student_id, product_id, slot_label, amount
        ) VALUES (
          _transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount
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
  IF computed_points <= 0 THEN
    computed_points := 1;
  END IF;

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
END;
$function$;
