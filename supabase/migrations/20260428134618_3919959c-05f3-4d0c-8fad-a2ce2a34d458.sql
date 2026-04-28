UPDATE storage.buckets
SET public = false
WHERE id IN ('group-media', 'evolution-photos', 'food-photos');

DROP POLICY IF EXISTS "Group media public read" ON storage.objects;
DROP POLICY IF EXISTS "Evolution photos public read" ON storage.objects;
DROP POLICY IF EXISTS "Food photos public read" ON storage.objects;

CREATE POLICY "Students read own evolution photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'evolution-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Students read own food photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'food-photos'
  AND auth.uid()::text = (storage.foldername(name))[1]
);

CREATE POLICY "Group members read media"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'group-media'
  AND (storage.foldername(name))[1] IN (
    SELECT gm.group_id::text
    FROM public.group_members gm
    JOIN public.profiles p ON p.id = gm.profile_id
    WHERE p.user_id = auth.uid()
      AND COALESCE(gm.is_banned, false) = false
  )
);

CREATE POLICY "Coaches read student evolution photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'evolution-photos'
  AND (storage.foldername(name))[2] IN (
    SELECT s.id::text
    FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);

CREATE POLICY "Coaches read student food photos"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'food-photos'
  AND (storage.foldername(name))[2] IN (
    SELECT s.id::text
    FROM public.students s
    JOIN public.coaches c ON c.id = s.coach_id
    JOIN public.profiles p ON p.id = c.profile_id
    WHERE p.user_id = auth.uid()
  )
);