ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS deleted_at timestamptz;
CREATE INDEX IF NOT EXISTS partner_products_deleted_at_idx ON public.partner_products(deleted_at);