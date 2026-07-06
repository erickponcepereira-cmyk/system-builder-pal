ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS event_start_time time,
  ADD COLUMN IF NOT EXISTS event_end_time time;

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS event_start_time time,
  ADD COLUMN IF NOT EXISTS event_end_time time;