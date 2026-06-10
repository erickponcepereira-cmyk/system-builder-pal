CREATE OR REPLACE FUNCTION public.apply_master_cross_sale_split()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id UUID;
  v_meta JSONB;
  v_seller_coach_id UUID;
  v_seller_profile_id UUID;
  v_pct NUMERIC(6,2);
  v_master_amount NUMERIC(12,2);
  v_new_amount NUMERIC(12,2);
  v_slot_label TEXT;
BEGIN
  IF COALESCE(NEW.is_master_coach_commission, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_referral, false) THEN RETURN NEW; END IF;
  IF NEW.beneficiary_coach_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.level, 0) <> 0 THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;

  v_slot_label := LOWER(COALESCE(NEW.slot_label, ''));
  IF v_slot_label LIKE '%upline%' OR v_slot_label LIKE '%master coach%' THEN
    RETURN NEW;
  END IF;

  SELECT (t.metadata->>'store_order_id')::uuid
    INTO v_order_id
  FROM public.transactions t WHERE t.id = NEW.transaction_id;
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT metadata INTO v_meta FROM public.store_orders WHERE id = v_order_id;
  IF v_meta IS NULL THEN RETURN NEW; END IF;

  v_seller_coach_id := NULLIF(v_meta->'master_cross_sale'->>'seller_coach_id','')::uuid;
  IF v_seller_coach_id IS NULL THEN
    v_seller_coach_id := NULLIF(v_meta->>'created_by_coach_id','')::uuid;
  END IF;

  IF v_seller_coach_id IS NULL OR v_seller_coach_id = NEW.beneficiary_coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_master_coach(v_seller_coach_id) THEN RETURN NEW; END IF;

  SELECT COALESCE(master_coach_commission_pct, 10) INTO v_pct
    FROM public.coaches WHERE id = NEW.beneficiary_coach_id;
  IF v_pct IS NULL THEN v_pct := 10; END IF;
  IF v_pct < 10 THEN v_pct := 10; END IF;
  IF v_pct > 70 THEN v_pct := 70; END IF;

  v_master_amount := ROUND(NEW.amount * (v_pct / 100.0), 2);
  IF v_master_amount <= 0 THEN RETURN NEW; END IF;
  v_new_amount := GREATEST(0, NEW.amount - v_master_amount);

  UPDATE public.commissions SET amount = v_new_amount WHERE id = NEW.id;

  SELECT profile_id INTO v_seller_profile_id FROM public.coaches WHERE id = v_seller_coach_id;
  IF v_seller_profile_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.commissions (
    transaction_id, beneficiary_profile_id, beneficiary_coach_id, level,
    percentage, amount, status, available_at,
    is_master_coach_commission, slot_label
  ) VALUES (
    NEW.transaction_id, v_seller_profile_id, v_seller_coach_id, 0,
    v_pct, v_master_amount, NEW.status, NEW.available_at,
    true, 'Master Coach (cross-sale)'
  );

  RETURN NEW;
END;
$$;

