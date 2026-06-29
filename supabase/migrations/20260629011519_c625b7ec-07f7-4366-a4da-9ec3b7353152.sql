CREATE OR REPLACE FUNCTION public.create_partner_company_order(_partner_product_id uuid, _student_id uuid DEFAULT NULL::uuid, _payment_method text DEFAULT 'pix'::text)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_student_id uuid; v_student_coach_id uuid; v_selling_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid;
  v_requested_is_own_student boolean := false; v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL;
  v_master_pct numeric; v_rem numeric;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;

  SELECT c.id INTO v_caller_coach_id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid() LIMIT 1;

  IF _student_id IS NOT NULL THEN
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s WHERE s.id = _student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;

    SELECT EXISTS (SELECT 1 FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE s.id = v_student_id AND p.user_id = auth.uid()) INTO v_requested_is_own_student;
    IF NOT v_requested_is_own_student THEN
      IF v_caller_coach_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não pertence ao usuário logado'; END IF;
      IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
        RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach';
      END IF;
    END IF;
    v_selling_coach_id := v_student_coach_id;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
    v_selling_coach_id := v_student_coach_id;
  END IF;

  SELECT pp.id, pp.partner_id, pp.price, pp.status, pp.is_active_by_partner, pp.kind, pp.coach_commission_percentage INTO v_prod FROM public.partner_products pp WHERE pp.id = _partner_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_partner <> true OR v_prod.kind <> 'paid' THEN RAISE EXCEPTION 'Produto indisponível'; END IF;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1; IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0); v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END; v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2); v_rem := ROUND(v_gross - v_fee, 2); v_tax := ROUND(v_rem * 6 / 100, 2); v_rem := ROUND(v_rem - v_tax, 2); v_sys := ROUND(v_rem * 5 / 100, 2); v_rem := ROUND(v_rem - v_sys, 2); v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_coach_amt * 3 / 100, 2); v_l2 := ROUND(v_coach_amt * 2 / 100, 2); v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2); v_partner_net := ROUND(v_rem - v_coach_amt, 2);

  IF _student_id IS NOT NULL AND NOT v_requested_is_own_student AND v_caller_coach_id IS NOT NULL AND v_student_coach_id IS NOT NULL AND v_caller_coach_id <> v_student_coach_id AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;

  INSERT INTO public.partner_product_orders (student_id, partner_product_id, partner_id, selling_coach_id, upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id, payment_method, status, gross_amount, payment_fee, tax_amount, system_fee, coach_commission_pct, coach_commission_amount, network_l1_amount, network_l2_amount, network_l3_amount, coach_net_amount, partner_net_amount, master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id, metadata)
  VALUES (v_student_id, v_prod.id, v_prod.partner_id, v_selling_coach_id, v_upline1, v_upline2, v_upline3, _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys, v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net, v_cross_bonus, v_cross_beneficiary,
    jsonb_strip_nulls(jsonb_build_object('created_by_coach_id', v_caller_coach_id, 'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END)))
  RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note) VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');
  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_partner_product_order(_professional_product_id uuid, _payment_method text DEFAULT 'pix'::text, _buyer_student_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_student_id uuid; v_selling_coach_id uuid; v_student_coach_id uuid; v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric; v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid; v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL; v_master_pct numeric; v_rem numeric;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
  SELECT c.id INTO v_caller_coach_id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
  IF _buyer_student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN RAISE EXCEPTION 'Apenas coaches podem comprar em nome de outro aluno'; END IF;
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s WHERE s.id = _buyer_student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;
  v_selling_coach_id := v_student_coach_id;
  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN RAISE EXCEPTION 'Produto indisponível'; END IF;
  IF v_selling_coach_id IS NOT NULL THEN SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id; IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1; IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF; END IF;
  v_gross := COALESCE(v_prod.price, 0); v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END; v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2); v_rem := ROUND(v_gross - v_fee, 2); v_tax := ROUND(v_rem * 6 / 100, 2); v_rem := ROUND(v_rem - v_tax, 2); v_sys := ROUND(v_rem * 5 / 100, 2); v_rem := ROUND(v_rem - v_sys, 2); v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_coach_amt * 3 / 100, 2); v_l2 := ROUND(v_coach_amt * 2 / 100, 2); v_l3 := ROUND(v_coach_amt * 1 / 100, 2); v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2); v_partner_net := ROUND(v_rem - v_coach_amt, 2);
  IF _buyer_student_id IS NOT NULL AND v_caller_coach_id IS NOT NULL AND v_student_coach_id IS NOT NULL AND v_caller_coach_id <> v_student_coach_id AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10))); v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2); v_cross_beneficiary := v_caller_coach_id; v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;
  INSERT INTO public.partner_product_orders (student_id, professional_product_id, professional_coach_id, selling_coach_id, upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id, payment_method, status, gross_amount, payment_fee, tax_amount, system_fee, coach_commission_pct, coach_commission_amount, network_l1_amount, network_l2_amount, network_l3_amount, coach_net_amount, partner_net_amount, master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id, metadata)
  VALUES (v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id, v_upline1, v_upline2, v_upline3, _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys, v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net, v_cross_bonus, v_cross_beneficiary,
    jsonb_strip_nulls(jsonb_build_object('created_by_coach_id', v_caller_coach_id, 'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END)))
  RETURNING id INTO v_order_id;
  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note) VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), NULL);
  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(_professional_product_id uuid, _starts_at timestamp with time zone, _payment_method text DEFAULT 'pix'::text, _student_id uuid DEFAULT NULL::uuid)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_student_id uuid; v_student_coach_id uuid; v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record; v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric; v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric; v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid; v_ends_at timestamptz; v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL; v_master_pct numeric; v_selling_coach_id uuid; v_rem numeric;
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
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;
  v_ends_at := _starts_at + make_interval(mins => COALESCE(v_prod.default_duration_minutes, 30));
  IF EXISTS (SELECT 1 FROM public.professional_appointments WHERE professional_coach_id = v_prod.coach_id AND status = 'scheduled' AND starts_at < v_ends_at AND ends_at > _starts_at) THEN RAISE EXCEPTION 'Horário não está mais disponível'; END IF;
  IF _starts_at < now() THEN RAISE EXCEPTION 'Não é possível agendar no passado'; END IF;
  v_selling_coach_id := v_student_coach_id;
  IF v_selling_coach_id IS NOT NULL THEN SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id; IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1; IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF; END IF;
  v_gross := COALESCE(v_prod.price, 0); v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END; v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2); v_rem := ROUND(v_gross - v_fee, 2); v_tax := ROUND(v_rem * 6 / 100, 2); v_rem := ROUND(v_rem - v_tax, 2); v_sys := ROUND(v_rem * 5 / 100, 2); v_rem := ROUND(v_rem - v_sys, 2); v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_coach_amt * 3 / 100, 2); v_l2 := ROUND(v_coach_amt * 2 / 100, 2); v_l3 := ROUND(v_coach_amt * 1 / 100, 2); v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2); v_partner_net := ROUND(v_rem - v_coach_amt, 2);
  IF _student_id IS NOT NULL AND v_caller_coach_id IS NOT NULL AND v_student_coach_id IS NOT NULL AND v_caller_coach_id <> v_student_coach_id AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10))); v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2); v_cross_beneficiary := v_caller_coach_id; v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;
  INSERT INTO public.partner_product_orders (student_id, professional_product_id, professional_coach_id, selling_coach_id, upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id, payment_method, status, gross_amount, payment_fee, tax_amount, system_fee, coach_commission_pct, coach_commission_amount, network_l1_amount, network_l2_amount, network_l3_amount, coach_net_amount, partner_net_amount, master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id, metadata)
  VALUES (v_student_id, v_prod.id, v_prod.coach_id, v_selling_coach_id, v_upline1, v_upline2, v_upline3, _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys, v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net, v_cross_bonus, v_cross_beneficiary,
    jsonb_strip_nulls(jsonb_build_object('created_by_coach_id', v_caller_coach_id, 'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END)))
  RETURNING id INTO v_order_id;
  INSERT INTO public.professional_appointments (professional_coach_id, product_id, seller_coach_id, student_id, order_id, starts_at, ends_at, cancellation_window_hours) VALUES (v_prod.coach_id, v_prod.id, v_selling_coach_id, v_student_id, v_order_id, _starts_at, v_ends_at, COALESCE(v_prod.cancellation_window_hours, 24));
  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note) VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Agendamento profissional criado');
  RETURN v_order_id;
END;
$function$;

DO $$
DECLARE
  o record; v_creator_coach_id uuid; v_student_coach_id uuid; v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_master_pct numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric; v_base numeric; v_cross numeric; v_coach_net numeric; v_paid_at timestamptz; v_available_at timestamptz; v_seller_profile uuid; v_profile uuid; v_mc_profile uuid; v_old_profiles uuid[]; v_pid uuid;
BEGIN
  FOR o IN SELECT ppo.*, s.coach_id AS actual_student_coach_id, creator.coach_id AS creator_coach_id
           FROM public.partner_product_orders ppo
           JOIN public.students s ON s.id = ppo.student_id
           LEFT JOIN LATERAL (SELECT c.id AS coach_id FROM public.partner_product_order_status_log l JOIN public.coaches c ON c.profile_id = l.changed_by WHERE l.order_id = ppo.id AND l.changed_by IS NOT NULL ORDER BY l.created_at ASC LIMIT 1) creator ON true
           WHERE ppo.status IN ('pending','paid') AND s.coach_id IS NOT NULL AND creator.coach_id IS NOT NULL AND creator.coach_id <> s.coach_id AND public.is_master_coach(creator.coach_id) AND (ppo.partner_product_id IS NOT NULL OR ppo.professional_product_id IS NOT NULL)
  LOOP
    v_creator_coach_id := o.creator_coach_id; v_student_coach_id := o.actual_student_coach_id;
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_student_coach_id; v_upline2 := NULL; v_upline3 := NULL;
    IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1; IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF;
    v_l1 := ROUND(COALESCE(o.coach_commission_amount, 0) * 3 / 100, 2); v_l2 := ROUND(COALESCE(o.coach_commission_amount, 0) * 2 / 100, 2); v_l3 := ROUND(COALESCE(o.coach_commission_amount, 0) * 1 / 100, 2); v_base := ROUND(COALESCE(o.coach_commission_amount, 0) - v_l1 - v_l2 - v_l3, 2);
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10))); v_cross := TRUNC(v_base * v_master_pct / 100, 2); v_coach_net := GREATEST(0, ROUND(v_base - v_cross, 2));
    UPDATE public.partner_product_orders SET selling_coach_id = v_student_coach_id, upline_l1_coach_id = v_upline1, upline_l2_coach_id = v_upline2, upline_l3_coach_id = v_upline3, network_l1_amount = v_l1, network_l2_amount = v_l2, network_l3_amount = v_l3, coach_net_amount = v_coach_net, master_coach_cross_bonus_amount = v_cross, master_coach_cross_beneficiary_coach_id = v_creator_coach_id, metadata = jsonb_strip_nulls(COALESCE(metadata, '{}'::jsonb) || jsonb_build_object('created_by_coach_id', v_creator_coach_id, 'master_cross_sale', jsonb_build_object('seller_coach_id', v_creator_coach_id, 'titular_coach_id', v_student_coach_id, 'master_pct', v_master_pct, 'backfilled', true))) WHERE id = o.id;

    IF o.status = 'paid' AND o.paid_at IS NOT NULL THEN
      v_paid_at := o.paid_at; v_available_at := v_paid_at + interval '7 days';
      SELECT COALESCE(array_agg(DISTINCT beneficiary_profile_id), ARRAY[]::uuid[]) INTO v_old_profiles FROM public.commissions WHERE partner_order_id = o.id AND beneficiary_profile_id IS NOT NULL;
      DELETE FROM public.commissions WHERE partner_order_id = o.id;
      SELECT profile_id INTO v_seller_profile FROM public.coaches WHERE id = v_student_coach_id;
      IF v_seller_profile IS NOT NULL AND v_coach_net > 0 THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_seller_profile, v_student_coach_id, 0, v_coach_net, 'pending', v_available_at, v_paid_at, 'Comissão do Vendedor (Parceiro/Profissional)'); END IF;
      IF v_l1 > 0 THEN IF v_upline1 IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = v_upline1; IF v_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_profile, v_upline1, 1, v_l1, 'pending', v_available_at, v_paid_at, 'Upline 1'); END IF; ELSIF v_seller_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_seller_profile, v_student_coach_id, 0, v_l1, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N1)'); END IF; END IF;
      IF v_l2 > 0 THEN IF v_upline2 IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = v_upline2; IF v_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_profile, v_upline2, 2, v_l2, 'pending', v_available_at, v_paid_at, 'Upline 2'); END IF; ELSIF v_seller_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_seller_profile, v_student_coach_id, 0, v_l2, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N2)'); END IF; END IF;
      IF v_l3 > 0 THEN IF v_upline3 IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = v_upline3; IF v_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_profile, v_upline3, 3, v_l3, 'pending', v_available_at, v_paid_at, 'Upline 3'); END IF; ELSIF v_seller_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label) VALUES (o.id, v_seller_profile, v_student_coach_id, 0, v_l3, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N3)'); END IF; END IF;
      IF v_cross > 0 THEN SELECT profile_id INTO v_mc_profile FROM public.coaches WHERE id = v_creator_coach_id; IF v_mc_profile IS NOT NULL THEN INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, is_master_coach_commission, slot_label) VALUES (o.id, v_mc_profile, v_creator_coach_id, 0, v_cross, 'pending', v_available_at, v_paid_at, true, 'Master Coach (cross-sale)'); END IF; END IF;
      FOREACH v_pid IN ARRAY v_old_profiles LOOP PERFORM public.recalc_wallet_for_profile(v_pid); END LOOP;
      IF v_seller_profile IS NOT NULL THEN PERFORM public.recalc_wallet_for_profile(v_seller_profile); END IF;
      IF v_mc_profile IS NOT NULL THEN PERFORM public.recalc_wallet_for_profile(v_mc_profile); END IF;
    END IF;
  END LOOP;
END $$;