CREATE OR REPLACE FUNCTION public.create_store_order(
  _items jsonb,
  _payment_method public.payment_method DEFAULT 'pix'::public.payment_method,
  _shipping jsonb DEFAULT '{}'::jsonb,
  _notes text DEFAULT NULL::text,
  _referrer_student_id uuid DEFAULT NULL::uuid
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
  v_referral_product_enabled boolean := false;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT (_items->0->>'sourceId')::uuid INTO fallback_product_id;
  IF fallback_product_id IS NULL THEN
    RAISE EXCEPTION 'Item do carrinho sem produto válido';
  END IF;

  SELECT COALESCE(pr.is_referral_product, false)
    INTO v_referral_product_enabled
  FROM public.products p
  LEFT JOIN public.product_referral_rules pr ON pr.product_id = p.id
  WHERE p.id = fallback_product_id;

  IF _referrer_student_id IS NOT NULL
     AND _referrer_student_id <> current_student_id
     AND COALESCE(v_referral_product_enabled, false) = true THEN
    PERFORM 1 FROM public.students WHERE id = _referrer_student_id;
    IF FOUND THEN
      v_ref_student_id := _referrer_student_id;
    END IF;
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

REVOKE EXECUTE ON FUNCTION public.create_store_order(jsonb, public.payment_method, jsonb, text, uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(jsonb, public.payment_method, jsonb, text, uuid) TO authenticated, service_role;