
ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS custom_split boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS skip_tax boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS system_fee_pct_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS creator_pct_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS network_l1_pct_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS network_l2_pct_override numeric(5,2),
  ADD COLUMN IF NOT EXISTS network_l3_pct_override numeric(5,2);

CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id uuid,
  _payment_method text DEFAULT 'pix'::text,
  _buyer_student_id uuid DEFAULT NULL::uuid,
  _referred_by_student_id uuid DEFAULT NULL::uuid
)
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

  v_gross   := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;

  v_tax_pct := CASE WHEN COALESCE(v_prod.custom_split,false) AND COALESCE(v_prod.skip_tax,false) THEN 0 ELSE 6 END;
  v_sys_pct := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.system_fee_pct_override IS NOT NULL
                    THEN v_prod.system_fee_pct_override ELSE 5 END;
  v_l1_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l1_pct_override IS NOT NULL
                    THEN v_prod.network_l1_pct_override ELSE 3 END;
  v_l2_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l2_pct_override IS NOT NULL
                    THEN v_prod.network_l2_pct_override ELSE 2 END;
  v_l3_pct  := CASE WHEN COALESCE(v_prod.custom_split,false) AND v_prod.network_l3_pct_override IS NOT NULL
                    THEN v_prod.network_l3_pct_override ELSE 1 END;

  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * v_tax_pct / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * v_sys_pct / 100, 2);
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

INSERT INTO public.professional_products (
  coach_id, name, description, price, status,
  is_active_by_professional, is_ready_for_sale,
  kind, redemption_mode, price_input_mode,
  coach_commission_percentage,
  custom_split, skip_tax,
  system_fee_pct_override, creator_pct_override,
  network_l1_pct_override, network_l2_pct_override, network_l3_pct_override
)
SELECT
  c.id, 'Benefícios SINDSCOND',
  'Assinatura de benefícios do Sindicato dos Condomínios de Mato Grosso.',
  20.00, 'approved',
  true, true,
  'paid', 'free', 'charge',
  50,
  true, true,
  30, 30,
  10, 5, 3
FROM public.coaches c
JOIN public.profiles p ON p.id = c.profile_id
WHERE p.email = 'sindscond@gmail.com'
  AND NOT EXISTS (
    SELECT 1 FROM public.professional_products pp
    WHERE pp.coach_id = c.id AND pp.name = 'Benefícios SINDSCOND'
  );
