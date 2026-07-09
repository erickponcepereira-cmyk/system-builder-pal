
ALTER TABLE public.partner_products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.store_subcategories(id) ON DELETE SET NULL;
ALTER TABLE public.professional_products ADD COLUMN IF NOT EXISTS subcategory_id UUID REFERENCES public.store_subcategories(id) ON DELETE SET NULL;
CREATE INDEX IF NOT EXISTS partner_products_subcategory_id_idx ON public.partner_products(subcategory_id);
CREATE INDEX IF NOT EXISTS professional_products_subcategory_id_idx ON public.professional_products(subcategory_id);
