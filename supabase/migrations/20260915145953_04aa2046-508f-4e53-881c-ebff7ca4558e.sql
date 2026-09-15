-- Reprocessamento NAO pode reescrever a data do pagamento.
-- A versao de 20260909190500 zerava paid_at antes de chamar
-- process_partner_product_order_paid, que grava now(). Como o sync de meio de
-- pagamento (20260909190000) chama o reprocessamento sozinho, vendas antigas
-- apareciam nos relatorios do dia do reprocessamento.
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
  v_paid_at_original timestamptz;
  v_prod_coach_pct numeric; v_prod_sys_override numeric;
  v_custom boolean := false; v_skip_tax boolean := false;
  v_prod_l1 numeric; v_prod_l2 numeric; v_prod_l3 numeric;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  v_paid_at_original := o.paid_at;

  SELECT array_agg(DISTINCT beneficiary_profile_id) INTO v_affected_profiles
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

  v_data  := COALESCE(v_paid_at_original, o.created_at)::date;
  v_gross := COALESCE(o.gross_amount, 0);

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

  UPDATE public.partner_product_orders SET
    selling_coach_id = v_selling_coach_id,
    upline_l1_coach_id = v_upline1, upline_l2_coach_id = v_upline2, upline_l3_coach_id = v_upline3,
    payment_fee = v_fee, tax_amount = v_tax, system_fee = v_sys,
    coach_commission_pct = v_coach_pct, coach_commission_amount = v_coach_amt,
    network_l1_amount = v_l1, network_l2_amount = v_l2, network_l3_amount = v_l3,
    coach_net_amount = v_coach_net, partner_net_amount = v_partner_net,
    master_coach_cross_bonus_amount = 0, master_coach_cross_beneficiary_coach_id = NULL,
    paid_at = NULL
  WHERE id = _order_id;

  PERFORM public.process_partner_product_order_paid(_order_id);

  -- A data original manda. process_partner_product_order_paid grava now(), e
  -- os relatorios (coach, ranking, resumo, presenca) leem paid_at.
  IF v_paid_at_original IS NOT NULL THEN
    UPDATE public.partner_product_orders
       SET paid_at = v_paid_at_original
     WHERE id = _order_id;

    UPDATE public.commissions
       SET created_at = v_paid_at_original
     WHERE partner_order_id = _order_id;
  END IF;

  IF v_affected_profiles IS NOT NULL THEN
    FOREACH p IN ARRAY v_affected_profiles LOOP
      PERFORM public.recalc_wallet_for_profile(p);
    END LOOP;
  END IF;
END;
$fn$;