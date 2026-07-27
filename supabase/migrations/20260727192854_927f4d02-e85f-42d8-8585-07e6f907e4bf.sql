DROP POLICY IF EXISTS store_sections_read_active ON public.store_sections;
CREATE POLICY store_sections_read_active ON public.store_sections
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS store_categories_read_active ON public.store_categories;
CREATE POLICY store_categories_read_active ON public.store_categories
  FOR SELECT TO anon, authenticated USING (is_active = true);

DROP POLICY IF EXISTS store_subcategories_read_active ON public.store_subcategories;
CREATE POLICY store_subcategories_read_active ON public.store_subcategories
  FOR SELECT TO anon, authenticated USING (is_active = true);

GRANT SELECT ON public.store_sections TO anon;
GRANT SELECT ON public.store_categories TO anon;
GRANT SELECT ON public.store_subcategories TO anon;