ALTER TABLE public.partners
  ADD COLUMN IF NOT EXISTS business_area text,
  ADD COLUMN IF NOT EXISTS specialty text;

ALTER TABLE public.freebies
  ADD COLUMN IF NOT EXISTS category text;