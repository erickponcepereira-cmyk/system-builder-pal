
CREATE TABLE public.store_subcategories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  category_id uuid NOT NULL REFERENCES public.store_categories(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  image_url text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  pending boolean NOT NULL DEFAULT false,
  card_width integer,
  card_height integer,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (category_id, slug)
);

CREATE INDEX idx_store_subcategories_category ON public.store_subcategories(category_id);

GRANT SELECT ON public.store_subcategories TO anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.store_subcategories TO authenticated;
GRANT ALL ON public.store_subcategories TO service_role;

ALTER TABLE public.store_subcategories ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_subcategories_admin_all ON public.store_subcategories
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));

CREATE POLICY store_subcategories_read_active ON public.store_subcategories
  FOR SELECT TO authenticated USING (is_active = true);

CREATE TRIGGER trg_store_subcategories_updated_at
  BEFORE UPDATE ON public.store_subcategories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

ALTER TABLE public.products
  ADD COLUMN IF NOT EXISTS subcategory_id uuid REFERENCES public.store_subcategories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_products_subcategory ON public.products(subcategory_id);
