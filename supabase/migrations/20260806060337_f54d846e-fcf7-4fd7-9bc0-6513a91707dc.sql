CREATE OR REPLACE FUNCTION public.expire_unpaid_professional_appointments()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT o.id AS order_id
    FROM public.partner_product_orders o
    JOIN public.professional_products pp ON pp.id = o.professional_product_id
    WHERE o.status = 'pending'
      AND o.professional_product_id IS NOT NULL
      AND COALESCE(pp.payment_timing, 'at_booking') = 'at_booking'
      AND o.created_at < now() - interval '30 minutes'
      AND EXISTS (
        SELECT 1 FROM public.professional_appointments a
        WHERE a.order_id = o.id AND a.status = 'scheduled'
      )
  LOOP
    UPDATE public.professional_appointments
       SET status = 'cancelled'
     WHERE order_id = r.order_id AND status = 'scheduled';

    UPDATE public.partner_product_orders
       SET status = 'cancelled'
     WHERE id = r.order_id AND status = 'pending';

    INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
    VALUES (r.order_id, 'pending', 'cancelled', NULL, 'Cancelado automaticamente: pagamento não confirmado em 30 minutos');

    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$function$;

GRANT EXECUTE ON FUNCTION public.expire_unpaid_professional_appointments() TO service_role;