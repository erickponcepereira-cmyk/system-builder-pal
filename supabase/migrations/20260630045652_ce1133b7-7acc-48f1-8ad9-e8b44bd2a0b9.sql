
-- 1) Novos campos no pedido
ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS referred_by_student_id uuid REFERENCES public.students(id),
  ADD COLUMN IF NOT EXISTS referral_fitcoin_amount numeric(12,2) NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_ppo_referred_by_student ON public.partner_product_orders(referred_by_student_id);

-- 2) RPC: pedido de empresa parceira
CREATE OR REPLACE FUNCTION public.create_partner_company_order(
  _partner_product_id uuid,
  _student_id uuid DEFAULT NULL::uuid,
  _payment_method text DEFAULT 'pix'::text,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_student_id uuid; v_student_coach_id uuid; v_selling_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid;
  v_requested_is_own_student boolean := false; v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL;
  v_master_pct numeric; v_rem numeric;
  v_fitcoin numeric := 0; v_partner_share numeric; v_referrer_student uuid;
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

  SELECT pp.id, pp.partner_id, pp.price, pp.status, pp.is_active_by_partner, pp.kind, pp.coach_commission_percentage
    INTO v_prod FROM public.partner_products pp WHERE pp.id = _partner_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_partner <> true OR v_prod.kind <> 'paid' THEN
    RAISE EXCEPTION 'Produto indisponível'; END IF;

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
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_partner_share := ROUND(v_rem - v_coach_amt, 2);

  -- Indicação: 50% da comissão bruta do coach vira Fitcoin do indicador
  -- (ignora se indicado por si mesmo)
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

  IF _student_id IS NOT NULL AND NOT v_requested_is_own_student AND v_caller_coach_id IS NOT NULL
     AND v_student_coach_id IS NOT NULL AND v_caller_coach_id <> v_student_coach_id
     AND public.is_master_coach(v_caller_coach_id) THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2);
    v_cross_beneficiary := v_caller_coach_id;
    v_coach_net := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;

  INSERT INTO public.partner_product_orders (
    student_id, partner_product_id, partner_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount,
    master_coach_cross_bonus_amount, master_coach_cross_beneficiary_coach_id,
    referred_by_student_id, referral_fitcoin_amount, metadata
  )
  VALUES (
    v_student_id, v_prod.id, v_prod.partner_id, v_selling_coach_id,
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

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');
  RETURN v_order_id;
END;
$function$;

-- 3) RPC: pedido de produto profissional avulso
CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix'::text,
  _buyer_student_id uuid DEFAULT NULL::uuid,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
DECLARE
  v_student_id uuid; v_selling_coach_id uuid; v_student_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid;
  v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL; v_master_pct numeric; v_rem numeric;
  v_fitcoin numeric := 0; v_partner_share numeric; v_referrer_student uuid;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN RAISE EXCEPTION 'Método de pagamento inválido'; END IF;
  SELECT c.id INTO v_caller_coach_id FROM public.coaches c JOIN public.profiles p ON p.id = c.profile_id WHERE p.user_id = auth.uid() LIMIT 1;

  IF _buyer_student_id IS NOT NULL THEN
    IF v_caller_coach_id IS NULL THEN RAISE EXCEPTION 'Apenas coaches podem comprar em nome de outro aluno'; END IF;
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s WHERE s.id = _buyer_student_id;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;
    IF v_student_coach_id <> v_caller_coach_id AND NOT public.is_master_coach(v_caller_coach_id) THEN
      RAISE EXCEPTION 'Aluno não pertence à sua carteira e seu perfil não é Master Coach'; END IF;
  ELSE
    SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid() LIMIT 1;
    IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;
  END IF;
  v_selling_coach_id := v_student_coach_id;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível'; END IF;

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
  v_sys := ROUND(v_rem * 5 / 100, 2);
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

  IF _buyer_student_id IS NOT NULL AND v_caller_coach_id IS NOT NULL
     AND v_student_coach_id IS NOT NULL AND v_caller_coach_id <> v_student_coach_id
     AND public.is_master_coach(v_caller_coach_id) THEN
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

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido criado');
  RETURN v_order_id;
END;
$function$;

