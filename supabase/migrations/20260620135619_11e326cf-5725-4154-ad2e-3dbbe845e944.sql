-- Ensure commission release settings are fixed at 7 days
INSERT INTO public.app_settings (key, value, description, updated_at)
VALUES
  ('commission_release_days', '7', 'Dias para liberação de comissões após a venda paga', now()),
  ('commission_release_referral_days', '7', 'Dias para liberação de comissões de indicação após a venda paga', now())
ON CONFLICT (key) DO UPDATE
SET value = EXCLUDED.value,
    description = COALESCE(public.app_settings.description, EXCLUDED.description),
    updated_at = now();

-- Recreate paid transaction processing so commission dates are based on the real payment timestamp, not the reprocessing timestamp
CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx RECORD; product RECORD; student_row RECORD;
  coach_row RECORD; upline1 RECORD; upline2 RECORD; upline3 RECORD; master_row RECORD;
  admin_profile_id UUID;
  commission_release_days INTEGER := 7;
  referral_release_days INTEGER := 7;
  effective_release_days INTEGER := 7;
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
  v_prev_points_total INTEGER := 0;
  v_prev_points_coach UUID := NULL;
  v_commission_base_at TIMESTAMPTZ;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  v_commission_base_at := COALESCE(tx.paid_at, tx.created_at, now());

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

  SELECT COALESCE((SELECT value::INTEGER FROM public.app_settings WHERE key = 'commission_release_days'), 7)
    INTO commission_release_days;
  SELECT COALESCE((SELECT value::INTEGER FROM public.app_settings WHERE key = 'commission_release_referral_days'), 7)
    INTO referral_release_days;
  effective_release_days := COALESCE(CASE WHEN v_is_referral THEN referral_release_days ELSE commission_release_days END, 7);

  -- Idempotency: undo previously-added points/sales for this tx before re-running
  SELECT coach_id, COALESCE(SUM(points),0) INTO v_prev_points_coach, v_prev_points_total
  FROM public.coach_points_log WHERE transaction_id = _transaction_id GROUP BY coach_id LIMIT 1;
  IF v_prev_points_coach IS NOT NULL THEN
    UPDATE public.coaches
    SET total_points = GREATEST(0, COALESCE(total_points,0) - v_prev_points_total),
        total_sales = GREATEST(0, COALESCE(total_sales,0) - 1)
    WHERE id = v_prev_points_coach;
  END IF;

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

  -- O vendedor é SEMPRE o coach direto do aluno (students.coach_id).
  -- Mesmo que o comprador também tenha registro de coach, a comissão de venda
  -- pertence ao coach que atende o aluno, e a cadeia de upline sobe a partir dele.
  IF student_row.coach_id IS NOT NULL THEN
    SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;
  END IF;

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
          is_referral, referred_by_student_id, created_at
        ) VALUES (
          _transaction_id, beneficiary_profile, beneficiary_coach,
          v_level, v_percentage, slot_amount,
          'pending', v_commission_base_at + (effective_release_days || ' days')::INTERVAL,
          CASE WHEN v_fallback_to_seller THEN slot.label || ' (sem upline → vendedor)' ELSE slot.label END,
          v_is_referral, tx.referrer_student_id, v_commission_base_at
        );
      END IF;
    END LOOP;
  END IF;

  remainder_amount := GREATEST(0, base_distributable - total_distributed);
  IF remainder_amount > 0 AND coach_row.id IS NOT NULL THEN
    INSERT INTO public.commissions (
      transaction_id, beneficiary_profile_id, beneficiary_coach_id,
      level, percentage, amount, status, available_at, slot_label,
      is_referral, referred_by_student_id, created_at
    ) VALUES (
      _transaction_id, coach_row.profile_id, coach_row.id,
      0, NULL, remainder_amount,
      'pending', v_commission_base_at + (effective_release_days || ' days')::INTERVAL,
      'Comissão do Vendedor',
      v_is_referral, tx.referrer_student_id, v_commission_base_at
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

-- Keep referral-to-Fitcoin trigger on a valid commission status
CREATE OR REPLACE FUNCTION public.commissions_redirect_to_fitcoin_before()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF COALESCE(NEW.is_referral, false) = true AND NEW.referred_by_student_id IS NOT NULL THEN
    NEW.status := 'available';
    NEW.available_at := COALESCE(NEW.available_at, now());
    NEW.fitcoin_credited := TRUE;
  END IF;
  RETURN NEW;
END;
$$;

-- Correct existing commission timestamps and release dates using the original paid transaction time
UPDATE public.commissions c
SET created_at = COALESCE(t.paid_at, t.created_at, c.created_at),
    available_at = COALESCE(t.paid_at, t.created_at, c.created_at) + INTERVAL '7 days'
FROM public.transactions t
WHERE c.transaction_id = t.id
  AND c.status IN ('pending', 'available')
  AND COALESCE(c.is_referral, false) = false;

-- Release everything whose corrected 7-day date has already passed
UPDATE public.commissions
SET status = 'available'
WHERE status = 'pending'
  AND COALESCE(is_referral, false) = false
  AND available_at IS NOT NULL
  AND available_at <= now();

-- Recreate wallet recalculation for valid commission statuses
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
    COALESCE(SUM(amount) FILTER (WHERE status::text IN ('pending', 'available', 'withdrawn')), 0)
  INTO v_pending, v_available, v_total_earned
  FROM public.commissions
  WHERE beneficiary_profile_id = _profile_id
    AND COALESCE(is_referral, false) = false
    AND COALESCE(slot_label, '') !~* '^(sistema|admin|nutri)';

  INSERT INTO public.wallets (profile_id, pending_balance, available_balance, total_earned, updated_at)
  VALUES (_profile_id, v_pending, v_available, v_total_earned, now())
  ON CONFLICT (profile_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = GREATEST(0, EXCLUDED.available_balance - COALESCE(public.wallets.total_withdrawn, 0)),
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$$;

-- Recreate the release function so wallet totals never depend on stale pending rows
CREATE OR REPLACE FUNCTION public.release_available_commissions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count INTEGER;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.commissions
  SET status = 'available'
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now();
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  PERFORM public.recalc_wallet_for_profile(c.beneficiary_profile_id)
  FROM (
    SELECT DISTINCT beneficiary_profile_id
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
      AND COALESCE(is_referral, false) = false
  ) c;

  PERFORM public.recalc_student_wallet_for_referral(s.referred_by_student_id)
  FROM (
    SELECT DISTINCT referred_by_student_id
    FROM public.commissions
    WHERE referred_by_student_id IS NOT NULL
      AND COALESCE(is_referral, false) = true
  ) s;

  RETURN changed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_available_commissions() TO authenticated;

-- Recalculate current coach wallets immediately after the correction
DO $$
DECLARE
  r RECORD;
BEGIN
  FOR r IN
    SELECT DISTINCT beneficiary_profile_id AS profile_id
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
      AND COALESCE(is_referral, false) = false
  LOOP
    PERFORM public.recalc_wallet_for_profile(r.profile_id);
  END LOOP;
END $$;