CREATE OR REPLACE FUNCTION public.create_store_order(
  _items JSONB,
  _payment_method public.payment_method DEFAULT 'pix',
  _shipping JSONB DEFAULT '{}'::jsonb,
  _notes TEXT DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  current_profile_id UUID;
  current_student_id UUID;
  fallback_product_id UUID;
  new_order_id UUID;
  cart_item JSONB;
  cart_kind TEXT;
  source_id UUID;
  product_title TEXT;
  product_price NUMERIC;
  cart_qty INTEGER;
  order_subtotal NUMERIC := 0;
  order_payment_fee NUMERIC := 0;
  order_tax_amount NUMERIC := 0;
  order_total NUMERIC := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT id INTO fallback_product_id FROM public.products WHERE status = 'active' ORDER BY sort_order NULLS LAST, created_at LIMIT 1;
  IF fallback_product_id IS NULL THEN
    RAISE EXCEPTION 'Nenhum produto base disponível para registrar a transação';
  END IF;

  INSERT INTO public.store_orders (student_id, payment_method, shipping_name, shipping_phone, shipping_zip, shipping_address, shipping_city, shipping_state, notes)
  VALUES (
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
    source_id := (cart_item->>'sourceId')::UUID;
    cart_qty := GREATEST(1, COALESCE((cart_item->>'quantity')::INTEGER, 1));
    product_title := NULL;
    product_price := NULL;

    IF cart_kind = 'challenge' THEN
      SELECT name, price INTO product_title, product_price FROM public.products WHERE id = source_id AND status = 'active';
    ELSIF cart_kind = 'digital' THEN
      SELECT title, price INTO product_title, product_price FROM public.digital_products WHERE id = source_id AND status = 'active';
    ELSIF cart_kind = 'store' THEN
      SELECT name, price INTO product_title, product_price FROM public.store_products WHERE id = source_id AND status = 'active' AND COALESCE(stock, 0) >= cart_qty;
    ELSE
      RAISE EXCEPTION 'Tipo de item inválido';
    END IF;

    IF product_title IS NULL OR product_price IS NULL THEN
      RAISE EXCEPTION 'Item indisponível ou sem estoque';
    END IF;

    IF cart_kind = 'store' THEN
      UPDATE public.store_products SET stock = GREATEST(0, COALESCE(stock, 0) - cart_qty) WHERE id = source_id;
    END IF;

    INSERT INTO public.store_order_items (order_id, product_kind, product_id, digital_product_id, store_product_id, title, quantity, unit_price, total_price)
    VALUES (
      new_order_id,
      cart_kind,
      CASE WHEN cart_kind = 'challenge' THEN source_id ELSE NULL END,
      CASE WHEN cart_kind = 'digital' THEN source_id ELSE NULL END,
      CASE WHEN cart_kind = 'store' THEN source_id ELSE NULL END,
      product_title,
      cart_qty,
      product_price,
      product_price * cart_qty
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

  INSERT INTO public.transactions (student_id, product_id, gross_amount, payment_fee, tax_amount, net_amount, payment_method, installments, status, purchase_type, metadata)
  VALUES (current_student_id, fallback_product_id, order_total, order_payment_fee, order_tax_amount, GREATEST(0, order_subtotal - order_payment_fee - order_tax_amount), COALESCE(_payment_method, 'pix'), 1, 'pending', 'store_order', jsonb_build_object('store_order_id', new_order_id));

  RETURN new_order_id;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.create_store_order(JSONB, public.payment_method, JSONB, TEXT) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_store_order(JSONB, public.payment_method, JSONB, TEXT) TO authenticated;