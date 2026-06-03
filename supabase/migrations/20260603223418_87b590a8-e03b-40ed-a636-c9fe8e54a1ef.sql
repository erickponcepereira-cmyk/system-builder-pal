CREATE OR REPLACE FUNCTION public.list_coach_team_clients()
RETURNS TABLE(id uuid, name text, email text, phone text, cpf text, coach_id uuid)
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  SELECT s.id,
         COALESCE(p.name, 'Cliente')::text AS name,
         p.email::text AS email,
         p.phone::text AS phone,
         p.cpf::text AS cpf,
         s.coach_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.coach_id = public.current_coach_id()
  ORDER BY p.name NULLS LAST, p.email NULLS LAST;
$function$;

CREATE OR REPLACE FUNCTION public.create_coach_sale(_client_id uuid, _items jsonb, _payment_method payment_method DEFAULT 'pix'::payment_method, _notes text DEFAULT NULL::text)
RETURNS TABLE(order_id uuid, order_number text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_profile_id uuid;
  current_coach_id uuid;
  client_allowed boolean;
  new_order_id uuid;
  new_order_number text;
  cart_item jsonb;
  item_kind text;
  item_product_id uuid;
  item_title text;
  item_unit_price numeric;
  item_qty integer;
  item_internal_kind text;
  order_subtotal numeric := 0;
BEGIN
  SELECT p.id INTO current_profile_id
  FROM public.profiles p WHERE p.user_id = auth.uid();

  SELECT c.id INTO current_coach_id
  FROM public.coaches c WHERE c.profile_id = current_profile_id;

  IF current_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach não encontrado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.students s
    WHERE s.id = _client_id
      AND (s.coach_id = current_coach_id OR public.is_master_coach(current_coach_id))
  ) INTO client_allowed;

  IF NOT client_allowed THEN
    RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
  END IF;

  INSERT INTO public.store_orders (
    student_id, payment_method, notes, status,
    subtotal, payment_fee, tax_amount, total_amount, metadata
  ) VALUES (
    _client_id, COALESCE(_payment_method, 'pix'), _notes, 'pending',
    0, 0, 0, 0,
    jsonb_build_object('created_by_coach_id', current_coach_id, 'source', 'coach_sale')
  )
  RETURNING store_orders.id, store_orders.order_number
  INTO new_order_id, new_order_number;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    item_kind          := cart_item->>'kind';
    item_product_id    := NULLIF(cart_item->>'productId','')::uuid;
    item_title         := cart_item->>'title';
    item_unit_price    := COALESCE((cart_item->>'unitPrice')::numeric, 0);
    item_qty           := COALESCE((cart_item->>'quantity')::integer, 1);
    item_internal_kind := cart_item->>'itemKind';

    INSERT INTO public.store_order_items (
      order_id, product_kind,
      product_id, digital_product_id, store_product_id,
      title, unit_price, quantity, total_price, metadata
    ) VALUES (
      new_order_id,
      COALESCE(item_kind, 'item'),
      CASE WHEN item_kind IN ('challenge','item') THEN item_product_id END,
      CASE WHEN item_kind = 'digital' THEN item_product_id END,
      CASE WHEN item_kind = 'store'   THEN item_product_id END,
      item_title, item_unit_price, item_qty, item_unit_price * item_qty,
      CASE WHEN item_kind = 'item'
           THEN jsonb_build_object('store_item_id', item_product_id, 'item_kind', COALESCE(item_internal_kind,'digital'))
           ELSE '{}'::jsonb END
    );

    order_subtotal := order_subtotal + (item_unit_price * item_qty);
  END LOOP;

  UPDATE public.store_orders
  SET subtotal = order_subtotal, total_amount = order_subtotal
  WHERE id = new_order_id;

  RETURN QUERY SELECT new_order_id, new_order_number, order_subtotal;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix',
  _buyer_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_selling_coach_id uuid;
  v_student_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid;
  v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric := 20;
  v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric;
  v_order_id uuid;
  v_caller_coach_id uuid;
  v_cross_bonus numeric := 0;
  v_cross_beneficiary uuid := NULL;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT c.id INTO v_caller_coach_id
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _buyer_student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN
      RAISE EXCEPTION 'Apenas coaches podem comprar em nome de outro aluno';
    END IF;

    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s WHERE s.id = _buyer_student_id;

    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
      RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
    END IF;

    v_selling_coach_id := v_caller_coach_id;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
    v_selling_coach_id := v_student_coach_id;
  END IF;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
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
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  IF v_caller_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_prod.coach_id
     AND public.is_master_coach(v_caller_coach_id)
     AND COALESCE(v_student_coach_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_caller_coach_id
  THEN
    v_cross_bonus := ROUND(v_gross * 10 / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_partner_net := ROUND(v_partner_net - v_cross_bonus, 2);
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), NULL);

  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamptz,
  _payment_method text DEFAULT 'pix',
  _buyer_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_prod record;
  v_duration int;
  v_ends_at timestamptz;
  v_student_id uuid;
  v_seller_coach_id uuid;
BEGIN
  SELECT id, coach_id, default_duration_minutes, cancellation_window_hours, is_schedulable
    INTO v_prod
  FROM public.professional_products
  WHERE id = _professional_product_id;

  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF v_prod.is_schedulable <> true THEN RAISE EXCEPTION 'Produto não é agendável'; END IF;

  v_duration := COALESCE(v_prod.default_duration_minutes, 30);
  v_ends_at := _starts_at + make_interval(mins => v_duration);

  IF _starts_at < now() THEN
    RAISE EXCEPTION 'Não é possível agendar no passado';
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.professional_appointments a
    WHERE a.professional_coach_id = v_prod.coach_id
      AND a.status = 'scheduled'
      AND a.starts_at < v_ends_at
      AND a.ends_at > _starts_at
  ) THEN
    RAISE EXCEPTION 'Horário não está mais disponível';
  END IF;

  v_order_id := public.create_partner_product_order(_professional_product_id, _payment_method, _buyer_student_id);

  SELECT student_id, selling_coach_id INTO v_student_id, v_seller_coach_id
  FROM public.partner_product_orders
  WHERE id = v_order_id;

  INSERT INTO public.professional_appointments (
    professional_coach_id, product_id, seller_coach_id, student_id, order_id,
    starts_at, ends_at, cancellation_window_hours
  ) VALUES (
    v_prod.coach_id, v_prod.id, v_seller_coach_id, v_student_id, v_order_id,
    _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24)
  );

  RETURN v_order_id;
END;
$function$;

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

    IF v_caller_coach_id IS NOT NULL THEN
      IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
        RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
      END IF;
      v_selling_coach_id := v_caller_coach_id;
    ELSE
      IF NOT EXISTS (
        SELECT 1 FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
        WHERE s.id = v_student_id AND p.user_id = auth.uid()
      ) THEN
        RAISE EXCEPTION 'Aluno indicado não pertence ao usuário logado';
      END IF;
      v_selling_coach_id := v_student_coach_id;
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

GRANT EXECUTE ON FUNCTION public.list_coach_team_clients() TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, payment_method, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text) TO authenticated;