CREATE OR REPLACE FUNCTION public.mark_store_order_paid_and_process(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_now timestamptz := now();
  v_tx record;
  v_order record;
  v_fallback_product_id uuid;
  v_new_tx_id uuid;
  v_has_tx boolean := false;
  v_pix_fee_pct numeric;
  v_card_fee_pct numeric;
  v_fee_pct numeric;
  v_tax_pct numeric;
  v_fee numeric;
  v_tax numeric;
BEGIN
  UPDATE public.store_orders
  SET status = 'paid'
  WHERE id = _order_id;

  SELECT * INTO v_order FROM public.store_orders WHERE id = _order_id;
  IF v_order.id IS NULL THEN RETURN; END IF;

  IF COALESCE(v_order.payment_fee, 0) = 0
     AND COALESCE(v_order.tax_amount, 0) = 0
     AND COALESCE(v_order.total_amount, 0) > 0 THEN
    SELECT pix_fee_percentage, card_fee_percentage
      INTO v_pix_fee_pct, v_card_fee_pct
      FROM public.payment_fee_configs
     WHERE is_default = true AND is_active = true
     ORDER BY created_at DESC
     LIMIT 1;

    v_fee_pct := CASE
      WHEN COALESCE(v_order.payment_method, 'pix') = 'pix' THEN COALESCE(v_pix_fee_pct, 0.99)
      ELSE COALESCE(v_card_fee_pct, 4.98)
    END;

    SELECT COALESCE(NULLIF(value, '')::numeric, 6)
      INTO v_tax_pct
      FROM public.app_settings
     WHERE key = 'product_default_tax'
     LIMIT 1;
    IF v_tax_pct IS NULL THEN v_tax_pct := 6; END IF;

    v_fee := ROUND(COALESCE(v_order.total_amount, 0) * v_fee_pct / 100.0, 2);
    v_tax := ROUND(GREATEST(0, COALESCE(v_order.total_amount, 0) - v_fee) * v_tax_pct / 100.0, 2);

    UPDATE public.store_orders
       SET payment_fee = v_fee,
           tax_amount = v_tax
     WHERE id = _order_id;

    v_order.payment_fee := v_fee;
    v_order.tax_amount := v_tax;
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.transactions WHERE metadata->>'store_order_id' = _order_id::text
  ) INTO v_has_tx;

  IF NOT v_has_tx THEN
    SELECT COALESCE(
      (SELECT product_id FROM public.store_order_items
        WHERE order_id = _order_id AND product_id IS NOT NULL LIMIT 1),
      (SELECT id FROM public.products WHERE price IS NOT NULL ORDER BY created_at LIMIT 1)
    ) INTO v_fallback_product_id;

    IF v_fallback_product_id IS NOT NULL THEN
      INSERT INTO public.transactions (
        student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount,
        payment_method, installments, status, purchase_type, metadata, referrer_student_id,
        paid_at
      ) VALUES (
        v_order.student_id,
        v_fallback_product_id,
        COALESCE(v_order.total_amount, 0),
        COALESCE(v_order.payment_fee, 0),
        COALESCE(v_order.tax_amount, 0),
        GREATEST(0, COALESCE(v_order.total_amount, 0) - COALESCE(v_order.payment_fee, 0) - COALESCE(v_order.tax_amount, 0)),
        COALESCE(v_order.payment_method, 'pix'),
        1,
        'paid',
        'store_order',
        jsonb_build_object('store_order_id', _order_id, 'auto_created_by', 'mark_store_order_paid_and_process') || COALESCE(v_order.metadata, '{}'::jsonb),
        v_order.referrer_student_id,
        v_now
      )
      RETURNING id INTO v_new_tx_id;
    END IF;
  END IF;

  FOR v_tx IN
    SELECT id, status, paid_at
    FROM public.transactions
    WHERE metadata->>'store_order_id' = _order_id::text
  LOOP
    UPDATE public.transactions
       SET payment_fee = COALESCE(v_order.payment_fee, 0),
           tax_amount  = COALESCE(v_order.tax_amount, 0),
           net_amount  = GREATEST(0, COALESCE(gross_amount, 0) - COALESCE(v_order.payment_fee, 0) - COALESCE(v_order.tax_amount, 0)),
           metadata = COALESCE(metadata, '{}'::jsonb) || COALESCE(v_order.metadata, '{}'::jsonb)
     WHERE id = v_tx.id;

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

CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  tx RECORD; product RECORD; student_row RECORD;
  coach_row RECORD; upline1 RECORD; upline2 RECORD; upline3 RECORD; master_row RECORD;
  admin_profile_id UUID;
  commission_release_days INTEGER := 3;
  referral_release_days INTEGER := 7;
  effective_release_days INTEGER := 3;
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
  v_fallback_to_seller BOOLEAN := FALSE;
  v_seen_uplines UUID[] := ARRAY[]::UUID[];
  v_order_id UUID := NULL;
  v_order_meta JSONB := NULL;
  v_created_by_coach_id UUID := NULL;
  v_points_coach_id UUID := NULL;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  BEGIN
    v_order_id := NULLIF(tx.metadata->>'store_order_id','')::uuid;
  EXCEPTION WHEN others THEN
    v_order_id := NULL;
  END;
  IF v_order_id IS NOT NULL THEN
    SELECT metadata INTO v_order_meta FROM public.store_orders WHERE id = v_order_id;
    IF v_order_meta IS NOT NULL THEN
      BEGIN
        v_created_by_coach_id := COALESCE(
          NULLIF(v_order_meta->'master_cross_sale'->>'seller_coach_id','')::uuid,
          NULLIF(v_order_meta->>'created_by_coach_id','')::uuid
        );
      EXCEPTION WHEN others THEN
        v_created_by_coach_id := NULL;
      END;
    END IF;
  END IF;

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

  SELECT COALESCE(value::INTEGER, 3) INTO commission_release_days
    FROM public.app_settings WHERE key = 'commission_release_days';
  SELECT COALESCE(value::INTEGER, 7) INTO referral_release_days
    FROM public.app_settings WHERE key = 'commission_release_referral_days';
  effective_release_days := CASE WHEN v_is_referral THEN referral_release_days ELSE commission_release_days END;

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
  v_points_coach_id := coach_row.id;
  IF v_created_by_coach_id IS NOT NULL
     AND v_created_by_coach_id IS DISTINCT FROM coach_row.id
     AND public.is_master_coach(v_created_by_coach_id) THEN
    v_points_coach_id := v_created_by_coach_id;
  END IF;

  upline1_id := NULL; upline2_id := NULL; upline3_id := NULL;
  IF coach_row.id IS NOT NULL THEN
    v_seen_uplines := ARRAY[coach_row.id];
    IF coach_row.upline_coach_id IS NOT NULL AND NOT (coach_row.upline_coach_id = ANY(v_seen_uplines)) THEN
      SELECT * INTO upline1 FROM public.coaches WHERE id = coach_row.upline_coach_id;
      IF FOUND THEN
        upline1_id := upline1.id;
        v_seen_uplines := v_seen_uplines || upline1.id;
        IF upline1.upline_coach_id IS NOT NULL AND NOT (upline1.upline_coach_id = ANY(v_seen_uplines)) THEN
          SELECT * INTO upline2 FROM public.coaches WHERE id = upline1.upline_coach_id;
          IF FOUND THEN
            upline2_id := upline2.id;
            v_seen_uplines := v_seen_uplines || upline2.id;
            IF upline2.upline_coach_id IS NOT NULL AND NOT (upline2.upline_coach_id = ANY(v_seen_uplines)) THEN
              SELECT * INTO upline3 FROM public.coaches WHERE id = upline2.upline_coach_id;
              IF FOUND THEN upline3_id := upline3.id; END IF;
            END IF;
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
      v_fallback_to_seller := FALSE;

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
              v_fallback_to_seller := TRUE;
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
              v_fallback_to_seller := TRUE;
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
              v_fallback_to_seller := TRUE;
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
          'pending', NOW() + (effective_release_days || ' days')::INTERVAL,
          CASE WHEN v_fallback_to_seller THEN slot.label || ' (sem upline → vendedor)' ELSE slot.label END,
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
      'pending', NOW() + (effective_release_days || ' days')::INTERVAL,
      'Comissão do Vendedor',
      v_is_referral, tx.referrer_student_id
    );
  END IF;

  computed_points := COALESCE(product.points_per_sale, 0);
  IF computed_points <= 0 THEN computed_points := 1; END IF;

  IF v_points_coach_id IS NOT NULL THEN
    INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
    VALUES (v_points_coach_id, _transaction_id, tx.product_id, computed_points, 'sale',
            jsonb_build_object('product_name', product.name, 'gross_amount', tx.gross_amount, 'student_coach_id', coach_row.id, 'created_by_coach_id', v_created_by_coach_id));

    UPDATE public.coaches
    SET total_points = COALESCE(total_points, 0) + computed_points
    WHERE id = v_points_coach_id;

    v_paid_month := date_trunc('month', COALESCE(tx.paid_at, NOW()))::DATE;
    PERFORM public.upsert_monthly_ranking_on_sale(
      v_points_coach_id, computed_points,
      COALESCE(tx.net_amount, tx.gross_amount, 0), v_paid_month
    );

    PERFORM public.update_career_period_plans(v_points_coach_id, computed_points);
    PERFORM public.update_career_challenge_progress(v_points_coach_id, computed_points);

    UPDATE public.coaches
    SET total_sales = COALESCE(total_sales, 0) + 1
    WHERE id = v_points_coach_id;
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

DELETE FROM public.commissions
WHERE COALESCE(is_master_coach_commission, false) = true
  AND COALESCE(amount, 0) <= 0;

DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT id FROM public.store_orders
    WHERE status = 'paid'
    ORDER BY updated_at NULLS LAST, created_at
  LOOP
    PERFORM public.mark_store_order_paid_and_process(r.id);
  END LOOP;
END;
$$;