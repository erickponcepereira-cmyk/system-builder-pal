CREATE OR REPLACE FUNCTION public.student_generate_partner_coupon(p_partner_product_id uuid)
RETURNS TABLE (coupon_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id uuid;
  v_partner_id uuid;
  v_product_name text;
  v_existing_id uuid;
  v_existing_token text;
  v_new_token text;
  v_new_id uuid;
BEGIN
  SELECT s.id INTO v_student_id
  FROM public.students s
  JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid();

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Apenas alunos podem gerar cupons';
  END IF;

  SELECT pp.partner_id, pp.name INTO v_partner_id, v_product_name
  FROM public.partner_products pp
  WHERE pp.id = p_partner_product_id
    AND pp.status = 'approved'
    AND pp.is_active_by_partner = true
    AND pp.kind = 'free';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Produto de desconto não disponível';
  END IF;

  SELECT pc.id, pc.token INTO v_existing_id, v_existing_token
  FROM public.partner_coupons pc
  WHERE pc.student_id = v_student_id
    AND pc.partner_product_id = p_partner_product_id
    AND pc.status = 'active'
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN QUERY SELECT v_existing_id AS coupon_id, v_existing_token AS token;
    RETURN;
  END IF;

  v_new_token := upper(encode(gen_random_bytes(12), 'hex'));

  INSERT INTO public.partner_coupons (token, partner_id, partner_product_id, student_id, product_name)
  VALUES (v_new_token, v_partner_id, p_partner_product_id, v_student_id, v_product_name)
  RETURNING partner_coupons.id INTO v_new_id;

  RETURN QUERY SELECT v_new_id AS coupon_id, v_new_token AS token;
END;
$$;

GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated;