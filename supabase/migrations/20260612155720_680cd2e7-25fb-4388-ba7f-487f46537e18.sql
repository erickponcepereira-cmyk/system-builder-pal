ALTER TABLE public.admin_system_wallet_entries
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_product_orders(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_admin_system_wallet_entries_partner_order ON public.admin_system_wallet_entries(partner_order_id);

ALTER TABLE public.system_fee_payouts
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_product_orders(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS idx_system_fee_payouts_partner_order ON public.system_fee_payouts(partner_order_id);
ALTER TABLE public.system_fee_payouts ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE public.system_fee_payouts DROP CONSTRAINT IF EXISTS system_fee_payouts_source_chk;
ALTER TABLE public.system_fee_payouts
  ADD CONSTRAINT system_fee_payouts_source_chk CHECK (transaction_id IS NOT NULL OR partner_order_id IS NOT NULL);

CREATE OR REPLACE FUNCTION public.process_partner_product_order_paid(_order_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  o record;
  v_profile uuid;
  v_seller_profile uuid;
  v_mc_profile uuid;
  v_source_label text;
  v_paid_at timestamptz;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RETURN; END IF;

  IF o.paid_at IS NOT NULL
     AND EXISTS (SELECT 1 FROM public.admin_system_wallet_entries e WHERE e.partner_order_id = o.id)
  THEN
    RETURN;
  END IF;

  IF o.status <> 'paid' THEN
    UPDATE public.partner_product_orders SET status = 'paid' WHERE id = _order_id;
    o.status := 'paid';
  END IF;

  v_paid_at := COALESCE(o.paid_at, now());
  v_source_label := CASE
    WHEN o.partner_product_id IS NOT NULL THEN 'Venda de Parceiro'
    WHEN o.professional_product_id IS NOT NULL THEN 'Venda de Profissional'
    ELSE 'Venda de Parceiro/Profissional'
  END;

  IF o.system_fee > 0 AND NOT EXISTS (
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
    RETURN;
  END IF;

  IF o.selling_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_seller_profile FROM public.coaches WHERE id = o.selling_coach_id;
  END IF;

  IF o.selling_coach_id IS NOT NULL AND o.coach_net_amount > 0 AND v_seller_profile IS NOT NULL THEN
    INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
    VALUES (v_seller_profile, o.coach_net_amount, o.coach_net_amount, now())
    ON CONFLICT (profile_id) DO UPDATE
      SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
          total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
          updated_at = now();

    INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label)
    VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.coach_net_amount, 'available', now(), 'Comissão do Vendedor (Parceiro/Profissional)');
  END IF;

  IF o.network_l1_amount > 0 THEN
    v_profile := NULL;
    IF o.upline_l1_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l1_coach_id;
    END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l1_amount, o.network_l1_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();

      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l1_coach_id, o.selling_coach_id), 1, o.network_l1_amount, 'available', now(),
              CASE WHEN o.upline_l1_coach_id IS NULL THEN 'Upline 1 (sem upline → vendedor)' ELSE 'Upline 1' END);
    END IF;
  END IF;

  IF o.network_l2_amount > 0 THEN
    v_profile := NULL;
    IF o.upline_l2_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l2_coach_id;
    END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l2_amount, o.network_l2_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();

      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l2_coach_id, o.selling_coach_id), 2, o.network_l2_amount, 'available', now(),
              CASE WHEN o.upline_l2_coach_id IS NULL THEN 'Upline 2 (sem upline → vendedor)' ELSE 'Upline 2' END);
    END IF;
  END IF;

  IF o.network_l3_amount > 0 THEN
    v_profile := NULL;
    IF o.upline_l3_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l3_coach_id;
    END IF;
    IF v_profile IS NULL THEN v_profile := v_seller_profile; END IF;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l3_amount, o.network_l3_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();

      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label)
      VALUES (o.id, v_profile, COALESCE(o.upline_l3_coach_id, o.selling_coach_id), 3, o.network_l3_amount, 'available', now(),
              CASE WHEN o.upline_l3_coach_id IS NULL THEN 'Upline 3 (sem upline → vendedor)' ELSE 'Upline 3' END);
    END IF;
  END IF;

  IF COALESCE(o.master_coach_cross_bonus_amount, 0) > 0 AND o.master_coach_cross_beneficiary_coach_id IS NOT NULL THEN
    SELECT profile_id INTO v_mc_profile FROM public.coaches WHERE id = o.master_coach_cross_beneficiary_coach_id;
    IF v_mc_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_mc_profile, o.master_coach_cross_bonus_amount, o.master_coach_cross_bonus_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();

      INSERT INTO public.commissions (partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, is_master_coach_commission, slot_label)
      VALUES (o.id, v_mc_profile, o.master_coach_cross_beneficiary_coach_id, 0, o.master_coach_cross_bonus_amount, 'available', now(), true, 'Master Coach (cross-sale)');
    END IF;
  END IF;

  IF o.partner_net_amount > 0 AND o.partner_id IS NOT NULL THEN
    INSERT INTO public.partner_wallets (partner_id, available_balance, total_earned, updated_at)
    VALUES (o.partner_id, o.partner_net_amount, o.partner_net_amount, now())
    ON CONFLICT (partner_id) DO UPDATE
      SET available_balance = public.partner_wallets.available_balance + EXCLUDED.available_balance,
          total_earned = public.partner_wallets.total_earned + EXCLUDED.total_earned,
          updated_at = now();
  END IF;

  UPDATE public.partner_product_orders SET paid_at = now() WHERE id = _order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento aprovado e distribuído')
  ON CONFLICT DO NOTHING;
