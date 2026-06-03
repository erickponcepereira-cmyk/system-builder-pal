-- ============================================================
-- 1) create_store_order: accept optional referrer_student_id
-- ============================================================
DROP FUNCTION IF EXISTS public.create_store_order(jsonb, payment_method, jsonb, text);

CREATE OR REPLACE FUNCTION public.create_store_order(
  _items jsonb,
  _payment_method payment_method DEFAULT 'pix'::payment_method,
  _shipping jsonb DEFAULT '{}'::jsonb,
  _notes text DEFAULT NULL::text,
  _referrer_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_profile_id uuid;
  current_student_id uuid;
  fallback_product_id uuid;
  new_order_id uuid;
  cart_item jsonb;
  cart_kind text;
  source_id uuid;
  product_title text;
  product_price numeric;
  cart_qty integer;
  item_kind_internal text;
  order_subtotal numeric := 0;
  order_payment_fee numeric := 0;
  order_tax_amount numeric := 0;
  order_total numeric := 0;
  v_ref_student_id uuid := NULL;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  -- Valida indicador (não pode ser o próprio comprador)
  IF _referrer_student_id IS NOT NULL AND _referrer_student_id <> current_student_id THEN
    PERFORM 1 FROM public.students WHERE id = _referrer_student_id;
    IF FOUND THEN
      v_ref_student_id := _referrer_student_id;
    END IF;
  END IF;

  SELECT (_items->0->>'sourceId')::uuid INTO fallback_product_id;
  IF fallback_product_id IS NULL THEN
    RAISE EXCEPTION 'Item do carrinho sem produto válido';
  END IF;

  INSERT INTO public.store_orders (
    student_id, payment_method, shipping_name, shipping_phone, shipping_zip,
    shipping_address, shipping_city, shipping_state, notes, referrer_student_id
  ) VALUES (
    current_student_id,
    COALESCE(_payment_method, 'pix'),
    NULLIF(_shipping->>'name', ''),
    NULLIF(_shipping->>'phone', ''),
    NULLIF(_shipping->>'zip', ''),
    NULLIF(_shipping->>'address', ''),
    NULLIF(_shipping->>'city', ''),
    NULLIF(_shipping->>'state', ''),
    _notes,
    v_ref_student_id
  )
  RETURNING id INTO new_order_id;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    cart_kind := cart_item->>'kind';
    source_id := (cart_item->>'sourceId')::uuid;
    cart_qty  := COALESCE((cart_item->>'quantity')::integer, 1);

    SELECT name, price INTO product_title, product_price
    FROM public.products WHERE id = source_id;

    IF product_title IS NULL THEN
      RAISE EXCEPTION 'Produto % não encontrado', source_id;
    END IF;

    IF cart_kind = 'plan' THEN
      item_kind_internal := 'plan';
    ELSE
      item_kind_internal := CASE WHEN (SELECT stock FROM public.products WHERE id = source_id) IS NULL
                                 THEN 'digital' ELSE 'physical' END;
    END IF;

    INSERT INTO public.store_order_items (
      order_id, product_id, title, unit_price, quantity, total_price, product_kind
    ) VALUES (
      new_order_id, source_id, product_title,
      product_price, cart_qty, product_price * cart_qty,
      item_kind_internal
    );

    order_subtotal := order_subtotal + (product_price * cart_qty);
  END LOOP;

  order_total := order_subtotal;

  UPDATE public.store_orders
  SET subtotal = order_subtotal,
      payment_fee = order_payment_fee,
      tax_amount = order_tax_amount,
      total_amount = order_total
  WHERE id = new_order_id;

  INSERT INTO public.transactions (
    student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount,
    payment_method, installments, status, purchase_type, metadata, referrer_student_id
  ) VALUES (
    current_student_id,
    fallback_product_id,
    order_total,
    order_payment_fee,
    order_tax_amount,
    order_total,
    COALESCE(_payment_method, 'pix'),
    1,
    'pending',
    'store_order',
    jsonb_build_object('store_order_id', new_order_id),
    v_ref_student_id
  );

  RETURN new_order_id;
END;
$function$;

-- ============================================================
-- 2) process_paid_transaction: referral-aware slot filtering
--    + commissions.is_referral / referred_by_student_id
--    + new destination 'referral_student'
-- ============================================================
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
  v_is_referral BOOLEAN := FALSE;
  v_referrer_profile UUID := NULL;
  v_matching_slots INTEGER := 0;
BEGIN
  SELECT * INTO tx FROM public.transactions WHERE id = _transaction_id;
  IF tx.id IS NULL OR tx.status <> 'paid' THEN RETURN; END IF;

  SELECT * INTO product FROM public.products WHERE id = tx.product_id;
  SELECT * INTO student_row FROM public.students WHERE id = tx.student_id;

  -- Detecta venda por indicação aluno→aluno
  v_is_referral := tx.referrer_student_id IS NOT NULL;
  IF v_is_referral THEN
    SELECT profile_id INTO v_referrer_profile
    FROM public.students WHERE id = tx.referrer_student_id;
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

  -- Conta slots elegíveis no modo correto (referral vs normal).
  -- Se houver slots marcados no modo correspondente, usa só esses.
  -- Caso contrário, faz fallback para todos os slots ativos (compat).
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
          -- Filtra conforme modo. Fallback: se nenhum slot marcado, considera todos.
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
        WHEN 'referral_student' THEN
          -- Beneficiário: o aluno indicador. Sem coach atrelado.
          IF v_referrer_profile IS NOT NULL THEN
            beneficiary_profile := v_referrer_profile;
            beneficiary_coach := NULL;
          ELSE
            -- Sem indicador: redireciona para admin
            beneficiary_profile := admin_profile_id;
          END IF;
        ELSE
          beneficiary_profile := admin_profile_id;
      END CASE;

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
$function$;