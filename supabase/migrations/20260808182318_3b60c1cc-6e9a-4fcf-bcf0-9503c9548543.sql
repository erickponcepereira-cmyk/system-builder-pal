DO $migration$
DECLARE
  f text;
BEGIN
  f := pg_get_functiondef('public.create_partner_product_order(uuid,text,uuid,uuid)'::regprocedure);

  IF position(
    'v_selling_coach_id := public.resolve_selling_coach(v_student_id, v_student_coach_id);'
    in f
  ) = 0 THEN
    RAISE EXCEPTION 'Trecho esperado de create_partner_product_order não encontrado';
  END IF;

  f := replace(
    f,
    'v_selling_coach_id := public.resolve_selling_coach(v_student_id, v_student_coach_id);',
    'v_selling_coach_id := public.resolve_selling_coach(v_student_id, CASE WHEN _buyer_student_id IS NOT NULL THEN v_caller_coach_id ELSE v_student_coach_id END);'
  );

  EXECUTE f;
END
$migration$;

CREATE OR REPLACE FUNCTION public.create_partner_product_order_checkout(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix'::text,
  _buyer_student_id uuid DEFAULT NULL::uuid,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_order_id uuid;
  v_order_number text;
  v_total numeric;
BEGIN
  v_order_id := public.create_partner_product_order(
    _professional_product_id,
    _payment_method,
    _buyer_student_id,
    _referred_by_student_id
  );

  SELECT order_number, gross_amount
    INTO v_order_number, v_total
    FROM public.partner_product_orders
   WHERE id = v_order_id;

  IF v_order_number IS NULL OR v_order_number !~ '^PP-[A-Z0-9]+$' THEN
    RAISE EXCEPTION 'Número do pedido não foi gerado corretamente';
  END IF;

  RETURN jsonb_build_object(
    'order_id', v_order_id,
    'order_number', v_order_number,
    'total', v_total,
    'pay_url', '/pay/' || v_order_number
  );
END;
$$;

REVOKE ALL ON FUNCTION public.create_partner_product_order_checkout(uuid,text,uuid,uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order_checkout(uuid,text,uuid,uuid) TO authenticated, service_role;

WITH target AS (
  SELECT o.id,
         row_number() OVER (ORDER BY o.created_at DESC, o.id DESC) AS rn
    FROM public.partner_product_orders o
    JOIN public.students s ON s.id = o.student_id
    JOIN public.profiles p ON p.id = s.profile_id
   WHERE lower(coalesce(p.name, '')) LIKE '%francisca%'
     AND o.professional_product_id = '7e471926-9f61-4042-8aae-504bc1ddf1e0'::uuid
     AND o.status = 'pending'
     AND o.paid_at IS NULL
)
UPDATE public.partner_product_orders o
   SET status = 'cancelled'
  FROM target t
 WHERE o.id = t.id
   AND t.rn > 1;

WITH latest AS (
  SELECT o.id
    FROM public.partner_product_orders o
    JOIN public.students s ON s.id = o.student_id
    JOIN public.profiles p ON p.id = s.profile_id
   WHERE lower(coalesce(p.name, '')) LIKE '%francisca%'
     AND o.professional_product_id = '7e471926-9f61-4042-8aae-504bc1ddf1e0'::uuid
     AND o.status = 'pending'
     AND o.paid_at IS NULL
   ORDER BY o.created_at DESC, o.id DESC
   LIMIT 1
)
UPDATE public.partner_product_orders o
   SET selling_coach_id = '02447f14-58d4-4f5f-a345-c721edc66e3e'::uuid
  FROM latest l
 WHERE o.id = l.id;