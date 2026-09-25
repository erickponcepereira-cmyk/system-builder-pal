-- Master Coach não vale na própria compra, e o reprocessamento volta a
-- preservar o bônus.
--
-- 1) COMPRAR PARA SI MESMO NÃO É VENDA CRUZADA
--
-- A venda cruzada dá ao Master Coach que opera a venda uma fatia da comissão
-- do coach titular do aluno. A condição comparava quem operou com o titular,
-- mas nunca com o COMPRADOR. Quando um coach comprava para o próprio cadastro
-- de aluno, `resolve_selling_coach` tirava ele de vendedor (ninguém vende para
-- si) e passava a venda ao titular — e o bônus continuava apontando para ele.
-- O comprador tirava uma fatia da comissão do próprio coach.
--
-- Até 24/09/2026: 7 pedidos pagos, R$ 14,48, todos de produto de parceiro
-- (Vimark 5, Luana 1, Ana Flávia 1, Erick 1 — o teste de R$ 1). Pedidos
-- cancelados também carregavam o valor, mas a comissão só nasce no pagamento,
-- então eles nunca moveram dinheiro.
--
-- Vale só daqui para frente, decisão do Erick: nenhum pedido passado muda. O
-- reprocessamento preserva o beneficiário gravado no pedido, então reprocessar
-- uma compra antiga também não mexe no bônus dela.
--
-- Os quatro caminhos que criam o bônus recebem a mesma regra:
--   create_partner_product_order         produto de profissional
--   create_scheduled_professional_order  produto de profissional com agenda
--   create_partner_company_order         produto de empresa parceira
--   apply_master_cross_sale_split        loja (gatilho em commissions)
--
-- 2) O REPROCESSAMENTO TINHA VOLTADO A APAGAR O BÔNUS
--
-- A migração 20260915145953 (Lovable, 15/09 15:00 UTC) regravou
-- `admin_reprocess_partner_order` com uma versão anterior à
-- 20260915140000: voltou a zerar o bônus de Master Coach — o defeito que
-- custou R$ 137,40 à Vimark — e deixou de preservar `available_at`. Nenhum
-- pedido com bônus foi reprocessado nesse intervalo (conferido em 24/09). A
-- versão certa volta aqui, sem mudança nenhuma.