-- 4) RPC: agendamento profissional
CREATE OR REPLACE FUNCTION public.create_scheduled_professional_order(
  _professional_product_id uuid,
  _starts_at timestamp with time zone,
  _payment_method text DEFAULT 'pix'::text,
  _student_id uuid DEFAULT NULL::uuid,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
RETURNS uuid LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public' AS $function$
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

  v_selling_coach_id := v_student_coach_id;
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
  v_sys := ROUND(v_rem * 5 / 100, 2);
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

GRANT EXECUTE ON FUNCTION public.create_partner_company_order(uuid, uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_partner_product_order(uuid, text, uuid, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.create_scheduled_professional_order(uuid, timestamptz, text, uuid, uuid) TO authenticated;

-- 5) Processamento de pagamento: credita Fitcoin de indicação como commission (is_referral=true)
CREATE OR REPLACE FUNCTION public.process_partner_product_order_paid(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o record;
  v_profile uuid;
  v_seller_profile uuid;
  v_creator_profile uuid;
  v_mc_profile uuid;
  v_ref_profile uuid;
  v_source_label text;
  v_paid_at timestamptz;
  v_available_at timestamptz;
  v_paid_month date;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;

  IF o.status <> 'paid' THEN
    UPDATE public.partner_product_orders SET status = 'paid' WHERE id = _order_id;
    o.status := 'paid';
  END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_available_at := v_paid_at + interval '7 days';
  v_paid_month := date_trunc('month', v_paid_at)::date;
  v_source_label := CASE
    WHEN o.partner_product_id IS NOT NULL THEN 'Venda de Parceiro'
    WHEN o.professional_product_id IS NOT NULL THEN 'Venda de Profissional'
    ELSE 'Venda de Parceiro/Profissional'
  END;

  IF o.selling_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_seller_profile FROM public.coaches WHERE id = o.selling_coach_id;
  END IF;
  IF o.partner_id IS NOT NULL THEN
    SELECT profile_id INTO v_creator_profile FROM public.partners WHERE id = o.partner_id;
  ELSIF o.professional_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_creator_profile FROM public.coaches WHERE id = o.professional_coach_id;
  END IF;

  IF COALESCE(o.system_fee, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.admin_system_wallet_entries
    WHERE partner_order_id = o.id AND kind = 'credit' AND slot_label = 'Taxa do Sistema - ' || v_source_label
  ) THEN
    UPDATE public.admin_system_wallet
    SET available_balance = available_balance + o.system_fee,
        total_earned = total_earned + o.system_fee,
        updated_at = now()
    WHERE id = true;
    INSERT INTO public.admin_system_wallet_entries (transaction_id, partner_order_id, slot_label, amount, kind, notes, created_at)
    VALUES (NULL, o.id, 'Taxa do Sistema - ' || v_source_label, o.system_fee, 'credit', o.order_number, v_paid_at);
  END IF;

  IF COALESCE(o.payment_fee, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.admin_system_wallet_entries
    WHERE partner_order_id = o.id AND kind = 'credit' AND slot_label = 'Taxa de Pagamento - ' || v_source_label
  ) THEN
    INSERT INTO public.admin_system_wallet_entries (transaction_id, partner_order_id, slot_label, amount, kind, notes, created_at)
    VALUES (NULL, o.id, 'Taxa de Pagamento - ' || v_source_label, o.payment_fee, 'credit', o.order_number, v_paid_at);
  END IF;

  IF COALESCE(o.tax_amount, 0) > 0 AND NOT EXISTS (
    SELECT 1 FROM public.admin_system_wallet_entries
    WHERE partner_order_id = o.id AND kind = 'credit' AND slot_label = 'Imposto - ' || v_source_label
  ) THEN
    INSERT INTO public.admin_system_wallet_entries (transaction_id, partner_order_id, slot_label, amount, kind, notes, created_at)
    VALUES (NULL, o.id, 'Imposto - ' || v_source_label, o.tax_amount, 'credit', o.order_number, v_paid_at);
  END IF;

  IF o.paid_at IS NOT NULL THEN
    IF o.partner_id IS NOT NULL THEN PERFORM public.recalc_partner_wallet(o.partner_id); END IF;
    IF o.professional_coach_id IS NOT NULL THEN PERFORM public.recalc_professional_wallet(o.professional_coach_id); END IF;
    RETURN;
  END IF;

  IF o.selling_coach_id IS NOT NULL AND o.coach_net_amount > 0 AND v_seller_profile IS NOT NULL THEN
    INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
    VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.coach_net_amount, 'pending', v_available_at, v_paid_at, 'Comissão do Vendedor (Parceiro/Profissional)');
    PERFORM public.recalc_wallet_for_profile(v_seller_profile);
  END IF;

  IF o.network_l1_amount > 0 THEN
    IF o.upline_l1_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l1_coach_id;
      IF v_profile IS NOT NULL THEN
        INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
        VALUES (o.id, v_profile, o.upline_l1_coach_id, 1, o.network_l1_amount, 'pending', v_available_at, v_paid_at, 'Upline 1');
        PERFORM public.recalc_wallet_for_profile(v_profile);
      END IF;
    ELSIF v_seller_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.network_l1_amount, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N1)');
      PERFORM public.recalc_wallet_for_profile(v_seller_profile);
    END IF;
  END IF;

  IF o.network_l2_amount > 0 THEN
    IF o.upline_l2_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l2_coach_id;
      IF v_profile IS NOT NULL THEN
        INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
        VALUES (o.id, v_profile, o.upline_l2_coach_id, 2, o.network_l2_amount, 'pending', v_available_at, v_paid_at, 'Upline 2');
        PERFORM public.recalc_wallet_for_profile(v_profile);
      END IF;
    ELSIF v_seller_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.network_l2_amount, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N2)');
      PERFORM public.recalc_wallet_for_profile(v_seller_profile);
    END IF;
  END IF;

  IF o.network_l3_amount > 0 THEN
    IF o.upline_l3_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l3_coach_id;
      IF v_profile IS NOT NULL THEN
        INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
        VALUES (o.id, v_profile, o.upline_l3_coach_id, 3, o.network_l3_amount, 'pending', v_available_at, v_paid_at, 'Upline 3');
        PERFORM public.recalc_wallet_for_profile(v_profile);
      END IF;
    ELSIF v_seller_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.network_l3_amount, 'pending', v_available_at, v_paid_at, 'Comissão Direta (sem upline N3)');
      PERFORM public.recalc_wallet_for_profile(v_seller_profile);
    END IF;
  END IF;

  IF COALESCE(o.master_coach_cross_bonus_amount, 0) > 0 AND o.master_coach_cross_beneficiary_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_mc_profile FROM public.coaches WHERE id = o.master_coach_cross_beneficiary_coach_id;
    IF v_mc_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, is_master_coach_commission, slot_label)
      VALUES (o.id, v_mc_profile, o.master_coach_cross_beneficiary_coach_id, 0, o.master_coach_cross_bonus_amount, 'pending', v_available_at, v_paid_at, true, 'Master Coach (cross-sale)');
      PERFORM public.recalc_wallet_for_profile(v_mc_profile);
    END IF;
  END IF;

  -- Fitcoin do aluno indicador (50% da comissão bruta do coach)
  IF COALESCE(o.referral_fitcoin_amount, 0) > 0 AND o.referred_by_student_id IS NOT NULL THEN
    SELECT profile_id INTO v_ref_profile FROM public.students WHERE id = o.referred_by_student_id;
    IF v_ref_profile IS NOT NULL THEN
      INSERT INTO public.commissions (
        partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount,
        status, available_at, created_at, is_referral, referred_by_student_id, slot_label
      )
      VALUES (
        o.id, v_ref_profile, NULL, 0, o.referral_fitcoin_amount,
        'pending', v_available_at, v_paid_at, true, o.referred_by_student_id,
        'Fitcoin de Indicação (' || v_source_label || ')'
      );
      PERFORM public.recalc_student_wallet_for_referral(o.referred_by_student_id);
    END IF;
  END IF;

  UPDATE public.partner_product_orders SET paid_at = v_paid_at WHERE id = _order_id;

  IF o.partner_id IS NOT NULL THEN PERFORM public.recalc_partner_wallet(o.partner_id); END IF;
  IF o.professional_coach_id IS NOT NULL THEN PERFORM public.recalc_professional_wallet(o.professional_coach_id); END IF;

  IF o.selling_coach_id IS NOT NULL THEN
    PERFORM public.upsert_monthly_ranking_on_sale(o.selling_coach_id, 1, COALESCE(o.gross_amount, 0), v_paid_month);
  END IF;
  IF o.selling_coach_id IS DISTINCT FROM o.professional_coach_id AND o.professional_coach_id IS NOT NULL THEN
    PERFORM public.upsert_monthly_ranking_on_sale(o.professional_coach_id, 1, COALESCE(o.gross_amount, 0), v_paid_month);
  END IF;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento aprovado; valores liberam para saque em 7 dias')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_partner_product_order_paid(uuid) TO authenticated, service_role;
