
DELETE FROM public.subscription_plans WHERE name = 'Anuidade FitMind';

ALTER TABLE public.user_subscriptions DROP COLUMN IF EXISTS billing_cycle;
ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS billing_cycle;
ALTER TABLE public.subscription_plans DROP COLUMN IF EXISTS description;

DROP TYPE IF EXISTS public.subscription_billing_cycle;
