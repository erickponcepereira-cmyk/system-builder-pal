
-- ============================================================
-- Partner Product Orders (integração própria, espelho de store_orders)
-- ============================================================

CREATE TABLE public.partner_product_orders (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_number TEXT NOT NULL UNIQUE DEFAULT ('PP-' || upper(substr(gen_random_uuid()::text, 1, 8))),
  student_id UUID NOT NULL REFERENCES public.students(id) ON DELETE CASCADE,
  professional_product_id UUID NOT NULL REFERENCES public.professional_products(id) ON DELETE RESTRICT,
  professional_coach_id UUID NOT NULL REFERENCES public.coaches(id) ON DELETE RESTRICT, -- criador (profissional)
  selling_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,                -- coach do aluno
  upline_l1_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  upline_l2_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,
  upline_l3_coach_id UUID REFERENCES public.coaches(id) ON DELETE SET NULL,

  payment_method TEXT NOT NULL DEFAULT 'pix' CHECK (payment_method IN ('pix','card')),
  status TEXT NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','paid','cancelled','refunded')),

  -- Snapshot financeiro
  gross_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  payment_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  tax_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  system_fee NUMERIC(12,2) NOT NULL DEFAULT 0,
  coach_commission_pct NUMERIC(5,2) NOT NULL DEFAULT 0,
  coach_commission_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  network_l1_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  network_l2_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  network_l3_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  coach_net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,
  partner_net_amount NUMERIC(12,2) NOT NULL DEFAULT 0,

  notes TEXT,
  metadata JSONB NOT NULL DEFAULT '{}'::jsonb,
  paid_at TIMESTAMPTZ,
  cancelled_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_ppo_student ON public.partner_product_orders(student_id);
CREATE INDEX idx_ppo_status ON public.partner_product_orders(status);
CREATE INDEX idx_ppo_professional ON public.partner_product_orders(professional_coach_id);
CREATE INDEX idx_ppo_selling ON public.partner_product_orders(selling_coach_id);

GRANT SELECT, INSERT, UPDATE ON public.partner_product_orders TO authenticated;
GRANT ALL ON public.partner_product_orders TO service_role;

ALTER TABLE public.partner_product_orders ENABLE ROW LEVEL SECURITY;

CREATE POLICY "ppo_admin_all" ON public.partner_product_orders
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "ppo_student_select" ON public.partner_product_orders FOR SELECT
  USING (student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid()));

CREATE POLICY "ppo_student_insert" ON public.partner_product_orders FOR INSERT
  WITH CHECK (student_id IN (SELECT s.id FROM public.students s JOIN public.profiles p ON p.id = s.profile_id WHERE p.user_id = auth.uid()));

CREATE POLICY "ppo_coach_select" ON public.partner_product_orders FOR SELECT
  USING (
    professional_coach_id IN (SELECT public.current_coach_id())
    OR selling_coach_id IN (SELECT public.current_coach_id())
    OR upline_l1_coach_id IN (SELECT public.current_coach_id())
    OR upline_l2_coach_id IN (SELECT public.current_coach_id())
    OR upline_l3_coach_id IN (SELECT public.current_coach_id())
  );

CREATE TRIGGER trg_ppo_updated_at BEFORE UPDATE ON public.partner_product_orders
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- ============================================================
-- Log de status
-- ============================================================

CREATE TABLE public.partner_product_order_status_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  order_id UUID NOT NULL REFERENCES public.partner_product_orders(id) ON DELETE CASCADE,
  from_status TEXT,
  to_status TEXT NOT NULL,
  changed_by UUID REFERENCES public.profiles(id),
  note TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX idx_pposl_order ON public.partner_product_order_status_log(order_id);

GRANT SELECT, INSERT ON public.partner_product_order_status_log TO authenticated;
GRANT ALL ON public.partner_product_order_status_log TO service_role;

ALTER TABLE public.partner_product_order_status_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "pposl_admin_all" ON public.partner_product_order_status_log
  USING (public.is_admin(auth.uid())) WITH CHECK (public.is_admin(auth.uid()));

CREATE POLICY "pposl_own_select" ON public.partner_product_order_status_log FOR SELECT
  USING (order_id IN (SELECT id FROM public.partner_product_orders));

-- ============================================================
-- create_partner_product_order: aluno cria pedido
-- ============================================================

