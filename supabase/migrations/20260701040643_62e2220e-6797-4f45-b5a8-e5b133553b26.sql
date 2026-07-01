
CREATE TABLE public.product_downloads (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  name text NOT NULL,
  file_path text NOT NULL,
  mime_type text,
  size_bytes bigint,
  sort_order integer NOT NULL DEFAULT 0,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX product_downloads_product_id_idx ON public.product_downloads(product_id);

GRANT SELECT, INSERT, UPDATE, DELETE ON public.product_downloads TO authenticated;
GRANT ALL ON public.product_downloads TO service_role;

ALTER TABLE public.product_downloads ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Auth users can list product downloads"
  ON public.product_downloads FOR SELECT
  TO authenticated
  USING (true);

CREATE POLICY "Admins manage product downloads"
  ON public.product_downloads FOR ALL
  TO authenticated
  USING (public.is_admin(auth.uid()))
  WITH CHECK (public.is_admin(auth.uid()));

CREATE TRIGGER trg_product_downloads_updated_at
  BEFORE UPDATE ON public.product_downloads
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE POLICY "Admins upload product-downloads"
  ON storage.objects FOR INSERT
  TO authenticated
  WITH CHECK (bucket_id = 'product-downloads' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins update product-downloads"
  ON storage.objects FOR UPDATE
  TO authenticated
  USING (bucket_id = 'product-downloads' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins delete product-downloads"
  ON storage.objects FOR DELETE
  TO authenticated
  USING (bucket_id = 'product-downloads' AND public.is_admin(auth.uid()));

CREATE POLICY "Admins read product-downloads (metadata)"
  ON storage.objects FOR SELECT
  TO authenticated
  USING (bucket_id = 'product-downloads' AND public.is_admin(auth.uid()));
