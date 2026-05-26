CREATE OR REPLACE FUNCTION public.create_coach_sale(_client_id uuid, _items jsonb, _payment_method payment_method DEFAULT 'pix'::payment_method, _notes text DEFAULT NULL::text)
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
    SELECT 1 FROM public.students s
    WHERE s.id = _client_id AND s.coach_id = current_coach_id
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