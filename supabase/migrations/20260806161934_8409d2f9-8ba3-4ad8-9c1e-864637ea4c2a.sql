-- 1) Regra única de resolução do coach vendedor
CREATE OR REPLACE FUNCTION public.resolve_selling_coach(_student_id uuid, _coach_id uuid)
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_profile uuid;
  v_student_coach uuid;
  v_cand uuid;
  v_cand_profile uuid;
  i int;
BEGIN
  IF _student_id IS NULL THEN
    RETURN _coach_id;
  END IF;

  SELECT s.profile_id, s.coach_id INTO v_student_profile, v_student_coach
    FROM public.students s WHERE s.id = _student_id;

  IF v_student_profile IS NULL THEN
    RETURN _coach_id;
  END IF;

  IF _coach_id IS NOT NULL THEN
    SELECT c.profile_id INTO v_cand_profile FROM public.coaches c WHERE c.id = _coach_id;
    -- vendedor diferente do comprador: mantém
    IF v_cand_profile IS DISTINCT FROM v_student_profile THEN
      RETURN _coach_id;
    END IF;
  END IF;

  -- 1ª opção: coach vinculado ao comprador
  IF v_student_coach IS NOT NULL THEN
    SELECT c.profile_id INTO v_cand_profile FROM public.coaches c WHERE c.id = v_student_coach;
    IF v_cand_profile IS DISTINCT FROM v_student_profile THEN
      RETURN v_student_coach;
    END IF;
  END IF;

  -- 2ª opção: sobe a linha de patrocínio até achar alguém diferente do comprador
  v_cand := COALESCE(_coach_id, v_student_coach);
  FOR i IN 1..10 LOOP
    EXIT WHEN v_cand IS NULL;
    SELECT c.upline_coach_id INTO v_cand FROM public.coaches c WHERE c.id = v_cand;
    EXIT WHEN v_cand IS NULL;
    SELECT c.profile_id INTO v_cand_profile FROM public.coaches c WHERE c.id = v_cand;
    IF v_cand_profile IS DISTINCT FROM v_student_profile THEN
      RETURN v_cand;
    END IF;
  END LOOP;

  -- ninguém elegível: sem comissão de coach
  RETURN NULL;
END;
$function$;

-- 2) Rede de segurança nos pedidos de parceiro/profissional
CREATE OR REPLACE FUNCTION public.trg_fix_self_selling_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_profile uuid;
  v_seller_profile uuid;
  v_new uuid;
BEGIN
  IF NEW.student_id IS NULL OR NEW.selling_coach_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_student_profile FROM public.students s WHERE s.id = NEW.student_id;
  SELECT c.profile_id INTO v_seller_profile FROM public.coaches c WHERE c.id = NEW.selling_coach_id;

  IF v_student_profile IS NULL OR v_seller_profile IS DISTINCT FROM v_student_profile THEN
    RETURN NEW;
  END IF;

  v_new := public.resolve_selling_coach(NEW.student_id, NEW.selling_coach_id);
  NEW.selling_coach_id := v_new;

  IF v_new IS NULL THEN
    NEW.upline_l1_coach_id := NULL;
    NEW.upline_l2_coach_id := NULL;
    NEW.upline_l3_coach_id := NULL;
  ELSE
    SELECT c1.upline_coach_id, c2.upline_coach_id, c3.upline_coach_id
      INTO NEW.upline_l1_coach_id, NEW.upline_l2_coach_id, NEW.upline_l3_coach_id
      FROM public.coaches c1
      LEFT JOIN public.coaches c2 ON c2.id = c1.upline_coach_id
      LEFT JOIN public.coaches c3 ON c3.id = c2.upline_coach_id
     WHERE c1.id = v_new;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_ppo_fix_self_selling_coach ON public.partner_product_orders;
CREATE TRIGGER trg_ppo_fix_self_selling_coach
  BEFORE INSERT OR UPDATE OF selling_coach_id, student_id ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fix_self_selling_coach();

-- 3) Loja FitMind: limpa "created_by_coach_id" quando aponta para o próprio comprador
CREATE OR REPLACE FUNCTION public.trg_fix_self_store_order_coach()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_coach_id uuid;
  v_student_profile uuid;
  v_coach_profile uuid;
  v_new uuid;
BEGIN
  v_coach_id := NULLIF(NEW.metadata->>'created_by_coach_id','')::uuid;
  IF v_coach_id IS NULL OR NEW.student_id IS NULL THEN
    RETURN NEW;
  END IF;

  SELECT s.profile_id INTO v_student_profile FROM public.students s WHERE s.id = NEW.student_id;
  SELECT c.profile_id INTO v_coach_profile FROM public.coaches c WHERE c.id = v_coach_id;

  IF v_student_profile IS NOT NULL AND v_coach_profile = v_student_profile THEN
    v_new := public.resolve_selling_coach(NEW.student_id, v_coach_id);
    IF v_new IS NULL THEN
      NEW.metadata := (COALESCE(NEW.metadata,'{}'::jsonb) - 'created_by_coach_id');
    ELSE
      NEW.metadata := COALESCE(NEW.metadata,'{}'::jsonb) || jsonb_build_object('created_by_coach_id', v_new::text);
    END IF;
  END IF;

  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_store_orders_fix_self_coach ON public.store_orders;