END;
$function$;

CREATE OR REPLACE FUNCTION public.update_coach_withdrawal_status(_withdrawal_id uuid, _status withdrawal_status, _notes text DEFAULT NULL::text)
RETURNS void
LANGUAGE plpgsql
SET search_path TO 'public'
AS $function$
DECLARE
  w RECORD;
  admin_profile_id UUID;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Acesso negado';
  END IF;

  SELECT id INTO admin_profile_id FROM public.profiles WHERE user_id = auth.uid();

  SELECT * INTO w
  FROM public.withdrawal_requests
  WHERE id = _withdrawal_id
  FOR UPDATE;

  IF w.id IS NULL THEN
    RAISE EXCEPTION 'Saque não encontrado';
  END IF;

  IF _status = 'paid' THEN
    IF w.status NOT IN ('approved', 'processing') THEN
      RAISE EXCEPTION 'Apenas saques aprovados podem ser marcados como pagos';
    END IF;

    IF w.partner_id IS NOT NULL THEN
      IF COALESCE((SELECT available_balance FROM public.partner_wallets WHERE partner_id = w.partner_id), 0) < w.amount THEN
        RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do parceiro';
      END IF;

      UPDATE public.partner_wallets
      SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
          total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
          updated_at = now()
      WHERE partner_id = w.partner_id;
    ELSE
      IF COALESCE((SELECT available_balance FROM public.wallets WHERE profile_id = w.profile_id), 0) < w.amount THEN
        RAISE EXCEPTION 'Saldo disponível insuficiente na carteira do coach';
      END IF;

      UPDATE public.wallets
      SET available_balance = GREATEST(0, COALESCE(available_balance, 0) - w.amount),
          total_withdrawn = COALESCE(total_withdrawn, 0) + w.amount,
          updated_at = now()
      WHERE profile_id = w.profile_id;
    END IF;
  END IF;

  UPDATE public.withdrawal_requests
  SET status = _status,
      notes = COALESCE(_notes, notes),
      approved_at = CASE WHEN _status IN ('approved', 'processing', 'paid') AND approved_at IS NULL THEN now() ELSE approved_at END,
      paid_at = CASE WHEN _status = 'paid' THEN now() ELSE paid_at END,
      approved_by = CASE WHEN _status IN ('approved', 'processing', 'paid', 'rejected') THEN admin_profile_id ELSE approved_by END
  WHERE id = _withdrawal_id;
END;
$function$;

DO $backfill_partner_finance$
DECLARE
  r record;
BEGIN
  FOR r IN SELECT id FROM public.partner_product_orders WHERE status = 'paid'
  LOOP
    PERFORM public.process_partner_product_order_paid(r.id);
  END LOOP;
END $backfill_partner_finance$;