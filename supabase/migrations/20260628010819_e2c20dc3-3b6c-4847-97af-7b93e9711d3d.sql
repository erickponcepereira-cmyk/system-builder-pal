
CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix'::text,
  _buyer_student_id uuid DEFAULT NULL::uuid
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid;
  v_selling_coach_id uuid;
  v_student_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid;
  v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric;
  v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric;
  v_order_id uuid;
  v_caller_coach_id uuid;
  v_cross_bonus numeric := 0;
  v_cross_beneficiary uuid := NULL;
  v_master_pct numeric;
  v_rem numeric;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT c.id INTO v_caller_coach_id
  FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id
  WHERE p.user_id = auth.uid()
  LIMIT 1;

  IF _buyer_student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN
      RAISE EXCEPTION 'Apenas coaches podem comprar em nome de outro aluno';
    END IF;
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s WHERE s.id = _buyer_student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
      RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
    END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
    FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
    WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;

  v_selling_coach_id := v_student_coach_id;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);

  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);

  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_rem - v_coach_amt, 2);

  IF _buyer_student_id IS NOT NULL
     AND v_caller_coach_id IS NOT NULL
     AND v_caller_coach_id <> COALESCE(v_student_coach_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND v_caller_coach_id <> v_prod.coach_id
     AND public.is_master_coach(v_caller_coach_id)
  THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct
    FROM public.coaches WHERE id = v_caller_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := ROUND(v_coach_amt * v_master_pct / 100, 2);
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
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), NULL);

  RETURN v_order_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamp with time zone,
  _payment_method text DEFAULT 'pix'::text,
  _student_id uuid DEFAULT NULL::uuid
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
  v_gross NUMERIC; v_fee NUMERIC; v_tax NUMERIC; v_sys NUMERIC;
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
  v_selling_coach_id uuid;
  v_rem numeric;
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

  v_selling_coach_id := v_student_coach_id;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);

  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);

  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_rem - v_coach_amt, 2);

  IF _student_id IS NOT NULL
     AND v_caller_coach_id IS NOT NULL
     AND v_caller_coach_id <> COALESCE(v_student_coach_id, '00000000-0000-0000-0000-000000000000'::uuid)
     AND v_caller_coach_id <> v_prod.coach_id
     AND public.is_master_coach(v_caller_coach_id)
  THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct
    FROM public.coaches WHERE id = v_caller_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := ROUND(v_coach_amt * v_master_pct / 100, 2);
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
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net,
    v_cross_bonus, v_cross_beneficiary
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.professional_appointments (
    professional_coach_id, product_id, seller_coach_id, student_id, order_id,
    starts_at, ends_at, cancellation_window_hours
  ) VALUES (
    v_prod.coach_id, v_prod.id, v_selling_coach_id, v_student_id, v_order_id,
    _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24)
  );

  RETURN v_order_id;
END;
$function$;


CREATE OR REPLACE FUNCTION public.admin_reprocess_partner_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_prod record;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric;
  v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric;
  v_selling_coach_id uuid;
  v_student_coach_id uuid;
  v_rem numeric;
  v_affected_profiles uuid[];
  p uuid;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  SELECT array_agg(DISTINCT beneficiary_profile_id)
  INTO v_affected_profiles
  FROM public.commissions
  WHERE partner_order_id = _order_id;

  DELETE FROM public.commissions WHERE partner_order_id = _order_id;

  IF COALESCE(o.system_fee, 0) > 0 AND EXISTS (
    SELECT 1 FROM public.admin_system_wallet_entries
    WHERE partner_order_id = _order_id
      AND kind = 'credit'
      AND slot_label ILIKE 'Taxa do Sistema -%'
  ) THEN
    UPDATE public.admin_system_wallet
    SET available_balance = GREATEST(0, available_balance - o.system_fee),
        total_earned = GREATEST(0, total_earned - o.system_fee),
        updated_at = now()
    WHERE id = true;
  END IF;
  DELETE FROM public.admin_system_wallet_entries WHERE partner_order_id = _order_id;

  SELECT coach_id INTO v_student_coach_id FROM public.students WHERE id = o.student_id;
  v_selling_coach_id := v_student_coach_id;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  IF o.professional_product_id IS NOT NULL THEN
    SELECT * INTO v_prod FROM public.professional_products WHERE id = o.professional_product_id;
  END IF;

  v_gross := COALESCE(o.gross_amount, 0);
  v_fee_pct := CASE o.payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, o.coach_commission_pct, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_rem - v_coach_amt, 2);

  UPDATE public.partner_product_orders SET
    selling_coach_id = v_selling_coach_id,
    upline_l1_coach_id = v_upline1,
    upline_l2_coach_id = v_upline2,
    upline_l3_coach_id = v_upline3,
    payment_fee = v_fee,
    tax_amount = v_tax,
    system_fee = v_sys,
    coach_commission_pct = v_coach_pct,
    coach_commission_amount = v_coach_amt,
    network_l1_amount = v_l1,
    network_l2_amount = v_l2,
    network_l3_amount = v_l3,
    coach_net_amount = v_coach_net,
    partner_net_amount = v_partner_net,
    master_coach_cross_bonus_amount = 0,
    master_coach_cross_beneficiary_coach_id = NULL,
    paid_at = NULL
  WHERE id = _order_id;

  PERFORM public.process_partner_product_order_paid(_order_id);

  IF v_affected_profiles IS NOT NULL THEN
    FOREACH p IN ARRAY v_affected_profiles LOOP
      PERFORM public.recalc_wallet_for_profile(p);
    END LOOP;
  END IF;
END;
$function$;


DO $$
DECLARE
  r record;
BEGIN
  FOR r IN
    SELECT o.id
    FROM public.partner_product_orders o
    LEFT JOIN public.students s ON s.id = o.student_id
    WHERE o.status = 'paid'
      AND (
        o.selling_coach_id IS DISTINCT FROM s.coach_id
        OR (
          o.master_coach_cross_bonus_amount > 0
          AND o.master_coach_cross_beneficiary_coach_id = s.coach_id
        )
      )
  LOOP
    BEGIN
      PERFORM public.admin_reprocess_partner_order(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha ao reprocessar pedido %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;