CREATE TRIGGER trg_store_orders_fix_self_coach
  BEFORE INSERT OR UPDATE OF metadata, student_id ON public.store_orders
  FOR EACH ROW EXECUTE FUNCTION public.trg_fix_self_store_order_coach();

-- 4) Coach não pode lançar venda para si mesmo
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
  client_profile_id uuid;
  effective_coach_id uuid;
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

  SELECT s.profile_id INTO client_profile_id FROM public.students s WHERE s.id = _client_id;

  -- Comprador e vendedor não podem ser a mesma pessoa
  effective_coach_id := public.resolve_selling_coach(_client_id, current_coach_id);

  INSERT INTO public.store_orders (
    student_id, payment_method, notes, status,
    subtotal, payment_fee, tax_amount, total_amount, metadata
  ) VALUES (
    _client_id, COALESCE(_payment_method, 'pix'), _notes, 'pending',
    0, 0, 0, 0,
    CASE WHEN effective_coach_id IS NULL
         THEN jsonb_build_object('source', 'coach_sale')
         ELSE jsonb_build_object('created_by_coach_id', effective_coach_id, 'source', 'coach_sale') END
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

-- 5) Correção retroativa
DO $$
DECLARE
  r record;
  v_new uuid;
  v_l1 uuid; v_l2 uuid; v_l3 uuid;
  v_profiles uuid[] := '{}';
  v_p uuid;
BEGIN
  FOR r IN
    SELECT o.id, o.student_id, o.selling_coach_id, o.upline_l1_coach_id, o.upline_l2_coach_id, o.upline_l3_coach_id
      FROM public.partner_product_orders o
      JOIN public.students st ON st.id = o.student_id
      JOIN public.coaches sc ON sc.id = o.selling_coach_id
     WHERE sc.profile_id = st.profile_id
  LOOP
    v_new := public.resolve_selling_coach(r.student_id, r.selling_coach_id);
    IF v_new IS NULL OR v_new = r.selling_coach_id THEN
      CONTINUE;
    END IF;

    SELECT c1.upline_coach_id, c2.upline_coach_id, c3.upline_coach_id
      INTO v_l1, v_l2, v_l3
      FROM public.coaches c1
      LEFT JOIN public.coaches c2 ON c2.id = c1.upline_coach_id
      LEFT JOIN public.coaches c3 ON c3.id = c2.upline_coach_id
     WHERE c1.id = v_new;

    -- perfis afetados (antes)
    SELECT array_agg(DISTINCT c.profile_id) INTO v_profiles
      FROM public.coaches c
     WHERE c.id = ANY (ARRAY[r.selling_coach_id, r.upline_l1_coach_id, r.upline_l2_coach_id, r.upline_l3_coach_id, v_new, v_l1, v_l2, v_l3]);

    UPDATE public.partner_product_orders
       SET selling_coach_id  = v_new,
           upline_l1_coach_id = v_l1,
           upline_l2_coach_id = v_l2,
           upline_l3_coach_id = v_l3
     WHERE id = r.id;

    -- comissão do vendedor
    UPDATE public.commissions c
       SET beneficiary_coach_id   = v_new,
           beneficiary_profile_id = (SELECT profile_id FROM public.coaches WHERE id = v_new)
     WHERE c.partner_order_id = r.id
       AND COALESCE(c.is_network,false) = false
       AND COALESCE(c.is_master_coach_commission,false) = false
       AND COALESCE(c.is_referral,false) = false;

    -- rede
    UPDATE public.commissions c
       SET beneficiary_coach_id   = t.cid,
           beneficiary_profile_id = (SELECT profile_id FROM public.coaches WHERE id = t.cid)
      FROM (VALUES (1, v_l1), (2, v_l2), (3, v_l3)) AS t(lvl, cid)
     WHERE c.partner_order_id = r.id
       AND COALESCE(c.is_network,false) = true
       AND c.level = t.lvl
       AND t.cid IS NOT NULL;

    DELETE FROM public.commissions c
     USING (VALUES (1, v_l1), (2, v_l2), (3, v_l3)) AS t(lvl, cid)
     WHERE c.partner_order_id = r.id
       AND COALESCE(c.is_network,false) = true
       AND c.level = t.lvl
       AND t.cid IS NULL;

    -- carteiras dos envolvidos
    FOREACH v_p IN ARRAY COALESCE(v_profiles, '{}'::uuid[]) LOOP
      BEGIN
        PERFORM public.recalc_wallets_for_owner(v_p);
      EXCEPTION WHEN OTHERS THEN
        NULL;
      END;
    END LOOP;
  END LOOP;
END $$;