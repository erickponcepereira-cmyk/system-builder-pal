
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS monthly_redeem_limit integer;

ALTER TABLE public.partner_products
  DROP CONSTRAINT IF EXISTS partner_products_monthly_redeem_limit_check;
ALTER TABLE public.partner_products
  ADD CONSTRAINT partner_products_monthly_redeem_limit_check
  CHECK (monthly_redeem_limit IS NULL OR monthly_redeem_limit > 0);

CREATE OR REPLACE FUNCTION public.student_generate_partner_coupon(p_partner_product_id uuid)
 RETURNS TABLE(coupon_id uuid, token text)
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public', 'extensions'
AS $function$
DECLARE
  v_student_id uuid;
  v_partner_id uuid;
  v_product_name text;
  v_discount_percent numeric;
  v_monthly_limit integer;
  v_existing_id uuid;
  v_existing_token text;
  v_used_this_month integer;
  v_new_token text;
  v_new_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found for current user';
  END IF;

  SELECT pp.partner_id, pp.name::text, pp.discount_percent, pp.monthly_redeem_limit
    INTO v_partner_id, v_product_name, v_discount_percent, v_monthly_limit
  FROM public.partner_products pp
  JOIN public.partners pa ON pa.id = pp.partner_id
  WHERE pp.id = p_partner_product_id
    AND pp.kind = 'free'
    AND pp.status = 'approved'
    AND pp.is_active_by_partner = true
    AND pa.status = 'approved';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner product not found';
  END IF;

  -- Cupom ativo existente: retorna o mesmo (não consome novo resgate)
  SELECT pc.id, pc.token::text INTO v_existing_id, v_existing_token
  FROM public.partner_coupons pc
  WHERE pc.student_id = v_student_id
    AND pc.partner_product_id = p_partner_product_id
    AND pc.status = 'active'
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    coupon_id := v_existing_id;
    token := v_existing_token;
    RETURN NEXT;
    RETURN;
  END IF;

  -- Verifica limite mensal (conta cupons ativos + usados criados no mês corrente)
  IF v_monthly_limit IS NOT NULL THEN
    SELECT COUNT(*) INTO v_used_this_month
    FROM public.partner_coupons pc
    WHERE pc.student_id = v_student_id
      AND pc.partner_product_id = p_partner_product_id
      AND pc.status IN ('active','used')
      AND pc.created_at >= date_trunc('month', now());

    IF v_used_this_month >= v_monthly_limit THEN
      RAISE EXCEPTION 'Você já atingiu o limite mensal de % resgate(s) deste cupom. Tente novamente no próximo mês.', v_monthly_limit
        USING ERRCODE = 'P0001';
    END IF;
  END IF;

  v_new_token := upper(encode(extensions.gen_random_bytes(12), 'hex'));

  INSERT INTO public.partner_coupons (
    partner_id, partner_product_id, student_id, token, status,
    discount_label, product_name
  )
  VALUES (
    v_partner_id, p_partner_product_id, v_student_id, v_new_token, 'active',
    CASE WHEN v_discount_percent IS NOT NULL THEN v_discount_percent::text || '% OFF' ELSE NULL END,
    v_product_name
  )
  RETURNING id INTO v_new_id;

  coupon_id := v_new_id;
  token := v_new_token;
  RETURN NEXT;
END;
$function$;
