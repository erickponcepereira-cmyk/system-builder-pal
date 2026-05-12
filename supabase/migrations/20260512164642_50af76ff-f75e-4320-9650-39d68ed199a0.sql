
-- =========================================================
-- Phase 3: Financial Engine integration into payment flow
-- =========================================================

-- 1) Coach points: total + log
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS total_points integer NOT NULL DEFAULT 0;

CREATE TABLE IF NOT EXISTS public.coach_points_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  coach_id uuid NOT NULL REFERENCES public.coaches(id) ON DELETE CASCADE,
  transaction_id uuid REFERENCES public.transactions(id) ON DELETE SET NULL,
  product_id uuid REFERENCES public.products(id) ON DELETE SET NULL,
  points integer NOT NULL,
  reason text,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamp with time zone NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_coach_points_log_coach ON public.coach_points_log(coach_id, created_at DESC);
CREATE INDEX IF NOT EXISTS idx_coach_points_log_tx ON public.coach_points_log(transaction_id);

ALTER TABLE public.coach_points_log ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "coach_points_log_admin_all" ON public.coach_points_log;
CREATE POLICY "coach_points_log_admin_all"
  ON public.coach_points_log
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "coach_points_log_own_select" ON public.coach_points_log;
CREATE POLICY "coach_points_log_own_select"
  ON public.coach_points_log
  FOR SELECT
  USING (
    coach_id IN (
      SELECT c.id FROM public.coaches c
      JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- 2) Helper: resolve a profile id from a slot (redirect_metadata.profile_id)
CREATE OR REPLACE FUNCTION public.slot_target_profile_id(_slot public.product_value_slots)
RETURNS uuid
LANGUAGE sql
STABLE
SET search_path = public
AS $$
  SELECT NULLIF(_slot.redirect_metadata->>'profile_id','')::uuid
$$;

-- 3) Rewrite process_paid_transaction with slot-based engine + points
CREATE OR REPLACE FUNCTION public.process_paid_transaction(_transaction_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  tx RECORD;
  product RECORD;
  student_row RECORD;
  referring_student RECORD;
  coach_row RECORD;
  upline1 RECORD;
  upline2 RECORD;
  upline3 RECORD;
  master_row RECORD;
  admin_profile_id UUID;
  commission_release_days INTEGER := 15;
  app_fee_amount NUMERIC := 0;
  base_distributable NUMERIC := 0;
  slot RECORD;
  slot_amount NUMERIC := 0;
  slot_target UUID;
  slot_count INTEGER := 0;
  system_fee_total NUMERIC := 0;
  computed_points INTEGER := 0;
  beneficiary_profile UUID;
  beneficiary_coach UUID;
  level_idx INTEGER;
  legacy_referral_amount NUMERIC := 0;
  legacy_network_base NUMERIC := 0;
  legacy_commission NUMERIC;
  legacy_level_pct NUMERIC;
  legacy_upline RECORD;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN
    RETURN;
  END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  -- Subscription/digital provisioning (unchanged)
  IF tx.purchase_type = 'challenge' AND tx.subscription_id IS NULL THEN
    INSERT INTO public.subscriptions (student_id, product_id, start_date, end_date, status, payment_method, installments)
    VALUES (
      tx.student_id, tx.product_id, CURRENT_DATE,
      CURRENT_DATE + COALESCE(product.duration_days, 30),
      'active', tx.payment_method, tx.installments
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
  FROM public.app_settings WHERE key = 'commission_release_days';

  -- Reset previous distributions for idempotency
  DELETE FROM public.commissions WHERE transaction_id = _transaction_id;
  DELETE FROM public.product_order_pool_entries WHERE transaction_id = _transaction_id;
  DELETE FROM public.nutritionist_blocked_entries WHERE transaction_id = _transaction_id AND status = 'blocked';
  DELETE FROM public.coach_points_log WHERE transaction_id = _transaction_id;

  -- Resolve seller coach + uplines + master
  SELECT * INTO coach_row FROM public.coaches WHERE id = student_row.coach_id;

  IF coach_row.id IS NOT NULL AND coach_row.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline1 FROM public.coaches WHERE id = coach_row.upline_coach_id;
  END IF;
  IF upline1.id IS NOT NULL AND upline1.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline2 FROM public.coaches WHERE id = upline1.upline_coach_id;
  END IF;
  IF upline2.id IS NOT NULL AND upline2.upline_coach_id IS NOT NULL THEN
    SELECT * INTO upline3 FROM public.coaches WHERE id = upline2.upline_coach_id;
  END IF;

  IF coach_row.id IS NOT NULL THEN
    SELECT * INTO master_row FROM public.master_coaches
    WHERE coach_id = coach_row.id AND status = 'active'
    LIMIT 1;
  END IF;

  -- Default admin profile id (master admin first, then any admin)
  SELECT id INTO admin_profile_id FROM public.profiles
  WHERE role = 'admin' AND COALESCE(is_master_admin, false) = true LIMIT 1;
  IF admin_profile_id IS NULL THEN
    SELECT id INTO admin_profile_id FROM public.profiles WHERE role = 'admin' LIMIT 1;
  END IF;

  -- Count active slots for product
  SELECT COUNT(*) INTO slot_count
  FROM public.product_value_slots
  WHERE product_id = tx.product_id AND is_active = true;

  base_distributable := GREATEST(0, COALESCE(tx.gross_amount,0) - COALESCE(tx.payment_fee,0) - COALESCE(tx.tax_amount,0));

  IF slot_count > 0 THEN
    -- =========================================================
    -- SLOT-BASED DISTRIBUTION
    -- =========================================================
    FOR slot IN
      SELECT * FROM public.product_value_slots
      WHERE product_id = tx.product_id AND is_active = true
      ORDER BY slot_order
    LOOP
      slot_amount := ROUND(
        CASE WHEN slot.value_type = 'fixed'
             THEN slot.value_amount
             ELSE base_distributable * (slot.value_amount / 100.0)
        END, 2);

      IF slot_amount <= 0 THEN
        CONTINUE;
      END IF;

      IF slot.is_system_fee THEN
        system_fee_total := system_fee_total + slot_amount;
      END IF;

      slot_target := public.slot_target_profile_id(slot);

      -- Route by destination
      IF slot.destination = 'coach_wallet' THEN
        IF coach_row.id IS NOT NULL THEN
          INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
          VALUES (_transaction_id, coach_row.profile_id, coach_row.id, 0,
                  CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
                  slot_amount, 'pending', now() + make_interval(days => commission_release_days));
        END IF;

      ELSIF slot.destination = 'network_l1' AND upline1.id IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, upline1.profile_id, upline1.id, 1,
                CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
                slot_amount, 'pending', now() + make_interval(days => commission_release_days));

      ELSIF slot.destination = 'network_l2' AND upline2.id IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, upline2.profile_id, upline2.id, 2,
                CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
                slot_amount, 'pending', now() + make_interval(days => commission_release_days));

      ELSIF slot.destination = 'network_l3' AND upline3.id IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, upline3.profile_id, upline3.id, 3,
                CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
                slot_amount, 'pending', now() + make_interval(days => commission_release_days));

      ELSIF slot.destination = 'master_coach_wallet' AND master_row.id IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at, is_master_coach_commission, master_coach_id)
        SELECT _transaction_id, c.profile_id, c.id, 0,
               CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
               slot_amount, 'pending', now() + make_interval(days => commission_release_days), true, master_row.id
        FROM public.coaches c WHERE c.id = master_row.coach_id;

      ELSIF slot.destination = 'referral_student' AND student_row.referred_by_student_id IS NOT NULL THEN
        SELECT s.*, p.id AS indicator_profile_id INTO referring_student
        FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
        WHERE s.id = student_row.referred_by_student_id;

        IF referring_student.id IS NOT NULL THEN
          INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at, is_referral, referred_by_student_id)
          VALUES (_transaction_id, referring_student.indicator_profile_id, NULL, 0,
                  CASE WHEN slot.value_type='percentage' THEN slot.value_amount ELSE 0 END,
                  slot_amount, 'pending', now() + make_interval(days => commission_release_days),
                  true, referring_student.id);

          INSERT INTO public.student_wallets (student_id, pending_balance, total_earned, updated_at)
          VALUES (referring_student.id, slot_amount, slot_amount, now())
          ON CONFLICT (student_id) DO UPDATE
          SET pending_balance = public.student_wallets.pending_balance + EXCLUDED.pending_balance,
              total_earned = public.student_wallets.total_earned + EXCLUDED.total_earned,
              updated_at = now();
        END IF;

      ELSIF slot.destination = 'admin_wallet' THEN
        beneficiary_profile := COALESCE(slot_target, admin_profile_id);
        IF beneficiary_profile IS NOT NULL THEN
          INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
          VALUES (beneficiary_profile, slot_amount, slot_amount, now())
          ON CONFLICT (profile_id) DO UPDATE
          SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
              total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
              updated_at = now();
        END IF;

      ELSIF slot.destination IN ('nutritionist_wallet','health_pro_wallet') THEN
        IF slot_target IS NOT NULL THEN
          INSERT INTO public.nutritionist_wallets (profile_id) VALUES (slot_target)
          ON CONFLICT (profile_id) DO NOTHING;

          IF slot.is_blocked_until_delivery THEN
            INSERT INTO public.nutritionist_blocked_entries
              (transaction_id, profile_id, student_id, product_id, slot_label, amount, status, reason)
            VALUES (_transaction_id, slot_target, tx.student_id, tx.product_id,
                    slot.label, slot_amount, 'blocked',
                    'Aguardando entrega do protocolo/dieta');

            UPDATE public.nutritionist_wallets
            SET blocked_balance = blocked_balance + slot_amount,
                total_earned = total_earned + slot_amount,
                updated_at = now()
            WHERE profile_id = slot_target;
          ELSE
            UPDATE public.nutritionist_wallets
            SET available_balance = available_balance + slot_amount,
                total_earned = total_earned + slot_amount,
                updated_at = now()
            WHERE profile_id = slot_target;
          END IF;
        END IF;

      ELSIF slot.destination = 'product_order_pool' THEN
        INSERT INTO public.product_order_pool_entries
          (transaction_id, student_id, product_id, slot_label, amount, status)
        VALUES (_transaction_id, tx.student_id, tx.product_id, slot.label, slot_amount, 'pending');

      ELSE
        -- platform_reserve / payment_gateway / government_tax / event_organizer / custom: no wallet credit
        NULL;
      END IF;
    END LOOP;

    -- Coach sales aggregation
    IF coach_row.id IS NOT NULL THEN
      UPDATE public.coaches
      SET total_sales = COALESCE(total_sales, 0) + tx.gross_amount,
          total_active_students = (SELECT COUNT(*) FROM public.students WHERE coach_id = coach_row.id),
          last_activity_at = now()
      WHERE id = coach_row.id;
    END IF;

    -- =========================================================
    -- POINTS: manual override OR auto from system-fee slots
    -- =========================================================
    IF coach_row.id IS NOT NULL THEN
      IF COALESCE(product.points_auto_calculated, true) = false
         AND COALESCE(product.points_per_sale, 0) > 0 THEN
        computed_points := product.points_per_sale;
      ELSE
        computed_points := FLOOR(system_fee_total / 20.0)::INTEGER * 10;
      END IF;

      IF computed_points > 0 THEN
        INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
        VALUES (coach_row.id, _transaction_id, tx.product_id, computed_points,
                'sale',
                jsonb_build_object('system_fee_total', system_fee_total,
                                   'auto', COALESCE(product.points_auto_calculated, true)));

        UPDATE public.coaches
        SET total_points = COALESCE(total_points, 0) + computed_points
        WHERE id = coach_row.id;
      END IF;
    END IF;

  ELSE
    -- =========================================================
    -- LEGACY FALLBACK (no slots configured)
    -- =========================================================
    app_fee_amount := COALESCE(product.app_fee, 0);
    legacy_network_base := GREATEST(0, tx.gross_amount - app_fee_amount);

    IF student_row.referred_by_student_id IS NOT NULL THEN
      SELECT s.*, p.id AS indicator_profile_id INTO referring_student
      FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.id = student_row.referred_by_student_id;

      IF referring_student.id IS NOT NULL THEN
        legacy_referral_amount := ROUND(legacy_network_base * COALESCE(product.referral_commission_percentage, 50) / 100, 2);
        IF legacy_referral_amount > 0 THEN
          INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at, is_referral, referred_by_student_id)
          VALUES (_transaction_id, referring_student.indicator_profile_id, NULL, 0,
                  COALESCE(product.referral_commission_percentage, 50), legacy_referral_amount,
                  'pending', now() + make_interval(days => commission_release_days),
                  true, referring_student.id);

          INSERT INTO public.student_wallets (student_id, pending_balance, total_earned, updated_at)
          VALUES (referring_student.id, legacy_referral_amount, legacy_referral_amount, now())
          ON CONFLICT (student_id) DO UPDATE
          SET pending_balance = public.student_wallets.pending_balance + EXCLUDED.pending_balance,
              total_earned = public.student_wallets.total_earned + EXCLUDED.total_earned,
              updated_at = now();
        END IF;
      END IF;
    END IF;

    legacy_network_base := GREATEST(0, tx.gross_amount - app_fee_amount - legacy_referral_amount - COALESCE(tx.payment_fee, 0) - COALESCE(tx.tax_amount, 0));

    IF coach_row.id IS NOT NULL THEN
      legacy_commission := ROUND(legacy_network_base * COALESCE(product.commission_coach, 0) / 100, 2);
      IF legacy_commission > 0 THEN
        INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
        VALUES (_transaction_id, coach_row.profile_id, coach_row.id, 0, COALESCE(product.commission_coach, 0), legacy_commission, 'pending', now() + make_interval(days => commission_release_days));
      END IF;

      UPDATE public.coaches
      SET total_sales = COALESCE(total_sales, 0) + tx.gross_amount,
          total_active_students = (SELECT COUNT(*) FROM public.students WHERE coach_id = coach_row.id),
          last_activity_at = now()
      WHERE id = coach_row.id;

      legacy_upline := coach_row;
      FOR level_idx IN 1..3 LOOP
        EXIT WHEN legacy_upline.upline_coach_id IS NULL;
        SELECT * INTO legacy_upline FROM public.coaches WHERE id = legacy_upline.upline_coach_id;
        EXIT WHEN legacy_upline.id IS NULL;
        legacy_level_pct := CASE level_idx
          WHEN 1 THEN COALESCE(product.commission_level1, 0)
          WHEN 2 THEN COALESCE(product.commission_level2, 0)
          ELSE COALESCE(product.commission_level3, 0)
        END;
        legacy_commission := ROUND(legacy_network_base * legacy_level_pct / 100, 2);
        IF legacy_commission > 0 THEN
          INSERT INTO public.commissions (transaction_id, beneficiary_profile_id, beneficiary_coach_id, level, percentage, amount, status, available_at)
          VALUES (_transaction_id, legacy_upline.profile_id, legacy_upline.id, level_idx, legacy_level_pct, legacy_commission, 'pending', now() + make_interval(days => commission_release_days));
        END IF;
      END LOOP;

      -- Manual points still apply on legacy path
      IF COALESCE(product.points_auto_calculated, true) = false
         AND COALESCE(product.points_per_sale, 0) > 0 THEN
        INSERT INTO public.coach_points_log (coach_id, transaction_id, product_id, points, reason, metadata)
        VALUES (coach_row.id, _transaction_id, tx.product_id, product.points_per_sale, 'sale',
                jsonb_build_object('legacy', true));
        UPDATE public.coaches
        SET total_points = COALESCE(total_points, 0) + product.points_per_sale
        WHERE id = coach_row.id;
      END IF;
    END IF;
  END IF;
END;
$function$;
