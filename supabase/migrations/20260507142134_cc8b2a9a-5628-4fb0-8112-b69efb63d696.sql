
-- Sections
CREATE TABLE public.store_sections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  slug text NOT NULL UNIQUE,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Categories
CREATE TABLE public.store_categories (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.store_sections(id) ON DELETE CASCADE,
  name text NOT NULL,
  slug text NOT NULL,
  icon text,
  sort_order integer NOT NULL DEFAULT 0,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (section_id, slug)
);

-- Items
CREATE TABLE public.store_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  section_id uuid NOT NULL REFERENCES public.store_sections(id) ON DELETE RESTRICT,
  category_id uuid REFERENCES public.store_categories(id) ON DELETE SET NULL,
  kind text NOT NULL CHECK (kind IN ('physical','digital')),
  name text NOT NULL,
  description text,
  short_description text,
  image_url text,
  gallery jsonb NOT NULL DEFAULT '[]'::jsonb,
  price numeric(12,2) NOT NULL DEFAULT 0,
  original_price numeric(12,2),
  stock integer,
  sku text,
  is_featured boolean NOT NULL DEFAULT false,
  is_active boolean NOT NULL DEFAULT true,
  sort_order integer NOT NULL DEFAULT 0,
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX idx_store_categories_section ON public.store_categories(section_id);
CREATE INDEX idx_store_items_section ON public.store_items(section_id);
CREATE INDEX idx_store_items_category ON public.store_items(category_id);
CREATE INDEX idx_store_items_active ON public.store_items(is_active);

-- Triggers para updated_at
CREATE TRIGGER trg_store_sections_updated_at
  BEFORE UPDATE ON public.store_sections
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_store_categories_updated_at
  BEFORE UPDATE ON public.store_categories
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER trg_store_items_updated_at
  BEFORE UPDATE ON public.store_items
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- RLS
ALTER TABLE public.store_sections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_categories ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.store_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY store_sections_admin_all ON public.store_sections
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY store_sections_read_active ON public.store_sections
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY store_categories_admin_all ON public.store_categories
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY store_categories_read_active ON public.store_categories
  FOR SELECT TO authenticated USING (is_active = true);

CREATE POLICY store_items_admin_all ON public.store_items
  FOR ALL USING (is_admin(auth.uid())) WITH CHECK (is_admin(auth.uid()));
CREATE POLICY store_items_read_active ON public.store_items
  FOR SELECT TO authenticated USING (is_active = true);

-- Storage bucket
INSERT INTO storage.buckets (id, name, public)
VALUES ('store-images', 'store-images', true)
ON CONFLICT (id) DO NOTHING;

CREATE POLICY "store-images public read"
  ON storage.objects FOR SELECT
  USING (bucket_id = 'store-images');

CREATE POLICY "store-images admin insert"
  ON storage.objects FOR INSERT
  WITH CHECK (bucket_id = 'store-images' AND is_admin(auth.uid()));

CREATE POLICY "store-images admin update"
  ON storage.objects FOR UPDATE
  USING (bucket_id = 'store-images' AND is_admin(auth.uid()));

CREATE POLICY "store-images admin delete"
  ON storage.objects FOR DELETE
  USING (bucket_id = 'store-images' AND is_admin(auth.uid()));
