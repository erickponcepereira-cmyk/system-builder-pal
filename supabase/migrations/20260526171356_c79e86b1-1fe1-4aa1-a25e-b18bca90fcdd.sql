CREATE OR REPLACE FUNCTION public.create_store_order(
  _items jsonb,
  _payment_method payment_method DEFAULT 'pix'::payment_method,
  _shipping jsonb DEFAULT '{}'::jsonb,
  _notes text DEFAULT NULL
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
  WHERE status = 'active' AND kind IS NULL
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
  )
  RETURNING id INTO new_order_id;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    cart_kind := cart_item->>'kind';
    source_id := (cart_item->>'sourceId')::uuid;
    cart_qty  := COALESCE((cart_item->>'quantity')::integer, 1);

    IF cart_kind = 'plan' THEN
      SELECT name, price INTO product_title, product_price
      FROM public.products WHERE id = source_id;
      item_kind_internal := 'plan';
    ELSE
      SELECT name, price INTO product_title, product_price
      FROM public.products WHERE id = source_id;
      item_kind_internal := CASE WHEN (SELECT stock FROM public.products WHERE id = source_id) IS NULL
                                 THEN 'digital' ELSE 'physical' END;
    END IF;

    INSERT INTO public.store_order_items (
      order_id, product_id, title, unit_price, quantity, total_price, kind
    ) VALUES (
      new_order_id, source_id, product_title,
      product_price, cart_qty, product_price * cart_qty,
      item_kind_internal
    );

    order_subtotal := order_subtotal + (product_price * cart_qty);
  END LOOP;

  order_total := order_subtotal;

  UPDATE public.store_orders
  SET
    subtotal     = order_subtotal,
    payment_fee  = order_payment_fee,
    tax_amount   = order_tax_amount,
    total_amount = order_total
  WHERE id = new_order_id;

  INSERT INTO public.transactions (
    student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount,
    payment_method, installments, status, purchase_type, metadata
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
    jsonb_build_object('store_order_id', new_order_id)
  );

  RETURN new_order_id;
END;
$function$;

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
  SELECT p.id INTO current_profile_id
  FROM public.profiles p
  WHERE p.user_id = auth.uid();

  SELECT c.id INTO current_coach_id
  FROM public.coaches c
  WHERE c.profile_id = current_profile_id;

  IF current_coach_id IS NULL THEN
    RAISE EXCEPTION 'Coach não encontrado';
  END IF;

  SELECT EXISTS (
    SELECT 1 FROM public.coach_students cs
    WHERE cs.coach_id = current_coach_id AND cs.student_id = _client_id
  ) INTO client_in_team;

  IF NOT client_in_team THEN
    RAISE EXCEPTION 'Aluno não pertence à equipe';
  END IF;

  INSERT INTO public.store_orders (
    student_id, payment_method, notes
  ) VALUES (
    _client_id, COALESCE(_payment_method, 'pix'), _notes
  )
  RETURNING store_orders.id, store_orders.order_number
  INTO new_order_id, new_order_number;

  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items)
  LOOP
    item_kind        := cart_item->>'kind';
    item_product_id  := (cart_item->>'productId')::uuid;
    item_title       := cart_item->>'title';
    item_unit_price  := (cart_item->>'unitPrice')::numeric;
    item_qty         := COALESCE((cart_item->>'quantity')::integer, 1);
    item_internal_kind := COALESCE(cart_item->>'itemKind', 'digital');

    INSERT INTO public.store_order_items (
      order_id, product_id, title, unit_price, quantity, total_price, kind
    ) VALUES (
      new_order_id, item_product_id, item_title,
      item_unit_price, item_qty, item_unit_price * item_qty,
      item_internal_kind
    );

    order_subtotal := order_subtotal + (item_unit_price * item_qty);
  END LOOP;

  UPDATE public.store_orders
  SET
    subtotal     = order_subtotal,
    payment_fee  = order_payment_fee,
    tax_amount   = order_tax_amount,
    total_amount = order_subtotal
  WHERE id = new_order_id;

  RETURN QUERY
  SELECT new_order_id, new_order_number, order_subtotal;
END;
$function$;

REVOKE EXECUTE ON FUNCTION public.create_store_order(jsonb, public.payment_method, jsonb, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_store_order(jsonb, public.payment_method, jsonb, text) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, public.payment_method, text) FROM PUBLIC, anon;
GRANT  EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, public.payment_method, text) TO authenticated;