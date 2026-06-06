ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS benefit_start_time time without time zone,
  ADD COLUMN IF NOT EXISTS benefit_end_time time without time zone;

DROP FUNCTION IF EXISTS public.partner_preview_coupon(text);

CREATE FUNCTION public.partner_preview_coupon(p_token text)
 RETURNS TABLE(
   coupon_id uuid,
   status text,
   student_name text,
   student_photo text,
   product_name text,
   created_at timestamp with time zone,
   redeemed_at timestamp with time zone,
   benefit_start_time time without time zone,
   benefit_end_time time without time zone
 )
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
BEGIN
  SELECT pa.id INTO v_partner_id
  FROM partners pa
  JOIN profiles p ON p.id = pa.profile_id
  WHERE p.user_id = auth.uid() AND pa.status = 'approved';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  RETURN QUERY
  SELECT
    pc.id,
    pc.status::text,
    sp.name::text,
    COALESCE(sp.photo_url, sp.avatar_url)::text,
    COALESCE(pc.product_name, pp.name)::text,
    pc.created_at,
    pc.redeemed_at,
    pp.benefit_start_time,
    pp.benefit_end_time
  FROM partner_coupons pc
  JOIN students s ON s.id = pc.student_id
  JOIN profiles sp ON sp.id = s.profile_id
  JOIN partner_products pp ON pp.id = pc.partner_product_id
  WHERE pc.token = upper(p_token)
    AND pc.partner_id = v_partner_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.partner_redeem_coupon(p_token text)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_partner_id uuid;
  v_user_profile_id uuid;
  v_coupon_id uuid;
  v_status text;
  v_start time without time zone;
  v_end time without time zone;
  v_now time without time zone;
  v_allowed boolean := true;
BEGIN
  SELECT pa.id, p.id INTO v_partner_id, v_user_profile_id
  FROM partners pa
  JOIN profiles p ON p.id = pa.profile_id
  WHERE p.user_id = auth.uid() AND pa.status = 'approved';

  IF v_partner_id IS NULL THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT pc.id, pc.status::text, pp.benefit_start_time, pp.benefit_end_time
  INTO v_coupon_id, v_status, v_start, v_end
  FROM partner_coupons pc
  JOIN partner_products pp ON pp.id = pc.partner_product_id
  WHERE pc.token = upper(p_token) AND pc.partner_id = v_partner_id
  FOR UPDATE OF pc;

  IF v_coupon_id IS NULL THEN
    RAISE EXCEPTION 'Cupom não encontrado';
  END IF;

  IF v_status <> 'active' THEN
    RAISE EXCEPTION 'Cupom já utilizado ou cancelado';
  END IF;

  v_now := (now() AT TIME ZONE 'America/Sao_Paulo')::time;

  IF v_start IS NOT NULL AND v_end IS NOT NULL THEN
    IF v_start <= v_end THEN
      v_allowed := v_now >= v_start AND v_now <= v_end;
    ELSE
      v_allowed := v_now >= v_start OR v_now <= v_end;
    END IF;
  ELSIF v_start IS NOT NULL THEN
    v_allowed := v_now >= v_start;
  ELSIF v_end IS NOT NULL THEN
    v_allowed := v_now <= v_end;
  END IF;

  IF NOT v_allowed THEN
    RAISE EXCEPTION 'Benefício disponível apenas no horário permitido';
  END IF;

  UPDATE partner_coupons
  SET status = 'used',
      redeemed_at = now(),
      redeemed_by = v_user_profile_id
  WHERE id = v_coupon_id;

  RETURN v_coupon_id;
END;
$function$;

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

  SELECT pp.partner_id, pp.name::text, pp.discount_percent
    INTO v_partner_id, v_product_name, v_discount_percent
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