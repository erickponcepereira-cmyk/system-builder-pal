
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'exempt_monthly';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'exempt_annual';
ALTER TYPE public.subscription_status ADD VALUE IF NOT EXISTS 'exempt_permanent';
