
-- Reprocessa pedidos pagos com a fórmula nova:
--   coach_amt = remaining * coach_pct%
--   l1/l2/l3  = coach_amt * 3% / 2% / 1%
--   fitcoin   = CEIL(coach_amt/2) (se houver indicador)
--   coach_net = coach_amt - (l1+l2+l3) - fitcoin

CREATE OR REPLACE FUNCTION public._recalc_partner_product_order_v2(_order_id uuid)
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
  v_coach_net numeric; v_partner_share numeric;
  v_fitcoin numeric := 0;
  v_referrer uuid;
  v_paid_at timestamptz;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;

  v_paid_at := o.paid_at;
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

  v_referrer := o.referred_by_student_id;
  IF v_referrer IS NOT NULL AND v_referrer = o.student_id THEN v_referrer := NULL; END IF;
  IF v_referrer IS NOT NULL AND v_coach_amt > 0 THEN
    v_fitcoin := CEIL(v_coach_amt * 50) / 100;
  ELSE
    v_fitcoin := 0;
  END IF;

  v_coach_net := GREATEST(0, ROUND(v_coach_amt - v_l1 - v_l2 - v_l3 - v_fitcoin, 2));

  -- Limpa entradas derivadas
  DELETE FROM public.commissions WHERE partner_order_id = _order_id;
  DELETE FROM public.admin_system_wallet_entries WHERE partner_order_id = _order_id;
  DELETE FROM public.fitcoin_ledger WHERE source_type = 'partner_order' AND source_id = _order_id;

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

  IF o.status = 'paid' THEN
    UPDATE public.partner_product_orders SET paid_at = NULL WHERE id = _order_id;
    PERFORM public.process_partner_product_order_paid(_order_id);
    UPDATE public.partner_product_orders SET paid_at = v_paid_at WHERE id = _order_id;
  END IF;
END;
$$;

DO $$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT id FROM public.partner_product_orders
    WHERE status = 'paid'
    ORDER BY paid_at ASC
  LOOP
    BEGIN
      PERFORM public._recalc_partner_product_order_v2(r.id);
    EXCEPTION WHEN OTHERS THEN
      RAISE NOTICE 'Falha ao reprocessar %: %', r.id, SQLERRM;
    END;
  END LOOP;
END $$;

DROP FUNCTION public._recalc_partner_product_order_v2(uuid);
