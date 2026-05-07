-- Função para coach criar venda para um aluno da sua equipe
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
AS $$
DECLARE
  current_profile_id UUID;
  current_coach_id UUID;
  client_coach_id UUID;
  new_order_id UUID;
  new_order_number TEXT;
  cart_item JSONB;
  item_kind TEXT;
  item_product_id UUID;
  item_title TEXT;
  item_unit_price NUMERIC;
  item_qty INTEGER;
  order_subtotal NUMERIC := 0;
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  IF current_profile_id IS NULL THEN RAISE EXCEPTION 'Perfil não encontrado'; END IF;

  SELECT id INTO current_coach_id FROM public.coaches WHERE profile_id = current_profile_id;
  IF current_coach_id IS NULL THEN RAISE EXCEPTION 'Coach não encontrado'; END IF;

  SELECT coach_id INTO client_coach_id FROM public.students WHERE id = _client_id;
  IF client_coach_id IS NULL OR client_coach_id <> current_coach_id THEN
    RAISE EXCEPTION 'Aluno não pertence ao coach';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  -- Calcula subtotal
  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_unit_price := COALESCE((cart_item->>'unitPrice')::numeric, 0);
    item_qty := COALESCE((cart_item->>'quantity')::integer, 1);
    order_subtotal := order_subtotal + (item_unit_price * item_qty);
  END LOOP;

  -- Cria pedido
  INSERT INTO public.store_orders (
    student_id, status, payment_method, subtotal, payment_fee, tax_amount, total_amount, notes, metadata
  ) VALUES (
    _client_id, 'pending'::order_status, _payment_method, order_subtotal, 0, 0, order_subtotal, _notes,
    jsonb_build_object('created_by_coach_id', current_coach_id, 'source', 'coach_sale')
  ) RETURNING id, order_number INTO new_order_id, new_order_number;

  -- Insere itens
  FOR cart_item IN SELECT * FROM jsonb_array_elements(_items) LOOP
    item_kind := cart_item->>'kind';
    item_product_id := (cart_item->>'productId')::uuid;
    item_title := cart_item->>'title';
    item_unit_price := COALESCE((cart_item->>'unitPrice')::numeric, 0);
    item_qty := COALESCE((cart_item->>'quantity')::integer, 1);

    INSERT INTO public.store_order_items (
      order_id, product_kind, product_id, digital_product_id, store_product_id,
      title, quantity, unit_price, total_price
    ) VALUES (
      new_order_id, item_kind,
      CASE WHEN item_kind = 'challenge' THEN item_product_id END,
      CASE WHEN item_kind = 'digital' THEN item_product_id END,
      CASE WHEN item_kind = 'store' THEN item_product_id END,
      item_title, item_qty, item_unit_price, item_unit_price * item_qty
    );
  END LOOP;

  RETURN QUERY SELECT new_order_id, new_order_number, order_subtotal;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_coach_sale(uuid, jsonb, payment_method, text) TO authenticated;