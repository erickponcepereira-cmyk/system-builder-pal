CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  tx RECORD;
  product RECORD;
  student_row RECORD;
  referring_student RECORD;
  coach_row RECORD;
  upline_row RECORD;
  commission_release_days INTEGER := 15;
  app_fee_amount NUMERIC := 0;
  referral_base NUMERIC := 0;
  referral_amount NUMERIC := 0;
  network_base NUMERIC := 0;
  commission_amount NUMERIC;
  level_percent NUMERIC;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN
    RETURN;
  END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  IF tx.purchase_type = 'challenge' AND tx.subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (student_id, product_id, start_date, end_date, status, payment_method, installments)
    VALUES (
      tx.student_id,
      tx.product_id,
      CURRENT_DATE,
      CURRENT_DATE + COALESCE(product.duration_days, 30),
      'active',
      tx.payment_method,
      tx.installments
    )
    RETURNING id INTO tx.subscription_id;

    UPDATE public.transactions SET subscription_id = tx.subscription_id WHERE id = _transaction_id;
  END IF;

  IF tx.purchase_type = 'digital' AND tx.digital_product_id IS NOT NULL THEN
    INSERT INTO public.digital_purchases (student_id, digital_product_id, amount_paid, access_url, expires_at)
    SELECT tx.student_id, dp.id, tx.gross_amount, dp.content_url, now() + make_interval(days => COALESCE(dp.access_days, 365))
    FROM public.digital_products dp
    WHERE dp.id = tx.digital_product_id
    ON CONFLICT DO NOTHING;
  END IF;

  SELECT COALESCE(value::INTEGER, 15) INTO commission_release_days
  FROM public.app_settings
  WHERE key = 'commission_release_days';

  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;

  app_fee_amount := COALESCE(product.app_fee, 0);
  referral_base := GREATEST(0, tx.gross_amount - app_fee_amount);

  IF student_row.referred_by_student_id IS NOT NULL THEN
    SELECT s.*, p.id AS indicator_profile_id
    INTO referring_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.id = student_row.referred_by_student_id;

    IF referring_student.id IS NOT NULL THEN
      referral_amount := ROUND(referral_base * COALESCE(product.referral_commission_percentage, 50) / 100, 2);

      IF referral_amount > 0 THEN
        INSERT INTO public.commissions (
          transaction_id,
          beneficiary_profile_id,
          beneficiary_coach_id,
          level,
          percentage,
          amount,
          status,
          available_at,
          is_referral,
          referred_by_student_id
        )
        VALUES (
          _transaction_id,
          referring_student.indicator_profile_id,
          NULL,
          0,
          COALESCE(product.referral_commission_percentage, 50),
          referral_amount,
          'pending',
          now() + make_interval(days => commission_release_days),
          TRUE,
          referring_student.id
        );

        INSERT INTO public.student_wallets (student_id, pending_balance, total_earned, updated_at)
        VALUES (referring_student.id, referral_amount, referral_amount, now())
        ON CONFLICT (student_id) DO UPDATE
        SET pending_balance = public.student_wallets.pending_balance + EXCLUDED.pending_balance,
            total_earned = public.student_wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
      END IF;
    END IF;
  END IF;

  network_base := GREATEST(0, tx.gross_amount - app_fee_amount - referral_amount - COALESCE(tx.payment_fee, 0) - COALESCE(tx.tax_amount, 0));

  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;
  IF coach_row.id IS NOT NULL THEN
    commission_amount := ROUND(network_base * COALESCE(product.commission_coach, 0) / 100, 2);
    IF commission_amount > 0 THEN
      INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
      VALUES (_transaction_id, coach_row.profile_id, coach_row.id, 0, COALESCE(product.commission_coach, 0), commission_amount, 'pending', now() + make_interval(days => commission_release_days));
    END IF;

    UPDATE public.coaches
    SET total_sales = COALESCE(total_sales, 0) + tx.gross_amount,
        total_active_students = (SELECT COUNT(*) FROM public.students WHERE coach_id = coach_row.id),
        last_activity_at = now()
    WHERE id = coach_row.id;

    upline_row := coach_row;
    FOR i IN 1..3 LOOP
      EXIT WHEN upline_row.upline_coach_id IS NULL;
      SELECT * INTO upline_row FROM public.coaches WHERE id = upline_row.upline_coach_id;
      EXIT WHEN upline_row.id IS NULL;
      level_percent := CASE i
        WHEN 1 THEN COALESCE(product.commission_level1, 0)
        WHEN 2 THEN COALESCE(product.commission_level2, 0)
        ELSE COALESCE(product.commission_level3, 0)
      END;
      commission_amount := ROUND(network_base * level_percent / 100, 2);
      IF commission_amount > 0 THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, upline_row.profile_id, upline_row.id, i, level_percent, commission_amount, 'pending', now() + make_interval(days => commission_release_days));
      END IF;
    END LOOP;
  END IF;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.process_paid_transaction(UUID) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.release_available_commissions()
RETURNS INTEGER
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

  INSERT INTO public.wallets (profile_id, available_balance, pending_balance, total_earned, updated_at)
  SELECT beneficiary_profile_id, SUM(amount), 0, SUM(amount), now()
  FROM public.commissions
  WHERE status = 'available'
    AND COALESCE(is_referral, false) = false
  GROUP BY beneficiary_profile_id
  ON CONFLICT (profile_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      pending_balance = (
        SELECT COALESCE(SUM(c.amount), 0)
        FROM public.commissions c
        WHERE c.beneficiary_profile_id = EXCLUDED.profile_id AND c.status = 'pending' AND COALESCE(c.is_referral, false) = false
      ),
      updated_at = now();

  INSERT INTO public.student_wallets (student_id, available_balance, pending_balance, total_earned, updated_at)
  SELECT referred_by_student_id, SUM(amount), 0, SUM(amount), now()
  FROM public.commissions
  WHERE status = 'available'
    AND COALESCE(is_referral, false) = true
    AND referred_by_student_id IS NOT NULL
  GROUP BY referred_by_student_id
  ON CONFLICT (student_id) DO UPDATE
  SET available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      pending_balance = (
        SELECT COALESCE(SUM(c.amount), 0)
        FROM public.commissions c
        WHERE c.referred_by_student_id = EXCLUDED.student_id AND c.status = 'pending' AND COALESCE(c.is_referral, false) = true
      ),
      updated_at = now();

  RETURN changed_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.release_available_commissions() TO authenticated;