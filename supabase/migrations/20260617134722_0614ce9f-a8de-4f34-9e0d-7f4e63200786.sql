
-- ============================================================
-- MENSALIDADE RECORRENTE
-- ============================================================

-- ENUMS
DO $$ BEGIN
  CREATE TYPE public.subscription_status AS ENUM (
    'active','exempt_monthly','exempt_annual','exempt_permanent','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_status AS ENUM (
    'pending','paid','exempted','overdue','blocked','cancelled'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DO $$ BEGIN
  CREATE TYPE public.invoice_payment_method AS ENUM (
    'pix','card','auto_debit','wallet','manual_admin'
  );
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

-- PLANS
CREATE TABLE IF NOT EXISTS public.subscription_plans (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL UNIQUE,
  default_amount numeric(10,2) NOT NULL DEFAULT 100,
  grace_days int NOT NULL DEFAULT 3,
  active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_plans TO authenticated;
GRANT ALL ON public.subscription_plans TO service_role;
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;
CREATE POLICY "plans_select_all" ON public.subscription_plans FOR SELECT TO authenticated USING (true);
CREATE POLICY "plans_admin_all" ON public.subscription_plans FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

INSERT INTO public.subscription_plans(name, default_amount)
VALUES ('Mensalidade FitMind', 100)
ON CONFLICT (name) DO NOTHING;

-- USER SUBSCRIPTIONS (1 por user_id)
CREATE TABLE IF NOT EXISTS public.user_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL UNIQUE,
  plan_id uuid NOT NULL REFERENCES public.subscription_plans(id),
  custom_amount numeric(10,2),
  billing_day int NOT NULL DEFAULT 5 CHECK (billing_day BETWEEN 1 AND 28),
  start_date date NOT NULL DEFAULT CURRENT_DATE,
  status public.subscription_status NOT NULL DEFAULT 'active',
  exempt_until date,
  preferred_payment_method public.invoice_payment_method NOT NULL DEFAULT 'wallet',
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT, UPDATE ON public.user_subscriptions TO authenticated;
GRANT ALL ON public.user_subscriptions TO service_role;
ALTER TABLE public.user_subscriptions ENABLE ROW LEVEL SECURITY;
CREATE POLICY "us_self_select" ON public.user_subscriptions FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "us_self_update" ON public.user_subscriptions FOR UPDATE TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "us_admin_all" ON public.user_subscriptions FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE INDEX IF NOT EXISTS user_subscriptions_status_idx ON public.user_subscriptions(status);

-- INVOICES
CREATE TABLE IF NOT EXISTS public.subscription_invoices (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_subscription_id uuid NOT NULL REFERENCES public.user_subscriptions(id) ON DELETE CASCADE,
  user_id uuid NOT NULL,
  reference_month date NOT NULL,
  due_date date NOT NULL,
  amount numeric(10,2) NOT NULL,
  fee_amount numeric(10,2) NOT NULL DEFAULT 0,
  tax_amount numeric(10,2) NOT NULL DEFAULT 0,
  net_to_admin numeric(10,2) NOT NULL DEFAULT 0,
  status public.invoice_status NOT NULL DEFAULT 'pending',
  paid_at timestamptz,
  payment_method public.invoice_payment_method,
  wallet_source text,
  mp_payment_id text,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_subscription_id, reference_month)
);
GRANT SELECT ON public.subscription_invoices TO authenticated;
GRANT ALL ON public.subscription_invoices TO service_role;
ALTER TABLE public.subscription_invoices ENABLE ROW LEVEL SECURITY;
CREATE POLICY "inv_self_select" ON public.subscription_invoices FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "inv_admin_all" ON public.subscription_invoices FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

CREATE INDEX IF NOT EXISTS subscription_invoices_status_idx ON public.subscription_invoices(status);
CREATE INDEX IF NOT EXISTS subscription_invoices_user_idx ON public.subscription_invoices(user_id);

-- AUDIT LOG
CREATE TABLE IF NOT EXISTS public.subscription_payment_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid REFERENCES public.subscription_invoices(id) ON DELETE SET NULL,
  user_id uuid NOT NULL,
  action text NOT NULL,
  performed_by uuid,
  details jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);