CREATE OR REPLACE FUNCTION public.create_partner_product_order(
  _professional_product_id UUID,
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
  v_coach_pct NUMERIC; v_coach_amt NUMERIC;
  v_l1 NUMERIC; v_l2 NUMERIC; v_l3 NUMERIC;
  v_coach_net NUMERIC; v_partner_net NUMERIC;
  v_order_id UUID;
BEGIN
  IF _payment_method NOT IN ('pix','card') THEN
    RAISE EXCEPTION 'Método de pagamento inválido';
  END IF;

  SELECT s.id, s.coach_id INTO v_student_id, v_student_coach_id
  FROM public.students s JOIN public.profiles p ON p.id = s.profile_id
  WHERE p.user_id = auth.uid() LIMIT 1;
  IF v_student_id IS NULL THEN RAISE EXCEPTION 'Aluno não encontrado'; END IF;

  SELECT * INTO v_prod FROM public.professional_products WHERE id = _professional_product_id;
  IF v_prod.id IS NULL OR v_prod.status <> 'approved' OR v_prod.is_active_by_professional <> true THEN
    RAISE EXCEPTION 'Produto indisponível';
  END IF;

  -- Resolve uplines do coach do aluno (vendedor)
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
  v_coach_pct := COALESCE(v_prod.coach_commission_percentage, 10);
  v_coach_amt := ROUND(v_gross * v_coach_pct / 100, 2);
  v_l1 := ROUND(v_gross * 3 / 100, 2);
  v_l2 := ROUND(v_gross * 2 / 100, 2);
  v_l3 := ROUND(v_gross * 1 / 100, 2);
  v_coach_net := ROUND(v_coach_amt - v_l1 - v_l2 - v_l3, 2);
  v_partner_net := ROUND(v_gross - v_fee - v_tax - v_sys - v_coach_amt, 2);

  INSERT INTO public.partner_product_orders (
    student_id, professional_product_id, professional_coach_id, selling_coach_id,
    upline_l1_coach_id, upline_l2_coach_id, upline_l3_coach_id,
    payment_method, status, gross_amount, payment_fee, tax_amount, system_fee,
    coach_commission_pct, coach_commission_amount,
    network_l1_amount, network_l2_amount, network_l3_amount,
    coach_net_amount, partner_net_amount
  ) VALUES (
    v_student_id, v_prod.id, v_prod.coach_id, v_student_coach_id,
    v_upline1, v_upline2, v_upline3,
    _payment_method, 'pending', v_gross, v_fee, v_tax, v_sys,
    v_coach_pct, v_coach_amt, v_l1, v_l2, v_l3, v_coach_net, v_partner_net
  ) RETURNING id INTO v_order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (v_order_id, NULL, 'pending', public.current_profile_id(), 'Pedido criado');

  RETURN v_order_id;
END;
$$;

-- ============================================================
-- process_partner_product_order_paid: distribui valores
-- ============================================================

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

  -- 1) Taxa do sistema (R$ 20) vai pra carteira admin
  IF o.system_fee > 0 THEN
    UPDATE public.admin_system_wallet
    SET available_balance = available_balance + o.system_fee,
        total_earned = total_earned + o.system_fee,
        updated_at = now()
    WHERE id = true;
  END IF;

  -- 2) Coach vendedor (líquido)
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

  -- 3) Rede L1/L2/L3
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

  -- 4) Profissional criador (líquido)
  IF o.professional_coach_id IS NOT NULL AND o.partner_net_amount > 0 THEN
    SELECT profile_id INTO v_profile FROM public.coaches WHERE id = o.professional_coach_id;
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

-- ============================================================
-- update_partner_product_order_status: admin atualiza
-- ============================================================

CREATE OR REPLACE FUNCTION public.update_partner_product_order_status(
  _order_id UUID,
  _status TEXT,
  _note TEXT DEFAULT NULL
)
RETURNS VOID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  o RECORD;
BEGIN
  IF NOT public.is_admin(auth.uid()) THEN RAISE EXCEPTION 'Acesso negado'; END IF;
  IF _status NOT IN ('pending','paid','cancelled','refunded') THEN
    RAISE EXCEPTION 'Status inválido';
  END IF;

  SELECT * INTO o FROM public.partner_product_orders WHERE id = _order_id FOR UPDATE;
  IF o.id IS NULL THEN RAISE EXCEPTION 'Pedido não encontrado'; END IF;

  UPDATE public.partner_product_orders
  SET status = _status,
      cancelled_at = CASE WHEN _status IN ('cancelled','refunded') AND cancelled_at IS NULL THEN now() ELSE cancelled_at END,
      notes = COALESCE(_note, notes)
  WHERE id = _order_id;

  INSERT INTO public.partner_product_order_status_log (order_id, from_status, to_status, changed_by, note)
  VALUES (_order_id, o.status, _status, public.current_profile_id(), _note);

  IF _status = 'paid' AND o.status <> 'paid' THEN
    PERFORM public.process_partner_product_order_paid(_order_id);
  END IF;
END;
$$;

GRANT EXECUTE ON FUNCTION public.create_partner_product_order(UUID, TEXT) TO authenticated;
GRANT EXECUTE ON FUNCTION public.update_partner_product_order_status(UUID, TEXT, TEXT) TO authenticated;
