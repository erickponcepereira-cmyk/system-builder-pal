CREATE TABLE IF NOT EXISTS public.professional_wallets (
  professional_coach_id uuid PRIMARY KEY REFERENCES public.coaches(id) ON DELETE CASCADE,
  available_balance numeric(14,2) NOT NULL DEFAULT 0,
  pending_balance numeric(14,2) NOT NULL DEFAULT 0,
  total_earned numeric(14,2) NOT NULL DEFAULT 0,
  total_withdrawn numeric(14,2) NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.professional_wallets TO authenticated;
GRANT ALL ON public.professional_wallets TO service_role;

ALTER TABLE public.professional_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Professionals view own wallet"
ON public.professional_wallets FOR SELECT TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE c.id = professional_wallets.professional_coach_id
      AND p.user_id = auth.uid()
  )
  OR public.is_admin(auth.uid())
);

CREATE POLICY "Admins manage professional wallets"
ON public.professional_wallets FOR ALL TO authenticated
USING (public.is_admin(auth.uid()))
WITH CHECK (public.is_admin(auth.uid()));

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS professional_coach_id uuid REFERENCES public.coaches(id) ON DELETE SET NULL;

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

  IF o.partner_net_amount > 0 THEN
    IF o.partner_id IS NOT NULL THEN
      INSERT INTO public.partner_wallets (partner_id, available_balance, total_earned, updated_at)
      VALUES (o.partner_id, o.partner_net_amount, o.partner_net_amount, now())
      ON CONFLICT (partner_id) DO UPDATE
        SET available_balance = public.partner_wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.partner_wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    ELSIF o.professional_coach_id IS NOT NULL THEN
      INSERT INTO public.professional_wallets (professional_coach_id, available_balance, total_earned, updated_at)
      VALUES (o.professional_coach_id, o.partner_net_amount, o.partner_net_amount, now())
      ON CONFLICT (professional_coach_id) DO UPDATE
        SET available_balance = public.professional_wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.professional_wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  UPDATE public.partner_product_orders SET paid_at = now() WHERE id = _order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento aprovado e distribuído')
  ON CONFLICT DO NOTHING;
END;
$function$;