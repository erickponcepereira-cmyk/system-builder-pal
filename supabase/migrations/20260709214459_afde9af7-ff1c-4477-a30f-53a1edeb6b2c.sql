
ALTER TABLE public.partner_products
  ADD COLUMN IF NOT EXISTS mirror_source_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_mirrored boolean NOT NULL DEFAULT false;

ALTER TABLE public.professional_products
  ADD COLUMN IF NOT EXISTS mirror_source_product_id uuid REFERENCES public.products(id) ON DELETE CASCADE,
  ADD COLUMN IF NOT EXISTS is_mirrored boolean NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS idx_partner_products_mirror_source
  ON public.partner_products(mirror_source_product_id) WHERE mirror_source_product_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_professional_products_mirror_source
  ON public.professional_products(mirror_source_product_id) WHERE mirror_source_product_id IS NOT NULL;

-- Evitar duplicar espelhos do mesmo produto para o mesmo parceiro/profissional
CREATE UNIQUE INDEX IF NOT EXISTS uq_partner_products_mirror
  ON public.partner_products(partner_id, mirror_source_product_id)
  WHERE mirror_source_product_id IS NOT NULL;

CREATE UNIQUE INDEX IF NOT EXISTS uq_professional_products_mirror
  ON public.professional_products(coach_id, mirror_source_product_id)
  WHERE mirror_source_product_id IS NOT NULL;

COMMENT ON COLUMN public.partner_products.is_mirrored IS 'true = produto espelhado da loja Fitmind (read-only para o parceiro; fotos/preço/descrição vem do produto original)';
COMMENT ON COLUMN public.professional_products.is_mirrored IS 'true = produto espelhado da loja Fitmind (read-only para o profissional; fotos/preço/descrição vem do produto original)';
