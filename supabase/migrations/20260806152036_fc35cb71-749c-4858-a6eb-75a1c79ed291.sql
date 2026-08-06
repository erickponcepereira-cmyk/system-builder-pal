CREATE OR REPLACE FUNCTION public.expire_unpaid_product_orders()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count int := 0;
BEGIN
  FOR r IN
    SELECT o.id AS order_id
      FROM public.partner_product_orders o
     WHERE o.status = 'pending'
       AND o.created_at < now() - interval '30 minutes'
       AND o.paid_at IS NULL
       AND NOT EXISTS (
         SELECT 1 FROM public.mercadopago_payments mp
          WHERE mp.source_id = o.id
            AND COALESCE(mp.status, '') IN ('in_process','authorized')
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
$$;