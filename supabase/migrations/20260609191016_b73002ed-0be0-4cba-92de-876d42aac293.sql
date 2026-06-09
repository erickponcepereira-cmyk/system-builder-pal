
DROP FUNCTION IF EXISTS public.create_scheduled_professional_order(uuid, timestamptz, text, uuid);

CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamptz,
  _payment_method text DEFAULT 'pix',
  _student_id uuid DEFAULT NULL
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
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
  v_caller_coach_id UUID;
  v_ends_at timestamptz;
  v_cross_bonus NUMERIC := 0;
  v_cross_beneficiary UUID := NULL;
  v_master_pct NUMERIC;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;
  IF v_prod.is_schedulable <> true THEN
    RAISE EXCEPTION 'Produto não é agendável';
  END IF;

  SELECT c.id INTO v_caller_coach_id
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN
      RAISE EXCEPTION 'Apenas coaches podem agendar para alunos';
    END IF;
    SELECT id, coach_id INTO v_student_id, v_student_coach_id
    FROM public.students WHERE id = _student_id LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;

  v_ends_at := _starts_at + make_interval(mins => COALESCE(v_prod.default_duration_minutes, 30));
  IF EXISTS (
    SELECT 1 FROM public.professional_appointments
    WHERE professional_coach_id = v_prod.coach_id
      AND status = 'scheduled'
      AND starts_at < v_ends_at
      AND ends_at   > _starts_at
  ) THEN
    RAISE EXCEPTION 'Horário não está mais disponível';
  END IF;
  IF _starts_at < now() THEN
    RAISE EXCEPTION 'Não é possível agendar no passado';
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

  IF v_caller_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_prod.coach_id
     AND is_master_coach(v_caller_coach_id)
     AND COALESCE(v_student_coach_id, '00000000-0000-0000-0000-000000000000'::uuid) <> v_caller_coach_id
  THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct
    FROM public.coaches WHERE id = v_caller_coach_id;
    IF v_master_pct IS NULL THEN v_master_pct := 10; END IF;
    IF v_master_pct < 10 THEN v_master_pct := 10; END IF;
    IF v_master_pct > 70 THEN v_master_pct := 70; END IF;
    v_cross_bonus := ROUND(v_gross * v_master_pct / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_partner_net := ROUND(v_partner_net - v_cross_bonus, 2);
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, COALESCE(v_caller_coach_id, v_student_coach_id),
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.professional_appointments (
    professional_coach_id, product_id, seller_coach_id, student_id, order_id,
    starts_at, ends_at, cancellation_window_hours
  ) VALUES (
    v_prod.coach_id, v_prod.id, v_caller_coach_id, v_student_id, v_order_id,
    _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24)
  );

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid) TO authenticated;
