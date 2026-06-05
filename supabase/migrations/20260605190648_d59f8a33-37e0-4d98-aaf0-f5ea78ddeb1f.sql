
DROP FUNCTION IF EXISTS public.student_generate_partner_coupon(uuid);

CREATE OR REPLACE FUNCTION public.student_generate_partner_coupon(p_partner_product_id uuid)
RETURNS TABLE(coupon_id uuid, token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id uuid;
  v_partner_id uuid;
  v_product_name text;
  v_discount_percent numeric;
  v_existing_id uuid;
  v_existing_token text;
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

  SELECT pp.partner_id, pp.name, pp.discount_percent
    INTO v_partner_id, v_product_name, v_discount_percent
  FROM public.partner_products pp
  WHERE pp.id = p_partner_product_id;

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Partner product not found';
  END IF;

  SELECT pc.id, pc.token INTO v_existing_id, v_existing_token
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
$$;

REVOKE ALL ON FUNCTION public.student_generate_partner_coupon(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated, service_role;