-- O coach que opera a venda e o aluno que compra são a mesma pessoa?
CREATE OR REPLACE FUNCTION public.compra_para_si_mesmo(_coach_id uuid, _student_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $fn$
  SELECT EXISTS (
    SELECT 1
      FROM public.coaches c
      JOIN public.students s ON s.profile_id = c.profile_id
     WHERE c.id = _coach_id
       AND s.id = _student_id
  );
$fn$;

REVOKE ALL ON FUNCTION public.compra_para_si_mesmo(uuid, uuid) FROM PUBLIC, anon, authenticated;

CREATE OR REPLACE FUNCTION public.create_partner_product_order(_professional_product_id uuid, _payment_method text DEFAULT 'pix'::text, _buyer_student_id uuid DEFAULT NULL::uuid, _referred_by_student_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_student_id uuid; v_selling_coach_id uuid; v_student_coach_id uuid;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid; v_prod record;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric; v_fee_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric; v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric; v_order_id uuid; v_caller_coach_id uuid;
  v_cross_bonus numeric := 0; v_cross_beneficiary uuid := NULL; v_master_pct numeric; v_rem numeric;
  v_fitcoin numeric := 0; v_partner_share numeric; v_referrer_student uuid;
  v_tax_pct numeric; v_sys_pct numeric;
  v_l1_pct numeric; v_l2_pct numeric; v_l3_pct numeric;
  v_creator_pct numeric;
  v_is_master_cross boolean := false;
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

  -- Venda cruzada de Master Coach: o titular (coach do aluno) permanece dono da comissão.
  -- Comprar para si mesmo não é venda cruzada: sem isto o comprador levava uma
  -- fatia da comissão do próprio coach.
  v_is_master_cross := (
    _buyer_student_id IS NOT NULL
    AND v_caller_coach_id IS NOT NULL
    AND v_student_coach_id IS NOT NULL
    AND v_caller_coach_id <> v_student_coach_id
    AND public.is_master_coach(v_caller_coach_id)
    AND NOT public.compra_para_si_mesmo(v_caller_coach_id, v_student_id)
  );

  v_selling_coach_id := public.resolve_selling_coach(
    v_student_id,
    CASE
      WHEN v_is_master_cross THEN v_student_coach_id
      WHEN _buyer_student_id IS NOT NULL THEN v_caller_coach_id
      ELSE v_student_coach_id
    END
  );

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível'; END IF;

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2; END IF; END IF;
  END IF;

  v_gross   := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END;

  v_tax_pct := CASE WHEN COALESCE(v_prod.custom_split,false) AND COALESCE(v_prod.skip_tax,false) THEN 0 ELSE (public.taxa_vigente()).imposto_pct END;
  v_sys_pct := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL
                    THEN v_prod.system_fee_pct_override ELSE (public.taxa_vigente()).sistema_pct END;
  v_l1_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l1_pct_override IS NOT NULL
                    THEN v_prod.network_l1_pct_override ELSE (public.taxa_vigente()).rede_l1_pct END;
  v_l2_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l2_pct_override IS NOT NULL
                    THEN v_prod.network_l2_pct_override ELSE (public.taxa_vigente()).rede_l2_pct END;
  v_l3_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l3_pct_override IS NOT NULL
                    THEN v_prod.network_l3_pct_override ELSE (public.taxa_vigente()).rede_l3_pct END;

  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * v_tax_pct / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * v_sys_pct / 100, 2) END;
  v_rem := ROUND(v_rem - v_sys, 2);

  IF COALESCE(v_prod.custom_split,false) AND v_prod.creator_pct_override IS NOT NULL THEN
    v_creator_pct   := v_prod.creator_pct_override;
    v_partner_share := ROUND(v_rem * v_creator_pct / 100, 2);
    v_coach_amt     := ROUND(v_rem - v_partner_share, 2);
    v_coach_pct     := GREATEST(0, 100 - v_creator_pct);
  ELSE
    v_coach_pct     := COALESCE(v_prod.coach_commission_percentage, 10);
    v_coach_amt     := ROUND(v_rem * v_coach_pct / 100, 2);
    v_partner_share := ROUND(v_rem - v_coach_amt, 2);
  END IF;

  v_l1 := ROUND(v_coach_amt * v_l1_pct / 100, 2);
  v_l2 := ROUND(v_coach_amt * v_l2_pct / 100, 2);
  v_l3 := ROUND(v_coach_amt * v_l3_pct / 100, 2);

  v_referrer_student := _referred_by_student_id;
  IF v_referrer_student IS NOT NULL AND v_referrer_student = v_student_id THEN
    v_referrer_student := NULL;
  END IF;
  IF v_referrer_student IS NOT NULL AND v_coach_amt > 0 THEN
    v_fitcoin := CEIL(v_coach_amt * 50) / 100;
  END IF;

  v_coach_net   := GREATEST(0, ROUND(v_coach_amt - v_l1 - v_l2 - v_l3 - v_fitcoin, 2));
  v_partner_net := v_partner_share;

  IF v_is_master_cross THEN
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
  ) VALUES (
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
      'custom_split', CASE WHEN COALESCE(v_prod.custom_split,false) THEN jsonb_build_object(
          'skip_tax', COALESCE(v_prod.skip_tax,false),
          'system_fee_pct', v_sys_pct,
          'creator_pct', v_creator_pct,
          'network_l1_pct', v_l1_pct,
          'network_l2_pct', v_l2_pct,
          'network_l3_pct', v_l3_pct
        ) ELSE NULL END,
      'student_referral', CASE WHEN v_referrer_student IS NOT NULL THEN jsonb_build_object('referrer_student_id', v_referrer_student, 'fitcoin_amount', v_fitcoin) ELSE NULL END,
      'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END
    )))
  RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido criado');
  RETURN v_order_id;
END;
$function$;

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
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * (public.taxa_vigente()).imposto_pct / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL THEN v_prod.system_fee_pct_override ELSE (public.taxa_vigente()).sistema_pct END / 100, 2) END;
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

  v_l1 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l1_pct / 100, 2);
  v_l2 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l2_pct / 100, 2);
  v_l3 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l3_pct / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := v_partner_share;

  -- Comprar para si mesmo não é venda cruzada (ver create_partner_product_order).
  IF _student_id IS NOT NULL AND v_caller_coach_id IS NOT NULL AND v_student_coach_id IS NOT NULL
     AND v_caller_coach_id <> v_student_coach_id AND public.is_master_coach(v_caller_coach_id)
     AND NOT public.compra_para_si_mesmo(v_caller_coach_id, v_student_id) THEN
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

CREATE OR REPLACE FUNCTION public.create_partner_company_order(_partner_product_id uuid, _student_id uuid, _payment_method text, _referred_by_student_id uuid DEFAULT NULL::uuid)
 RETURNS uuid
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_prod public.partner_products%ROWTYPE;
  v_student_id uuid := _student_id;
  v_caller_coach_id uuid := public.current_coach_id();
  v_selling_coach_id uuid;
  v_student_coach_id uuid;
  v_requested_is_own_student boolean := false;
  v_is_master_cross boolean := false;
  v_upline1 uuid;
  v_upline2 uuid;
  v_upline3 uuid;
  v_gross numeric;
  v_fee_pct numeric;
  v_fee numeric;
  v_rem numeric;
  v_tax numeric;
  v_sys numeric;
  v_coach_pct numeric;
  v_coach_amt numeric;
  v_l1 numeric;
  v_l2 numeric;
  v_l3 numeric;
  v_coach_after_network numeric;
  v_coach_net numeric;
  v_partner_share numeric;
  v_partner_net numeric;
  v_master_pct numeric;
  v_cross_bonus numeric := 0;
  v_cross_beneficiary uuid := NULL;
  v_referrer_student uuid := NULL;
  v_fitcoin numeric := 0;
  v_order_id uuid;
  v_used int;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT *
    INTO v_prod
    FROM public.partner_products
   WHERE id = _partner_product_id
     AND status = 'approved'
     AND is_active_by_partner = true
   FOR UPDATE;

  IF NOT FOUND THEN
    RAISE EXCEPTION 'Produto parceiro indisponível';
  END IF;

  IF v_prod.stock IS NOT NULL THEN
    v_used := public.partner_product_used_slots(v_prod.id);

    IF v_used >= v_prod.stock THEN
      RAISE EXCEPTION 'Produto esgotado — 0 de % vagas restantes', v_prod.stock;
    END IF;
  END IF;

  IF v_student_id IS NULL THEN
    SELECT s.id, s.coach_id
      INTO v_student_id, v_student_coach_id
      FROM public.students s
     WHERE s.profile_id = public.current_profile_id();
  ELSE
    SELECT s.coach_id
      INTO v_student_coach_id
      FROM public.students s
     WHERE s.id = v_student_id;
  END IF;

  IF v_student_id IS NULL THEN
    RAISE EXCEPTION 'Aluno não encontrado';
  END IF;

  v_requested_is_own_student := (v_caller_coach_id IS NOT NULL AND v_student_coach_id = v_caller_coach_id);

  -- Venda cruzada de Master Coach: o titular (coach do aluno) permanece dono da comissão.
  -- Comprar para si mesmo não é venda cruzada: sem isto o comprador levava uma
  -- fatia da comissão do próprio coach.
  v_is_master_cross := (
    _student_id IS NOT NULL
    AND NOT v_requested_is_own_student
    AND v_caller_coach_id IS NOT NULL
    AND v_student_coach_id IS NOT NULL
    AND v_caller_coach_id <> v_student_coach_id
    AND public.is_master_coach(v_caller_coach_id)
    AND NOT public.compra_para_si_mesmo(v_caller_coach_id, v_student_id)
  );

  v_selling_coach_id := public.resolve_selling_coach(
    v_student_id,
    CASE WHEN v_is_master_cross THEN v_student_coach_id
         ELSE COALESCE(v_caller_coach_id, v_student_coach_id) END
  );

  IF v_selling_coach_id IS NULL THEN
    RAISE EXCEPTION 'Vendedor sem coach vinculado';
  END IF;

  SELECT c1.upline_coach_id,
         c2.upline_coach_id,
         c3.upline_coach_id
    INTO v_upline1, v_upline2, v_upline3
    FROM public.coaches c1
    LEFT JOIN public.coaches c2 ON c2.id = c1.upline_coach_id
    LEFT JOIN public.coaches c3 ON c3.id = c2.upline_coach_id
   WHERE c1.id = v_selling_coach_id;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE WHEN _payment_method = 'pix' THEN (public.taxa_vigente()).maquininha_pix ELSE (public.taxa_vigente()).maquininha_cartao END;
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * (public.taxa_vigente()).imposto_pct / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := CASE WHEN v_prod.system_fee_amount_override IS NOT NULL THEN LEAST(GREATEST(v_prod.system_fee_amount_override, 0), v_rem) ELSE ROUND(v_rem * COALESCE(v_prod.system_fee_pct_override, (public.taxa_vigente()).sistema_pct) / 100, 2) END;
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_partner_share := ROUND(v_rem - v_coach_amt, 2);

  v_l1 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l1_pct / 100, 2);
  v_l2 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l2_pct / 100, 2);
  v_l3 := ROUND(v_coach_amt * (public.taxa_vigente()).rede_l3_pct / 100, 2);
  v_coach_after_network := GREATEST(0, ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2));

  v_referrer_student := _referred_by_student_id;
  IF v_referrer_student IS NOT NULL AND v_referrer_student = v_student_id THEN
    v_referrer_student := NULL;
  END IF;

  IF v_referrer_student IS NOT NULL AND v_coach_after_network > 0 THEN
    v_fitcoin := CEIL(v_coach_after_network * 50) / 100;
    IF v_fitcoin > v_coach_after_network THEN
      v_fitcoin := v_coach_after_network;
    END IF;
  END IF;

  v_coach_net := GREATEST(0, ROUND(v_coach_after_network - v_fitcoin, 2));
  v_partner_net := v_partner_share;

  IF v_is_master_cross THEN
    SELECT COALESCE(master_coach_commission_pct, 10)
      INTO v_master_pct
      FROM public.coaches
     WHERE id = v_student_coach_id;

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
      'system_fee_pct', COALESCE(v_prod.system_fee_pct_override, (public.taxa_vigente()).sistema_pct),
      'student_referral', CASE WHEN v_referrer_student IS NOT NULL THEN jsonb_build_object('referrer_student_id', v_referrer_student, 'fitcoin_amount', v_fitcoin) ELSE NULL END,
      'master_cross_sale', CASE WHEN v_cross_beneficiary IS NOT NULL THEN jsonb_build_object('seller_coach_id', v_cross_beneficiary, 'titular_coach_id', v_selling_coach_id, 'master_pct', v_master_pct) ELSE NULL END
    ))
  )
  RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');

  RETURN v_order_id;
