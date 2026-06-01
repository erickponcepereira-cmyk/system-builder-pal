-- Adiciona carteirinha (validade) ao coach
ALTER TABLE public.coaches
  ADD COLUMN IF NOT EXISTS card_valid_until TIMESTAMPTZ;

-- Função para estender carteirinha do coach somando dias à validade atual (ou começando agora)
CREATE OR REPLACE FUNCTION public.extend_coach_card_access(
  _coach_id uuid,
  _days integer
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_current TIMESTAMPTZ;
  v_base    TIMESTAMPTZ;
BEGIN
  IF _days IS NULL OR _days <= 0 OR _coach_id IS NULL THEN RETURN; END IF;
  SELECT card_valid_until INTO v_current FROM public.coaches WHERE id = _coach_id;
  v_base := GREATEST(COALESCE(v_current, NOW()), NOW());
  UPDATE public.coaches
  SET card_valid_until = v_base + (_days || ' days')::INTERVAL
  WHERE id = _coach_id;
END;
$function$;

-- Função para o admin definir/limpar a carteirinha manualmente
CREATE OR REPLACE FUNCTION public.admin_set_coach_card_validity(
  _coach_id uuid,
  _valid_until timestamptz
)
 RETURNS void
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Apenas administradores podem alterar a carteirinha do coach';
  END IF;
  UPDATE public.coaches
  SET card_valid_until = _valid_until
  WHERE id = _coach_id;
END;
$function$;

-- Atualiza process_paid_transaction para também estender a carteirinha do coach
-- quando o produto comprado for do tipo 'coach_training' e tiver card_access_days configurado
-- (ou usa 365 como padrão se o produto for coach_training mas sem valor).
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
  v_card_days INTEGER := 0;
  v_buyer_coach_id UUID;
  v_coach_card_days INTEGER := 0;
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
        WHEN 'master_coach' THEN
          IF master_row.id IS NOT NULL THEN
            beneficiary_profile := (SELECT profile_id FROM public.coaches WHERE id = master_row.master_coach_id);
            beneficiary_coach := master_row.master_coach_id;
          ELSE
            beneficiary_profile := admin_profile_id;
          END IF;
        ELSE
          beneficiary_profile := admin_profile_id;
      END CASE;

      IF beneficiary_profile IS NOT NULL THEN
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

  remainder_amount := GREATEST(0, base_distributable - total_distributed);
  IF remainder_amount > 0 AND coach_row.id IS NOT NULL THEN
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

  -- Estende validade da carteirinha do aluno (já existente)
  v_card_days := COALESCE(product.card_access_days, 0);
  IF v_card_days > 0 AND tx.student_id IS NOT NULL THEN
    PERFORM public.extend_student_card_access(tx.student_id, v_card_days);
  END IF;

  -- NOVO: Estende validade da carteirinha do COACH quando o produto é um curso de coach.
  -- O comprador (aluno) pode ser ele próprio um coach: localizamos pelo profile_id.
  IF product.product_type IN ('coach_training', 'health_pro_course')
     AND student_row.profile_id IS NOT NULL THEN
    SELECT id INTO v_buyer_coach_id FROM public.coaches WHERE profile_id = student_row.profile_id LIMIT 1;
    IF v_buyer_coach_id IS NOT NULL THEN
      v_coach_card_days := COALESCE(NULLIF(product.card_access_days, 0), 365);
      PERFORM public.extend_coach_card_access(v_buyer_coach_id, v_coach_card_days);
    END IF;
  END IF;
END;
$function$;