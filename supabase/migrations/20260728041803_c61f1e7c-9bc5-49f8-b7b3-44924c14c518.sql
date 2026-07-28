ALTER TABLE public.product_downloads
  ADD COLUMN IF NOT EXISTS professional_product_id uuid REFERENCES public.professional_products(id) ON DELETE CASCADE;

CREATE INDEX IF NOT EXISTS product_downloads_professional_product_id_idx
  ON public.product_downloads(professional_product_id);

ALTER TABLE public.product_downloads DROP CONSTRAINT IF EXISTS product_downloads_source_chk;
ALTER TABLE public.product_downloads ADD CONSTRAINT product_downloads_source_chk CHECK (
  ((product_id IS NOT NULL)::int + (partner_product_id IS NOT NULL)::int + (professional_product_id IS NOT NULL)::int) = 1
);

DROP POLICY IF EXISTS "Professionals manage own product downloads" ON public.product_downloads;
CREATE POLICY "Professionals manage own product downloads"
ON public.product_downloads
FOR ALL
TO authenticated
USING (
  professional_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.professional_products pp
    JOIN public.coaches c ON c.id = pp.coach_id
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE pp.id = product_downloads.professional_product_id AND pr.user_id = auth.uid()
  )
)
WITH CHECK (
  professional_product_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.professional_products pp
    JOIN public.coaches c ON c.id = pp.coach_id
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE pp.id = product_downloads.professional_product_id AND pr.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Professionals upload own product-downloads" ON storage.objects;
CREATE POLICY "Professionals upload own product-downloads"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'product-downloads'
  AND (storage.foldername(objects.name))[1] = 'prof'
  AND EXISTS (
    SELECT 1 FROM public.professional_products pp
    JOIN public.coaches c ON c.id = pp.coach_id
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE pp.id::text = (storage.foldername(objects.name))[2] AND pr.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Professionals read own product-downloads" ON storage.objects;
CREATE POLICY "Professionals read own product-downloads"
ON storage.objects FOR SELECT TO authenticated
USING (
  bucket_id = 'product-downloads'
  AND (storage.foldername(objects.name))[1] = 'prof'
  AND EXISTS (
    SELECT 1 FROM public.professional_products pp
    JOIN public.coaches c ON c.id = pp.coach_id
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE pp.id::text = (storage.foldername(objects.name))[2] AND pr.user_id = auth.uid()
  )
);

DROP POLICY IF EXISTS "Professionals delete own product-downloads" ON storage.objects;
CREATE POLICY "Professionals delete own product-downloads"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'product-downloads'
  AND (storage.foldername(objects.name))[1] = 'prof'
  AND EXISTS (
    SELECT 1 FROM public.professional_products pp
    JOIN public.coaches c ON c.id = pp.coach_id
    JOIN public.profiles pr ON pr.id = c.profile_id
    WHERE pp.id::text = (storage.foldername(objects.name))[2] AND pr.user_id = auth.uid()
  )
);