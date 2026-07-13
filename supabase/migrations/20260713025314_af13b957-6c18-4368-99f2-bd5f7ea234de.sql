
CREATE TABLE IF NOT EXISTS public.test_accounts (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  email text NOT NULL UNIQUE,
  cpf text,
  phone text,
  default_password text NOT NULL,
  label text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

GRANT SELECT ON public.test_accounts TO authenticated;
GRANT ALL ON public.test_accounts TO service_role;

ALTER TABLE public.test_accounts ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Admins manage test accounts" ON public.test_accounts;
CREATE POLICY "Admins manage test accounts"
  ON public.test_accounts FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

DROP POLICY IF EXISTS "Authenticated can read test accounts" ON public.test_accounts;
CREATE POLICY "Authenticated can read test accounts"
  ON public.test_accounts FOR SELECT
  TO authenticated
  USING (true);

CREATE OR REPLACE FUNCTION public.is_test_email(_email text)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT
    lower(_email) LIKE '%@fitmind.test'
    OR lower(_email) LIKE '%.test'
    OR EXISTS (SELECT 1 FROM public.test_accounts WHERE lower(email) = lower(_email));
$$;

DO $$
DECLARE
  t text;
  tables text[] := ARRAY[
    'profiles','students','coaches',
    'subscriptions','subscription_invoices','user_subscriptions',
    'transactions','commissions','mercadopago_payments',
    'store_orders','store_order_items',
    'coach_evaluation_clients','coach_points_log','coach_network_projections',
    'wallets','student_wallets','fitcoin_ledger',
    'event_registrations','event_attendances','attendance_logs',
    'monthly_rankings','career_plan_progress',
    'coach_medals_individual','coach_patent_achievements',
    'partner_product_orders','notifications'
  ];
BEGIN
  FOREACH t IN ARRAY tables LOOP
    EXECUTE format('ALTER TABLE public.%I ADD COLUMN IF NOT EXISTS is_test boolean NOT NULL DEFAULT false', t);
    EXECUTE format('CREATE INDEX IF NOT EXISTS %I ON public.%I(is_test) WHERE is_test = true', 'idx_'||t||'_is_test', t);
  END LOOP;
END $$;

CREATE OR REPLACE FUNCTION public.propagate_is_test_from_profile()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_is_test boolean;
BEGIN
  SELECT is_test INTO v_is_test FROM public.profiles WHERE id = NEW.profile_id;
  IF v_is_test IS TRUE THEN
    NEW.is_test := true;
  END IF;
  RETURN NEW;
END $$;

DROP TRIGGER IF EXISTS trg_students_propagate_is_test ON public.students;
CREATE TRIGGER trg_students_propagate_is_test
  BEFORE INSERT ON public.students
  FOR EACH ROW EXECUTE FUNCTION public.propagate_is_test_from_profile();

DROP TRIGGER IF EXISTS trg_coaches_propagate_is_test ON public.coaches;
CREATE TRIGGER trg_coaches_propagate_is_test
  BEFORE INSERT ON public.coaches
  FOR EACH ROW EXECUTE FUNCTION public.propagate_is_test_from_profile();

INSERT INTO public.test_accounts (email, cpf, phone, default_password, label) VALUES
  ('teste1@fitmind.test', '11111111111', '11999990001', 'Teste@2026', 'Teste Aluno 1'),
  ('teste2@fitmind.test', '22222222222', '11999990002', 'Teste@2026', 'Teste Aluno 2'),
  ('teste3@fitmind.test', '33333333333', '11999990003', 'Teste@2026', 'Teste Aluno 3')
ON CONFLICT (email) DO NOTHING;
