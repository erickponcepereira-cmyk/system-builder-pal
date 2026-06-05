CREATE EXTENSION IF NOT EXISTS pgcrypto WITH SCHEMA extensions;

DROP FUNCTION IF EXISTS public.student_generate_partner_coupon(uuid);

CREATE OR REPLACE FUNCTION public.student_generate_partner_coupon(p_product_id uuid)
RETURNS TABLE(token text)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public, extensions
AS $$
DECLARE
  v_student_id uuid;
  v_existing_token text;
  v_new_token text;
BEGIN
  SELECT id INTO v_student_id FROM public.students WHERE user_id = auth.uid() LIMIT 1;
  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Student profile not found';
  END IF;

  SELECT pc.token INTO v_existing_token
  FROM public.partner_coupons pc
  WHERE pc.student_id = v_student_id
    AND pc.product_id = p_product_id
    AND pc.status = 'active'
    AND (pc.expires_at IS NULL OR pc.expires_at > now())
  LIMIT 1;

  IF v_existing_token IS NOT NULL THEN
    token := v_existing_token;
    RETURN NEXT;
    RETURN;
  END IF;

  v_new_token := upper(encode(extensions.gen_random_bytes(12), 'hex'));

  INSERT INTO public.partner_coupons (student_id, product_id, token, status)
  VALUES (v_student_id, p_product_id, v_new_token, 'active');

  token := v_new_token;
  RETURN NEXT;
END;
$$;

REVOKE EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.student_generate_partner_coupon(uuid) TO service_role;