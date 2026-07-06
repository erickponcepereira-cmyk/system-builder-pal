
-- Event fields (single-use with specific date + capacity) for partner and professional products
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS event_capacity integer;

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS event_date date,
  ADD COLUMN IF NOT EXISTS event_capacity integer,
  ADD COLUMN IF NOT EXISTS payment_timing text NOT NULL DEFAULT 'at_booking';

-- Validate payment_timing values
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'professional_products_payment_timing_check'
  ) THEN
    ALTER TABLE public.professional_products
      ADD CONSTRAINT professional_products_payment_timing_check
      CHECK (payment_timing IN ('at_booking','later'));
  END IF;
END$$;
