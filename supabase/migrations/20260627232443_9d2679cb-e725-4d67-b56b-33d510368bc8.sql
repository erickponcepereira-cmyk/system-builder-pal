
-- 1) Tabela de carteiras de professor (espelho de nutritionist_wallets)
CREATE TABLE IF NOT EXISTS public.professor_wallets (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL UNIQUE REFERENCES public.profiles(id) ON DELETE CASCADE,
  available_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  blocked_balance NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_earned NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_released NUMERIC(12,2) NOT NULL DEFAULT 0,
  total_withdrawn NUMERIC(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_wallets TO authenticated;
GRANT ALL ON public.professor_wallets TO service_role;

ALTER TABLE public.professor_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage professor wallets"
  ON public.professor_wallets FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Professors view their own wallet"
  ON public.professor_wallets FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE TRIGGER professor_wallets_updated_at
  BEFORE UPDATE ON public.professor_wallets
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 2) Lançamentos bloqueados de professor (espelho de nutritionist_blocked_entries)
CREATE TABLE IF NOT EXISTS public.professor_blocked_entries (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  transaction_id UUID REFERENCES public.transactions(id) ON DELETE SET NULL,
  profile_id UUID NOT NULL REFERENCES public.profiles(id) ON DELETE CASCADE,
  student_id UUID REFERENCES public.students(id) ON DELETE SET NULL,
  product_id UUID REFERENCES public.products(id) ON DELETE SET NULL,
  slot_label TEXT,
  amount NUMERIC(12,2) NOT NULL,
  status TEXT NOT NULL DEFAULT 'blocked' CHECK (status IN ('blocked','released','cancelled')),
  reason TEXT,
  notes TEXT,
  released_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_prof_blocked_profile ON public.professor_blocked_entries(profile_id);
CREATE INDEX IF NOT EXISTS idx_prof_blocked_status ON public.professor_blocked_entries(status);
CREATE INDEX IF NOT EXISTS idx_prof_blocked_tx ON public.professor_blocked_entries(transaction_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.professor_blocked_entries TO authenticated;
GRANT ALL ON public.professor_blocked_entries TO service_role;

ALTER TABLE public.professor_blocked_entries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins manage professor blocked entries"
  ON public.professor_blocked_entries FOR ALL
  TO authenticated
  USING (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'))
  WITH CHECK (EXISTS (SELECT 1 FROM public.profiles p WHERE p.id = auth.uid() AND p.role = 'admin'));

CREATE POLICY "Professors view their own blocked entries"
  ON public.professor_blocked_entries FOR SELECT
  TO authenticated
  USING (profile_id = auth.uid());

CREATE TRIGGER professor_blocked_entries_updated_at
  BEFORE UPDATE ON public.professor_blocked_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- 3) RPC: liberar lançamento bloqueado de professor
CREATE OR REPLACE FUNCTION public.release_professor_blocked_entry(_entry_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO e FROM public.professor_blocked_entries WHERE id = _entry_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF e.status <> 'blocked' THEN RAISE EXCEPTION 'Lançamento não está bloqueado'; END IF;

  UPDATE public.professor_blocked_entries
  SET status = 'released',
      released_at = NOW(),
      notes = COALESCE(_notes, notes),
      updated_at = NOW()
  WHERE id = _entry_id;

  UPDATE public.professor_wallets
  SET blocked_balance = GREATEST(0, COALESCE(blocked_balance,0) - e.amount),
      available_balance = COALESCE(available_balance,0) + e.amount,
      total_released = COALESCE(total_released,0) + e.amount,
      updated_at = NOW()
  WHERE profile_id = e.profile_id;
END;
$$;

-- 4) RPC: cancelar lançamento bloqueado de professor
CREATE OR REPLACE FUNCTION public.cancel_professor_blocked_entry(_entry_id UUID, _notes TEXT DEFAULT NULL)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  e RECORD;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM public.profiles WHERE id = auth.uid() AND role = 'admin') THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT * INTO e FROM public.professor_blocked_entries WHERE id = _entry_id FOR UPDATE;
  IF e.id IS NULL THEN RAISE EXCEPTION 'Lançamento não encontrado'; END IF;
  IF e.status <> 'blocked' THEN RAISE EXCEPTION 'Lançamento não está bloqueado'; END IF;

  UPDATE public.professor_blocked_entries
  SET status = 'cancelled',
      notes = COALESCE(_notes, notes),
      updated_at = NOW()
  WHERE id = _entry_id;

  UPDATE public.professor_wallets
  SET blocked_balance = GREATEST(0, COALESCE(blocked_balance,0) - e.amount),
      total_earned = GREATEST(0, COALESCE(total_earned,0) - e.amount),
      updated_at = NOW()
  WHERE profile_id = e.profile_id;
END;
$$;

-- 5) Atualiza process_paid_transaction para suportar destinos professor_wallet / professor_blocked.
--    Por padrão (sem mapeamento automático), professor entra como crédito virtual no admin
--    com slot_label contendo "professor", permitindo atribuição manual posterior — mesmo
--    fluxo da nutricionista quando não há vínculo.
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
  ref_slot RECORD;
  ref_amount NUMERIC := 0;
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

  SELECT COUNT(*) INTO slot_count FROM public.product_value_slots
  WHERE product_id = tx.product_id AND is_active = true AND COALESCE(applies_to_referral_sales, true) = true;

  base_distributable := GREATEST(0, COALESCE(tx.gross_amount,0) - COALESCE(tx.payment_fee,0) - COALESCE(tx.tax_amount,0));
  running_balance := base_distributable;
  group_snapshot := base_distributable;
  total_distributed := 0;

  IF slot_count > 0 THEN
    FOR slot IN
      SELECT * FROM public.product_value_slots
      WHERE product_id = tx.product_id AND is_active = true
        AND COALESCE(applies_to_referral_sales, true) = true
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
        WHEN 'professor_wallet', 'professor_blocked' THEN
          -- Professor: sem resolução automática. Cai como crédito virtual no admin
          -- e fica disponível para atribuição manual (mesmo fluxo da nutricionista sem vínculo).
          beneficiary_profile := NULL;
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
      ELSIF effective_destination IN ('professor_wallet','professor_blocked') THEN
        -- Crédito virtual no admin com slot_label marcado como professor para atribuição manual
        INSERT INTO public.admin_system_wallet_entries (transaction_id, slot_label, amount, kind, notes)
        VALUES (_transaction_id,
                CASE WHEN slot.label ILIKE '%professor%' THEN slot.label ELSE slot.label || ' (professor)' END,
                slot_amount, 'credit',
                'Aguardando atribuição a professor');
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

  IF student_row.referred_by_student_id IS NOT NULL THEN
    SELECT s.*, p.id AS indicator_profile_id
      INTO referrer_student
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE s.id = student_row.referred_by_student_id;

    IF referrer_student.id IS NOT NULL THEN
      referrer_profile_id := referrer_student.indicator_profile_id;

      FOR ref_slot IN
        SELECT * FROM public.product_value_slots
        WHERE product_id = tx.product_id
          AND is_active = true
          AND COALESCE(applies_to_student_referral, false) = true
        ORDER BY slot_order
      LOOP
        ref_amount := ROUND(
          CASE ref_slot.value_type
            WHEN 'fixed' THEN ref_slot.value_amount
            ELSE base_distributable * (ref_slot.value_amount / 100.0)
          END, 2);

        IF ref_amount <= 0 THEN CONTINUE; END IF;

        INSERT INTO public.commissions (
          transaction_id, beneficiary_profile_id, beneficiary_coach_id,
          level, percentage, amount, status, available_at, slot_label,
          is_referral, referred_by_student_id
        ) VALUES (
          _transaction_id, referrer_profile_id, NULL,
          0,
          CASE WHEN ref_slot.value_type IN ('pct_running','pct_base') THEN ref_slot.value_amount ELSE NULL END,
          ref_amount,
          'pending', NOW() + (commission_release_days || ' days')::INTERVAL,
          ref_slot.label,
          TRUE, referrer_student.id
        );
      END LOOP;
    END IF;
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
