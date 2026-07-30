CREATE OR REPLACE FUNCTION public.partner_product_used_slots(_product_id uuid)
RETURNS integer
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT COALESCE(count(*), 0)::int
    FROM public.partner_product_orders o
   WHERE o.partner_product_id = _product_id
     AND COALESCE(o.status, '') NOT IN ('cancelled','refunded','failed')
     AND (
       COALESCE(o.status, '') <> 'pending'
       OR o.created_at > now() - interval '30 minutes'
     );
$$;

GRANT EXECUTE ON FUNCTION public.partner_product_used_slots(uuid) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.partner_products_stock_status(_ids uuid[])
 RETURNS TABLE(product_id uuid, stock integer, used integer, remaining integer)
 LANGUAGE sql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
  SELECT pp.id,
         pp.stock,
         public.partner_product_used_slots(pp.id),
         GREATEST(0, pp.stock - public.partner_product_used_slots(pp.id))::int
    FROM public.partner_products pp
   WHERE pp.id = ANY(_ids)
     AND pp.stock IS NOT NULL;
$function$;

CREATE OR REPLACE FUNCTION public.create_partner_company_order(_partner_product_id uuid, _student_id uuid, _payment_method text, _referred_by_student_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prod public.partner_products%ROWTYPE;
  v_student_id uuid := _student_id;
  v_caller_coach_id uuid := public.current_coach_id();
  v_selling_coach_id uuid;
  v_student_coach_id uuid;
  v_requested_is_own_student boolean := false;
  v_upline1 uuid;
  v_upline2 uuid;
  v_upline3 uuid;
  v_gross numeric;
  v_fee_pct numeric;
  v_fee numeric;
  v_rem numeric;
  v_tax numeric;
  v_sys numeric;
  v_coach_pct numeric;
  v_coach_amt numeric;
  v_l1 numeric;
  v_l2 numeric;
  v_l3 numeric;
  v_coach_after_network numeric;
  v_coach_net numeric;
  v_partner_share numeric;
  v_partner_net numeric;
  v_master_pct numeric;
  v_cross_bonus numeric := 0;
  v_cross_beneficiary uuid := NULL;
  v_referrer_student uuid := NULL;
  v_fitcoin numeric := 0;
  v_order_id uuid;
  v_used int;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  -- Trava a linha do produto: impede duas vendas simultâneas da última vaga.
  SELECT *
    INTO v_prod
    FROM public.partner_products
   WHERE id = _partner_product_id
     AND status = 'approved'
     AND is_active_by_partner = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto parceiro indisponível';
  END IF;

  -- Estoque/vagas: só consomem vaga pedidos PAGOS (ou pós-pagamento) e
  -- pendentes recentes (reserva de 30 min contra venda dupla da última vaga).
  IF v_prod.stock IS NOT NULL THEN
    v_used := public.partner_product_used_slots(v_prod.id);

    IF v_used >= v_prod.stock THEN
      RAISE EXCEPTION 'Produto esgotado — 0 de % vagas restantes', v_prod.stock;
    END IF;
  END IF;

  IF v_student_id IS NULL THEN
    SELECT s.id, s.coach_id
      INTO v_student_id, v_student_coach_id
      FROM public.students s
     WHERE s.profile_id = public.current_profile_id();
  ELSE
    SELECT s.coach_id
      INTO v_student_coach_id
      FROM public.students s
     WHERE s.id = v_student_id;
  END IF;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  v_requested_is_own_student := (v_caller_coach_id IS NOT NULL AND v_student_coach_id = v_caller_coach_id);
  v_selling_coach_id := COALESCE(v_caller_coach_id, v_student_coach_id);

  IF v_selling_coach_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor sem coach vinculado';
  END IF;

  SELECT c1.upline_coach_id,
         c2.upline_coach_id,
         c3.upline_coach_id
    INTO v_upline1, v_upline2, v_upline3
    FROM public.coaches c1
    LEFT JOIN public.coaches c2 ON c2.id = c1.upline_coach_id
    LEFT JOIN public.coaches c3 ON c3.id = c2.upline_coach_id
   WHERE c1.id = v_selling_coach_id;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE WHEN _payment_method = 'pix' THEN 0.99 ELSE 4.98 END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_partner_share := ROUND(v_rem - v_coach_amt, 2);

  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_after_network := GREATEST(0, ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2));

  v_referrer_student := _referred_by_student_id;
  IF v_referrer_student IS NOT NULL AND v_referrer_student = v_student_id THEN
    v_referrer_student := NULL;
  END IF;

  IF v_referrer_student IS NOT NULL AND v_coach_after_network > 0 THEN
    v_fitcoin := CEIL(v_coach_after_network * 50) / 100;
    IF v_fitcoin > v_coach_after_network THEN
      v_fitcoin := v_coach_after_network;
    END IF;
  END IF;

  v_coach_net := GREATEST(0, ROUND(v_coach_after_network - v_fitcoin, 2));
  v_partner_net := v_partner_share;

  IF _student_id IS NOT NULL
     AND NOT v_requested_is_own_student
     AND v_caller_coach_id IS NOT NULL
     AND v_student_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_student_coach_id
     AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10)
      INTO v_master_pct
      FROM public.coaches
     WHERE id = v_student_coach_id;

    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, partner_product_id, partner_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id,
    referred_by_student_id, referral_fitcoin_amount, metadata
  )
  VALUES (
    v_student_id, v_prod.id, v_prod.partner_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt,
    v_l1, v_l2, v_l3,
    v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary,
    v_referrer_student, v_fitcoin,
    jsonb_strip_nulls(jsonb_build_object(
      'created_by_coach_id', v_caller_coach_id,
      'student_referral', CASE WHEN v_referrer_student IS NOT NULL THEN jsonb_build_object('referrer_student_id', v_referrer_student, 'fitcoin_amount', v_fitcoin) ELSE NULL END,
      'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END
    ))
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');

  RETURN v_order_id;
END;
$function$;