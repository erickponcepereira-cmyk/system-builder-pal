
DROP FUNCTION IF EXISTS public.create_scheduled_professional_order(uuid, timestamptz, text, uuid);
DROP FUNCTION IF EXISTS public.create_scheduled_professional_order(uuid, timestamptz, text);
DROP FUNCTION IF EXISTS public.create_partner_product_order(uuid, text);

CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix',
  _buyer_student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id UUID;
  v_student_coach_id UUID;
  v_upline1 UUID; v_upline2 UUID; v_upline3 UUID;
  v_prod RECORD;
  v_gross NUMERIC; v_fee NUMERIC; v_tax NUMERIC; v_sys NUMERIC := 20;
  v_fee_pct NUMERIC;
  v_coach_pct NUMERIC; v_coach_amt NUMERIC;
  v_l1 NUMERIC; v_l2 NUMERIC; v_l3 NUMERIC;
  v_coach_net NUMERIC; v_partner_net NUMERIC;
  v_order_id UUID;
  v_is_coach BOOLEAN := false;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  IF _buyer_student_id IS NOT NULL THEN
    SELECT EXISTS (
      SELECT 1 FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
      WHERE p.user_id = auth.uid()
    ) INTO v_is_coach;
    IF NOT v_is_coach THEN
      RAISE EXCEPTION 'Apenas coaches podem comprar em nome de outro aluno';
    END IF;
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s WHERE s.id = _buyer_student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  IF v_student_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_student_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_tax := ROUND(v_gross * 6 / 100, 2);
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_student_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), NULL);

  RETURN v_order_id;
END;
$function$;

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
  v_prod RECORD;
  v_duration int;
  v_ends_at timestamptz;
BEGIN
  v_order_id := public.create_partner_product_order(_professional_product_id, _payment_method, _buyer_student_id);
  SELECT id, default_duration_minutes, coach_id INTO v_prod
  FROM public.professional_products WHERE id = _professional_product_id;
  v_duration := COALESCE(v_prod.default_duration_minutes, 30);
  v_ends_at := _starts_at + (v_duration || ' minutes')::interval;

  UPDATE public.partner_product_orders
     SET scheduled_starts_at = _starts_at,
         scheduled_ends_at = v_ends_at
   WHERE id = v_order_id;

  RETURN v_order_id;
END;
$function$;
