DROP POLICY IF EXISTS "store-images professional insert" ON storage.objects;
DROP POLICY IF EXISTS "store-images professional update" ON storage.objects;
DROP POLICY IF EXISTS "store-images professional delete" ON storage.objects;

CREATE POLICY "store-images professional insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT c.id::text FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "store-images professional update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT c.id::text FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "store-images professional delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'store-images'
  AND (storage.foldername(name))[1] = 'professionals'
  AND (storage.foldername(name))[2] IN (
    SELECT c.id::text FROM public.coaches c
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

-- Avatars: path is `${auth.uid()}/...` in SettingsTab — existing policies match auth.uid()::text, OK.
-- Mas o uploadAvatar do profissional grava em `${user.id}/...` onde user.id = auth.uid(),
-- então as policies avatars_owner_* já cobrem.
