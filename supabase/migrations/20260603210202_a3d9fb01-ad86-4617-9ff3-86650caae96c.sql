
-- 1) Schema: support partner_company orders in partner_product_orders
ALTER TABLE public.partner_product_orders
  ALTER COLUMN professional_product_id DROP NOT NULL,
  ALTER COLUMN professional_coach_id DROP NOT NULL;

ALTER TABLE public.partner_product_orders
  ADD COLUMN IF NOT EXISTS partner_product_id UUID REFERENCES public.partner_products(id) ON DELETE RESTRICT,
  ADD COLUMN IF NOT EXISTS partner_id UUID REFERENCES public.partners(id) ON DELETE RESTRICT;

ALTER TABLE public.partner_product_orders
  DROP CONSTRAINT IF EXISTS ppo_one_source_chk;
ALTER TABLE public.partner_product_orders
  ADD CONSTRAINT ppo_one_source_chk
  CHECK ((professional_product_id IS NOT NULL)::int + (partner_product_id IS NOT NULL)::int = 1);

CREATE INDEX IF NOT EXISTS idx_ppo_partner_product ON public.partner_product_orders(partner_product_id);
CREATE INDEX IF NOT EXISTS idx_ppo_partner ON public.partner_product_orders(partner_id);

-- 2) Allow partner owners to view their orders
DROP POLICY IF EXISTS ppo_partner_select ON public.partner_product_orders;
CREATE POLICY ppo_partner_select ON public.partner_product_orders FOR SELECT
  USING (
    partner_id IN (
      SELECT pt.id FROM public.partners pt
      JOIN public.profiles p ON p.id = pt.profile_id
      WHERE p.user_id = auth.uid()
    )
  );

-- 3) New RPC: any authenticated user purchases a partner_company product on behalf of an indicated student
CREATE OR REPLACE FUNCTION public.create_partner_company_order(
  _partner_product_id UUID,
  _student_id UUID,
  _payment_method TEXT DEFAULT 'pix'
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_student_id UUID;
  v_student_coach_id UUID;
  v_upline1 UUID; v_upline2 UUID; v_upline3 UUID;
  v_prod RECORD;
  v_gross NUMERIC; v_fee NUMERIC; v_tax NUMERIC; v_sys NUMERIC := 20;
  v_fee_pct NUMERIC;
  v_coach_pct NUMERIC := 10; v_coach_amt NUMERIC;
  v_l1 NUMERIC; v_l2 NUMERIC; v_l3 NUMERIC;
  v_coach_net NUMERIC; v_partner_net NUMERIC;
  v_order_id UUID;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
  FROM public.students s WHERE s.id = _student_id;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno indicado não encontrado'; END IF;

  SELECT pp.id, pp.partner_id, pp.price, pp.status, pp.is_active_by_partner, pp.kind
    INTO v_prod
  FROM public.partner_products pp WHERE pp.id = _partner_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_partner <> true OR v_prod.kind <> 'paid' THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  IF v_student_coach_id IS NOT NULL THEN
    SELECT upline_coach_id INTO v_upline1 FROM public.coaches WHERE id = v_student_coach_id;
    IF v_upline1 IS NOT NULL THEN
      SELECT upline_coach_id INTO v_upline2 FROM public.coaches WHERE id = v_upline1;
      IF v_upline2 IS NOT NULL THEN
        SELECT upline_coach_id INTO v_upline3 FROM public.coaches WHERE id = v_upline2;
      END IF;
    END IF;
  END IF;

  v_gross := COALESCE(v_prod.price, 0);
  v_fee_pct := CASE _payment_method WHEN 'pix' THEN 0.99 ELSE 4.98 END;
  v_fee := ROUND(v_gross * v_fee_pct / 100, 2);
  v_tax := ROUND(v_gross * 6 / 100, 2);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  INSERT INTO public.partner_product_orders (
    student_id, partner_product_id, partner_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount
  ) VALUES (
    v_student_id, v_prod.id, v_prod.partner_id, v_student_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido (empresa parceira) criado');

  RETURN v_order_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partner_company_order(UUID, UUID, TEXT) TO authenticated;

-- 4) Extend paid-processing to credit partner wallet when applicable
CREATE OR REPLACE FUNCTION public.process_partner_product_order_paid(_order_id UUID)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
  v_profile UUID;
BEGIN
  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL OR o.status <> 'paid' OR o.paid_at IS NOT NULL THEN RETURN; END IF;

  -- 1) System fee → admin wallet
  IF o.system_fee > 0 THEN
    UPDATE public.admin_system_wallet
    SET available_balance = available_balance + o.system_fee,
        total_earned = total_earned + o.system_fee,
        updated_at = now()
    WHERE id = true;
  END IF;

  -- 2) Selling coach (net)
  IF o.selling_coach_id IS NOT NULL AND o.coach_net_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.selling_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.coach_net_amount, o.coach_net_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  -- 3) Network L1/L2/L3
  IF o.upline_l1_coach_id IS NOT NULL AND o.network_l1_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l1_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l1_amount, o.network_l1_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;
  IF o.upline_l2_coach_id IS NOT NULL AND o.network_l2_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l2_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l2_amount, o.network_l2_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;
  IF o.upline_l3_coach_id IS NOT NULL AND o.network_l3_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.upline_l3_coach_id;
    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.network_l3_amount, o.network_l3_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  -- 4) Creator: professional coach OR partner company
  IF o.partner_net_amount > 0 THEN
    IF o.professional_coach_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.professional_coach_id;
    ELSIF o.partner_id IS NOT NULL THEN
      SELECT profile_id INTO v_profile FROM public.partners WHERE id = o.partner_id;
    ELSE
      v_profile := NULL;
    END IF;

    IF v_profile IS NOT NULL THEN
      INSERT INTO public.wallets (profile_id, available_balance, total_earned, updated_at)
      VALUES (v_profile, o.partner_net_amount, o.partner_net_amount, now())
      ON CONFLICT (profile_id) DO UPDATE
        SET available_balance = public.wallets.available_balance + EXCLUDED.available_balance,
            total_earned = public.wallets.total_earned + EXCLUDED.total_earned,
            updated_at = now();
    END IF;
  END IF;

  UPDATE public.partner_product_orders SET paid_at = now() WHERE id = _order_id;
END;
$$;
