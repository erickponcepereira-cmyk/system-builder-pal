
CREATE POLICY "store-images professional insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.coaches WHERE profile_id = auth.uid()
  )
);

CREATE POLICY "store-images professional update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.coaches WHERE profile_id = auth.uid()
  )
);

CREATE POLICY "store-images professional delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT id::text FROM public.coaches WHERE profile_id = auth.uid()
  )
);