GRANT SELECT ON public.subscription_payment_log TO authenticated;
GRANT ALL ON public.subscription_payment_log TO service_role;
ALTER TABLE public.subscription_payment_log ENABLE ROW LEVEL SECURITY;
CREATE POLICY "splog_admin_all" ON public.subscription_payment_log FOR ALL TO authenticated
  USING (public.current_user_is_admin()) WITH CHECK (public.current_user_is_admin());

-- LINK COLUMNS NAS TABELAS DE RELATÓRIO
ALTER TABLE public.admin_system_wallet_entries
  ADD COLUMN IF NOT EXISTS subscription_invoice_id uuid;
ALTER TABLE public.system_fee_payouts
  ADD COLUMN IF NOT EXISTS subscription_invoice_id uuid;

-- ============================================================
-- FUNÇÕES
-- ============================================================

-- Cria assinatura única para um user_id (idempotente)
CREATE OR REPLACE FUNCTION public.ensure_user_subscription(
  _user_id uuid,
  _billing_day int DEFAULT 5
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_plan_id uuid;
  v_sub_id uuid;
BEGIN
  SELECT id INTO v_sub_id FROM public.user_subscriptions WHERE user_id = _user_id;
  IF v_sub_id IS NOT NULL THEN RETURN v_sub_id; END IF;

  SELECT id INTO v_plan_id FROM public.subscription_plans WHERE active = true ORDER BY created_at LIMIT 1;
  IF v_plan_id IS NULL THEN
    RAISE EXCEPTION 'No active subscription plan';
  END IF;

  INSERT INTO public.user_subscriptions(user_id, plan_id, billing_day)
  VALUES (_user_id, v_plan_id, GREATEST(1, LEAST(28, _billing_day)))
  RETURNING id INTO v_sub_id;
  RETURN v_sub_id;
END;
$$;

GRANT EXECUTE ON FUNCTION public.ensure_user_subscription(uuid, int) TO authenticated, service_role;

-- Valor efetivo da assinatura
CREATE OR REPLACE FUNCTION public.subscription_effective_amount(_sub_id uuid)
RETURNS numeric
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(us.custom_amount, sp.default_amount, 0)
  FROM public.user_subscriptions us
  JOIN public.subscription_plans sp ON sp.id = us.plan_id
  WHERE us.id = _sub_id;
$$;

GRANT EXECUTE ON FUNCTION public.subscription_effective_amount(uuid) TO authenticated, service_role;

-- Gera faturas do mês para todos os ativos
CREATE OR REPLACE FUNCTION public.generate_monthly_invoices()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_ref date := date_trunc('month', CURRENT_DATE)::date;
  r record;
  v_due date;
  v_amount numeric;
BEGIN
  FOR r IN
    SELECT us.id, us.user_id, us.billing_day, us.start_date, us.status, us.exempt_until
    FROM public.user_subscriptions us
    WHERE us.status IN ('active','exempt_monthly','exempt_annual')
      AND us.start_date <= (v_ref + INTERVAL '1 month - 1 day')::date
  LOOP
    v_due := (v_ref + ((r.billing_day - 1) || ' days')::interval)::date;
    v_amount := public.subscription_effective_amount(r.id);

    IF r.status = 'exempt_annual' AND r.exempt_until IS NOT NULL AND v_due <= r.exempt_until THEN
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'exempted')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
    ELSIF r.status = 'exempt_monthly' THEN
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'exempted')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
      -- volta para active após isentar o mês
      UPDATE public.user_subscriptions SET status = 'active', updated_at = now() WHERE id = r.id;
    ELSE
      INSERT INTO public.subscription_invoices(user_subscription_id, user_id, reference_month, due_date, amount, status)
      VALUES (r.id, r.user_id, v_ref, v_due, v_amount, 'pending')
      ON CONFLICT (user_subscription_id, reference_month) DO NOTHING;
    END IF;
    v_count := v_count + 1;
  END LOOP;
  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.generate_monthly_invoices() TO authenticated, service_role;

