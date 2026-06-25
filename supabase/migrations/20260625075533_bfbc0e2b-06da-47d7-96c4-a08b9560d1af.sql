
DO $$ BEGIN
  CREATE TYPE public.subscription_billing_cycle AS ENUM ('monthly','yearly');
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

ALTER TABLE public.subscription_plans
  ADD COLUMN IF NOT EXISTS billing_cycle public.subscription_billing_cycle NOT NULL DEFAULT 'monthly',
  ADD COLUMN IF NOT EXISTS description text;

UPDATE public.subscription_plans
  SET billing_cycle = 'monthly'
  WHERE name ILIKE '%mensal%';

INSERT INTO public.subscription_plans (name, default_amount, grace_days, active, billing_cycle, description)
SELECT 'Anuidade FitMind', 1000.00, 7, true, 'yearly', 'Assinatura anual única — vale para coach, profissional e parceiro.'
WHERE NOT EXISTS (
  SELECT 1 FROM public.subscription_plans WHERE billing_cycle = 'yearly'
);

ALTER TABLE public.user_subscriptions
  ADD COLUMN IF NOT EXISTS paid_until date,
  ADD COLUMN IF NOT EXISTS billing_cycle public.subscription_billing_cycle;

UPDATE public.user_subscriptions us
  SET billing_cycle = p.billing_cycle
  FROM public.subscription_plans p
  WHERE us.plan_id = p.id AND us.billing_cycle IS NULL;

CREATE OR REPLACE FUNCTION public.has_active_subscription(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_subscriptions us
    WHERE us.user_id = _user_id
      AND us.status = 'active'
      AND (
        (us.paid_until IS NOT NULL AND us.paid_until >= CURRENT_DATE)
        OR (us.exempt_until IS NOT NULL AND us.exempt_until >= CURRENT_DATE)
      )
  );
$$;

GRANT EXECUTE ON FUNCTION public.has_active_subscription(uuid) TO authenticated, service_role;
