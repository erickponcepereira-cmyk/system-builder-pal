-- ── Campos de recorrência nos produtos ──────────────────────────────────────
DO $$
DECLARE t text;
BEGIN
  FOREACH t IN ARRAY ARRAY['products','partner_products','professional_products','store_products'] LOOP
    IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_schema='public' AND table_name=t) THEN
      EXECUTE format('ALTER TABLE public.%I
        ADD COLUMN IF NOT EXISTS is_recurring boolean NOT NULL DEFAULT false,
        ADD COLUMN IF NOT EXISTS recurrence_interval text NOT NULL DEFAULT ''monthly'',
        ADD COLUMN IF NOT EXISTS recurrence_amount numeric,
        ADD COLUMN IF NOT EXISTS recurrence_trial_days integer NOT NULL DEFAULT 0,
        ADD COLUMN IF NOT EXISTS recurrence_engine text NOT NULL DEFAULT ''saved_card''', t);
    END IF;
  END LOOP;
END $$;

-- ── Assinaturas recorrentes ─────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_subscriptions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL,
  profile_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL,
  student_id uuid,
  product_kind text NOT NULL DEFAULT 'product',
  product_id uuid,
  title text NOT NULL,
  amount numeric NOT NULL CHECK (amount > 0),
  interval_type text NOT NULL DEFAULT 'monthly',
  billing_day integer NOT NULL DEFAULT 5 CHECK (billing_day BETWEEN 1 AND 31),
  engine text NOT NULL DEFAULT 'saved_card',
  saved_card_id uuid REFERENCES public.saved_payment_cards(id) ON DELETE SET NULL,
  mp_preapproval_id text,
  status text NOT NULL DEFAULT 'active',
  next_charge_at date,
  last_charge_at timestamptz,
  failure_count integer NOT NULL DEFAULT 0,
  last_failure_reason text,
  cancelled_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_subs_user ON public.recurring_subscriptions(user_id);
CREATE INDEX IF NOT EXISTS idx_recurring_subs_due ON public.recurring_subscriptions(status, next_charge_at);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_subs_preapproval ON public.recurring_subscriptions(mp_preapproval_id) WHERE mp_preapproval_id IS NOT NULL;

GRANT SELECT, INSERT, UPDATE ON public.recurring_subscriptions TO authenticated;
GRANT ALL ON public.recurring_subscriptions TO service_role;
ALTER TABLE public.recurring_subscriptions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_recurring_subscriptions_select" ON public.recurring_subscriptions
  FOR SELECT TO authenticated USING (user_id = auth.uid() OR public.current_user_is_admin());
CREATE POLICY "own_recurring_subscriptions_insert" ON public.recurring_subscriptions
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());
CREATE POLICY "own_recurring_subscriptions_update" ON public.recurring_subscriptions
  FOR UPDATE TO authenticated USING (user_id = auth.uid() OR public.current_user_is_admin())
  WITH CHECK (user_id = auth.uid() OR public.current_user_is_admin());

-- ── Histórico de cobranças ──────────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.recurring_charges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  subscription_id uuid NOT NULL REFERENCES public.recurring_subscriptions(id) ON DELETE CASCADE,
  reference_date date NOT NULL DEFAULT CURRENT_DATE,
  amount numeric NOT NULL,
  attempt integer NOT NULL DEFAULT 1,
  status text NOT NULL DEFAULT 'pending',
  status_detail text,
  mp_payment_id text,
  invoice_id uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_recurring_charges_sub ON public.recurring_charges(subscription_id, reference_date);
CREATE UNIQUE INDEX IF NOT EXISTS uq_recurring_charge_attempt
  ON public.recurring_charges(subscription_id, reference_date, attempt);

GRANT SELECT ON public.recurring_charges TO authenticated;
GRANT ALL ON public.recurring_charges TO service_role;
ALTER TABLE public.recurring_charges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "own_recurring_charges_select" ON public.recurring_charges
  FOR SELECT TO authenticated USING (
    public.current_user_is_admin()
    OR EXISTS (
      SELECT 1 FROM public.recurring_subscriptions s
      WHERE s.id = recurring_charges.subscription_id AND s.user_id = auth.uid()
    )
  );

-- ── Cartões salvos: acesso ──────────────────────────────────────────────────
GRANT SELECT, INSERT, UPDATE, DELETE ON public.saved_payment_cards TO authenticated;
GRANT ALL ON public.saved_payment_cards TO service_role;
ALTER TABLE public.saved_payment_cards ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "own_saved_cards_select" ON public.saved_payment_cards;
DROP POLICY IF EXISTS "own_saved_cards_delete" ON public.saved_payment_cards;

CREATE POLICY "own_saved_cards_select" ON public.saved_payment_cards
  FOR SELECT TO authenticated USING (
    public.current_user_is_admin() OR student_id = ANY (public.current_user_student_ids())
  );
CREATE POLICY "own_saved_cards_delete" ON public.saved_payment_cards
  FOR DELETE TO authenticated USING (
    public.current_user_is_admin() OR student_id = ANY (public.current_user_student_ids())
  );

-- ── updated_at ──────────────────────────────────────────────────────────────
DROP TRIGGER IF EXISTS trg_recurring_subs_updated ON public.recurring_subscriptions;
CREATE TRIGGER trg_recurring_subs_updated BEFORE UPDATE ON public.recurring_subscriptions
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();
DROP TRIGGER IF EXISTS trg_recurring_charges_updated ON public.recurring_charges;
CREATE TRIGGER trg_recurring_charges_updated BEFORE UPDATE ON public.recurring_charges
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();