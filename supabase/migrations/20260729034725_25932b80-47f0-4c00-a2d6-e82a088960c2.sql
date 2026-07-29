ALTER TABLE public.products ADD COLUMN IF NOT EXISTS recurrence_allow_one_time boolean NOT NULL DEFAULT true;
ALTER TABLE public.store_products ADD COLUMN IF NOT EXISTS recurrence_allow_one_time boolean NOT NULL DEFAULT true;
ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS recurrence_allow_one_time boolean NOT NULL DEFAULT true;
ALTER TABLE public.professional_products ADD COLUMN IF NOT EXISTS recurrence_allow_one_time boolean NOT NULL DEFAULT true;