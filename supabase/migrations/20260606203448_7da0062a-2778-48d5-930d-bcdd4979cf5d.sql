CREATE OR REPLACE FUNCTION public.enforce_appointment_cancellation_window()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_status text;
  v_is_paid boolean;
BEGIN
  IF NEW.status = 'cancelled' AND OLD.status = 'scheduled' THEN
    -- Verifica se o pedido está pago
    v_is_paid := true;
    IF OLD.order_id IS NOT NULL THEN
      SELECT status INTO v_order_status FROM public.partner_product_orders WHERE id = OLD.order_id;
      v_is_paid := COALESCE(v_order_status, 'pending') = 'paid';
    END IF;

    -- Só aplica janela de cancelamento se já estiver pago
    IF v_is_paid AND now() > (OLD.starts_at - make_interval(hours => OLD.cancellation_window_hours)) THEN
      IF NOT is_admin(auth.uid()) THEN
        RAISE EXCEPTION 'Cancelamento fora da janela permitida (%h antes do horário)', OLD.cancellation_window_hours;
      END IF;
    END IF;

    NEW.cancelled_at := now();
    NEW.cancelled_by := auth.uid();
  END IF;
  RETURN NEW;
END;
$function$;