END;
$function$;

CREATE OR REPLACE FUNCTION public.apply_master_cross_sale_split()
 RETURNS trigger
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_order_id UUID;
  v_meta JSONB;
  v_seller_coach_id UUID;
  v_seller_profile_id UUID;
  v_pct NUMERIC(6,2);
  v_master_amount NUMERIC(12,2);
  v_new_amount NUMERIC(12,2);
  v_slot_label TEXT;
BEGIN
  IF COALESCE(NEW.is_master_coach_commission, false) THEN RETURN NEW; END IF;
  IF COALESCE(NEW.is_referral, false) THEN RETURN NEW; END IF;
  IF NEW.beneficiary_coach_id IS NULL THEN RETURN NEW; END IF;
  IF COALESCE(NEW.level, 0) <> 0 THEN RETURN NEW; END IF;
  IF NEW.amount IS NULL OR NEW.amount <= 0 THEN RETURN NEW; END IF;

  v_slot_label := LOWER(COALESCE(NEW.slot_label, ''));
  IF v_slot_label LIKE '%upline%' OR v_slot_label LIKE '%master coach%' THEN
    RETURN NEW;
  END IF;

  SELECT (t.metadata->>'store_order_id')::uuid
    INTO v_order_id
  FROM public.transactions t WHERE t.id = NEW.transaction_id;
  IF v_order_id IS NULL THEN RETURN NEW; END IF;

  SELECT metadata INTO v_meta FROM public.store_orders WHERE id = v_order_id;
  IF v_meta IS NULL THEN RETURN NEW; END IF;

  v_seller_coach_id := NULLIF(v_meta->'master_cross_sale'->>'seller_coach_id','')::uuid;
  IF v_seller_coach_id IS NULL THEN
    v_seller_coach_id := NULLIF(v_meta->>'created_by_coach_id','')::uuid;
  END IF;

  IF v_seller_coach_id IS NULL OR v_seller_coach_id = NEW.beneficiary_coach_id THEN
    RETURN NEW;
  END IF;
  IF NOT public.is_master_coach(v_seller_coach_id) THEN RETURN NEW; END IF;

  -- Quem compra para si mesmo não tira fatia da comissão do próprio coach.
  IF EXISTS (SELECT 1 FROM public.store_orders so
              WHERE so.id = v_order_id
                AND public.compra_para_si_mesmo(v_seller_coach_id, so.student_id)) THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(master_coach_commission_pct, 10) INTO v_pct
    FROM public.coaches WHERE id = NEW.beneficiary_coach_id;
  IF v_pct IS NULL THEN v_pct := 10; END IF;
  IF v_pct < 10 THEN v_pct := 10; END IF;
  IF v_pct > 70 THEN v_pct := 70; END IF;

  v_master_amount := ROUND(NEW.amount * (v_pct / 100.0), 2);
  IF v_master_amount <= 0 THEN RETURN NEW; END IF;
  v_new_amount := GREATEST(0, NEW.amount - v_master_amount);

  UPDATE public.commissions SET amount = v_new_amount WHERE id = NEW.id;

  SELECT profile_id INTO v_seller_profile_id FROM public.coaches WHERE id = v_seller_coach_id;
  IF v_seller_profile_id IS NULL THEN RETURN NEW; END IF;

  INSERT INTO public.commissions (
    transaction_id, beneficiary_profile_id, beneficiary_coach_id, level,
    percentage, amount, status, available_at,
    is_master_coach_commission, slot_label
  ) VALUES (
    NEW.transaction_id, v_seller_profile_id, v_seller_coach_id, 0,
    v_pct, v_master_amount, NEW.status, NEW.available_at,
    true, 'Master Coach (cross-sale)'
  );

  RETURN NEW;
