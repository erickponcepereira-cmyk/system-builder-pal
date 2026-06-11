
CREATE TABLE IF NOT EXISTS public.partner_wallets (
  partner_id uuid PRIMARY KEY REFERENCES public.partners(id) ON DELETE CASCADE,
  available_balance numeric NOT NULL DEFAULT 0,
  pending_balance numeric NOT NULL DEFAULT 0,
  total_earned numeric NOT NULL DEFAULT 0,
  total_withdrawn numeric NOT NULL DEFAULT 0,
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.partner_wallets TO authenticated;
GRANT ALL ON public.partner_wallets TO service_role;

ALTER TABLE public.partner_wallets ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Partner reads own wallet"
ON public.partner_wallets FOR SELECT TO authenticated
USING (
  partner_id IN (
    SELECT p.id FROM public.partners p
    JOIN public.profiles pr ON pr.id = p.profile_id
    WHERE pr.user_id = auth.uid()
  )
);

CREATE POLICY "Admins read all partner wallets"
ON public.partner_wallets FOR SELECT TO authenticated
USING (public.is_admin(auth.uid()));

ALTER TABLE public.withdrawal_requests
  ADD COLUMN IF NOT EXISTS partner_id uuid REFERENCES public.partners(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS idx_withdrawal_requests_partner ON public.withdrawal_requests(partner_id);

ALTER TABLE public.commissions
  ADD COLUMN IF NOT EXISTS partner_order_id uuid REFERENCES public.partner_product_orders(id) ON DELETE CASCADE;
ALTER TABLE public.commissions ALTER COLUMN transaction_id DROP NOT NULL;
ALTER TABLE public.commissions DROP CONSTRAINT IF EXISTS commissions_origin_chk;
ALTER TABLE public.commissions
  ADD CONSTRAINT commissions_origin_chk CHECK (transaction_id IS NOT NULL OR partner_order_id IS NOT NULL);
CREATE INDEX IF NOT EXISTS idx_commissions_partner_order ON public.commissions(partner_order_id);

DO $bf$
DECLARE r record;
BEGIN
  FOR r IN
    SELECT o.partner_id, p.profile_id, SUM(o.partner_net_amount) AS total
    FROM public.partner_product_orders o
    JOIN public.partners p ON p.id = o.partner_id
    WHERE o.status = 'paid' AND o.partner_net_amount > 0
    GROUP BY o.partner_id, p.profile_id
  LOOP
    INSERT INTO public.partner_wallets (partner_id, available_balance, total_earned, updated_at)
    VALUES (r.partner_id, r.total, r.total, now())
    ON CONFLICT (partner_id) DO UPDATE
      SET available_balance = r.total,
          total_earned = r.total,
          updated_at = now();

    UPDATE public.wallets
    SET available_balance = GREATEST(available_balance - r.total, 0),
        total_earned = GREATEST(total_earned - r.total, 0),
        updated_at = now()
    WHERE profile_id = r.profile_id;
  END LOOP;
END $bf$;

DO $bc$
DECLARE
  o record;
  v_seller_profile uuid;
  v_p1 uuid; v_p2 uuid; v_p3 uuid;
  v_mc_profile uuid;
BEGIN
  FOR o IN
    SELECT * FROM public.partner_product_orders ord
    WHERE ord.status = 'paid'
      AND NOT EXISTS (SELECT 1 FROM public.commissions c WHERE c.partner_order_id = ord.id)
  LOOP
    v_seller_profile := NULL;
    IF o.selling_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_seller_profile FROM public.coaches WHERE id = o.selling_coach_id;
    END IF;

    IF o.coach_net_amount > 0 AND v_seller_profile IS NOT NULL THEN
      INSERT INTO public.commissions (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label, created_at)
      VALUES (NULL, o.id, v_seller_profile, o.selling_coach_id, 0, o.coach_net_amount, 'available', o.paid_at, 'Comissão do Vendedor (Parceiro)', o.paid_at);
    END IF;

    IF o.network_l1_amount > 0 THEN
      v_p1 := NULL;
      IF o.upline_l1_coach_id IS NOT NULL THEN
        SELECT profile_id INTO v_p1 FROM public.coaches WHERE id = o.upline_l1_coach_id;
      END IF;
      IF v_p1 IS NULL THEN v_p1 := v_seller_profile; END IF;
      IF v_p1 IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label, created_at)
        VALUES (NULL, o.id, v_p1, COALESCE(o.upline_l1_coach_id, o.selling_coach_id), 1, o.network_l1_amount, 'available', o.paid_at,
                CASE WHEN o.upline_l1_coach_id IS NULL THEN 'Upline 1 (sem upline → vendedor)' ELSE 'Upline 1' END, o.paid_at);
      END IF;
    END IF;

    IF o.network_l2_amount > 0 THEN
      v_p2 := NULL;
      IF o.upline_l2_coach_id IS NOT NULL THEN
        SELECT profile_id INTO v_p2 FROM public.coaches WHERE id = o.upline_l2_coach_id;
      END IF;
      IF v_p2 IS NULL THEN v_p2 := v_seller_profile; END IF;
      IF v_p2 IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label, created_at)
        VALUES (NULL, o.id, v_p2, COALESCE(o.upline_l2_coach_id, o.selling_coach_id), 2, o.network_l2_amount, 'available', o.paid_at,
                CASE WHEN o.upline_l2_coach_id IS NULL THEN 'Upline 2 (sem upline → vendedor)' ELSE 'Upline 2' END, o.paid_at);
      END IF;
    END IF;

    IF o.network_l3_amount > 0 THEN
      v_p3 := NULL;
      IF o.upline_l3_coach_id IS NOT NULL THEN
        SELECT profile_id INTO v_p3 FROM public.coaches WHERE id = o.upline_l3_coach_id;
      END IF;
      IF v_p3 IS NULL THEN v_p3 := v_seller_profile; END IF;
      IF v_p3 IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, slot_label, created_at)
        VALUES (NULL, o.id, v_p3, COALESCE(o.upline_l3_coach_id, o.selling_coach_id), 3, o.network_l3_amount, 'available', o.paid_at,
                CASE WHEN o.upline_l3_coach_id IS NULL THEN 'Upline 3 (sem upline → vendedor)' ELSE 'Upline 3' END, o.paid_at);
      END IF;
    END IF;

    IF COALESCE(o.master_coach_cross_bonus_amount, 0) > 0 AND o.master_coach_cross_beneficiary_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_mc_profile FROM public.coaches WHERE id = o.master_coach_cross_beneficiary_coach_id;
      IF v_mc_profile IS NOT NULL THEN
        INSERT INTO public.commissions (transaction_id, partner_order_id, beneficiary_profile_id, beneficiary_coach_id, level, amount, status, available_at, is_master_coach_commission, slot_label, created_at)
        VALUES (NULL, o.id, v_mc_profile, o.master_coach_cross_beneficiary_coach_id, 0, o.master_coach_cross_bonus_amount, 'available', o.paid_at, true, 'Master Coach (cross-sale)', o.paid_at);
      END IF;
    END IF;
  END LOOP;
END $bc$;

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
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR o.paid_at IS NOT NULL THEN RETURN; END IF;

  IF o.status <> 'paid' THEN
    UPDATE public.partner_product_orders SET status = 'paid' WHERE id = _order_id;
    o.status := 'paid';
  END IF;

  IF o.system_fee > 0 THEN
    UPDATE public.admin_system_wallet
    SET available_balance = available_balance + o.system_fee,
        total_earned = total_earned + o.system_fee,
        updated_at = now()
    WHERE id = true;
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
    VALUES (o.id, v_seller_profile, o.selling_coach_id, 0, o.coach_net_amount, 'available', now(), 'Comissão do Vendedor (Parceiro)');
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
  VALUES (_order_id, NULL, 'paid', NULL, 'Pagamento Mercado Pago aprovado')
  ON CONFLICT DO NOTHING;
END;
$function$;
