-- Unifica vendas de parceiros/profissionais com o fluxo normal:
-- 1) comissões entram pendentes por 7 dias;
-- 2) carteiras de parceiro/profissional também respeitam 7 dias;
-- 3) recálculo evita saldos liberados indevidamente em pedidos antigos.

CREATE OR REPLACE FUNCTION public.recalc_partner_wallet(_partner_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total numeric := 0;
  v_withdrawn numeric := 0;
BEGIN
  IF _partner_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(total_withdrawn, 0)
  INTO v_withdrawn
  FROM public.partner_wallets
  WHERE partner_id = _partner_id;
  v_withdrawn := COALESCE(v_withdrawn, 0);

  SELECT
    COALESCE(SUM(partner_net_amount) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' > now()), 0),
    COALESCE(SUM(partner_net_amount) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' <= now()), 0),
    COALESCE(SUM(partner_net_amount), 0)
  INTO v_pending, v_available, v_total
  FROM public.partner_product_orders
  WHERE partner_id = _partner_id
    AND status = 'paid'
    AND partner_net_amount > 0;

  INSERT INTO public.partner_wallets (partner_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_partner_id, v_pending, GREATEST(0, v_available - v_withdrawn), v_total, v_withdrawn, now())
  ON CONFLICT (partner_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.recalc_professional_wallet(_professional_coach_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_pending numeric := 0;
  v_available numeric := 0;
  v_total numeric := 0;
  v_withdrawn numeric := 0;
BEGIN
  IF _professional_coach_id IS NULL THEN RETURN; END IF;

  SELECT COALESCE(total_withdrawn, 0)
  INTO v_withdrawn
  FROM public.professional_wallets
  WHERE professional_coach_id = _professional_coach_id;
  v_withdrawn := COALESCE(v_withdrawn, 0);

  SELECT
    COALESCE(SUM(partner_net_amount) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' > now()), 0),
    COALESCE(SUM(partner_net_amount) FILTER (WHERE COALESCE(paid_at, created_at) + interval '7 days' <= now()), 0),
    COALESCE(SUM(partner_net_amount), 0)
  INTO v_pending, v_available, v_total
  FROM public.partner_product_orders
  WHERE professional_coach_id = _professional_coach_id
    AND status = 'paid'
    AND partner_net_amount > 0;

  INSERT INTO public.professional_wallets (professional_coach_id, pending_balance, available_balance, total_earned, total_withdrawn, updated_at)
  VALUES (_professional_coach_id, v_pending, GREATEST(0, v_available - v_withdrawn), v_total, v_withdrawn, now())
  ON CONFLICT (professional_coach_id) DO UPDATE
  SET pending_balance = EXCLUDED.pending_balance,
      available_balance = EXCLUDED.available_balance,
      total_earned = EXCLUDED.total_earned,
      updated_at = now();
END;
$$;

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

  IF o.selling_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_seller_profile FROM public.coaches WHERE id = o.selling_coach_id;
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
END;
$$;

CREATE OR REPLACE FUNCTION public.release_due_partner_product_wallets()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  r record;
  changed_count integer := 0;
BEGIN
  FOR r IN SELECT DISTINCT partner_id FROM public.partner_product_orders WHERE partner_id IS NOT NULL AND status = 'paid' LOOP
    PERFORM public.recalc_partner_wallet(r.partner_id);
    changed_count := changed_count + 1;
  END LOOP;

  FOR r IN SELECT DISTINCT professional_coach_id FROM public.partner_product_orders WHERE professional_coach_id IS NOT NULL AND status = 'paid' LOOP
    PERFORM public.recalc_professional_wallet(r.professional_coach_id);
    changed_count := changed_count + 1;
  END LOOP;

  RETURN changed_count;
END;
$$;

CREATE OR REPLACE FUNCTION public.release_available_commissions()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  changed_count integer;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  UPDATE public.commissions
  SET status = 'available'
  WHERE status = 'pending'
    AND available_at IS NOT NULL
    AND available_at <= now();
  GET DIAGNOSTICS changed_count = ROW_COUNT;

  PERFORM public.recalc_wallet_for_profile(c.beneficiary_profile_id)
  FROM (
    SELECT DISTINCT beneficiary_profile_id
    FROM public.commissions
    WHERE beneficiary_profile_id IS NOT NULL
      AND COALESCE(is_referral, false) = false
  ) c;

  PERFORM public.recalc_student_wallet_for_referral(s.referred_by_student_id)
  FROM (
    SELECT DISTINCT referred_by_student_id
    FROM public.commissions
    WHERE referred_by_student_id IS NOT NULL
      AND COALESCE(is_referral, false) = true
  ) s;

  PERFORM public.release_due_partner_product_wallets();
  RETURN changed_count;
END;
$$;

-- Reaplica retroativamente: comissões de partner orders sem available_at e recalcula carteiras
DO $$
DECLARE r record;
BEGIN
  UPDATE public.commissions c
  SET status = 'pending',
      available_at = COALESCE(ppo.paid_at, ppo.created_at, c.created_at) + interval '7 days',
      created_at = COALESCE(ppo.paid_at, ppo.created_at, c.created_at)
  FROM public.partner_product_orders ppo
  WHERE c.partner_order_id = ppo.id
    AND c.status = 'available'
    AND COALESCE(ppo.paid_at, ppo.created_at, c.created_at) + interval '7 days' > now();

  UPDATE public.commissions c
  SET available_at = COALESCE(c.available_at, COALESCE(ppo.paid_at, ppo.created_at, c.created_at) + interval '7 days')
  FROM public.partner_product_orders ppo
  WHERE c.partner_order_id = ppo.id;

  FOR r IN SELECT DISTINCT beneficiary_profile_id FROM public.commissions WHERE beneficiary_profile_id IS NOT NULL LOOP
    PERFORM public.recalc_wallet_for_profile(r.beneficiary_profile_id);
  END LOOP;
  PERFORM public.release_due_partner_product_wallets();
END $$;

GRANT EXECUTE ON FUNCTION public.recalc_partner_wallet(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.recalc_professional_wallet(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_due_partner_product_wallets() TO service_role;
GRANT EXECUTE ON FUNCTION public.process_partner_product_order_paid(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.release_available_commissions() TO authenticated;