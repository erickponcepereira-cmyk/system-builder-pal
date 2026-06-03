
DROP POLICY IF EXISTS store_sections_propose ON public.store_sections;
DROP POLICY IF EXISTS store_categories_propose ON public.store_categories;

CREATE POLICY store_sections_create_own ON public.store_sections
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY store_sections_update_own ON public.store_sections
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());

CREATE POLICY store_categories_create_own ON public.store_categories
  FOR INSERT TO authenticated
  WITH CHECK (created_by = auth.uid());

CREATE POLICY store_categories_update_own ON public.store_categories
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid())
  WITH CHECK (created_by = auth.uid());
