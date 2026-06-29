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
  v_hbl_coach_id UUID;
  total_distributed NUMERIC := 0;
  remainder_amount NUMERIC := 0;
  v_card_days INTEGER := 0;
  effective_destination TEXT;
  old_nutri RECORD;
  old_prof RECORD;
  old_admin_amount NUMERIC := 0;
  referrer_student RECORD;
  referrer_profile_id UUID;
  v_ref_student_id UUID;
  v_is_referral_sale BOOLEAN := false;
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

  -- Limpa execuções anteriores deste tx
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

  FOR old_prof IN
    SELECT profile_id, COALESCE(SUM(amount),0) AS amount
    FROM public.professor_blocked_entries
    WHERE transaction_id = _transaction_id AND status = 'blocked'
    GROUP BY profile_id
  LOOP
    UPDATE public.professor_wallets
    SET blocked_balance = GREATEST(0, COALESCE(blocked_balance,0) - old_prof.amount),
        total_earned = GREATEST(0, COALESCE(total_earned,0) - old_prof.amount),
        updated_at = NOW()
    WHERE profile_id = old_prof.profile_id;
  END LOOP;

  SELECT COALESCE(SUM(amount), 0) INTO old_admin_amount
  FROM public.admin_system_wallet_entries
  WHERE transaction_id = _transaction_id AND kind = 'credit';
  IF old_admin_amount > 0 THEN
    UPDATE public.admin_system_wallet
    SET available_balance = GREATEST(0, available_balance - old_admin_amount),
        total_earned = GREATEST(0, total_earned - old_admin_amount),
        updated_at = NOW()
    WHERE id = true;
    DELETE FROM public.admin_system_wallet_entries
    WHERE transaction_id = _transaction_id AND kind = 'credit';
  END IF;

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;
  DELETE FROM public.product_order_pool_entries WHERE transaction_id = _transaction_id;
  DELETE FROM public.nutritionist_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
  DELETE FROM public.professor_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
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

  -- Indicação por link (per-sale) tem prioridade sobre o indicador permanente do cadastro
  v_ref_student_id := COALESCE(tx.referrer_student_id, student_row.referred_by_student_id);
  IF v_ref_student_id IS NOT NULL AND v_ref_student_id <> tx.student_id THEN
    SELECT s.*, p.id AS indicator_profile_id
      INTO referrer_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.id = v_ref_student_id;
    IF referrer_student.id IS NOT NULL THEN
      v_is_referral_sale := true;
      referrer_profile_id := referrer_student.indicator_profile_id;
    END IF;
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
          -- venda normal: usa slots padrão (applies_to_referral_sales)
          (NOT v_is_referral_sale AND COALESCE(applies_to_referral_sales, true) = true)
          OR
          -- venda por indicação: usa slots marcados para indicação + os que NÃO aplicam à indicação
          (v_is_referral_sale AND (
              COALESCE(applies_to_student_referral, false) = true
              OR COALESCE(applies_to_referral_sales, true) = false
          ))
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

      -- Em venda por indicação: slots marcados para indicação são redirecionados ao aluno indicador (Fitcoin)
      IF v_is_referral_sale AND COALESCE(slot.applies_to_student_referral, false) = true THEN
        INSERT INTO public.commissions (
          transaction_id, beneficiary_profile_id, beneficiary_coach_id,
          level, percentage, amount, status, available_at, slot_label,
          is_referral, referred_by_student_id
        ) VALUES (
          _transaction_id, referrer_profile_id, NULL,
          0,
          CASE WHEN slot.value_type IN ('pct_running','pct_base') THEN slot.value_amount ELSE NULL END,
          slot_amount,
          'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
          slot.label,
          TRUE, referrer_student.id
        );
        CONTINUE;
      END IF;

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
          INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind)
          VALUES (_transaction_id, slot.label, slot_amount, 'credit');
          UPDATE public.admin_system_wallet
          SET available_balance = available_balance + slot_amount,
              total_earned = total_earned + slot_amount,
              updated_at = NOW()
          WHERE id = true;
          CONTINUE;
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
        ELSE
          beneficiary_profile := NULL;
      END CASE;

      IF effective_destination IN ('nutritionist_wallet','nutritionist_blocked') AND beneficiary_profile IS NOT NULL THEN
        INSERT INTO public.nutritionist_blocked_entries
          (transaction_id, profile_id, coach_id, slot_label, amount, kind, reason)
        VALUES (_transaction_id, beneficiary_profile, v_nut_coach_id, slot.label,
                slot_amount, 'credit', 'Comissão de nutricionista');
        UPDATE public.nutritionist_wallets
        SET blocked_balance = COALESCE(blocked_balance,0) + slot_amount,
            total_earned = COALESCE(total_earned,0) + slot_amount,
            updated_at = NOW()
        WHERE profile_id = beneficiary_profile;
      ELSIF effective_destination IN ('nutritionist_wallet','nutritionist_blocked') AND beneficiary_profile IS NULL THEN
        INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind)
        VALUES (_transaction_id, slot.label || ' (nutricionista ausente)', slot_amount, 'credit');
        UPDATE public.admin_system_wallet
        SET available_balance = available_balance + slot_amount,
            total_earned = total_earned + slot_amount,
            updated_at = NOW()
        WHERE id = true;
      ELSIF effective_destination IN ('professor_wallet','professor_blocked') THEN
        INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind)
        VALUES (_transaction_id, slot.label, slot_amount, 'credit');
        UPDATE public.admin_system_wallet
        SET available_balance = available_balance + slot_amount,
            total_earned = total_earned + slot_amount,
            updated_at = NOW()
        WHERE id = true;
      ELSIF effective_destination = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries (
          transaction_id, student_id, product_id, slot_label, amount, hbl_fulfiller_coach_id
        ) VALUES (
          _transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount, v_hbl_coach_id
        );
      ELSIF effective_destination = 'referral_student' THEN
        -- slot dedicado a indicação fora de venda por indicação: ignora
        CONTINUE;
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

  IF remainder_amount > 0.01 AND coach_row.id IS NOT NULL AND NOT v_is_referral_sale THEN
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
      COALESCE(tx.gross_amount, 0), v_paid_month
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
$function$;