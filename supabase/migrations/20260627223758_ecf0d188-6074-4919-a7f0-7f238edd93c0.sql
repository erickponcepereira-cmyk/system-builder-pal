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
  v_source_label text;
  v_paid_at timestamptz;
  v_available_at timestamptz;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;

  IF o.status <> 'paid' THEN
    UPDATE public.partner_product_orders SET status = 'paid' WHERE id = _order_id;
    o.status := 'paid';
  END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_available_at := v_paid_at + interval '7 days';
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
    v_profile := NULL;
    IF o.upline_l1_coach_id IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l1_coach_id; END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l1_coach_id, o.selling_coach_id), 1, o.network_l1_amount, 'pending', v_available_at, v_paid_at,
              CASE WHEN o.upline_l1_coach_id IS NULL THEN 'Upline 1 (sem upline → vendedor)' ELSE 'Upline 1' END);
      PERFORM public.recalc_wallet_for_profile(v_profile);
    END IF;
  END IF;

  IF o.network_l2_amount > 0 THEN
    v_profile := NULL;
    IF o.upline_l2_coach_id IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l2_coach_id; END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l2_coach_id, o.selling_coach_id), 2, o.network_l2_amount, 'pending', v_available_at, v_paid_at,
              CASE WHEN o.upline_l2_coach_id IS NULL THEN 'Upline 2 (sem upline → vendedor)' ELSE 'Upline 2' END);
      PERFORM public.recalc_wallet_for_profile(v_profile);
    END IF;
  END IF;

  IF o.network_l3_amount > 0 THEN
    v_profile := NULL;
    IF o.upline_l3_coach_id IS NOT NULL THEN SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l3_coach_id; END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, created_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l3_coach_id, o.selling_coach_id), 3, o.network_l3_amount, 'pending', v_available_at, v_paid_at,
              CASE WHEN o.upline_l3_coach_id IS NULL THEN 'Upline 3 (sem upline → vendedor)' ELSE 'Upline 3' END);
      PERFORM public.recalc_wallet_for_profile(v_profile);
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

  UPDATE public.partner_product_orders SET paid_at = v_paid_at WHERE id = _order_id;

  IF o.partner_id IS NOT NULL THEN PERFORM public.recalc_partner_wallet(o.partner_id); END IF;
  IF o.professional_coach_id IS NOT NULL THEN PERFORM public.recalc_professional_wallet(o.professional_coach_id); END IF;

  IF o.selling_coach_id IS NOT NULL THEN
    PERFORM public.upsert_monthly_ranking_on_sale(o.selling_coach_id, 1, COALESCE(o.gross_amount, 0));
  END IF;
  IF o.selling_coach_id IS DISTINCT FROM o.professional_coach_id AND o.professional_coach_id IS NOT NULL THEN
    PERFORM public.upsert_monthly_ranking_on_sale(o.professional_coach_id, 1, COALESCE(o.gross_amount, 0));
  END IF;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento aprovado; valores liberam para saque em 7 dias')
  ON CONFLICT DO NOTHING;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_partner_product_order_paid(uuid) TO authenticated, service_role;