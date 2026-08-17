CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(_professional_product_id uuid, _starts_at timestamp with time zone, _payment_method text DEFAULT 'pix'::text, _student_id uuid DEFAULT NULL::uuid, _referred_by_student_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid; v_student_coach_id uuid; v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid; v_ends_at timestamptz;
  v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL; v_master_pct numeric; v_selling_coach_id uuid; v_rem numeric;
  v_fitcoin numeric := 0; v_partner_share numeric; v_referrer_student uuid;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF v_prod.is_schedulable <> true THEN RAISE EXCEPTION 'Produto não é agendável'; END IF;

  SELECT c.id INTO v_caller_coach_id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
  IF _student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN RAISE EXCEPTION 'Apenas coaches podem agendar para alunos'; END IF;
    SELECT id, coach_id INTO v_student_id, v_student_coach_id FROM public.students WHERE id = _student_id LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
      RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;

  v_ends_at := _starts_at + make_interval(mins => COALESCE(v_prod.default_duration_minutes, 30));
  IF EXISTS (SELECT 1 FROM public.professional_appointments WHERE professional_coach_id = v_prod.coach_id AND status = 'scheduled' AND starts_at < v_ends_at AND ends_at > _starts_at) THEN
    RAISE EXCEPTION 'Horário não está mais disponível'; END IF;
  IF _starts_at < now() THEN RAISE EXCEPTION 'Não é possível agendar no passado'; END IF;

  v_selling_coach_id := public.resolve_selling_coach(v_student_id, v_student_coach_id);
  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL THEN v_prod.system_fee_pct_override ELSE 5 END / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_partner_share := ROUND(v_rem - v_coach_amt, 2);

  v_referrer_student := _referred_by_student_id;
  IF v_referrer_student IS NOT NULL AND v_referrer_student = v_student_id THEN
    v_referrer_student := NULL;
  END IF;
  IF v_referrer_student IS NOT NULL AND v_coach_amt > 0 THEN
    v_fitcoin := ROUND(v_coach_amt * 0.50, 2);
    v_coach_amt := ROUND(v_coach_amt - v_fitcoin, 2);
  END IF;

  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := v_partner_share;

  IF _student_id IS NOT NULL AND v_caller_coach_id IS NOT NULL AND v_student_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_student_coach_id AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id,
    referred_by_student_id, referral_fitcoin_amount, metadata
  )
  VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt,
    v_l1, v_l2, v_l3,
    v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary,
    v_referrer_student, v_fitcoin,
    jsonb_strip_nulls(jsonb_build_object(
      'created_by_coach_id', v_caller_coach_id,
      'student_referral', CASE WHEN v_referrer_student IS NOT NULL THEN jsonb_build_object('referrer_student_id', v_referrer_student, 'fitcoin_amount', v_fitcoin) ELSE NULL END,
      'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END
    )))
  RETURNING id INTO v_order_id;

  INSERT INTO public.professional_appointments (professional_coach_id, product_id, seller_coach_id, student_id, order_id, starts_at, ends_at, cancellation_window_hours)
  VALUES (v_prod.coach_id, v_prod.id, v_selling_coach_id, v_student_id, v_order_id, _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24));

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Agendamento profissional criado');
  RETURN v_order_id;
END;
$function$;