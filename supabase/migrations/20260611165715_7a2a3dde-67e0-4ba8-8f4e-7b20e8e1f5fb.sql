DO $$
DECLARE
  v_gross NUMERIC := 1.00;
  v_fee NUMERIC := 0.01;
  v_tax NUMERIC := 0.06;
  v_sys_new NUMERIC := 0.05;
  v_coach_amt NUMERIC := 0.44;
  v_l1 NUMERIC := 0.01; v_l2 NUMERIC := 0.01; v_l3 NUMERIC := 0.00;
  v_coach_net NUMERIC := 0.42;
  v_partner_net NUMERIC := 0.44;
  -- old values
  v_sys_old NUMERIC := 20.00;
  v_seller_old NUMERIC := 0.10; -- 0.04 + 0.03 + 0.02 + 0.01 (fallback)
  v_partner_old NUMERIC := 0;    -- pulou pois era negativo
  v_seller_profile uuid := '9d2c0d78-f523-494e-847b-ead8631e2a9e';
  v_partner_profile uuid := '331e4a6d-025e-4f6a-aa11-8d78a8be214f';
  v_seller_new NUMERIC := 0.44;  -- coach_net + L1+L2+L3 fallback
  v_delta_sys NUMERIC; v_delta_seller NUMERIC; v_delta_partner NUMERIC;
BEGIN
  v_delta_sys := v_sys_new - v_sys_old;        -- -19.95
  v_delta_seller := v_seller_new - v_seller_old; -- +0.34
  v_delta_partner := v_partner_net - v_partner_old; -- +0.44

  -- Atualiza pedido
  UPDATE public.partner_product_orders SET
    payment_fee = v_fee,
    tax_amount = v_tax,
    system_fee = v_sys_new,
    coach_commission_pct = 50,
    coach_commission_amount = v_coach_amt,
    network_l1_amount = v_l1,
    network_l2_amount = v_l2,
    network_l3_amount = v_l3,
    coach_net_amount = v_coach_net,
    partner_net_amount = v_partner_net,
    metadata = COALESCE(metadata,'{}'::jsonb) || jsonb_build_object('backfilled_at', now(), 'backfill_reason','cascading_fee_recalc')
  WHERE order_number = 'PP-39A99248';

  -- Ajusta admin_system_wallet
  UPDATE public.admin_system_wallet
     SET available_balance = available_balance + v_delta_sys,
         total_earned = GREATEST(0, total_earned + v_delta_sys),
         updated_at = now()
   WHERE id = true;

  -- Ajusta carteira do coach vendedor
  UPDATE public.wallets
     SET available_balance = available_balance + v_delta_seller,
         total_earned = GREATEST(0, total_earned + v_delta_seller),
         updated_at = now()
   WHERE profile_id = v_seller_profile;

  -- Credita parceiro (valor antigo era 0 porque era negativo)
  INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
  VALUES (v_partner_profile, v_delta_partner, v_delta_partner, now())
  ON CONFLICT (profile_id) DO UPDATE
    SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
        total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
        updated_at = now();

  RAISE NOTICE 'Backfill PP-39A99248 OK';
END $$;