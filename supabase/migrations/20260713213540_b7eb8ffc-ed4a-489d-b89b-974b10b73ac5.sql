
ALTER TABLE public.product_downloads DROP CONSTRAINT IF EXISTS product_downloads_product_id_fkey;
ALTER TABLE public.product_downloads ALTER COLUMN product_id DROP NOT NULL;
ALTER TABLE public.product_downloads ADD COLUMN IF NOT EXISTS partner_product_id uuid REFERENCES public.partner_products(id) ON DELETE CASCADE;
CREATE INDEX IF NOT EXISTS product_downloads_partner_product_id_idx ON public.product_downloads(partner_product_id);

ALTER TABLE public.product_downloads
  ADD CONSTRAINT product_downloads_product_id_fkey
  FOREIGN KEY (product_id) REFERENCES public.products(id) ON DELETE CASCADE;

ALTER TABLE public.product_downloads DROP CONSTRAINT IF EXISTS product_downloads_source_chk;
ALTER TABLE public.product_downloads ADD CONSTRAINT product_downloads_source_chk
  CHECK ((product_id IS NOT NULL) <> (partner_product_id IS NOT NULL));

DROP POLICY IF EXISTS "Partners manage own product downloads" ON public.product_downloads;
CREATE POLICY "Partners manage own product downloads"
  ON public.product_downloads FOR ALL
  TO authenticated
  USING (
    partner_product_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.partner_products pp
      JOIN public.partners pt ON pt.id = pp.partner_id
      JOIN public.profiles pr ON pr.id = pt.profile_id
      WHERE pp.id = product_downloads.partner_product_id AND pr.user_id = auth.uid()
    )
  )
  WITH CHECK (
    partner_product_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.partner_products pp
      JOIN public.partners pt ON pt.id = pp.partner_id
      JOIN public.profiles pr ON pr.id = pt.profile_id
      WHERE pp.id = product_downloads.partner_product_id AND pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partners upload own product-downloads" ON storage.objects;
CREATE POLICY "Partners upload own product-downloads"
  ON storage.objects FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'product-downloads'
    AND (storage.foldername(storage.objects.name))[1] = 'pp'
    AND EXISTS (
      SELECT 1 FROM public.partner_products pp
      JOIN public.partners pt ON pt.id = pp.partner_id
      JOIN public.profiles pr ON pr.id = pt.profile_id
      WHERE pp.id::text = (storage.foldername(storage.objects.name))[2] AND pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partners read own product-downloads" ON storage.objects;
CREATE POLICY "Partners read own product-downloads"
  ON storage.objects FOR SELECT TO authenticated
  USING (
    bucket_id = 'product-downloads'
    AND (storage.foldername(storage.objects.name))[1] = 'pp'
    AND EXISTS (
      SELECT 1 FROM public.partner_products pp
      JOIN public.partners pt ON pt.id = pp.partner_id
      JOIN public.profiles pr ON pr.id = pt.profile_id
      WHERE pp.id::text = (storage.foldername(storage.objects.name))[2] AND pr.user_id = auth.uid()
    )
  );

DROP POLICY IF EXISTS "Partners delete own product-downloads" ON storage.objects;
CREATE POLICY "Partners delete own product-downloads"
  ON storage.objects FOR DELETE TO authenticated
  USING (
    bucket_id = 'product-downloads'
    AND (storage.foldername(storage.objects.name))[1] = 'pp'
    AND EXISTS (
      SELECT 1 FROM public.partner_products pp
      JOIN public.partners pt ON pt.id = pp.partner_id
      JOIN public.profiles pr ON pr.id = pt.profile_id
      WHERE pp.id::text = (storage.foldername(storage.objects.name))[2] AND pr.user_id = auth.uid()
    )
  );
