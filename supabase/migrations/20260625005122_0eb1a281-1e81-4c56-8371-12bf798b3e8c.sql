DROP POLICY IF EXISTS "store-images professional update" ON storage.objects;
DROP POLICY IF EXISTS "store-images partner insert" ON storage.objects;
DROP POLICY IF EXISTS "store-images partner update" ON storage.objects;
DROP POLICY IF EXISTS "store-images partner delete" ON storage.objects;
DROP POLICY IF EXISTS "store-images admin public folders insert" ON storage.objects;
DROP POLICY IF EXISTS "store-images admin public folders update" ON storage.objects;
DROP POLICY IF EXISTS "store-images admin public folders delete" ON storage.objects;

CREATE POLICY "store-images professional update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT c.id::text
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND c.is_professional = true
  )
)
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT c.id::text
    FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
      AND c.is_professional = true
  )
);

CREATE POLICY "store-images partner insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'partners'
  AND (storage.foldername(name))[2] IN (
    SELECT pt.id::text
    FROM public.partners pt
    JOIN public.profiles p ON p.id = pt.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "store-images partner update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'partners'
  AND (storage.foldername(name))[2] IN (
    SELECT pt.id::text
    FROM public.partners pt
    JOIN public.profiles p ON p.id = pt.profile_id
    WHERE p.user_id = auth.uid()
  )
)
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'partners'
  AND (storage.foldername(name))[2] IN (
    SELECT pt.id::text
    FROM public.partners pt
    JOIN public.profiles p ON p.id = pt.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "store-images partner delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'partners'
  AND (storage.foldername(name))[2] IN (
    SELECT pt.id::text
    FROM public.partners pt
    JOIN public.profiles p ON p.id = pt.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "store-images admin public folders insert"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] IN ('items', 'freebies', 'sections', 'categories', 'store')
  AND public.is_admin(auth.uid())
);

CREATE POLICY "store-images admin public folders update"
ON storage.objects
FOR UPDATE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] IN ('items', 'freebies', 'sections', 'categories', 'store')
  AND public.is_admin(auth.uid())
)
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] IN ('items', 'freebies', 'sections', 'categories', 'store')
  AND public.is_admin(auth.uid())
);

CREATE POLICY "store-images admin public folders delete"
ON storage.objects
FOR DELETE
TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] IN ('items', 'freebies', 'sections', 'categories', 'store')
  AND public.is_admin(auth.uid())
);