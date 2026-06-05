CREATE OR REPLACE FUNCTION public.partner_preview_coupon(p_token text)
 RETURNS TABLE(coupon_id uuid, status text, student_name text, student_photo text, product_name text, created_at timestamp with time zone, redeemed_at timestamp with time zone)
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
    sp.name,
    COALESCE(sp.photo_url, sp.avatar_url),
    pc.product_name,
    pc.created_at,
    pc.redeemed_at
  FROM partner_coupons pc
  JOIN students s ON s.id = pc.student_id
  JOIN profiles sp ON sp.id = s.profile_id
  WHERE pc.token = upper(p_token)
    AND pc.partner_id = v_partner_id;
END;
$function$;