begin;

create or replace function public.create_store_order(
  _items jsonb,
  _payment_method public.payment_method default 'pix'::public.payment_method,
  _shipping jsonb default '{}'::jsonb,
  _notes text default null,
  _referrer_student_id uuid default null
)
returns uuid
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
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
  v_is_digital boolean;                 -- NOVO
  v_digital_id uuid;                    -- NOVO
BEGIN
  SELECT id INTO current_profile_id FROM public.profiles WHERE user_id = auth.uid();
  SELECT id INTO current_student_id FROM public.students WHERE profile_id = current_profile_id;
  IF current_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  IF jsonb_typeof(_items) <> 'array' OR jsonb_array_length(_items) = 0 THEN
    RAISE EXCEPTION 'Carrinho vazio';
  END IF;

  SELECT (i->>'sourceId')::uuid INTO fallback_product_id
    FROM jsonb_array_elements(_items) i
   WHERE exists (select 1 from public.products p where p.id = (i->>'sourceId')::uuid)
   LIMIT 1;

  IF fallback_product_id IS NULL THEN
    SELECT id INTO fallback_product_id
      FROM public.products
     WHERE status = 'active'
     ORDER BY sort_order NULLS LAST, id
     LIMIT 1;
  END IF;

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

    v_is_digital := (cart_kind = 'digital');
    v_digital_id := NULL;

    IF v_is_digital THEN
      SELECT title, price INTO product_title, product_price
        FROM public.digital_products
       WHERE id = source_id AND status = 'active';

      IF product_title IS NULL THEN
        RAISE EXCEPTION 'Curso % não encontrado ou fora da loja', source_id;
      END IF;

      v_digital_id := source_id;
      item_kind_internal := 'digital';
    ELSE
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
    END IF;

    INSERT INTO public.store_order_items (
      order_id, product_id, digital_product_id, title, unit_price, quantity, total_price, product_kind
    ) VALUES (
      new_order_id,
      CASE WHEN v_is_digital THEN NULL ELSE source_id END,
      v_digital_id,
      product_title,
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
$fn$;

create or replace function public.liberar_cursos_do_pedido(_order_id uuid)
returns integer
language plpgsql
security definer
set search_path = public, pg_temp
as $fn$
declare
  v_student_id uuid;
  v_liberados int := 0;
begin
  select so.student_id into v_student_id
    from public.store_orders so
   where so.id = _order_id and so.status = 'paid';

  if v_student_id is null then
    return 0;
  end if;

  with novos as (
    insert into public.digital_purchases
      (student_id, digital_product_id, amount_paid, expires_at)
    select v_student_id,
           i.digital_product_id,
           i.total_price,
           case when dp.access_days is null then null
                else now() + (dp.access_days || ' days')::interval end
      from public.store_order_items i
      join public.digital_products dp on dp.id = i.digital_product_id
     where i.order_id = _order_id
       and i.digital_product_id is not null
       and not exists (
         select 1 from public.digital_purchases d
          where d.student_id = v_student_id
            and d.digital_product_id = i.digital_product_id
       )
    returning 1
  )
  select count(*) into v_liberados from novos;

  return v_liberados;
end;
$fn$;

revoke execute on function public.liberar_cursos_do_pedido(uuid) from public, anon, authenticated;
grant  execute on function public.liberar_cursos_do_pedido(uuid) to service_role;

commit;

DO $$
DECLARE
  fn_sql text;
  ancora text := 'PERFORM public.apply_annual_activation_for_store_order(_order_id);';
BEGIN
  SELECT pg_get_functiondef(p.oid)
    INTO fn_sql
  FROM pg_proc p
  JOIN pg_namespace n ON n.oid = p.pronamespace
  WHERE n.nspname = 'public'
    AND p.proname = 'mark_store_order_paid_and_process'
    AND pg_get_function_identity_arguments(p.oid) = '_order_id uuid';

  IF fn_sql IS NULL THEN
    RAISE EXCEPTION 'mark_store_order_paid_and_process(_order_id uuid) nao encontrada';
  END IF;

  IF fn_sql LIKE '%liberar_cursos_do_pedido%' THEN
    RAISE NOTICE 'Gancho ja aplicado. Nada a fazer.';
    RETURN;
  END IF;

  IF position(ancora in fn_sql) = 0 THEN
    RAISE EXCEPTION
      'Ancora nao encontrada no corpo vivo. NAO aplique as cegas: leia a funcao com pg_get_functiondef e escolha outro ponto.';
  END IF;

  fn_sql := replace(
    fn_sql,
    ancora,
    ancora || '

  BEGIN
    PERFORM public.liberar_cursos_do_pedido(_order_id);
  EXCEPTION WHEN others THEN
    RAISE WARNING ''liberar_cursos_do_pedido falhou no pedido %: %'', _order_id, SQLERRM;
  END;'
  );

  EXECUTE fn_sql;
  RAISE NOTICE 'Gancho aplicado.';
END $$;

REVOKE EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) FROM PUBLIC, anon, authenticated;
GRANT  EXECUTE ON FUNCTION public.mark_store_order_paid_and_process(uuid) TO service_role;

DO $$
DECLARE
  r record;
  total int := 0;
BEGIN
  FOR r IN
    SELECT DISTINCT so.id
      FROM public.store_orders so
      JOIN public.store_order_items i ON i.order_id = so.id
     WHERE so.status = 'paid'
       AND i.digital_product_id IS NOT NULL
  LOOP
    total := total + public.liberar_cursos_do_pedido(r.id);
  END LOOP;
  RAISE NOTICE 'Cursos liberados retroativamente: %', total;
END $$;