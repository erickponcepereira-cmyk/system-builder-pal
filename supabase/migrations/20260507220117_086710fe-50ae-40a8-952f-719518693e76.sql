CREATE OR REPLACE FUNCTION public.create_store_order(
  _items jsonb,
  _payment_method payment_method DEFAULT 'pix'::payment_method,
  _shipping jsonb DEFAULT '{}'::jsonb,
  _notes text DEFAULT NULL::text
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
  transaction_product_id uuid;
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
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT id INTO fallback_product_id
  FROM public.products
  WHERE status = 'active'
  ORDER BY sort_order NULLS LAST, created_at
  LIMIT 1;

  INSERT INTO public.store_orders (
    student_id, payment_method, shipping_name, shipping_phone, shipping_zip,
    shipping_address, shipping_city, shipping_state, notes
  ) VALUES (
    current_student_id,
    COALESCE(_payment_method, 'pix'),
    NULLIF(_shipping->>'name', ''),
    NULLIF(_shipping->>'phone', ''),
    NULLIF(_shipping->>'zip', ''),
    NULLIF(_shipping->>'address', ''),
    NULLIF(_shipping->>'city', ''),
    NULLIF(_shipping->>'state', ''),
    _notes
  ) RETURNING id INTO new_order_id;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    cart_kind := cart_item->>'kind';
    source_id := (cart_item->>'sourceId')::uuid;
    cart_qty := GREATEST(1, COALESCE((cart_item->>'quantity')::integer, 1));
    product_title := NULL;
    product_price := NULL;
    item_kind_internal := NULL;

    IF cart_kind = 'challenge' THEN
      SELECT name, price INTO product_title, product_price FROM public.products WHERE id = source_id AND status = 'active';
      transaction_product_id := COALESCE(transaction_product_id, source_id);
    ELSIF cart_kind = 'digital' THEN
      SELECT title, price INTO product_title, product_price FROM public.digital_products WHERE id = source_id AND status = 'active';
    ELSIF cart_kind = 'store' THEN
      SELECT name, price INTO product_title, product_price FROM public.store_products WHERE id = source_id AND status = 'active' AND COALESCE(stock, 0) >= cart_qty;
    ELSIF cart_kind = 'item' THEN
      SELECT name, price, kind INTO product_title, product_price, item_kind_internal FROM public.store_items WHERE id = source_id AND is_active = true;
      IF item_kind_internal = 'physical' AND COALESCE((SELECT stock FROM public.store_items WHERE id = source_id), 0) < cart_qty THEN
        RAISE EXCEPTION 'Item sem estoque';
      END IF;
    ELSE
      RAISE EXCEPTION 'Tipo de item inválido';
    END IF;

    IF product_title IS NULL OR product_price IS NULL THEN
      RAISE EXCEPTION 'Item indisponível ou sem estoque';
    END IF;

    IF cart_kind = 'store' THEN
      UPDATE public.store_products SET stock = GREATEST(0, COALESCE(stock, 0) - cart_qty) WHERE id = source_id;
    ELSIF cart_kind = 'item' AND item_kind_internal = 'physical' THEN
      UPDATE public.store_items SET stock = GREATEST(0, COALESCE(stock, 0) - cart_qty) WHERE id = source_id;
    END IF;

    INSERT INTO public.store_order_items (
      order_id, product_kind, product_id, digital_product_id, store_product_id,
      title, quantity, unit_price, total_price, metadata
    ) VALUES (
      new_order_id,
      cart_kind,
      CASE WHEN cart_kind = 'challenge' THEN source_id ELSE NULL END,
      CASE WHEN cart_kind = 'digital' THEN source_id ELSE NULL END,
      CASE WHEN cart_kind = 'store' THEN source_id ELSE NULL END,
      product_title,
      cart_qty,
      product_price,
      product_price * cart_qty,
      CASE WHEN cart_kind = 'item' THEN jsonb_build_object('store_item_id', source_id, 'item_kind', item_kind_internal) ELSE '{}'::jsonb END
    );

    order_subtotal := order_subtotal + (product_price * cart_qty);
  END LOOP;

  order_payment_fee := ROUND(order_subtotal * CASE COALESCE(_payment_method, 'pix') WHEN 'pix' THEN 0.01 WHEN 'debit_card' THEN 0.0169 ELSE 0.0299 END, 2);
  order_tax_amount := ROUND(order_subtotal * 0.06, 2);
  order_total := order_subtotal + order_payment_fee + order_tax_amount;

  UPDATE public.store_orders
  SET subtotal = order_subtotal,
      payment_fee = order_payment_fee,
      tax_amount = order_tax_amount,
      total_amount = order_total
  WHERE id = new_order_id;

  IF COALESCE(transaction_product_id, fallback_product_id) IS NOT NULL THEN
    INSERT INTO public.transactions (
      student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount,
      payment_method, installments, status, purchase_type, metadata
    ) VALUES (
      current_student_id,
      COALESCE(transaction_product_id, fallback_product_id),
      order_total,
      order_payment_fee,
      order_tax_amount,
      GREATEST(0, order_subtotal - order_payment_fee - order_tax_amount),
      COALESCE(_payment_method, 'pix'),
      1,
      'pending',
      'store_order',
      jsonb_build_object('store_order_id', new_order_id)
    );
  END IF;

  RETURN new_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.list_coach_team_clients()
RETURNS TABLE(id uuid, name text, email text, phone text, coach_id uuid)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
  WITH RECURSIVE team AS (
    SELECT c.id
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
    UNION ALL
    SELECT child.id
    FROM public.coaches child
    JOIN team parent ON child.upline_coach_id = parent.id
    WHERE child.approved_at IS NOT NULL
      AND child.blocked_at IS NULL
  )
  SELECT s.id,
         COALESCE(p.name, 'Cliente')::text AS name,
         p.email::text AS email,
         p.phone::text AS phone,
         s.coach_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE s.coach_id IN (SELECT id FROM team)
  ORDER BY p.name NULLS LAST, p.email NULLS LAST;
$function$;

REVOKE EXECUTE ON FUNCTION public.list_coach_team_clients() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.list_coach_team_clients() TO authenticated;

CREATE OR REPLACE FUNCTION public.create_coach_sale(
  _client_id uuid,
  _items jsonb,
  _payment_method payment_method DEFAULT 'pix'::payment_method,
  _notes text DEFAULT NULL
)
RETURNS TABLE(order_id uuid, order_number text, total numeric)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  current_profile_id uuid;
  current_coach_id uuid;
  client_in_team boolean;
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
  order_payment_fee numeric := 0;
  order_tax_amount numeric := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF current_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  SELECT id INTO current_coach_id FROM public.coaches WHERE profile_id = current_profile_id;
  IF current_coach_id IS NULL THEN RAISE EXCEPTION 'Coach não encontrado'; END IF;

  WITH RECURSIVE team AS (
    SELECT current_coach_id AS id
    UNION ALL
    SELECT child.id
    FROM public.coaches child
    JOIN team parent ON child.upline_coach_id = parent.id
    WHERE child.approved_at IS NOT NULL
      AND child.blocked_at IS NULL
  )
  SELECT EXISTS (
    SELECT 1 FROM public.students s WHERE s.id = _client_id AND s.coach_id IN (SELECT id FROM team)
  ) INTO client_in_team;

  IF NOT client_in_team THEN
    RAISE EXCEPTION 'Aluno não pertence à equipe do coach';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_unit_price := COALESCE((cart_item->>'unitPrice')::numeric, 0);
    item_qty := GREATEST(1, COALESCE((cart_item->>'quantity')::integer, 1));
    order_subtotal := order_subtotal + (item_unit_price * item_qty);
  END LOOP;

  order_payment_fee := ROUND(order_subtotal * CASE COALESCE(_payment_method, 'pix') WHEN 'pix' THEN 0.01 WHEN 'debit_card' THEN 0.0169 ELSE 0.0299 END, 2);
  order_tax_amount := ROUND(order_subtotal * 0.06, 2);

  INSERT INTO public.store_orders (
    student_id, status, payment_method, subtotal, payment_fee, tax_amount, total_amount, notes, metadata
  ) VALUES (
    _client_id,
    'pending',
    COALESCE(_payment_method, 'pix'),
    order_subtotal,
    order_payment_fee,
    order_tax_amount,
    order_subtotal + order_payment_fee + order_tax_amount,
    _notes,
    jsonb_build_object('created_by_coach_id', current_coach_id, 'source', 'coach_sale')
  ) RETURNING id, order_number INTO new_order_id, new_order_number;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_kind := cart_item->>'kind';
    item_product_id := (cart_item->>'productId')::uuid;
    item_title := cart_item->>'title';
    item_unit_price := COALESCE((cart_item->>'unitPrice')::numeric, 0);
    item_qty := GREATEST(1, COALESCE((cart_item->>'quantity')::integer, 1));
    item_internal_kind := cart_item->>'itemKind';

    INSERT INTO public.store_order_items (
      order_id, product_kind, product_id, digital_product_id, store_product_id,
      title, quantity, unit_price, total_price, metadata
    ) VALUES (
      new_order_id,
      item_kind,
      CASE WHEN item_kind = 'challenge' THEN item_product_id END,
      CASE WHEN item_kind = 'digital' THEN item_product_id END,
      CASE WHEN item_kind = 'store' THEN item_product_id END,
      item_title,
      item_qty,
      item_unit_price,
      item_unit_price * item_qty,
      CASE WHEN item_kind = 'item' THEN jsonb_build_object('store_item_id', item_product_id, 'item_kind', COALESCE(item_internal_kind, 'digital')) ELSE '{}'::jsonb END
    );
  END LOOP;

  RETURN QUERY SELECT new_order_id, new_order_number, order_subtotal + order_payment_fee + order_tax_amount;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, payment_method, text) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, payment_method, text) TO authenticated;