-- Marca atraso e bloqueio
CREATE OR REPLACE FUNCTION public.mark_overdue_invoices()
RETURNS int
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count int := 0;
  v_grace int;
BEGIN
  SELECT grace_days INTO v_grace FROM public.subscription_plans WHERE active = true ORDER BY created_at LIMIT 1;
  v_grace := COALESCE(v_grace, 3);

  UPDATE public.subscription_invoices
  SET status = 'overdue', updated_at = now()
  WHERE status = 'pending' AND due_date < CURRENT_DATE;
  GET DIAGNOSTICS v_count = ROW_COUNT;

  UPDATE public.subscription_invoices
  SET status = 'blocked', updated_at = now()
  WHERE status = 'overdue' AND due_date < (CURRENT_DATE - (v_grace || ' days')::interval)::date;

  RETURN v_count;
END;
$$;

GRANT EXECUTE ON FUNCTION public.mark_overdue_invoices() TO authenticated, service_role;

-- Usuário está bloqueado por inadimplência?
CREATE OR REPLACE FUNCTION public.is_user_blocked_by_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.subscription_invoices
    WHERE user_id = _user_id AND status = 'blocked'
  );
$$;
GRANT EXECUTE ON FUNCTION public.is_user_blocked_by_subscription(uuid) TO authenticated, service_role;

-- Processa pagamento de uma fatura (wallet/manual/external)
CREATE OR REPLACE FUNCTION public.process_subscription_invoice_payment(
  _invoice_id uuid,
  _method public.invoice_payment_method,
  _wallet_source text DEFAULT NULL,
  _performed_by uuid DEFAULT NULL,
  _fee_amount numeric DEFAULT 0,
  _mp_payment_id text DEFAULT NULL
)
RETURNS public.subscription_invoices
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  inv public.subscription_invoices;
  v_tax numeric;
  v_net numeric;
  v_remaining numeric;
  v_user uuid;
  v_profile_id uuid;
  v_partner_id uuid;
  v_pro_id uuid;
  v_debit numeric;
