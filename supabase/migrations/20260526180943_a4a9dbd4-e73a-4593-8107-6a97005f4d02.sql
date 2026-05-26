
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
    WHERE s.id = _client_id AND s.coach_id = current_coach_id
  ) INTO client_in_team;

  IF NOT client_in_team THEN
    RAISE EXCEPTION 'Aluno não pertence à equipe';
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
