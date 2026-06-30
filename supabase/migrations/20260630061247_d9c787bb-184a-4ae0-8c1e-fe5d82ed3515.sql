-- Reprocessa pedidos de parceiro/profissional cujos valores ficaram travados antes
-- da última correção (rede deve sair primeiro, depois fitcoin do indicador, depois coach).
-- Recalcula valores no pedido, remove comissões/entradas antigas e reaplica process_partner_product_order_paid.

CREATE OR REPLACE FUNCTION public._recalc_partner_product_order_amounts(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o public.partner_product_orders%ROWTYPE;
  v_gross numeric; v_fee_pct numeric; v_fee numeric; v_rem numeric;
  v_tax numeric; v_sys numeric;
  v_coach_pct numeric; v_coach_amt numeric;
  v_l1 numeric; v_l2 numeric; v_l3 numeric;
  v_coach_after_network numeric;
  v_coach_net numeric; v_partner_share numeric;
  v_fitcoin numeric := 0;
  v_referrer uuid;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;

  v_gross := COALESCE(o.gross_amount, 0);
  v_coach_pct := COALESCE(o.coach_commission_pct, 10);
  v_fee_pct := CASE WHEN o.payment_method = 'pix' THEN 0.99 ELSE 4.98 END;
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_rem := ROUND(v_gross - v_fee, 2);
  v_tax := ROUND(v_rem * 6 / 100, 2);
  v_rem := ROUND(v_rem - v_tax, 2);
  v_sys := ROUND(v_rem * 5 / 100, 2);
  v_rem := ROUND(v_rem - v_sys, 2);
  v_coach_amt := ROUND(v_rem * v_coach_pct / 100, 2);
  v_partner_share := ROUND(v_rem - v_coach_amt, 2);
  v_l1 := ROUND(v_coach_amt * 3 / 100, 2);
  v_l2 := ROUND(v_coach_amt * 2 / 100, 2);
  v_l3 := ROUND(v_coach_amt * 1 / 100, 2);
  v_coach_after_network := GREATEST(0, ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2));

  v_referrer := o.referred_by_student_id;
  IF v_referrer IS NOT NULL AND v_referrer = o.student_id THEN v_referrer := NULL; END IF;
  IF v_referrer IS NOT NULL AND v_coach_after_network > 0 THEN
    v_fitcoin := CEIL(v_coach_after_network * 50) / 100;
    IF v_fitcoin > v_coach_after_network THEN v_fitcoin := v_coach_after_network; END IF;
  END IF;
  v_coach_net := GREATEST(0, ROUND(v_coach_after_network - v_fitcoin, 2));

  -- Limpa entradas derivadas
  DELETE FROM public.commissions WHERE partner_order_id = _order_id;
  DELETE FROM public.admin_system_wallet_entries WHERE partner_order_id = _order_id;

  UPDATE public.partner_product_orders
  SET payment_fee = v_fee,
      tax_amount = v_tax,
      system_fee = v_sys,
      coach_commission_amount = v_coach_amt,
      network_l1_amount = v_l1,
      network_l2_amount = v_l2,
      network_l3_amount = v_l3,
      coach_net_amount = v_coach_net,
      partner_net_amount = v_partner_share,
      referral_fitcoin_amount = v_fitcoin,
      referred_by_student_id = v_referrer
  WHERE id = _order_id;

  -- Força o reprocessamento (limpa paid_at para que o handler reinjete comissões)
  IF o.status = 'paid' THEN
    UPDATE public.partner_product_orders SET paid_at = NULL WHERE id = _order_id;
    PERFORM public.process_partner_product_order_paid(_order_id);
    UPDATE public.partner_product_orders SET paid_at = COALESCE(o.paid_at, now()) WHERE id = _order_id;
  END IF;
END;
$$;

-- Reprocessa todos os pedidos pagos com referrer cujo l1 ficou zerado mas tem upline (claro sintoma do bug antigo)
DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.partner_product_orders
    WHERE referred_by_student_id IS NOT NULL
      AND upline_l1_coach_id IS NOT NULL
      AND COALESCE(network_l1_amount,0) = 0
      AND status = 'paid'
  LOOP
    PERFORM public._recalc_partner_product_order_amounts(r.id);
  END LOOP;
END $$;

DROP FUNCTION public._recalc_partner_product_order_amounts(uuid);