BEGIN
  SELECT * INTO inv FROM public.subscription_invoices WHERE id = _invoice_id FOR UPDATE;
  IF inv.id IS NULL THEN RAISE EXCEPTION 'Invoice not found'; END IF;
  IF inv.status = 'paid' THEN RETURN inv; END IF;

  v_user := inv.user_id;
  v_remaining := inv.amount - COALESCE(_fee_amount, 0);
  v_tax := round((v_remaining * 0.06)::numeric, 2);
  v_net := round((v_remaining - v_tax)::numeric, 2);

  -- Débito da carteira interna
  IF _method = 'wallet' THEN
    v_debit := inv.amount;
    IF _wallet_source = 'coach' THEN
      SELECT id INTO v_profile_id FROM public.profiles WHERE user_id = v_user;
      UPDATE public.wallets SET available_balance = available_balance - v_debit,
             total_withdrawn = total_withdrawn + v_debit, updated_at = now()
      WHERE profile_id = v_profile_id AND available_balance >= v_debit
      RETURNING profile_id INTO v_profile_id;
      IF v_profile_id IS NULL THEN RAISE EXCEPTION 'Saldo insuficiente na carteira do coach'; END IF;
    ELSIF _wallet_source = 'partner' THEN
      SELECT p.id INTO v_partner_id FROM public.partners p
        JOIN public.profiles pr ON pr.id = p.profile_id WHERE pr.user_id = v_user;
      UPDATE public.partner_wallets SET available_balance = available_balance - v_debit,
             total_withdrawn = total_withdrawn + v_debit, updated_at = now()
      WHERE partner_id = v_partner_id AND available_balance >= v_debit
      RETURNING partner_id INTO v_partner_id;
      IF v_partner_id IS NULL THEN RAISE EXCEPTION 'Saldo insuficiente na carteira do parceiro'; END IF;
    ELSIF _wallet_source = 'professional' THEN
      SELECT c.id INTO v_pro_id FROM public.coaches c
        JOIN public.profiles pr ON pr.id = c.profile_id WHERE pr.user_id = v_user;
      UPDATE public.professional_wallets SET available_balance = available_balance - v_debit,
             total_withdrawn = total_withdrawn + v_debit, updated_at = now()
      WHERE professional_coach_id = v_pro_id AND available_balance >= v_debit
      RETURNING professional_coach_id INTO v_pro_id;
      IF v_pro_id IS NULL THEN RAISE EXCEPTION 'Saldo insuficiente na carteira do profissional'; END IF;
    ELSE
      RAISE EXCEPTION 'wallet_source inválido';
    END IF;
  END IF;

  -- Credita admin (valor líquido)
  INSERT INTO public.admin_system_wallet(id, available_balance, total_earned)
  VALUES (true, v_net, v_net)
  ON CONFLICT (id) DO UPDATE
    SET available_balance = admin_system_wallet.available_balance + EXCLUDED.available_balance,
        total_earned = admin_system_wallet.total_earned + EXCLUDED.total_earned,
        updated_at = now();

  -- Entrada na carteira do admin
  INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
  VALUES ('Mensalidade Recorrente', v_net, 'subscription',
          'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'),
          inv.id);

  -- Taxa/imposto (rastreamento para baixa manual)
  IF _fee_amount > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Taxa de Pagamento', -_fee_amount, 'payment_fee',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;
  IF v_tax > 0 THEN
    INSERT INTO public.admin_system_wallet_entries(slot_label, amount, kind, notes, subscription_invoice_id)
    VALUES ('Imposto Simples Nacional', -v_tax, 'tax',
            'Mensalidade ' || to_char(inv.reference_month, 'MM/YYYY'), inv.id);
  END IF;

  UPDATE public.subscription_invoices
  SET status = 'paid', paid_at = now(),
      payment_method = _method, wallet_source = _wallet_source,
      fee_amount = COALESCE(_fee_amount, 0), tax_amount = v_tax, net_to_admin = v_net,
      mp_payment_id = _mp_payment_id, updated_at = now()
  WHERE id = _invoice_id
  RETURNING * INTO inv;

  INSERT INTO public.subscription_payment_log(invoice_id, user_id, action, performed_by, details)
  VALUES (inv.id, v_user, 'paid', _performed_by,
          jsonb_build_object('method', _method, 'wallet_source', _wallet_source,
                             'amount', inv.amount, 'net', v_net));
  RETURN inv;
END;
$$;

GRANT EXECUTE ON FUNCTION public.process_subscription_invoice_payment(uuid, public.invoice_payment_method, text, uuid, numeric, text) TO authenticated, service_role;

-- ============================================================
-- BACKFILL: cria assinaturas para coach/parceiro/profissional existentes
-- ============================================================
INSERT INTO public.user_subscriptions(user_id, plan_id, billing_day)
SELECT DISTINCT pr.user_id,
  (SELECT id FROM public.subscription_plans WHERE active = true ORDER BY created_at LIMIT 1),
  5
FROM public.profiles pr
WHERE pr.user_id IS NOT NULL
  AND (
    EXISTS (SELECT 1 FROM public.coaches c WHERE c.profile_id = pr.id)
    OR EXISTS (SELECT 1 FROM public.partners p WHERE p.profile_id = pr.id)
  )
ON CONFLICT (user_id) DO NOTHING;
