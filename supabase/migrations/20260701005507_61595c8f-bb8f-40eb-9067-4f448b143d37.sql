-- Add visibility_audiences to items (products table used for store items)
ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS visibility_audiences text[];

COMMENT ON COLUMN public.products.visibility_audiences IS
  'Public audiences allowed to see this item in stores. NULL or empty = visible to all. Values: student, coach, partner, professional.';

CREATE INDEX IF NOT EXISTS products_visibility_audiences_idx
  ON public.products USING GIN (visibility_audiences);