END;
$function$;

-- Restaurada de 20260915140000_reprocessar_preserva_o_master_coach.sql.
CREATE OR REPLACE FUNCTION public.admin_reprocess_partner_order(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $fn$
DECLARE
  o record;
  v_upline1 uuid; v_upline2 uuid; v_upline3 uuid;
  v_gross numeric; v_fee numeric; v_tax numeric; v_sys numeric;
  v_fee_pct numeric; v_tax_pct numeric; v_sys_pct numeric;
  v_l1_pct numeric; v_l2_pct numeric; v_l3_pct numeric;
  v_coach_pct numeric; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_net numeric; v_partner_net numeric;
  v_selling_coach_id uuid; v_student_coach_id uuid;
  v_rem numeric; v_data date;
  v_affected_profiles uuid[]; p uuid;
  -- Escalares em vez de record: um record não atribuído explode ao ser lido,
  -- e era isso que derrubava o reprocessamento de TODO pedido de produto de
  -- parceiro — `v_prod` só era carregado no ramo de produto profissional.
  v_prod_coach_pct numeric; v_prod_sys_override numeric;
  v_custom boolean := false; v_skip_tax boolean := false;
  v_prod_l1 numeric; v_prod_l2 numeric; v_prod_l3 numeric;
  -- A linha do tempo que precisa sobreviver ao reprocessamento.
  v_paid_at_original timestamptz;
  v_available_original timestamptz;
  -- Quem recebe a venda cruzada, e quanto.
  v_master_beneficiary uuid;
  v_master_pct numeric;
  v_cross_bonus numeric := 0;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  v_paid_at_original   := o.paid_at;
  v_master_beneficiary := o.master_coach_cross_beneficiary_coach_id;

  SELECT array_agg(DISTINCT beneficiary_profile_id), min(available_at)
    INTO v_affected_profiles, v_available_original
    FROM public.commissions WHERE partner_order_id = _order_id;
  DELETE FROM public.commissions WHERE partner_order_id = _order_id;

  IF COALESCE(o.system_fee, 0) > 0 AND EXISTS (
    SELECT 1 FROM public.admin_system_wallet_entries
     WHERE partner_order_id = _order_id AND kind = 'credit'
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
  v_selling_coach_id := COALESCE(o.selling_coach_id, v_student_coach_id);

  IF v_selling_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_selling_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  -- Produto pode vir de qualquer uma das duas tabelas. `partner_products` não
  -- tem custom_split/skip_tax/overrides de rede — só a taxa de sistema.
  IF o.professional_product_id IS NOT NULL THEN
    SELECT coach_commission_percentage, system_fee_pct_override,
           COALESCE(custom_split,false), COALESCE(skip_tax,false),
           network_l1_pct_override, network_l2_pct_override, network_l3_pct_override
      INTO v_prod_coach_pct, v_prod_sys_override, v_custom, v_skip_tax,
           v_prod_l1, v_prod_l2, v_prod_l3
      FROM public.professional_products WHERE id = o.professional_product_id;
  ELSIF o.partner_product_id IS NOT NULL THEN
    SELECT coach_commission_percentage, system_fee_pct_override
      INTO v_prod_coach_pct, v_prod_sys_override
      FROM public.partner_products WHERE id = o.partner_product_id;
  END IF;

  v_data  := COALESCE(o.paid_at, o.created_at)::date;
  v_gross := COALESCE(o.gross_amount, 0);

  -- Mesma cascata de `create_partner_product_order`, incluindo o portão
  -- `custom_split`. Sem isto o reprocessamento reescrevia um produto de 15%
  -- de taxa de sistema com os 7% padrão, em silêncio.
  v_fee_pct := CASE o.payment_method WHEN 'pix' THEN (public.taxa_vigente(v_data)).maquininha_pix
                                     ELSE (public.taxa_vigente(v_data)).maquininha_cartao END;
  v_tax_pct := CASE WHEN v_custom AND v_skip_tax THEN 0 ELSE (public.taxa_vigente(v_data)).imposto_pct END;
  v_sys_pct := CASE WHEN v_prod_sys_override IS NOT NULL AND (v_custom OR o.professional_product_id IS NULL)
                    THEN v_prod_sys_override ELSE (public.taxa_vigente(v_data)).sistema_pct END;
  v_l1_pct  := CASE WHEN v_custom AND v_prod_l1 IS NOT NULL THEN v_prod_l1 ELSE (public.taxa_vigente(v_data)).rede_l1_pct END;
  v_l2_pct  := CASE WHEN v_custom AND v_prod_l2 IS NOT NULL THEN v_prod_l2 ELSE (public.taxa_vigente(v_data)).rede_l2_pct END;
  v_l3_pct  := CASE WHEN v_custom AND v_prod_l3 IS NOT NULL THEN v_prod_l3 ELSE (public.taxa_vigente(v_data)).rede_l3_pct END;
  v_coach_pct := COALESCE(v_prod_coach_pct, o.coach_commission_pct, 10);

  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * v_tax_pct / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * v_sys_pct / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_coach_amt * v_l1_pct / 100, 2);
  v_l2 := ROUND(v_coach_amt * v_l2_pct / 100, 2);
  v_l3 := ROUND(v_coach_amt * v_l3_pct / 100, 2);
  v_coach_net   := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_rem - v_coach_amt, 2);

  -- Venda cruzada: o bônus sai de dentro do líquido do coach titular, como na
  -- venda original. Só recalcula se o pedido já tinha um beneficiário.
  IF v_master_beneficiary IS NOT NULL THEN
    SELECT COALESCE(master_coach_commission_pct, 10) INTO v_master_pct
      FROM public.coaches WHERE id = v_student_coach_id;
    v_master_pct := GREATEST(10, LEAST(70, COALESCE(v_master_pct, 10)));
    v_cross_bonus := TRUNC(v_coach_net * v_master_pct / 100, 2);
    v_coach_net   := GREATEST(0, ROUND(v_coach_net - v_cross_bonus, 2));
  END IF;

  UPDATE public.partner_product_orders SET
    selling_coach_id = v_selling_coach_id,
    upline_l1_coach_id = v_upline1, upline_l2_coach_id = v_upline2, upline_l3_coach_id = v_upline3,
    payment_fee = v_fee, tax_amount = v_tax, system_fee = v_sys,
    coach_commission_pct = v_coach_pct, coach_commission_amount = v_coach_amt,
    network_l1_amount = v_l1, network_l2_amount = v_l2, network_l3_amount = v_l3,
    coach_net_amount = v_coach_net, partner_net_amount = v_partner_net,
    master_coach_cross_bonus_amount = v_cross_bonus,
    master_coach_cross_beneficiary_coach_id = v_master_beneficiary,
    paid_at = NULL
  WHERE id = _order_id;

  PERFORM public.process_partner_product_order_paid(_order_id);

  -- Devolve a linha do tempo. Sem isto o pedido sai daqui carimbado com a data
  -- de hoje e as comissões recriadas ficam bloqueadas por mais 7 dias.
  IF v_paid_at_original IS NOT NULL THEN
    UPDATE public.partner_product_orders
       SET paid_at = v_paid_at_original
     WHERE id = _order_id;

    UPDATE public.commissions
       SET created_at   = v_paid_at_original,
           available_at = COALESCE(v_available_original, v_paid_at_original + interval '7 days')
     WHERE partner_order_id = _order_id;

    -- Comissão cujo prazo já venceu volta a constar liberada, que é o estado em
    -- que ela estava antes de ser apagada. Deixá-la 'pending' com data no
    -- passado faria o extrato e o status discordarem.
    UPDATE public.commissions
       SET status = 'available'
     WHERE partner_order_id = _order_id
       AND status = 'pending'
       AND available_at <= now();
  END IF;

  IF v_affected_profiles IS NOT NULL THEN
    FOREACH p IN ARRAY v_affected_profiles LOOP
      PERFORM public.recalc_wallet_for_profile(p);
    END LOOP;
  END IF;
END;
$fn$;
