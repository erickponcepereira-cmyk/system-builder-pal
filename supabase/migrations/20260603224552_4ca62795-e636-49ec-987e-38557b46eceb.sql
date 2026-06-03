ALTER TABLE public.mercadopago_payments
  DROP CONSTRAINT IF EXISTS mercadopago_payments_source_kind_check;

ALTER TABLE public.mercadopago_payments
  ADD CONSTRAINT mercadopago_payments_source_kind_check
  CHECK (source_kind IN ('store_order','transaction','partner_product_order'));

CREATE OR REPLACE FUNCTION public.create_partner_company_order(
  _partner_product_id uuid,
  _student_id uuid DEFAULT NULL,
  _payment_method text DEFAULT 'pix'
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  v_student_id uuid;
  v_student_coach_id uuid;
  v_selling_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid;
  v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric := 20;
  v_fee_pct numeric;
  v_coach_pct numeric := 10; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric;
  v_order_id uuid;
  v_caller_coach_id uuid;
  v_requested_is_own_student boolean := false;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT c.id INTO v_caller_coach_id
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _student_id IS NOT NULL THEN
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s WHERE s.id = _student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;

    SELECT EXISTS (
      SELECT 1
      FROM public.students s
      JOIN public.profiles p ON p.id = s.profile_id
      WHERE s.id = v_student_id AND p.user_id = auth.uid()
    ) INTO v_requested_is_own_student;

    IF v_requested_is_own_student THEN
      v_selling_coach_id := v_student_coach_id;
    ELSIF v_caller_coach_id IS NOT NULL THEN
      IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
        RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
      END IF;
      v_selling_coach_id := v_caller_coach_id;
    ELSE
      RAISE EXCEPTION 'Aluno indicado não pertence ao usuário logado';
    END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
    v_selling_coach_id := v_student_coach_id;
  END IF;

  SELECT pp.id, pp.partner_id, pp.price, pp.status, pp.is_active_by_partner, pp.kind
    INTO v_prod
  FROM public.partner_products pp WHERE pp.id = _partner_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_partner <> true OR v_prod.kind <> 'paid' THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_tax := ROUND(v_gross * 6 / 100, 2);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  INSERT INTO public.partner_product_orders (
    student_id, partner_product_id, partner_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount
  ) VALUES (
    v_student_id, v_prod.id, v_prod.partner_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');

  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.process_partner_product_order_paid(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  o record;
  v_profile uuid;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR o.paid_at IS NOT NULL THEN RETURN; END IF;

  IF o.status <> 'paid' THEN
    UPDATE public.partner_product_orders SET status = 'paid' WHERE id = _order_id;
    o.status := 'paid';
  END IF;

  IF o.system_fee > 0 THEN
    UPDATE public.admin_system_wallet
    SET available_balance = available_balance + o.system_fee,
        total_earned = total_earned + o.system_fee,
        updated_at = now()
    WHERE id = true;
  END IF;

  IF o.selling_coach_id IS NOT NULL AND o.coach_net_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.selling_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.coach_net_amount, o.coach_net_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  IF o.upline_l1_coach_id IS NOT NULL AND o.network_l1_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l1_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l1_amount, o.network_l1_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  IF o.upline_l2_coach_id IS NOT NULL AND o.network_l2_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l2_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l2_amount, o.network_l2_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  IF o.upline_l3_coach_id IS NOT NULL AND o.network_l3_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l3_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l3_amount, o.network_l3_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  IF o.partner_net_amount > 0 THEN
    IF o.professional_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.professional_coach_id;
    ELSIF o.partner_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.partners WHERE id = o.partner_id;
    ELSE
      v_profile := NULL;
    END IF;

    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.partner_net_amount, o.partner_net_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  UPDATE public.partner_product_orders SET paid_at = now() WHERE id = _order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento Mercado Pago aprovado')
  ON CONFLICT DO NOTHING;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.process_partner_product_order_paid(uuid) TO authenticated, service_role;