-- Link partner_products and professional_products to store taxonomy
ALTER TABLE public.partner_products
  ADD COLUMN section_id uuid REFERENCES public.store_sections(id) ON DELETE SET NULL,
  ADD COLUMN category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL;

ALTER TABLE public.professional_products
  ADD COLUMN section_id uuid REFERENCES public.store_sections(id) ON DELETE SET NULL,
  ADD COLUMN category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL;

CREATE INDEX IF NOT EXISTS idx_partner_products_category ON public.partner_products(category_id);
CREATE INDEX IF NOT EXISTS idx_professional_products_category ON public.professional_products(category_id);

-- Add pending/created_by to sections + categories (so any authenticated user can propose new ones)
ALTER TABLE public.store_sections
  ADD COLUMN created_by uuid,
  ADD COLUMN pending boolean NOT NULL DEFAULT false;

ALTER TABLE public.store_categories
  ADD COLUMN created_by uuid,
  ADD COLUMN pending boolean NOT NULL DEFAULT false;

-- Allow authenticated users to insert pending taxonomy entries
CREATE POLICY "store_sections_propose"
  ON public.store_sections
  FOR INSERT
  TO authenticated
  WITH CHECK (pending = true AND is_active = false AND created_by = auth.uid());

CREATE POLICY "store_categories_propose"
  ON public.store_categories
  FOR INSERT
  TO authenticated
  WITH CHECK (pending = true AND is_active = false AND created_by = auth.uid());

-- Let users see their own pending entries (admin all already covers admins; active is readable to everyone)
CREATE POLICY "store_sections_read_own_pending"
  ON public.store_sections
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());

CREATE POLICY "store_categories_read_own_pending"
  ON public.store_categories
  FOR SELECT
  TO authenticated
  USING (created_by = auth.uid());