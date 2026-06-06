CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamptz,
  _payment_method text DEFAULT 'pix',
  _buyer_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id uuid;
  v_prod record;
  v_duration int;
  v_ends_at timestamptz;
  v_student_id uuid;
  v_seller_coach_id uuid;
  v_buyer_student_id uuid;
BEGIN
  SELECT id, coach_id, default_duration_minutes, cancellation_window_hours, is_schedulable
    INTO v_prod
  FROM public.professional_products
  WHERE id = _professional_product_id;

  IF v_prod.id IS NULL THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF v_prod.is_schedulable <> true THEN RAISE EXCEPTION 'Produto não é agendável'; END IF;

  v_duration := COALESCE(v_prod.default_duration_minutes, 30);
  v_ends_at := _starts_at + make_interval(mins => v_duration);

  IF _starts_at < now() THEN
    RAISE EXCEPTION 'Não é possível agendar no passado';
  END IF;

  IF _buyer_student_id IS NOT NULL THEN
    v_buyer_student_id := _buyer_student_id;
  ELSE
    SELECT s.id INTO v_buyer_student_id
    FROM public.students s
    JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid()
    LIMIT 1;
  END IF;

  -- Auto-cancel buyer's own pending appointments overlapping this slot for same product
  IF v_buyer_student_id IS NOT NULL THEN
    UPDATE public.partner_product_orders ppo
       SET status = 'cancelled'
     WHERE ppo.status = 'pending'
       AND ppo.id IN (
         SELECT a.order_id
           FROM public.professional_appointments a
          WHERE a.product_id = _professional_product_id
            AND a.status = 'scheduled'
            AND a.student_id = v_buyer_student_id
            AND a.starts_at < v_ends_at
            AND a.ends_at > _starts_at
       );

    UPDATE public.professional_appointments
       SET status = 'cancelled', cancelled_at = now()
     WHERE product_id = _professional_product_id
       AND status = 'scheduled'
       AND student_id = v_buyer_student_id
       AND starts_at < v_ends_at
       AND ends_at > _starts_at;
  END IF;

  IF EXISTS (
    SELECT 1 FROM public.professional_appointments a
    WHERE a.professional_coach_id = v_prod.coach_id
      AND a.status = 'scheduled'
      AND a.starts_at < v_ends_at
      AND a.ends_at > _starts_at
  ) THEN
    RAISE EXCEPTION 'Horário não está mais disponível';
  END IF;

  v_order_id := public.create_partner_product_order(_professional_product_id, _payment_method, _buyer_student_id);

  SELECT student_id, selling_coach_id INTO v_student_id, v_seller_coach_id
  FROM public.partner_product_orders
  WHERE id = v_order_id;

  INSERT INTO public.professional_appointments (
    order_id, product_id, professional_coach_id, student_id, seller_coach_id,
    starts_at, ends_at, status, cancellation_window_hours
  ) VALUES (
    v_order_id, _professional_product_id, v_prod.coach_id, v_student_id, v_seller_coach_id,
    _starts_at, v_ends_at, 'scheduled', COALESCE(v_prod.cancellation_window_hours, 48)
  );

  RETURN v_order_id;
END;
$function$;