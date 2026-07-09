
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS sort_order integer NOT NULL DEFAULT 0;

CREATE INDEX IF NOT EXISTS idx_partner_products_sort_order ON public.partner_products(partner_id, sort_order);
